// 카페24 앱 등록 전에도 로컬에서 전체 흐름을 돌려 보기 위한 가짜 쇼핑몰.
// 데이터는 모두 예시이며 실존 브랜드·회원이 아니다.

import type { CouponOrder, CouponSpec, MemberConsent, Product, ShopApi, SmsSpec } from "./api";

const PRODUCTS: Product[] = [
  { productNo: 101, name: "데일리 숄더백 (블랙)", price: 59_000 },
  { productNo: 102, name: "미니 크로스백 (크림)", price: 45_000 },
  { productNo: 103, name: "캔버스 토트백", price: 39_000 },
  { productNo: 104, name: "레더 카드지갑", price: 29_000 },
  { productNo: 105, name: "니트 버킷햇", price: 32_000 },
  { productNo: 106, name: "스웨이드 버킷백", price: 68_000 },
  { productNo: 107, name: "나일론 백팩", price: 54_000 },
  { productNo: 108, name: "체인 스트랩", price: 19_000 },
];

const members = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${String(i + 1).padStart(3, "0")}`);
const WISH: Record<number, string[]> = { 101: members("user", 320), 102: members("user", 140), 103: members("buyer", 60), 104: members("buyer", 25), 105: [], 106: members("fan", 210), 107: members("fan", 12), 108: [] };
const CART: Record<number, string[]> = { 101: members("cart", 48), 102: members("cart", 20), 103: members("cart", 9), 104: [], 105: members("cart", 3), 106: members("cart", 31), 107: members("cart", 2), 108: [] };

export class MockCafe24Api implements ShopApi {
  coupons = new Map<string, { spec: CouponSpec; issued: Set<string> }>();
  sent: SmsSpec[] = [];
  orders: CouponOrder[] = [];

  async listProducts(offset: number, limit: number) { return PRODUCTS.slice(offset, offset + limit); }
  // 실제 카페24처럼 상품마다 조회 시간이 걸리는 것을 흉내 낸다 (MOCK_DELAY_MS, 기본 0)
  private delay = () => new Promise((r) => setTimeout(r, Number(process.env.MOCK_DELAY_MS ?? 0)));
  async wishlistCount(p: number) { await this.delay(); return WISH[p]?.length ?? 0; }
  async wishlistMembers(p: number) { return (WISH[p] ?? []).slice(0, 100); }
  async cartCount(p: number) { return CART[p]?.length ?? 0; }
  async cartMembers(p: number) { return CART[p] ?? []; }
  async consents(ids: string[]): Promise<MemberConsent[]> {
    // 대략 60%가 수신동의 (예시)
    return ids.map((id) => ({ memberId: id, sms: [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 5 < 3 }));
  }
  async createCoupon(spec: CouponSpec) {
    const no = `MOCK${this.coupons.size + 1}`;
    this.coupons.set(no, { spec, issued: new Set() });
    return no;
  }
  async issueCoupon(no: string, ids: string[]) { ids.forEach((id) => this.coupons.get(no)?.issued.add(id)); }
  async sendSms(spec: SmsSpec) { this.sent.push(spec); }
  async installScriptTag() { return "MOCK_SCRIPT_1"; }
  async couponOrders(no: string) { return this.orders.filter((o) => o.couponNo === no); }
}
