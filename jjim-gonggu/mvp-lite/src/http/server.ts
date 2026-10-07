import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Router, sendHtml, sendJson, cors, rateLimiter, type Req } from './router.ts';
import { adminPage, loginPage, reportPage } from './pages.ts';
import { UserError, type Ctx } from '../context.ts';
import { audit } from '../db.ts';
import { activeCampaignForProduct, getCampaign, openCampaign, previewCampaign, publicView, recordProductionDecision, pledgedQty, type Campaign } from '../services/campaigns.ts';
import { createPledge, cancelPledge, myPledge } from '../services/pledges.ts';
import { judgeNow } from '../services/judge.ts';
import { handleOrderWebhook, reconcileCampaign } from '../services/payments.ts';
import { buildReport, pilotScorecard } from '../services/report.ts';
import { topWishedProducts } from '../services/radar.ts';
import { retryMessage } from '../services/messages.ts';
import { RealCafe24, type Cafe24Config } from '../cafe24/real.ts';

export type ServerOptions = {
  adminToken: string;
  publicBaseUrl: string;
  webhookSecret?: string;        // VERIFY: 카페24 웹훅 서명 방식. 없으면 서명 검사를 건너뛴다 (본문은 어차피 믿지 않음)
  oauth?: { cfg: Cafe24Config; scopes: string[]; real: RealCafe24 };
  extraRoutes?: (r: Router) => void;
  pledgePerMinute?: number;      // IP당 분당 신청 API 호출 한도 (기본 30)
};

const WIDGET_JS = readFileSync(new URL('./widget.js', import.meta.url), 'utf8');
const SESSION_TTL = 12 * 3600 * 1000;

export function buildRouter(ctx: Ctx, opt: ServerOptions) {
  const r = new Router();
  const sessions = new Map<string, number>();
  const limitPledge = rateLimiter(opt.pledgePerMinute ?? 30);

  const isAdmin = (req: Req) => {
    const sid = /(?:^|;\s*)jjg_admin=([A-Za-z0-9_-]+)/.exec(String(req.headers.cookie ?? ''))?.[1];
    const exp = sid ? sessions.get(sid) : undefined;
    return !!exp && exp > Date.now();
  };
  const admin = (h: (req: Req, res: any) => any) => async (req: Req, res: any) => {
    if (!isAdmin(req)) throw new UserError('unauthorized', '로그인이 필요해요.', 401);
    if (req.method !== 'GET' && req.headers['x-jjg'] !== '1') throw new UserError('csrf', '허용되지 않은 요청이에요.', 403);
    return h(req, res);
  };
  const safeEq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

  // ---------- 공개: 위젯 ----------
  r.get('/widget.js', (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' }).end(WIDGET_JS);
  });
  r.get('/v1/public/malls/:mall/products/:no/campaign', (req, res) => {
    cors(res);
    const c = activeCampaignForProduct(ctx, req.params.mall, Number(req.params.no));
    if (!c) return sendJson(res, 404, { error: 'none', message: '진행 중인 공구가 없어요.' });
    sendJson(res, 200, { campaign: publicView(ctx, c) });
  });
  r.get('/v1/public/campaigns/:id/progress', (req, res) => { cors(res); sendJson(res, 200, { campaign: publicView(ctx, getCampaign(ctx, req.params.id)) }); });
  r.post('/v1/public/campaigns/:id/pledges', async (req, res) => {
    cors(res); limitPledge(req);
    const out = await createPledge(ctx, req.params.id, req.body, String(req.headers['idempotency-key'] ?? '') || undefined);
    sendJson(res, out.replay ? 200 : 201, out);
  });
  r.post('/v1/public/campaigns/:id/pledges/mine', async (req, res) => { cors(res); limitPledge(req); sendJson(res, 200, await myPledge(ctx, req.params.id, req.body)); });
  r.delete('/v1/public/campaigns/:id/pledges/mine', async (req, res) => { cors(res); limitPledge(req); sendJson(res, 200, await cancelPledge(ctx, req.params.id, req.body)); });

  // ---------- 판매자 리포트 (읽기 전용 링크) ----------
  r.get('/r/:token', (req, res) => {
    const c = ctx.db.prepare('SELECT id FROM campaigns WHERE report_token = ?').get(req.params.token) as { id: string } | undefined;
    if (!c) return sendHtml(res, '<p>리포트를 찾을 수 없어요.</p>', 404);
    sendHtml(res, reportPage(buildReport(ctx, c.id)));
  });

  // ---------- 카페24 웹훅 ----------
  r.post('/webhooks/cafe24', async (req, res) => {
    if (opt.webhookSecret) {
      const sig = String(req.headers['x-jjg-signature'] ?? req.headers['x-cafe24-hmac-sha256'] ?? '');
      const want = createHmac('sha256', opt.webhookSecret).update(req.rawBody).digest('base64');
      if (!sig || !safeEq(sig, want)) return sendJson(res, 401, { error: 'bad_signature' });
    }
    const out = await handleOrderWebhook(ctx, req.body);
    sendJson(res, 200, out);
  });

  // ---------- 카페24 설치 (OAuth) ----------
  const stateSig = (mall: string) => createHmac('sha256', opt.adminToken).update(`oauth:${mall}`).digest('base64url').slice(0, 32);
  r.get('/oauth/start', (req, res) => {
    if (!opt.oauth) throw new UserError('no_oauth', '실제 카페24 연동 모드가 아니에요.', 400);
    const mall = String(req.query.get('mall_id') ?? '');
    if (!/^[a-z0-9-]{3,40}$/.test(mall)) throw new UserError('bad_mall', '쇼핑몰 ID를 확인해 주세요.');
    const url = RealCafe24.authorizeUrl(mall, opt.oauth.cfg, `${opt.publicBaseUrl}/oauth/callback`, `${mall}.${stateSig(mall)}`, opt.oauth.scopes);
    res.writeHead(302, { Location: url }).end();
  });
  r.get('/oauth/callback', async (req, res) => {
    if (!opt.oauth) throw new UserError('no_oauth', '실제 카페24 연동 모드가 아니에요.', 400);
    const [mall, sig] = String(req.query.get('state') ?? '').split('.');
    if (!mall || !sig || !safeEq(sig, stateSig(mall))) throw new UserError('bad_state', '설치 요청을 확인할 수 없어요. 다시 시작해 주세요.', 400);
    const now = ctx.clock.now().toISOString();
    ctx.db.prepare("INSERT INTO malls (mall_id, brand_name, unsubscribe_no, installed_at) VALUES (?, ?, '', ?) ON CONFLICT(mall_id) DO NOTHING").run(mall, mall, now);
    await opt.oauth.real.exchangeCode(mall, String(req.query.get('code') ?? ''), `${opt.publicBaseUrl}/oauth/callback`);
    audit(ctx.db, ctx.clock.now(), 'oauth', 'mall.installed', mall);
    sendHtml(res, `<p style="font:16px sans-serif;padding:24px">카페24 연결을 마쳤어요. 운영팀이 브랜드명·발신번호·수신거부 번호를 확인한 뒤 공구를 열 수 있어요.</p>`);
  });

  // ---------- 운영자 ----------
  r.get('/admin', (req, res) => isAdmin(req) ? sendHtml(res, adminPage()) : sendHtml(res, loginPage()));
  r.post('/admin/login', (req, res) => {
    const t = String(req.body?.token ?? '');
    if (!t || !safeEq(t, opt.adminToken)) { audit(ctx.db, ctx.clock.now(), 'unknown', 'admin.login_failed'); return sendHtml(res, loginPage('토큰이 맞지 않아요.'), 401); }
    const sid = randomBytes(24).toString('base64url');
    sessions.set(sid, Date.now() + SESSION_TTL);
    audit(ctx.db, ctx.clock.now(), 'operator', 'admin.login');
    const secure = opt.publicBaseUrl.startsWith('https:') ? '; Secure' : '';
    res.writeHead(303, { Location: '/admin', 'Set-Cookie': `jjg_admin=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL / 1000}${secure}` }).end();
  });
  r.get('/admin/api/malls', admin((_req, res) => sendJson(res, 200, { malls: ctx.db.prepare('SELECT mall_id, brand_name, unsubscribe_no, sender_no FROM malls ORDER BY installed_at').all() })));
  r.post('/admin/api/malls/:mall/profile', admin((req, res) => {
    const b = req.body ?? {};
    const brand = String(b.brand_name ?? '').trim().slice(0, 40), unsub = String(b.unsubscribe_no ?? '').trim().slice(0, 20), sender = String(b.sender_no ?? '').trim().slice(0, 20);
    if (!brand || !/^[0-9-]{8,20}$/.test(unsub)) throw new UserError('bad_profile', '브랜드명과 무료수신거부 번호를 확인해 주세요.');
    ctx.db.prepare('UPDATE malls SET brand_name = ?, unsubscribe_no = ?, sender_no = ? WHERE mall_id = ?').run(brand, unsub, sender || null, req.params.mall);
    audit(ctx.db, ctx.clock.now(), 'operator', 'mall.profile', req.params.mall, { brand, unsub, sender });
    sendJson(res, 200, { ok: true });
  }));
  r.get('/admin/api/malls/:mall/radar', admin(async (req, res) => sendJson(res, 200, { products: await topWishedProducts(ctx, req.params.mall, 20, req.query.get('fresh') === '1') })));
  r.post('/admin/api/malls/:mall/campaigns/preview', admin(async (req, res) => sendJson(res, 200, await previewCampaign(ctx, req.params.mall, req.body))));
  r.post('/admin/api/malls/:mall/campaigns', admin(async (req, res) => sendJson(res, 201, await openCampaign(ctx, 'operator', req.params.mall, req.body))));
  r.get('/admin/api/malls/:mall/campaigns', admin((req, res) => {
    const rows = ctx.db.prepare('SELECT * FROM campaigns WHERE mall_id = ? ORDER BY opened_at DESC').all(req.params.mall) as Campaign[];
    sendJson(res, 200, { campaigns: rows.map(c => ({ ...publicView(ctx, c), pledged_qty: pledgedQty(ctx, c.id) })) });
  }));
  r.get('/admin/api/campaigns/:id', admin((req, res) => {
    const c = getCampaign(ctx, req.params.id);
    const messages = (ctx.db.prepare('SELECT id, kind, recipients_json, content, status, send_after, sent_at, error FROM messages WHERE campaign_id = ? ORDER BY send_after').all(c.id) as any[])
      .map(m => ({ ...m, recipients: JSON.parse(m.recipients_json).length, recipients_json: undefined }));
    const issues = ctx.db.prepare('SELECT at, kind, detail FROM issues WHERE campaign_id = ? AND resolved = 0 ORDER BY at DESC').all(c.id);
    sendJson(res, 200, { report: buildReport(ctx, c.id), report_token: c.report_token, messages, issues });
  }));
  r.post('/admin/api/campaigns/:id/judge', admin(async (req, res) => sendJson(res, 200, { campaign: await judgeNow(ctx, req.params.id, 'operator') })));
  r.post('/admin/api/campaigns/:id/reconcile', admin(async (req, res) => sendJson(res, 200, await reconcileCampaign(ctx, req.params.id, 'operator'))));
  r.post('/admin/api/campaigns/:id/decision', admin((req, res) => sendJson(res, 200, { campaign: recordProductionDecision(ctx, 'operator', req.params.id, req.body) })));
  r.post('/admin/api/messages/:id/retry', admin((req, res) => sendJson(res, 200, { ok: retryMessage(ctx, req.params.id) })));
  r.get('/admin/api/now', admin((_req, res) => sendJson(res, 200, { now: ctx.clock.now().toISOString() })));
  r.get('/admin/api/scorecard', admin((_req, res) => sendJson(res, 200, pilotScorecard(ctx))));

  r.get('/healthz', (_req, res) => sendJson(res, 200, { ok: true }));
  opt.extraRoutes?.(r);
  return r;
}

export function startServer(ctx: Ctx, opt: ServerOptions, port: number) {
  const router = buildRouter(ctx, opt);
  const server = createServer((req, res) => { void router.handle(req, res); });
  return new Promise<typeof server>(resolve => server.listen(port, () => resolve(server)));
}
