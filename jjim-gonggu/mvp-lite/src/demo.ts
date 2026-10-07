// 데모: 모의 카페24 쇼핑몰 위에서 6단계를 처음부터 끝까지 눌러 본다. 실제 문자·결제는 일어나지 않는다.
import { randomBytes } from 'node:crypto';
import { openDb } from './db.ts';
import { MockCafe24 } from './cafe24/mock.ts';
import { manualClock, HOUR, fmtKst } from './time.ts';
import { startServer } from './http/server.ts';
import { sendHtml, sendJson, esc, type Router } from './http/router.ts';
import { handleOrderWebhook } from './services/payments.ts';
import { activeCampaignForProduct, getCampaign } from './services/campaigns.ts';
import { createPledge } from './services/pledges.ts';
import { tick } from './scheduler.ts';
import { won, UserError, type Ctx } from './context.ts';

const MALL = 'linenco';
const PRODUCTS = [
  { product_no: 101, product_name: '워싱 린넨 이불 커버 (Q)', price: 129000, sold_out: true },
  { product_no: 102, product_name: '스톤웨어 디너 접시 4P', price: 52000, sold_out: true },
  { product_no: 103, product_name: '린넨 암막 커튼 2장', price: 89000, sold_out: false },
  { product_no: 104, product_name: '원목 수납 트레이', price: 39000, sold_out: false },
];
const WISH: Record<number, [number, number]> = { 101: [1, 180], 102: [60, 200], 103: [150, 240], 104: [300, 330] };
const CART: Record<number, [number, number]> = { 101: [170, 200], 102: [190, 230], 103: [235, 250], 104: [330, 335] };

const clock = manualClock(new Date());
const cafe24 = new MockCafe24(clock, randomBytes(16).toString('hex'));
cafe24.addMall(MALL, PRODUCTS);
for (let i = 1; i <= 400; i++) cafe24.addMember(MALL, `m${i}`, (i * 37) % 10 < 6); // 약 60% 문자 수신 동의
for (const [no, [a, b]] of Object.entries(WISH)) for (let i = a; i <= b; i++) cafe24.addWish(MALL, Number(no), `m${i}`);
for (const [no, [a, b]] of Object.entries(CART)) for (let i = a; i <= b; i++) cafe24.addCart(MALL, Number(no), `m${i}`);

const db = openDb(':memory:');
db.prepare("INSERT INTO malls (mall_id, brand_name, unsubscribe_no, sender_no, installed_at) VALUES (?, 'LINEN & CO.', '080-000-0000', '02-000-0000', ?)").run(MALL, clock.now().toISOString());
const port = Number(process.env.PORT ?? 8787);
const base = process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`;
const ctx: Ctx = { db, cafe24, clock, productUrl: (_m, no) => `${base}/demo/shop/${no}`, log: (m, x) => console.log('[demo]', m, x ?? '') };
cafe24.onWebhook(async e => { await handleOrderWebhook(ctx, e); });
const adminToken = process.env.ADMIN_TOKEN ?? randomBytes(18).toString('base64url');

const page = (title: string, body: string) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>:root{--fg:#16233F;--fg2:#4B5671;--line:#DDE2EB;--bg:#F7F5F1;--surface:#fff;--accent:#2F5BEA}
@media (prefers-color-scheme:dark){:root{--fg:#E6EBF5;--fg2:#AAB4C8;--line:#2A3654;--bg:#10151F;--surface:#18202E;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 "Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif}
.wrap{max-width:980px;margin:0 auto;padding-inline:16px;padding-block:16px 60px;display:grid;gap:14px}.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px;display:grid;gap:8px;min-width:0}
.bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.btn{font:inherit;font-size:14px;font-weight:600;border:1.5px solid var(--line);background:var(--surface);color:var(--fg);border-radius:9px;padding:7px 12px;cursor:pointer}
.btn.pri{background:var(--accent);border-color:var(--accent);color:#fff}.muted{color:var(--fg2);font-size:13.5px}.grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:14px}
@media (max-width:760px){.grid{grid-template-columns:minmax(0,1fr)}}.sms{background:var(--bg);border-radius:12px;padding:10px 12px;white-space:pre-wrap;font-size:13.5px}
.shop{font-family:Georgia,serif;letter-spacing:.14em;font-weight:700}.img{aspect-ratio:4/3;border-radius:12px;background:linear-gradient(140deg,#E7DFD2,#C9BCA8);display:grid;place-items:center;color:#5C5246;font-size:13px}
select{font:inherit;padding:6px 8px;border-radius:8px;border:1.5px solid var(--line);background:var(--surface);color:var(--fg)}</style></head><body>${body}</body></html>`;

function demoRoutes(r: Router) {
  r.get('/', (_q, res) => { res.writeHead(302, { Location: '/demo' }).end(); });
  r.get('/demo', (_q, res) => sendHtml(res, page('찜 공구 데모', `<div class="wrap" style="max-width:720px">
    <h1 style="margin:0">찜 공구 MVP 데모</h1>
    <p class="muted" style="margin:0">모의 카페24 쇼핑몰(LINEN &amp; CO.)에서 6단계를 끝까지 눌러 볼 수 있어요. 실제 문자·결제는 일어나지 않아요. 데모 시각 ${esc(fmtKst(clock.now()))}</p>
    <div class="card"><b>1. 운영자 화면에서 공구 열기</b><span class="muted">운영자 토큰: <code>${esc(adminToken)}</code></span><a class="btn pri" href="/admin" style="width:max-content;text-decoration:none">운영자 화면 열기</a></div>
    <div class="card"><b>2. 고객이 되어 상품 페이지에서 신청하기</b><span class="muted">짝수 회원 대부분이 문자 수신 동의자예요. 회원을 바꿔 가며 신청해 보세요.</span><a class="btn" href="/demo/shop/102?member=m62" style="width:max-content;text-decoration:none">스톤웨어 디너 접시 상품 페이지</a></div>
    <div class="card"><b>3. 상품 페이지 위쪽 데모 막대로 시간 넘기기</b><span class="muted">마감 시각으로 → 판정·쿠폰 발급 → 고객이 쿠폰으로 결제 → 결제 기간 끝으로 → 확정 리포트 → 운영자 화면에서 생산 결정 기록</span></div>
  </div>`)));

  r.get('/demo/shop/:no', (req, res) => {
    const no = Number(req.params.no);
    const p = PRODUCTS.find(x => x.product_no === no);
    if (!p) return sendHtml(res, '<p>상품이 없어요</p>', 404);
    const member = /^m\d{1,3}$/.test(req.query.get('member') ?? '') ? req.query.get('member')! : '';
    const token = member ? cafe24.encryptMember(MALL, member) : '';
    const opts = ['<option value="">비회원 (로그인 안 함)</option>'].concat(Array.from({ length: 40 }, (_, i) => `m${(i + 30) * 2}`).map(m => `<option value="${m}" ${m === member ? 'selected' : ''}>${m}</option>`)).join('');
    sendHtml(res, page(`${p.product_name} · LINEN & CO.`, `
    <div style="background:var(--surface);border-bottom:1px solid var(--line)"><div class="wrap" style="padding-block:10px">
      <div class="bar"><b>데모 막대</b><span class="muted" id="now">${esc(fmtKst(clock.now()))}</span>
      <button class="btn" data-adv="1">+1시간</button><button class="btn" data-adv="24">+1일</button><button class="btn" data-adv="deadline">마감 시각으로</button><button class="btn" data-adv="payend">결제 기간 끝으로</button>
      <button class="btn" id="simP">다른 고객 10명 신청</button><button class="btn" id="simPay">쿠폰 받은 고객 60% 결제</button><a class="btn" href="/admin" style="text-decoration:none">운영자 화면</a></div>
      <div class="bar"><label class="muted" for="member">지금 고객</label><select id="member">${opts}</select></div></div></div>
    <div class="wrap"><div class="shop">LINEN &amp; CO.</div>
      <div class="grid"><div class="card"><div class="img">${esc(p.product_name)}</div>
        <div><b style="font-size:19px">${esc(p.product_name)}</b><div>${won(p.price)} ${p.sold_out ? '<span class="muted">· 품절 (재생산 대기)</span>' : ''}</div></div>
        <div id="jjim-gonggu"></div>
        <button class="btn" id="buy">${member ? '주문서로 결제 (보유 쿠폰 자동 적용)' : '정가로 구매 (로그인 필요)'}</button><div class="muted" id="buymsg"></div></div>
      <div class="card"><b>${member ? esc(member) + '님 문자함' : '문자함 (회원을 고르면 보여요)'}</b><div id="inbox" class="muted">불러오는 중…</div><b>내 쿠폰</b><div id="coupons" class="muted">–</div></div></div></div>
    <script>window.JJIM_MEMBER_TOKEN=function(){return ${JSON.stringify(token)}||null};</script>
    <script src="/widget.js?mall=${MALL}" data-product-no="${no}" data-anchor="#jjim-gonggu" defer></script>
    <script>
    const M=${JSON.stringify(member)};const NO=${no};
    const post=(u,b)=>fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})}).then(r=>r.json());
    document.getElementById('member').onchange=e=>{location.search='?member='+e.target.value};
    document.querySelectorAll('[data-adv]').forEach(b=>b.onclick=async()=>{await post('/demo/api/advance',{to:b.dataset.adv,product_no:NO});location.reload()});
    document.getElementById('simP').onclick=async()=>{const j=await post('/demo/api/simulate-pledges',{product_no:NO,n:10});alertBox(j.message);setTimeout(()=>location.reload(),900)};
    document.getElementById('simPay').onclick=async()=>{const j=await post('/demo/api/simulate-payments',{product_no:NO,rate:.6});alertBox(j.message);setTimeout(()=>location.reload(),900)};
    document.getElementById('buy').onclick=async()=>{if(!M){alertBox('회원을 먼저 골라 주세요');return}const j=await post('/demo/api/checkout',{member:M,product_no:NO,qty:1});alertBox(j.message);setTimeout(()=>location.reload(),1200)};
    function alertBox(t){const d=document.getElementById('buymsg');d.textContent=t}
    fetch('/demo/api/state?member='+encodeURIComponent(M)).then(r=>r.json()).then(j=>{
      const ib=document.getElementById('inbox');ib.textContent='';if(!M){ib.textContent='–'}else if(!j.inbox.length){ib.textContent='받은 문자가 없어요'}else j.inbox.forEach(s=>{const d=document.createElement('div');d.className='sms';d.textContent=s.at+'\\n'+s.content;ib.appendChild(d)});
      document.getElementById('coupons').textContent=j.coupons.length?j.coupons.join(', '):'없어요';});
    </script>`));
  });

  r.post('/demo/api/advance', async (req, res) => {
    const c = activeCampaignForProduct(ctx, MALL, Number(req.body.product_no));
    const to = req.body.to;
    let target: number;
    if (to === 'deadline') { if (!c) throw new UserError('none', '공구가 없어요'); target = Math.max(clock.now().getTime(), new Date(c.deadline_at).getTime() + 1000); }
    else if (to === 'payend') { const cc = c && getCampaign(ctx, c.id); if (!cc?.pay_until) throw new UserError('none', '아직 결제 기간이 아니에요'); target = new Date(cc.pay_until).getTime() + 1000; }
    else target = clock.now().getTime() + Math.min(240, Number(to) || 1) * HOUR;
    // 시간을 한 번에 건너뛰지 않고 1시간씩 흘려보낸다. 그래야 08시 발송 같은 예약이 실제처럼 실행된다
    while (clock.now().getTime() < target) { clock.set(new Date(Math.min(target, clock.now().getTime() + HOUR))); await tick(ctx); }
    sendJson(res, 200, { now: clock.now().toISOString() });
  });
  r.post('/demo/api/simulate-pledges', async (req, res) => {
    const c = activeCampaignForProduct(ctx, MALL, Number(req.body.product_no));
    if (!c || c.state !== 'open') return sendJson(res, 200, { message: '진행 중인 공구가 없어요' });
    const invited = (db.prepare("SELECT member_id FROM invitations WHERE campaign_id = ? AND member_id NOT IN (SELECT member_id FROM pledges WHERE campaign_id = ?)").all(c.id, c.id) as { member_id: string }[]).map(x => x.member_id);
    let n = 0;
    for (const m of invited.slice(0, Math.min(50, Number(req.body.n) || 10))) {
      await createPledge(ctx, c.id, { member_token: cafe24.encryptMember(MALL, m), qty: 1 + (n % 2) }, `sim-${m}`); n++;
    }
    sendJson(res, 200, { message: `다른 고객 ${n}명이 신청했어요` });
  });
  r.post('/demo/api/simulate-payments', async (req, res) => {
    const c0 = activeCampaignForProduct(ctx, MALL, Number(req.body.product_no));
    const c = c0 && getCampaign(ctx, c0.id);
    if (!c || c.state !== 'reached') return sendJson(res, 200, { message: '결제 기간인 공구가 없어요' });
    const rows = db.prepare("SELECT member_id, qty FROM pledges WHERE campaign_id = ? AND state = 'coupon_issued'").all(c.id) as { member_id: string; qty: number }[];
    const k = Math.round(rows.length * Math.min(1, Number(req.body.rate) || 0.6));
    for (const r0 of rows.slice(0, k)) await cafe24.placeOrder(MALL, r0.member_id, c.product_no, r0.qty, c.coupon_no!);
    sendJson(res, 200, { message: `${k}명이 쿠폰으로 결제했어요` });
  });
  r.post('/demo/api/checkout', async (req, res) => {
    const member = String(req.body.member), no = Number(req.body.product_no);
    const c0 = activeCampaignForProduct(ctx, MALL, no); const c = c0 && getCampaign(ctx, c0.id);
    const holds = c?.coupon_no ? (await cafe24.listCouponHolders(MALL, c.coupon_no)).includes(member) : false;
    const pl = c ? db.prepare('SELECT qty FROM pledges WHERE campaign_id = ? AND member_id = ?').get(c.id, member) as { qty: number } | undefined : undefined;
    try {
      const o = await cafe24.placeOrder(MALL, member, no, holds ? pl?.qty ?? 1 : 1, holds ? c!.coupon_no! : undefined);
      sendJson(res, 200, { message: `${o.order_id} 결제 완료 · ${won(o.items[0].amount)}${holds ? ' (공구 쿠폰 적용)' : ' (정가)'}` });
    } catch (e) { sendJson(res, 200, { message: String((e as Error).message) }); }
  });
  r.get('/demo/api/state', (req, res) => {
    const m = req.query.get('member') ?? '';
    const inbox = cafe24.smsLog.filter(s => s.member_ids.includes(m)).map(s => ({ at: fmtKst(s.at), content: s.content }));
    const mall = cafe24.malls.get(MALL)!;
    const coupons = [...mall.coupons.values()].filter(c => c.holders.has(m)).map(c => `${c.name} −${won(c.discount_amount)}${c.used.has(m) ? ' (사용함)' : ''}`);
    sendJson(res, 200, { now: clock.now().toISOString(), inbox, coupons });
  });
}

await startServer(ctx, { adminToken, publicBaseUrl: base, extraRoutes: demoRoutes }, port);
setInterval(() => { void tick(ctx); }, 5000);
console.log(`찜 공구 데모: ${base}/demo  ·  운영자 토큰: ${adminToken}`);
