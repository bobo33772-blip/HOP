// 공구 관리 화면이 API와 주고받는 데이터 모양. 운영자 화면과 판매자 화면이 같이 쓴다.

export type State = "open" | "reached" | "failed" | "settled" | "cancelled";
export interface Mall { mallId: string; brandName: string | null; optOutNumber: string | null; smsSender: string | null; senders?: { senderNo: string; number: string; status: string }[] | null }
export interface Camp { id: string; state: State; productName: string; targetQty: number; pledgedQty: number; deadlineAt: string; payUntil: string | null; dealPrice?: number; proceeded?: boolean; productNo?: number }
export interface Report {
  campaign: { id: string; productName: string; state: State; listPrice: number; dealPrice: number; targetQty: number; deadlineAt: string; payUntil: string | null; shipEta: string; decision: { qty: number; note: string; at: string } | null; proceededAt: string | null };
  funnel: { invited: number; invitedSent: number; pledgers: number; invitedPledgers: number; pledgedQty: number; couponIssued: number; paidMembers: number };
  confirmed: { qty: number; revenue: number; unpaidMembers: number; cancelledOrders: number; lateOrders: number; expected: number | null };
  rates: { inviteToPledge: number | null; pledgeToPaid: number | null };
}
export interface Detail {
  report: Report; reportToken: string;
  messages: { id: string; kind: string; recipients: number; content: string; status: "scheduled" | "sending" | "sent" | "failed"; sendAfter: string; sentAt: string | null; error: string | null }[];
  issues: { id: number; at: string; kind: string; detail: unknown }[];
  // 미달 공구만: '그래도 살래요' 표시 수와 그래도 진행할 수 있는 기간
  proceed: { proceedUntil: string | null; proceedOpen: boolean; wanted: { members: number; qty: number }; payWindowHours: number; costPrice: number | null } | null;
}
export interface RadarRow { productNo: number; name: string; price: number; soldOut: boolean; alert: number; cart: number }
/** 공구 열기 칸 미리 채우기 (#124). costFrom: last 지난 공구 · cafe24 카페24 공급가 */
export interface ProductDefaults { costPrice: number | null; costFrom: "last" | "cafe24" | null; moq: number | null }
export interface Run { status: "running" | "done" | "failed"; total: number; done: number; finishedAt: string | null; startedAt: string }
export interface Preview {
  errors: string[]; warnings: string[]; message: string; sendAt: string; marginPerUnit: number | null;
  audience: { alert: number; cart: number; unique: number; reachable: number; consentChecked: boolean };
}
/** 공구 매출 (#79). 숫자 기준은 리포트의 확정 매출과 같다 */
export type SalesBy = "day" | "week" | "month";
export interface SalesRow {
  id: string; productNo: number; productName: string; state: State; proceeded: boolean;
  openedAt: string; deadlineAt: string; payUntil: string | null; settledAt: string | null;
  listPrice: number; dealPrice: number; targetQty: number;
  orders: number; qty: number; revenue: number; cancelledOrders: number; lateOrders: number;
  couponMembers: number; paidMembers: number; waitingMembers: number; waitingQty: number; // 쿠폰 받은 · 결제한 · 결제 대기 (#92)
}
export interface Sales {
  by: SalesBy;
  totals: { campaigns: number; orders: number; qty: number; revenue: number; thisMonth: number; lastMonth: number };
  waiting: { campaigns: number; members: number; qty: number; amount: number; payUntil: string | null }; // 쿠폰 받고 아직 결제 안 한 금액 (#92)
  recruiting: { campaigns: number; qty: number; amount: number; reachedTarget: number }; // 모집 중 신청 수량 × 공구가 (#92)
  trend: { points: { key: string; label: string; orders: number; qty: number; revenue: number }[]; truncated: boolean };
  campaigns: SalesRow[];
}
/** 모니터링 › 기간별 (#92). 숫자 기준은 공구 매출과 같다(결제 기간 안 쿠폰 결제, 취소 · 반품 뺌) */
export type SalesSource = "cart" | "alert" | "direct";
export interface PeriodSum { revenue: number; qty: number; orders: number }
export interface SalesPeriods extends PeriodSum {
  month: string; label: string; isCurrent: boolean;
  compare: { label: string; revenue: number; diff: number }; // 이번 달이면 '지난달 같은 기간', 지난 달이면 '전달'
  months: ({ key: string; label: string } & PeriodSum)[];
  byProduct: ({ productNo: number; name: string } & PeriodSum)[];
  bySource: ({ source: SalesSource } & PeriodSum)[];
}
