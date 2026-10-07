// 핵심 엔티티. 개인정보 최소 저장: 회원 ID·신청 이력·주문번호/금액만. 고객 이름·전화번호·주소는 저장하지 않는다.
// 문자는 카페24 SMS에 회원 ID만 넘겨 보낸다.

import { pgTable, text, integer, timestamp, boolean, jsonb, uuid, serial, uniqueIndex, index, primaryKey } from "drizzle-orm/pg-core";

export const malls = pgTable("malls", {
  mallId: text("mall_id").primaryKey(),
  shopNo: integer("shop_no").notNull().default(1),
  brandName: text("brand_name"), // 광고 문자 맨 앞에 붙는 발신 브랜드명
  smsSender: text("sms_sender"), // 카페24에 등록된 문자 발신번호
  optOutNumber: text("opt_out_number"), // 무료수신거부 번호 (광고 문자 필수)
  accessTokenEnc: text("access_token_enc"),
  refreshTokenEnc: text("refresh_token_enc"),
  accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }),
  refreshExpiresAt: timestamp("refresh_expires_at", { withTimezone: true }),
  scopes: text("scopes").array().notNull().default([]),
  plan: text("plan").notNull().default("trial"),
  scriptTagNo: text("script_tag_no"),
  installedAt: timestamp("installed_at", { withTimezone: true }).notNull().defaultNow(),
  uninstalledAt: timestamp("uninstalled_at", { withTimezone: true }),
});

export const oauthStates = pgTable("oauth_states", {
  state: text("state").primaryKey(),
  mallId: text("mall_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 수요 레이더 수집 1회 = run 1개. 찜 웹훅이 없어 상품 단위로 하나씩 묻는 배치라 수 분~수 시간 걸릴 수 있다.
export const collectionRuns = pgTable("collection_runs", {
  id: serial("id").primaryKey(),
  mallId: text("mall_id").notNull(),
  status: text("status").notNull().default("running"), // running | done | failed
  totalProducts: integer("total_products").notNull().default(0),
  doneProducts: integer("done_products").notNull().default(0),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => [index("run_mall_idx").on(t.mallId, t.startedAt)]);

export const demandSnapshots = pgTable("demand_snapshots", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull(),
  mallId: text("mall_id").notNull(),
  productNo: integer("product_no").notNull(),
  productName: text("product_name").notNull(),
  price: integer("price").notNull(),
  soldOut: boolean("sold_out").notNull().default(false),
  wishlistCount: integer("wishlist_count").notNull(),
  cartCount: integer("cart_count").notNull(),
  collectedAt: timestamp("collected_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("demand_mall_idx").on(t.mallId, t.collectedAt)]);

// 공구. state: open → reached | failed, reached → settled (결제 기간 종료).
export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  mallId: text("mall_id").notNull().references(() => malls.mallId),
  productNo: integer("product_no").notNull(),
  productName: text("product_name").notNull(),
  listPrice: integer("list_price").notNull(),
  dealPrice: integer("deal_price").notNull(),
  costPrice: integer("cost_price"),
  targetQty: integer("target_qty").notNull(),
  perMemberLimit: integer("per_member_limit").notNull(),
  deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
  payWindowHours: integer("pay_window_hours").notNull(),
  shipEta: text("ship_eta").notNull(), // YYYY-MM-DD (고객에게 그대로 보여 준다)
  state: text("state").notNull().default("open"),
  couponNo: text("coupon_no"),
  reportToken: text("report_token").notNull(),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
  judgedAt: timestamp("judged_at", { withTimezone: true }),
  payUntil: timestamp("pay_until", { withTimezone: true }),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  decisionQty: integer("decision_qty"), // 판매자가 확정 수량을 보고 정한 생산·발주 수량 (원씽)
  decisionNote: text("decision_note"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
}, (t) => [
  index("campaign_mall_idx").on(t.mallId, t.state),
  uniqueIndex("campaign_report_token_uq").on(t.reportToken),
]);

export const invitations = pgTable("invitations", {
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  memberId: text("member_id").notNull(),
  source: text("source").notNull(), // wishlist | cart | both
}, (t) => [primaryKey({ columns: [t.campaignId, t.memberId] })]);

// state: pledged | cancelled | coupon_issued | paid | expired | not_reached
export const pledges = pgTable("pledges", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  memberId: text("member_id").notNull(),
  qty: integer("qty").notNull(),
  state: text("state").notNull().default("pledged"),
  idemKey: text("idem_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (t) => [uniqueIndex("pledge_campaign_member_uq").on(t.campaignId, t.memberId)]);

// 공구 쿠폰으로 결제된 주문. status: paid | cancelled | late(결제 기간 뒤 결제), source: webhook | reconcile
export const orderLinks = pgTable("order_links", {
  orderId: text("order_id").primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  memberId: text("member_id").notNull(),
  qty: integer("qty").notNull(),
  amount: integer("amount").notNull(),
  status: text("status").notNull(),
  source: text("source").notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (t) => [index("order_campaign_idx").on(t.campaignId)]);

// 예약 문자. kind: invite_ad(광고) | result, status: scheduled | sending | sent | failed
export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  kind: text("kind").notNull(),
  recipients: jsonb("recipients").$type<string[]>().notNull(),
  content: text("content").notNull(),
  status: text("status").notNull().default("scheduled"),
  attempts: integer("attempts").notNull().default(0),
  sendAfter: timestamp("send_after", { withTimezone: true }).notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  queueRef: text("queue_ref"),
  error: text("error"),
}, (t) => [index("message_due_idx").on(t.status, t.sendAfter)]);

// 운영자가 확인할 일: coupon_missing | reconcile_mismatch | reconcile_fixed | sms_failed | invite_not_sent | orphan_coupon …
export const issues = pgTable("issues", {
  id: serial("id").primaryKey(),
  at: timestamp("at", { withTimezone: true }).notNull(),
  campaignId: uuid("campaign_id"),
  kind: text("kind").notNull(),
  detail: jsonb("detail").notNull(),
  resolved: boolean("resolved").notNull().default(false),
});

export const webhookEvents = pgTable("webhook_events", {
  id: serial("id").primaryKey(),
  traceId: text("trace_id").notNull(),
  eventNo: integer("event_no").notNull(),
  mallId: text("mall_id"),
  payload: jsonb("payload").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  error: text("error"),
}, (t) => [uniqueIndex("webhook_trace_uq").on(t.traceId)]);

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  mallId: text("mall_id"),
  actor: text("actor").notNull(), // operator | seller:<user_id> | system | scheduler | customer:<member_id>
  action: text("action").notNull(),
  target: text("target"),
  detail: jsonb("detail"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});
