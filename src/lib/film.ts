import { BlurStyle, FilterMode, ImageFormat, MipmapMode, Skia, TileMode, matchFont, type SkImage } from '@shopify/react-native-skia';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * 롤롤 필름 룩을 사진 파일에 굽는다.
 * 따뜻한 톤 · 바랜 검정 · 낮은 채도 · 비네팅 · 그레인 · 주황 날짜 각인.
 * 구운 파일 이름에는 `.film.`이 들어가서 화면에서 효과를 두 번 입히지 않는다.
 */
const FILM_SKSL = `
uniform shader image;
uniform float2 size;
uniform float seed;

half4 main(float2 p) {
  float3 col = image.eval(p).rgb;

  // 바랜 검정, 부드러운 하이라이트
  col = col * 0.9 + 0.06;
  // 따뜻한 톤
  col.r = col.r * 1.05 + 0.02;
  col.g = col.g * 1.0 + 0.01;
  col.b = col.b * 0.88 + 0.03;
  // 채도 살짝 낮추기
  float l = dot(col, float3(0.299, 0.587, 0.114));
  col = mix(float3(l), col, 0.86);
  // 완만한 S 커브
  float3 s = col * col * (3.0 - 2.0 * col);
  col = mix(col, s, 0.35);
  // 비네팅
  float2 uv = p / size - 0.5;
  uv.x *= size.x / size.y;
  float v = smoothstep(0.95, 0.3, length(uv));
  col *= mix(0.8, 1.0, v);
  // 그레인
  float n = fract(sin(dot(floor(p) + seed, float2(12.9898, 78.233))) * 43758.5453);
  col += (n - 0.5) * 0.06;

  return half4(half3(clamp(col, 0.0, 1.0)), 1.0);
}
`;

const effect = Skia.RuntimeEffect.Make(FILM_SKSL);

function stampText(takenAt: number) {
  const d = new Date(takenAt);
  return `'${String(d.getFullYear()).slice(2)} ${d.getMonth() + 1} ${d.getDate()}`;
}

function render(img: SkImage, takenAt: number) {
  const w = img.width();
  const h = img.height();
  const surface = Skia.Surface.MakeOffscreen(w, h) ?? Skia.Surface.Make(w, h);
  if (!surface || !effect) return null;
  const canvas = surface.getCanvas();

  const shader = effect.makeShaderWithChildren([w, h, Math.random() * 1000], [img.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Linear, MipmapMode.None)]);
  const paint = Skia.Paint();
  paint.setShader(shader);
  canvas.drawRect(Skia.XYWHRect(0, 0, w, h), paint);

  // 날짜 각인: 번진 빛 한 번, 선명한 글자 한 번
  const font = matchFont({
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    fontSize: Math.round(w * 0.042),
    fontWeight: 'bold',
  });
  const text = stampText(takenAt);
  const tw = font.measureText(text).width;
  const x = w - tw - w * 0.05;
  const y = h - h * 0.06;
  const glow = Skia.Paint();
  glow.setColor(Skia.Color('rgba(255,120,30,0.75)'));
  glow.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, w * 0.006, true));
  canvas.drawText(text, x, y, glow, font);
  const ink = Skia.Paint();
  ink.setColor(Skia.Color('#FFB26B'));
  canvas.drawText(text, x, y, ink, font);

  surface.flush();
  return surface.makeImageSnapshot();
}

/** 실패하면 원본을 그대로 돌려준다 (촬영 흐름을 막지 않는다) */
export async function bakeFilm(uri: string, takenAt: number): Promise<{ uri: string; baked: boolean }> {
  try {
    const data = await Skia.Data.fromURI(uri);
    const img = Skia.Image.MakeImageFromEncoded(data);
    if (!img) return { uri, baked: false };
    const out = render(img, takenAt);
    if (!out) return { uri, baked: false };
    const bytes = out.encodeToBytes(ImageFormat.JPEG, 88);
    const dir = new Directory(Paths.document, 'films');
    if (!dir.exists) dir.create({ intermediates: true });
    const file = new File(dir, `${takenAt}.film.jpg`);
    file.create({ overwrite: true });
    file.write(bytes);
    return { uri: file.uri, baked: true };
  } catch {
    return { uri, baked: false };
  }
}

export const isBaked = (src: unknown) => typeof src === 'string' && src.includes('.film.');
