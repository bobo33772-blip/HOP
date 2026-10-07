import type { Ctx } from '../context.ts';
import { getCampaign, pledgedQty } from './campaigns.ts';

export const SUCCESS_FEE_RATE = 0.015; // 스타터 요금제 기준. 4주 파일럿은 무료라 표시만 한다.

const num = (ctx: Ctx, sql: string, ...a: unknown[]) => Number((ctx.db.prepare(sql).get(...(a as any[])) as { n: number }).n);

/** 확정 리포트: 결제 완료 기준 확정 수량과 4주 성공 기준에 쓰는 퍼널 숫자 */
export function buildReport(ctx: Ctx, campaignId: string) {
  const c = getCampaign(ctx, campaignId);
  const invited = num(ctx, 'SELECT COUNT(*) AS n FROM invitations WHERE campaign_id = ?', c.id);
  const invitedSent = num(ctx, "SELECT COUNT(*) AS n FROM messages WHERE campaign_id = ? AND kind = 'invite_ad' AND status = 'sent'", c.id) > 0 ? invited : 0;
  const pledgers = num(ctx, "SELECT COUNT(*) AS n FROM pledges WHERE campaign_id = ? AND state != 'cancelled'", c.id);
  const invitedPledgers = num(ctx, "SELECT COUNT(*) AS n FROM pledges p JOIN invitations i ON i.campaign_id = p.campaign_id AND i.member_id = p.member_id WHERE p.campaign_id = ? AND p.state != 'cancelled'", c.id);
  const paidMembers = num(ctx, "SELECT COUNT(DISTINCT member_id) AS n FROM order_links WHERE campaign_id = ? AND status = 'paid'", c.id);
  const confirmedQty = num(ctx, "SELECT COALESCE(SUM(qty),0) AS n FROM order_links WHERE campaign_id = ? AND status = 'paid'", c.id);
  const revenue = num(ctx, "SELECT COALESCE(SUM(amount),0) AS n FROM order_links WHERE campaign_id = ? AND status = 'paid'", c.id);
  const cancelledOrders = num(ctx, "SELECT COUNT(*) AS n FROM order_links WHERE campaign_id = ? AND status = 'cancelled'", c.id);
  const lateOrders = num(ctx, "SELECT COUNT(*) AS n FROM order_links WHERE campaign_id = ? AND status = 'late'", c.id);
  const couponIssued = num(ctx, "SELECT COUNT(*) AS n FROM pledges WHERE campaign_id = ? AND state IN ('coupon_issued','paid','expired')", c.id);
  const openIssues = num(ctx, 'SELECT COUNT(*) AS n FROM issues WHERE campaign_id = ? AND resolved = 0', c.id);
  const rate = (a: number, b: number) => (b ? a / b : null);
  return {
    campaign: {
      id: c.id, mall_id: c.mall_id, product_no: c.product_no, product_name: c.product_name, state: c.state,
      list_price: c.list_price, deal_price: c.deal_price, target_qty: c.target_qty, deadline_at: c.deadline_at,
      pay_until: c.pay_until, ship_eta: c.ship_eta, settled_at: c.settled_at,
      decision: c.decided_at ? { qty: c.decision_qty, note: c.decision_note, at: c.decided_at } : null,
    },
    funnel: { invited, invited_sent: invitedSent, pledgers, invited_pledgers: invitedPledgers, pledged_qty: pledgedQty(ctx, c.id), coupon_issued: couponIssued, paid_members: paidMembers },
    confirmed: { qty: confirmedQty, revenue, unpaid_members: Math.max(0, couponIssued - paidMembers), cancelled_orders: cancelledOrders, late_orders: lateOrders, success_fee: Math.round(revenue * SUCCESS_FEE_RATE) },
    rates: {
      invite_to_pledge: rate(invitedPledgers, invitedSent),
      pledge_to_paid: rate(paidMembers, couponIssued),
      reached: c.state === 'open' ? null : c.state !== 'failed',
    },
    open_issues: openIssues,
    final: c.state === 'settled' || c.state === 'failed',
  };
}

/** 4주 성공 기준 판정표 (기획서 '4주 MVP · 목표'와 같은 기준) */
export function pilotScorecard(ctx: Ctx) {
  const camps = ctx.db.prepare("SELECT id, mall_id, state FROM campaigns").all() as { id: string; mall_id: string; state: string }[];
  const malls = new Set(camps.map(c => c.mall_id)).size;
  const judged = camps.filter(c => c.state !== 'open');
  const reached = judged.filter(c => c.state !== 'failed').length;
  const reps = camps.map(c => buildReport(ctx, c.id));
  const sum = (f: (r: ReturnType<typeof buildReport>) => number) => reps.reduce((a, r) => a + f(r), 0);
  const sent = sum(r => r.funnel.invited_sent), invP = sum(r => r.funnel.invited_pledgers);
  const issued = sum(r => r.funnel.coupon_issued), paid = sum(r => r.funnel.paid_members);
  const coupMissing = ctx.db.prepare("SELECT COUNT(*) AS n FROM issues WHERE kind = 'coupon_missing' AND resolved = 0").get() as { n: number };
  const mismatch = ctx.db.prepare("SELECT COUNT(*) AS n FROM issues WHERE kind = 'reconcile_mismatch' AND resolved = 0").get() as { n: number };
  const decided = ctx.db.prepare("SELECT COUNT(DISTINCT mall_id) AS n FROM campaigns WHERE decided_at IS NOT NULL").get() as { n: number };
  const r = (a: number, b: number) => (b ? a / b : null);
  const rows = [
    { key: 'one_thing', label: '확정 수량으로 생산을 결정한 판매자', value: Number(decided.n), goal: '1곳 이상', pass: Number(decided.n) >= 1 },
    { key: 'scale', label: '파일럿 몰 · 연 공구', value: `${malls}몰 · ${camps.length}건`, goal: '3몰 · 3건 이상', pass: malls >= 3 && camps.length >= 3 },
    { key: 'reach_rate', label: '공구 성사율', value: r(reached, judged.length), goal: '60% 이상', pass: judged.length > 0 && reached / judged.length >= 0.6 },
    { key: 'invite_to_pledge', label: '초대 → 신청', value: r(invP, sent), goal: '5% 이상', pass: sent > 0 && invP / sent >= 0.05 },
    { key: 'pledge_to_paid', label: '신청 → 결제', value: r(paid, issued), goal: '50% 이상', pass: issued > 0 && paid / issued >= 0.5 },
    { key: 'accuracy', label: '쿠폰 누락 · 대사 불일치', value: Number(coupMissing.n) + Number(mismatch.n), goal: '0건', pass: Number(coupMissing.n) + Number(mismatch.n) === 0 },
  ];
  const allLowPledge = judged.length >= 3 && reps.filter(x => x.campaign.state !== 'open').every(x => (x.rates.invite_to_pledge ?? 0) < 0.02);
  const others = rows.filter(x => x.key !== 'pledge_to_paid').every(x => x.pass);
  const verdict = rows.every(x => x.pass) ? 'go' : allLowPledge ? 'rethink' : others ? 'iterate' : 'in_progress';
  return { rows, verdict };
}
