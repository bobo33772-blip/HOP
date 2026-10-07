// 핵심 엔티티. 개인정보 최소 저장: 회원 ID·수신동의 여부·신청 이력·주문번호/금액만. 이름·전화번호는 저장하지 않는다.

import { pgTable, text, integer, timestamp, boolean, jsonb, uuid, serial, date, uniqueIndex, index } from "drizzle-orm/pg-core";

export const malls = pgTable("malls", {
  mallId: text("mall_id").primaryKey(),
  shopNo: integer("shop_no").notNull().default(1),
  accessTokenEnc: text("access_token_enc"),
  refreshTokenEnc: text("refresh_token_enc"),
  accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }),
  refreshExpiresAt: timestamp("refresh_expires_at", { withTimezone: true }),
  scopes: text("scopes").array().notNull().default([]),
  plan: text("plan").notNull().default("trial"),
  smsSender: text("sms_sender"),
  optOutNumber: text("opt_out_number"),
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
  wishlistCount: integer("wishlist_count").notNull(),
  cartCount: integer("cart_count").notNull(),
  collectedAt: timestamp("collected_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("demand_mall_idx").on(t.mallId, t.collectedAt)]);

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  mallId: text("mall_id").notNull(),
  productNo: integer("product_no").notNull(),
  productName: text("product_name").notNull(),
  targetQty: integer("target_qty").notNull(),
  dealPrice: integer("deal_price").notNull(),
  listPrice: integer("list_price").notNull(),
  costPrice: integer("cost_price"),
  deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
  payWindowHours: integer("pay_window_hours").notNull().default(72),
  perMemberLimit: integer("per_member_limit").notNull().default(1),
  shipEta: date("ship_eta", { mode: "date" }).notNull(),
  state: text("state").notNull().default("draft"),
  cafe24CouponNo: text("cafe24_coupon_no"),
  extended: boolean("extended").notNull().default(false),
  extendReason: text("extend_reason"),
  invitedCount: integer("invited_count").notNull().default(0),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  judgedAt: timestamp("judged_at", { withTimezone: true }),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("campaign_mall_idx").on(t.mallId, t.state)]);

export const pledges = pgTable("pledges", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  mallId: text("mall_id").notNull(),
  memberId: text("member_id").notNull(),
  qty: integer("qty").notNull(),
  state: text("state").notNull().default("pledged"),
  idempotencyKey: text("idempotency_key").notNull(),
  orderId: text("order_id"),
  paidAmount: integer("paid_amount"),
  couponIssuedAt: timestamp("coupon_issued_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("pledge_idem_uq").on(t.idempotencyKey),
  index("pledge_campaign_member_idx").on(t.campaignId, t.memberId),
]);

export const messageLogs = pgTable("message_logs", {
  id: serial("id").primaryKey(),
  mallId: text("mall_id").notNull(),
  campaignId: uuid("campaign_id"),
  kind: text("kind").notNull(), // invite | result_reached | result_failed | reminder
  memberId: text("member_id").notNull(),
  isAd: boolean("is_ad").notNull(),
  status: text("status").notNull(), // queued | sent | skipped_no_consent | failed
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
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
  actor: text("actor").notNull(), // seller:<user_id> | system | customer:<member_id>
  action: text("action").notNull(),
  detail: jsonb("detail"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});
