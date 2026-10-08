// PoC: 테스트몰에 쿠폰 생성 요청을 직접 보내 필드 형식을 확인한다 (토큰·키는 출력하지 않는다).
// 사용: node scripts/poc-coupon.mjs <mall_id> <variant>
import fs from "node:fs";
import { createDecipheriv } from "node:crypto";
import postgres from "postgres";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const [mall, variant = "a"] = process.argv.slice(2);
const decrypt = (blob) => {
  const [iv, tag, enc] = blob.split(".").map((s) => Buffer.from(s, "base64"));
  const d = createDecipheriv("aes-256-gcm", Buffer.from(env.TOKEN_ENC_KEY, "hex"), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
};
const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false });
const [m] = await sql`select access_token_enc from malls where mall_id = ${mall}`;
await sql.end();
const token = decrypt(m.access_token_enc);

const kst = (d) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 19) + "+09:00";
const begin = new Date(Date.now() + 2 * 86400e3), end = new Date(Date.now() + 6 * 86400e3);
const base = {
  coupon_name: "[찜꽁 PoC] 테스트 쿠폰", benefit_type: "A", issue_type: "M", issue_sub_type: "M",
  available_period_type: "F", available_begin_datetime: kst(begin), available_end_datetime: kst(end),
  available_scope: "P", available_product: "I", available_product_list: [12], available_category: "U",
  available_amount_type: "E", available_coupon_count_by_order: 1, issue_max_count_by_user: 1, issue_reserved: "F",
};
const variants = {
  a: { ...base, available_site: ["W", "M"], discount_amount: { benefit_price: "13000.00" } },
  b: { ...base, available_site: "W,M", discount_amount: { benefit_price: "13000.00" } },
  c: { ...base, available_site: ["W", "M"], benefit_price: 13000 },
  d: { ...base, available_site: ["W", "M"], discount_amount: { benefit_price: 13000 } },
  e: { ...base, available_site: ["W", "M"], discount_amount: { benefit_price: 13000 }, available_begin_datetime: kst(begin).slice(0, 13) + ":00:00+09:00", available_end_datetime: kst(end).slice(0, 13) + ":00:00+09:00" },
  f: { ...base, available_site: ["W", "M"], discount_amount: { benefit_price: 13000 }, available_begin_datetime: kst(begin).slice(0, 10) + " " + kst(begin).slice(11, 13) + ":00:00", available_end_datetime: kst(end).slice(0, 10) + " " + kst(end).slice(11, 13) + ":00:00" },
  g: { ...base, available_site: ["W", "M"], discount_amount: { benefit_price: 13000 }, available_begin_datetime: kst(new Date(Date.now() + 3600e3)).slice(0, 13) + ":00:00+09:00", available_end_datetime: kst(end).slice(0, 13) + ":00:00+09:00" },
};
const res = await fetch(`https://${mall}.cafe24api.com/api/v2/admin/coupons`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Cafe24-Api-Version": "2026-09-01" },
  body: JSON.stringify({ shop_no: 1, request: variants[variant] }),
});
console.log(variant, res.status, (await res.text()).slice(0, 400));
