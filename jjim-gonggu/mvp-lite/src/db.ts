import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

// 개인정보 원칙: 고객의 전화번호·이름·주소는 저장하지 않는다.
// 고객은 쇼핑몰 회원 ID(member_id)로만 식별하고, 문자는 카페24 SMS에 회원 ID만 넘겨 보낸다.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS malls (
  mall_id TEXT PRIMARY KEY,
  shop_no INTEGER NOT NULL DEFAULT 1,
  brand_name TEXT NOT NULL,
  unsubscribe_no TEXT NOT NULL,          -- 무료수신거부 번호 (판매자 번호)
  sender_no TEXT,                        -- 판매자 문자 발신번호 (카페24에 등록된 번호)
  access_token_enc TEXT,
  refresh_token_enc TEXT,
  token_expires_at TEXT,
  installed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  mall_id TEXT NOT NULL REFERENCES malls(mall_id),
  product_no INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  list_price INTEGER NOT NULL,
  deal_price INTEGER NOT NULL,
  cost_price INTEGER,
  target_qty INTEGER NOT NULL,
  per_member_limit INTEGER NOT NULL,
  deadline_at TEXT NOT NULL,
  pay_window_h INTEGER NOT NULL,
  ship_eta TEXT NOT NULL,
  state TEXT NOT NULL,                   -- open | reached | failed | settled
  coupon_no TEXT,
  report_token TEXT NOT NULL UNIQUE,
  opened_at TEXT NOT NULL,
  judged_at TEXT,
  pay_until TEXT,
  settled_at TEXT,
  decision_qty INTEGER,                  -- 판매자가 확정 수량을 보고 정한 생산·발주 수량
  decision_note TEXT,
  decided_at TEXT
);
CREATE TABLE IF NOT EXISTS invitations (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  member_id TEXT NOT NULL,
  source TEXT NOT NULL,                  -- wishlist | cart | both
  PRIMARY KEY (campaign_id, member_id)
);
CREATE TABLE IF NOT EXISTS pledges (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  member_id TEXT NOT NULL,
  qty INTEGER NOT NULL,
  state TEXT NOT NULL,                   -- pledged | cancelled | coupon_issued | paid | expired | not_reached
  idem_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (campaign_id, member_id)
);
CREATE TABLE IF NOT EXISTS order_links (
  order_id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  member_id TEXT NOT NULL,
  qty INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL,                  -- paid | cancelled | late
  source TEXT NOT NULL,                  -- webhook | reconcile
  paid_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  kind TEXT NOT NULL,                    -- invite_ad | result
  recipients_json TEXT NOT NULL,         -- 회원 ID 목록
  content TEXT NOT NULL,
  status TEXT NOT NULL,                  -- scheduled | sent | failed
  attempts INTEGER NOT NULL DEFAULT 0,
  send_after TEXT NOT NULL,
  sent_at TEXT,
  queue_ref TEXT,
  error TEXT
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT
);
CREATE TABLE IF NOT EXISTS issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  campaign_id TEXT,
  kind TEXT NOT NULL,                    -- coupon_missing | reconcile_mismatch | sms_failed ...
  detail TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0
);
`;

export type DB = DatabaseSync;

export function openDb(path = ':memory:'): DB {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

export function tx<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

export const newId = (prefix: string) => `${prefix}_${randomBytes(9).toString('base64url')}`;

export function audit(db: DB, at: Date, actor: string, action: string, target?: string, detail?: unknown) {
  db.prepare('INSERT INTO audit_log (at, actor, action, target, detail) VALUES (?, ?, ?, ?, ?)')
    .run(at.toISOString(), actor, action, target ?? null, detail === undefined ? null : JSON.stringify(detail));
}

export function recordIssue(db: DB, at: Date, campaignId: string | null, kind: string, detail: unknown) {
  db.prepare('INSERT INTO issues (at, campaign_id, kind, detail) VALUES (?, ?, ?, ?)')
    .run(at.toISOString(), campaignId, kind, JSON.stringify(detail));
}

// 카페24 토큰은 AES-256-GCM으로 암호화해 저장한다.
function keyFrom(secret: string) { return createHash('sha256').update(secret).digest(); }

export function encryptSecret(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map(b => b.toString('base64url')).join('.');
}

export function decryptSecret(blob: string, secret: string): string {
  const [iv, tag, enc] = blob.split('.').map(s => Buffer.from(s, 'base64url'));
  const d = createDecipheriv('aes-256-gcm', keyFrom(secret), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}
