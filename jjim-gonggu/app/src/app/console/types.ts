// 공구 관리 화면이 API와 주고받는 데이터 모양. 운영자 화면과 판매자 화면이 같이 쓴다.

export type State = "open" | "reached" | "failed" | "settled";
export interface Mall { mallId: string; brandName: string | null; optOutNumber: string | null; smsSender: string | null; senders?: { senderNo: string; number: string; status: string }[] | null }
export interface Camp { id: string; state: State; productName: string; targetQty: number; pledgedQty: number; deadlineAt: string; payUntil: string | null }
export interface Report {
  campaign: { id: string; productName: string; state: State; listPrice: number; dealPrice: number; targetQty: number; deadlineAt: string; payUntil: string | null; shipEta: string; decision: { qty: number; note: string; at: string } | null };
  funnel: { invited: number; invitedSent: number; pledgers: number; invitedPledgers: number; pledgedQty: number; couponIssued: number; paidMembers: number };
  confirmed: { qty: number; revenue: number; unpaidMembers: number; cancelledOrders: number; lateOrders: number; successFee: number; expected: number | null };
  rates: { inviteToPledge: number | null; pledgeToPaid: number | null };
}
export interface Detail {
  report: Report; reportToken: string;
  messages: { id: string; kind: string; recipients: number; content: string; status: "scheduled" | "sending" | "sent" | "failed"; sendAfter: string; sentAt: string | null; error: string | null }[];
  issues: { id: number; at: string; kind: string; detail: unknown }[];
}
export interface RadarRow { productNo: number; name: string; price: number; soldOut: boolean; wishlist: number; cart: number }
export interface Run { status: "running" | "done" | "failed"; total: number; done: number; finishedAt: string | null; startedAt: string }
export interface Preview {
  errors: string[]; warnings: string[]; message: string; sendAt: string; marginPerUnit: number | null;
  audience: { wishlist: number; cart: number; unique: number; reachable: number; consentChecked: boolean };
}
