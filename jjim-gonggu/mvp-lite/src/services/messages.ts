import { recordIssue } from '../db.ts';
import { isQuietHours, nextAllowedSendTime } from '../time.ts';
import type { Ctx } from '../context.ts';

const MAX_ATTEMPTS = 3;

type Row = { id: string; campaign_id: string; kind: string; recipients_json: string; content: string; attempts: number; mall_id: string; state: string; deadline_at: string };

/** 예약된 문자를 보낸다. 광고 문자는 21~08시에 보내지 않고, 판정 결과 문자도 같은 시간대를 피한다 */
export async function releaseDueMessages(ctx: Ctx): Promise<number> {
  const now = ctx.clock.now();
  const due = ctx.db.prepare(`SELECT m.id, m.campaign_id, m.kind, m.recipients_json, m.content, m.attempts, c.mall_id, c.state, c.deadline_at
    FROM messages m JOIN campaigns c ON c.id = m.campaign_id
    WHERE m.status = 'scheduled' AND m.send_after <= ? ORDER BY m.send_after`).all(now.toISOString()) as Row[];
  let sent = 0;
  for (const m of due) {
    // 마감이 지난 공구의 초대(광고) 문자는 보내지 않는다. 참여할 수 없는 공구를 광고하게 되기 때문이다
    if (m.kind === 'invite_ad' && (m.state !== 'open' || now >= new Date(m.deadline_at))) {
      ctx.db.prepare("UPDATE messages SET status = 'failed', error = ? WHERE id = ?").run('마감 후라 보내지 않음', m.id);
      recordIssue(ctx.db, now, m.campaign_id, 'invite_not_sent', { message_id: m.id, reason: '마감 전에 발송 가능 시간이 오지 않음' });
      continue;
    }
    if (isQuietHours(now)) {
      ctx.db.prepare('UPDATE messages SET send_after = ? WHERE id = ?').run(nextAllowedSendTime(now).toISOString(), m.id);
      continue;
    }
    if (m.kind === 'invite_ad' && !m.content.startsWith('(광고)')) {
      ctx.db.prepare("UPDATE messages SET status = 'failed', error = ? WHERE id = ?").run('(광고) 표기 누락으로 발송 차단', m.id);
      recordIssue(ctx.db, now, m.campaign_id, 'ad_label_missing', { message_id: m.id });
      continue;
    }
    const ids: string[] = JSON.parse(m.recipients_json);
    try {
      const refs: string[] = [];
      for (let i = 0; i < ids.length; i += 100) {
        const r = await ctx.cafe24.sendSms(m.mall_id, { member_ids: ids.slice(i, i + 100), content: m.content, is_ad: m.kind === 'invite_ad' });
        refs.push(r.queue_ref);
      }
      ctx.db.prepare("UPDATE messages SET status = 'sent', sent_at = ?, queue_ref = ?, attempts = attempts + 1, error = NULL WHERE id = ?")
        .run(now.toISOString(), refs.join(','), m.id);
      sent++;
    } catch (e) {
      const attempts = m.attempts + 1;
      const final = attempts >= MAX_ATTEMPTS;
      ctx.db.prepare('UPDATE messages SET status = ?, attempts = ?, error = ?, send_after = ? WHERE id = ?')
        .run(final ? 'failed' : 'scheduled', attempts, String(e), new Date(now.getTime() + 10 * 60 * 1000).toISOString(), m.id);
      if (final) recordIssue(ctx.db, now, m.campaign_id, 'sms_failed', { message_id: m.id, error: String(e) });
      ctx.log('sms 발송 실패', { id: m.id, attempts, error: String(e) });
    }
  }
  return sent;
}

export function retryMessage(ctx: Ctx, messageId: string) {
  const r = ctx.db.prepare("UPDATE messages SET status = 'scheduled', attempts = 0, send_after = ? WHERE id = ? AND status = 'failed'")
    .run(ctx.clock.now().toISOString(), messageId);
  return r.changes > 0;
}
