// 찜 공구가 카페24에 기대하는 기능의 경계. 실제 연동(real.ts)과 모의 쇼핑몰(mock.ts)이 같은 모양을 따른다.

export type Product = { product_no: number; product_name: string; price: number; sold_out: boolean };

export type OrderInfo = {
  order_id: string;
  member_id: string;
  coupon_nos: string[];
  items: { product_no: number; qty: number; amount: number }[];
  status: 'paid' | 'pending' | 'cancelled';   // pending: 주문은 했지만 아직 입금 전 (무통장 등)
  paid_at: string;
};

export type CouponSpec = {
  name: string;
  product_no: number;
  discount_amount: number;      // 정가 − 공구가 (정액 할인)
  available_from: string;       // ISO
  available_until: string;      // ISO
};

export interface Cafe24Port {
  listProducts(mallId: string): Promise<Product[]>;
  wishlistCount(mallId: string, productNo: number): Promise<number>;
  cartCount(mallId: string, productNo: number): Promise<number>;
  wishlistMembers(mallId: string, productNo: number): Promise<string[]>;
  cartMembers(mallId: string, productNo: number): Promise<string[]>;
  /** 문자 수신에 동의한(sms=T) 회원만 돌려준다 */
  smsConsented(mallId: string, memberIds: string[]): Promise<Set<string>>;
  /** 회원 ID로 발송. 카페24가 수신거부자를 한 번 더 제외한다 */
  sendSms(mallId: string, msg: { member_ids: string[]; content: string; is_ad: boolean }): Promise<{ queue_ref: string }>;
  createCoupon(mallId: string, spec: CouponSpec): Promise<{ coupon_no: string }>;
  issueCoupon(mallId: string, couponNo: string, memberIds: string[]): Promise<void>;
  listCouponHolders(mallId: string, couponNo: string): Promise<string[]>;
  getOrder(mallId: string, orderId: string): Promise<OrderInfo | null>;
  listOrdersWithCoupon(mallId: string, couponNo: string, sinceIso: string): Promise<OrderInfo[]>;
  /** 위젯이 보낸 암호화 회원 ID를 검증해 member_id를 돌려준다. 실패하면 null */
  verifyMember(mallId: string, encryptedMemberId: string): Promise<string | null>;
}
