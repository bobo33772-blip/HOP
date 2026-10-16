// 데모 역할 (#104): 시연 · 영상에서 지금 보는 화면이 누구의 것인지 구분한다.
// 색은 globals.css의 포인트색 · 보조색. 데모 상점(일반 HTML)은 같은 값을 직접 쓴다.

export type DemoRole = "seller" | "shopper" | "admin";

export const DEMO_ROLES: Record<DemoRole, { name: string; who: string; where: string; color: string; ink: string }> = {
  seller: { name: "판매자", who: "쇼핑몰 사장님", where: "카페24 관리자에서 찜꽁 앱을 연 화면", color: "var(--brand)", ink: "var(--brand-ink)" },
  shopper: { name: "소비자", who: "쇼핑몰 고객", where: "쇼핑몰 상품 페이지에 붙은 찜꽁 위젯", color: "var(--blue)", ink: "var(--blue-ink)" },
  admin: { name: "관리자", who: "찜꽁 운영팀", where: "파일럿 동안 모든 쇼핑몰을 함께 보는 운영자 화면", color: "var(--violet)", ink: "var(--violet-ink)" },
};
