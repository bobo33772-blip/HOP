// 카페24에 요청하는 권한 목록 — 최소 권한 원칙.
// 스토어 심사 소명 자료의 표와 반드시 같이 고칠 것.
// 개인정보(mall.read_privacy)는 카페24 별도 승인이 필요해 개발자센터 권한 목록에 없다(2026-10-08 문의 중).
// 승인 전에는 CAFE24_PRIVACY_SCOPE를 비워 두고 '장바구니 고객 공구'로 동작한다. 승인 후 1로 바꾸면 찜 고객까지 넓힌다.

export interface ScopeInfo { scope: string; why: string }

const PRIVACY: ScopeInfo = { scope: "mall.read_privacy", why: "상품별 찜 회원과 문자 수신동의 여부를 확인해, 동의한 고객에게만 공구 초대를 보냅니다." };

const BASE: ScopeInfo[] = [
  { scope: "mall.read_product", why: "공구를 열 상품 이름·가격을 불러옵니다." },
  { scope: "mall.read_personal", why: "상품을 장바구니에 담은 회원을 찾아 공구 초대 대상으로 삼습니다." },
  { scope: "mall.read_customer", why: "상품 페이지 위젯에서 로그인한 회원 본인인지 확인(암호화 회원 ID)해, 본인만 공구에 신청할 수 있게 합니다." },
  { scope: "mall.read_promotion", why: "공구 쿠폰 발급 상태를 확인합니다." },
  { scope: "mall.write_promotion", why: "목표를 달성하면 신청 회원에게만 쓸 수 있는 1회용 할인 쿠폰을 만들고 발급합니다." },
  { scope: "mall.read_order", why: "공구 쿠폰으로 결제된 주문만 집계해 확정 수량을 계산합니다." },
  { scope: "mall.read_notification", why: "등록된 문자 발신번호를 확인합니다." },
  { scope: "mall.write_notification", why: "공구 초대와 결과 안내 문자를 판매자 SMS로 보냅니다. 수신거부 고객은 카페24가 자동으로 제외합니다." },
  { scope: "mall.read_application", why: "설치된 위젯 스크립트 상태를 확인합니다." },
  { scope: "mall.write_application", why: "상품 페이지에 공구 진행률 위젯 스크립트를 설치합니다." },
];

export const privacyScopeEnabled = () => process.env.CAFE24_PRIVACY_SCOPE === "1";

/** 지금 요청하는 권한 (개발자센터 STEP 01 권한선택과 같아야 설치가 된다) */
export function requestedScopes(): ScopeInfo[] {
  return privacyScopeEnabled() ? [BASE[0], PRIVACY, ...BASE.slice(1)] : BASE;
}

export const scopeString = () => requestedScopes().map((s) => s.scope).join(" ");
