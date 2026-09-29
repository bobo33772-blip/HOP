import { Asset } from 'expo-asset';

/**
 * 웹 버전 색 입히기. 네이티브(lib/tint.ts의 Skia 셰이더)와 같은 계산을 캔버스 픽셀로 한다:
 * 하늘색 계열 픽셀만 Oklab에서 색상·채도·밝기를 옮기고, 눈·볼·목도리처럼 파랗지 않은 부분은 그대로 둔다.
 * 결과는 blob URL로 메모리에 캐시한다.
 */
export const MASTER_HEX = '#8CC8F2';

const done = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

// sRGB(0~255) → 선형, 선형(0~1, 4096칸) → sRGB 표
const TO_LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  TO_LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
const OUT_N = 4096;
const TO_SRGB = new Uint8ClampedArray(OUT_N + 1);
for (let i = 0; i <= OUT_N; i++) {
  const c = i / OUT_N;
  TO_SRGB[i] = Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055) * 255);
}

function labOf(r: number, g: number, b: number): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

function hexLab(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return labOf(TO_LIN[(n >> 16) & 255], TO_LIN[(n >> 8) & 255], TO_LIN[n & 255]);
}

const MASTER = hexLab(MASTER_HEX);
const M_HUE = Math.atan2(MASTER[2], MASTER[1]);
const M_C = Math.hypot(MASTER[1], MASTER[2]);

function recolor(px: Uint8ClampedArray, fillHex: string) {
  const T = hexLab(fillHex);
  const tA = Math.atan2(T[2], T[1]);
  const tC = Math.hypot(T[1], T[2]);
  const cosT = Math.cos(tA);
  const sinT = Math.sin(tA);
  const dL = T[0] - MASTER[0];
  const lin = (v: number) => TO_SRGB[Math.max(0, Math.min(OUT_N, Math.round(v * OUT_N)))];
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 2) continue;
    const [L, a, b] = labOf(TO_LIN[px[i]], TO_LIN[px[i + 1]], TO_LIN[px[i + 2]]);
    const C = Math.hypot(a, b);
    if (C < 0.02) continue; // 채도 없는 곳(흰색·회색·검정)은 그대로
    let dh = Math.abs(Math.atan2(b, a) - M_HUE);
    if (dh > Math.PI) dh = 2 * Math.PI - dh;
    const w = Math.min(1, Math.max(0, (0.6 - dh) / 0.3)) * Math.min(1, Math.max(0, (C - 0.02) / 0.03));
    if (w <= 0) continue;
    const k = C / M_C;
    const nL = L + dL * Math.min(1.2, Math.max(0, L / MASTER[0]));
    const oL = L + (nL - L) * w;
    const oa = a + (cosT * tC * k - a) * w;
    const ob = b + (sinT * tC * k - b) * w;
    let l = oL + 0.3963377774 * oa + 0.2158037573 * ob;
    let m = oL - 0.1055613458 * oa - 0.0638541728 * ob;
    let s = oL - 0.0894841775 * oa - 1.291485548 * ob;
    l = l * l * l;
    m = m * m * m;
    s = s * s * s;
    px[i] = lin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
    px[i + 1] = lin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
    px[i + 2] = lin(-0.0041960771 * l - 0.7034186147 * m + 1.707614794 * s);
  }
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** 이미 만들어 둔 결과가 있으면 바로 돌려준다 */
export function cachedTint(key: string): string | undefined {
  return done.get(key);
}

/** 하늘색 렌더(module)를 fillHex 색으로 입힌 그림의 blob URL. 실패하면 null(하늘색 원본을 쓴다). */
export function tintCharacter(key: string, module: number, fillHex: string): Promise<string | null> {
  const hit = done.get(key);
  if (hit) return Promise.resolve(hit);
  let job = pending.get(key);
  if (job) return job;
  job = (async () => {
    try {
      if (typeof document === 'undefined') return null;
      const asset = Asset.fromModule(module);
      await asset.downloadAsync();
      const img = await load(asset.localUri ?? asset.uri);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      recolor(data.data, fillHex);
      ctx.putImageData(data, 0, 0);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      done.set(key, url);
      return url;
    } catch {
      return null;
    } finally {
      pending.delete(key);
    }
  })();
  pending.set(key, job);
  return job;
}
