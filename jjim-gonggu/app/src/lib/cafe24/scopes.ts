// 카페24에 요청하는 권한 목록 — 최소 권한 원칙.
// 스토어 심사 소명서(docs/STORE_REVIEW.md)의 표와 반드시 같이 고칠 것.

export const SCOPES = [
  { scope: "mall.read_product", why: "공구를 열 상품 이름·가격·옵션을 불러옵니다." },
  { scope: "mall.read_privacy", why: "상품별 찜 회원과 문자 수신동의 여부를 확인해, 동의한 고객에게만 공구 초대를 보냅니다." },
  { scope: "mall.read_personal", why: "장바구니에 담은 회원과 회원별 찜 목록으로 공구 대상을 찾습니다." },
  { scope: "mall.read_promotion", why: "공구 쿠폰 발급 상태를 확인합니다." },
  { scope: "mall.write_promotion", why: "목표를 달성하면 신청 회원에게만 쓸 수 있는 1회용 할인 쿠폰을 만들고 발급합니다." },
  { scope: "mall.read_order", why: "공구 쿠폰으로 결제된 주문만 집계해 확정 수량을 계산합니다." },
  { scope: "mall.read_notification", why: "등록된 문자 발신번호를 확인합니다." },
  { scope: "mall.write_notification", why: "공구 초대와 결과 안내 문자를 판매자 SMS로 보냅니다." },
  { scope: "mall.read_application", why: "설치된 위젯 스크립트 상태를 확인합니다." },
  { scope: "mall.write_application", why: "상품 페이지에 공구 진행률 위젯 스크립트를 설치합니다." },
] as const;

export const SCOPE_STRING = SCOPES.map((s) => s.scope).join(" ");
