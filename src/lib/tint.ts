import { FilterMode, ImageFormat, MipmapMode, Skia, TileMode } from '@shopify/react-native-skia';
import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';

/**
 * 캐릭터 렌더는 모두 하늘색(#8CC8F2) 한 벌만 들어 있다.
 * 다른 몸 색은 하늘색 계열 픽셀만 Oklab에서 색상·채도·밝기를 옮겨 입힌다.
 * 눈·볼터치·주둥이·필름 목도리처럼 파랗지 않은 부분은 그대로 남는다.
 * 한 번 입힌 결과는 캐시 폴더에 PNG로 저장해 다시 쓴다.
 */
const TINT_SKSL = `
uniform shader image;
uniform float3 master;  // Oklab (L, a, b)
uniform float3 target;

float3 toLin(float3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, float3(2.4)), step(0.04045, c)); }
float3 toSrgb(float3 c) { c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, float3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }

float3 toLab(float3 rgb) {
  float3 c = toLin(rgb);
  float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
  float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
  float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
  l = pow(max(l, 0.0), 1.0 / 3.0); m = pow(max(m, 0.0), 1.0 / 3.0); s = pow(max(s, 0.0), 1.0 / 3.0);
  return float3(0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
                1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
                0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);
}

float3 fromLab(float3 lab) {
  float l = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  float m = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  float s = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
  l = l * l * l; m = m * m * m; s = s * s * s;
  return toSrgb(float3(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                       -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                       -0.0041960771 * l - 0.7034186147 * m + 1.7076147940 * s));
}

half4 main(float2 p) {
  half4 px = image.eval(p);
  if (px.a < 0.004) return px;
  float3 rgb = float3(px.rgb) / float(px.a);
  float3 lab = toLab(rgb);

  float C = length(lab.yz);
  float mC = length(master.yz);
  float dh = abs(atan(lab.z, lab.y) - atan(master.z, master.y));
  dh = min(dh, 6.2831853 - dh);
  // 하늘색 계열(색상 차 0.6rad 이내, 채도 있음)만 바꾼다
  float w = clamp((0.6 - dh) / 0.3, 0.0, 1.0) * clamp((C - 0.02) / 0.03, 0.0, 1.0);

  float k = C / mC;
  float tA = atan(target.z, target.y);
  float tC = length(target.yz);
  float nL = lab.x + (target.x - master.x) * clamp(lab.x / master.x, 0.0, 1.2);
  float3 moved = float3(nL, cos(tA) * tC * k, sin(tA) * tC * k);

  float3 outRgb = fromLab(mix(lab, moved, w));
  return half4(half3(outRgb * float(px.a)), px.a);
}
`;

const effect = Skia.RuntimeEffect.Make(TINT_SKSL);

function hexToLab(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = lin;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export const MASTER_HEX = '#8CC8F2';
const MASTER = hexToLab(MASTER_HEX);
// 렌더 파일이 바뀌면 숫자를 올려 예전 캐시를 버린다
const VERSION = 1;

const pending = new Map<string, Promise<string | null>>();
const done = new Map<string, string>();

/** 이미 만들어 둔 결과가 있으면 바로 돌려준다 (첫 렌더 깜빡임 방지) */
export function cachedTint(key: string): string | undefined {
  const hit = done.get(key);
  if (hit) return hit;
  const file = new File(new Directory(Paths.cache, 'mallang'), `${key}.v${VERSION}.png`);
  if (file.exists) {
    done.set(key, file.uri);
    return file.uri;
  }
  return undefined;
}

/** 하늘색 렌더(module)를 fillHex 색으로 입힌 PNG 파일 uri. 실패하면 null(하늘색 원본을 쓴다). */
export function tintCharacter(key: string, module: number, fillHex: string): Promise<string | null> {
  const hit = cachedTint(key);
  if (hit) return Promise.resolve(hit);
  let job = pending.get(key);
  if (job) return job;
  job = (async () => {
    try {
      if (!effect) return null;
      const asset = Asset.fromModule(module);
      await asset.downloadAsync();
      const src = asset.localUri ?? asset.uri;
      const img = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(src));
      if (!img) return null;
      const w = img.width();
      const h = img.height();
      const surface = Skia.Surface.MakeOffscreen(w, h) ?? Skia.Surface.Make(w, h);
      if (!surface) return null;
      const shader = effect.makeShaderWithChildren(
        [...MASTER, ...hexToLab(fillHex)],
        [img.makeShaderOptions(TileMode.Decal, TileMode.Decal, FilterMode.Nearest, MipmapMode.None)],
      );
      const paint = Skia.Paint();
      paint.setShader(shader);
      const canvas = surface.getCanvas();
      canvas.clear(Skia.Color('transparent'));
      canvas.drawRect(Skia.XYWHRect(0, 0, w, h), paint);
      surface.flush();
      const bytes = surface.makeImageSnapshot().encodeToBytes(ImageFormat.PNG, 100);
      const dir = new Directory(Paths.cache, 'mallang');
      if (!dir.exists) dir.create({ intermediates: true });
      const file = new File(dir, `${key}.v${VERSION}.png`);
      file.create({ overwrite: true });
      file.write(bytes);
      done.set(key, file.uri);
      return file.uri;
    } catch {
      return null;
    } finally {
      pending.delete(key);
    }
  })();
  pending.set(key, job);
  return job;
}
