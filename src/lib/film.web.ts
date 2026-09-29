// 웹(개발 미리보기)에서는 Skia(CanvasKit)를 불러오지 않고 원본을 그대로 쓴다.
// 화면에 보일 때 FilmPhoto가 필름 효과를 덧입힌다.
export async function bakeFilm(uri: string): Promise<{ uri: string; baked: boolean }> {
  return { uri, baked: false };
}

export const isBaked = (src: unknown) => typeof src === 'string' && src.includes('.film.');
