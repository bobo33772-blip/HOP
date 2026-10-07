// 데모 쇼핑몰 상품 페이지. 실제 카페24 쇼핑몰처럼 React 밖의 일반 HTML이고, 위젯 스크립트(/widget.js)가 공구 진행률과 신청 버튼을 붙인다.
// 위쪽 데모 막대로 시간을 넘기고, 다른 고객의 신청·결제를 흉내 낼 수 있다.

import type { NextRequest } from "next/server";
import { getDemo } from "@/lib/server";
import { DEMO_BRAND, DEMO_MALL } from "@/lib/cafe24/mock";
import { demoProduct, isDemoMember } from "@/lib/demo";
import { fmtKst, won } from "@/lib/time";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
// <script> 안에 넣는 JSON: </script> 로 끊기지 않게 < 를 이스케이프한다
const js = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

export async function GET(req: NextRequest, { params }: { params: Promise<{ no: string }> }) {
  const demo = await getDemo();
  const p = demoProduct(Number((await params).no));
  if (!demo || !p) return new Response("없는 상품이에요", { status: 404 });
  const raw = req.nextUrl.searchParams.get("member") ?? "";
  const member = isDemoMember(raw) ? raw : "";
  const token = member ? demo.world.encryptMember(DEMO_MALL, member) : "";
  const options = ['<option value="">비회원 (로그인 안 함)</option>']
    .concat(Array.from({ length: 40 }, (_, i) => `m${(i + 30) * 2}`).map((m) => `<option value="${m}"${m === member ? " selected" : ""}>${m}</option>`))
    .join("");

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.name)} · ${esc(DEMO_BRAND)}</title><meta name="robots" content="noindex">
<style>:root{--fg:#16233F;--fg2:#4B5671;--line:#DDE2EB;--bg:#F7F5F1;--surface:#fff;--accent:#2F5BEA}
@media (prefers-color-scheme:dark){:root{--fg:#E6EBF5;--fg2:#AAB4C8;--line:#2A3654;--bg:#10151F;--surface:#18202E;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 "Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif}
.wrap{max-width:980px;margin:0 auto;padding:16px 16px 60px;display:grid;gap:14px}.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px;display:grid;gap:8px;min-width:0;align-content:start}
.bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.btn{font:inherit;font-size:14px;font-weight:600;border:1.5px solid var(--line);background:var(--surface);color:var(--fg);border-radius:9px;padding:7px 12px;cursor:pointer;text-decoration:none}
.btn:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.muted{color:var(--fg2);font-size:13.5px}.grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:14px}
@media (max-width:760px){.grid{grid-template-columns:minmax(0,1fr)}}.sms{background:var(--bg);border-radius:12px;padding:10px 12px;white-space:pre-wrap;font-size:13.5px}
.shop{font-family:Georgia,serif;letter-spacing:.14em;font-weight:700}.img{aspect-ratio:4/3;border-radius:12px;background:linear-gradient(140deg,#E7DFD2,#C9BCA8);display:grid;place-items:center;color:#5C5246;font-size:13px}
select{font:inherit;padding:6px 8px;border-radius:8px;border:1.5px solid var(--line);background:var(--surface);color:var(--fg)}</style></head><body>
<div style="background:var(--surface);border-bottom:1px solid var(--line)"><div class="wrap" style="padding-block:10px">
  <div class="bar"><b>데모 막대</b><span class="muted">${esc(fmtKst(demo.clock.now()))}</span>
  <button class="btn" data-adv="1">+1시간</button><button class="btn" data-adv="24">+1일</button><button class="btn" data-adv="deadline">마감 시각으로</button><button class="btn" data-adv="payend">결제 기간 끝으로</button>
  <button class="btn" id="simP">다른 고객 10명 신청</button><button class="btn" id="simPay">쿠폰 받은 고객 60% 결제</button><a class="btn" href="/admin">운영자 화면</a><a class="btn" href="/demo">데모 안내</a></div>
  <div class="bar"><label class="muted" for="member">지금 고객</label><select id="member">${options}</select><span class="muted" id="msg" role="status"></span></div></div></div>
<div class="wrap"><div class="shop">${esc(DEMO_BRAND)}</div>
  <div class="grid"><div class="card"><div class="img">${esc(p.name)}</div>
    <div><b style="font-size:19px">${esc(p.name)}</b><div>${won(p.price)} ${p.soldOut ? '<span class="muted">· 품절 (재생산 대기)</span>' : ""}</div></div>
    <div id="jjim-gonggu"></div>
    <button class="btn" id="buy">${member ? "주문서로 결제 (보유 쿠폰 자동 적용)" : "정가로 구매 (로그인 필요)"}</button></div>
  <div class="card"><b>${member ? `${esc(member)}님 문자함` : "문자함 (회원을 고르면 보여요)"}</b><div id="inbox" class="muted">불러오는 중…</div><b>내 쿠폰</b><div id="coupons" class="muted">–</div></div></div></div>
<script>window.JJIM_MEMBER_TOKEN=function(){return ${js(token)}||null};</script>
<script src="/widget.js?mall=${DEMO_MALL}" data-product-no="${p.productNo}" data-anchor="#jjim-gonggu" defer></script>
<script>
const M=${js(member)},NO=${p.productNo};
const say=t=>{document.getElementById('msg').textContent=t};
const post=(a,b)=>fetch('/api/demo/'+a,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})}).then(r=>r.json());
document.getElementById('member').onchange=e=>{location.search='?member='+e.target.value};
document.querySelectorAll('[data-adv]').forEach(b=>b.onclick=async()=>{b.disabled=true;say('시간을 넘기는 중…');const j=await post('advance',{to:b.dataset.adv,productNo:NO});if(j.message){say(j.message);b.disabled=false}else location.reload()});
document.getElementById('simP').onclick=async()=>{const j=await post('simulate-pledges',{productNo:NO,n:10});say(j.message);setTimeout(()=>location.reload(),900)};
document.getElementById('simPay').onclick=async()=>{const j=await post('simulate-payments',{productNo:NO,rate:.6});say(j.message);setTimeout(()=>location.reload(),900)};
document.getElementById('buy').onclick=async()=>{if(!M){say('회원을 먼저 골라 주세요');return}const j=await post('checkout',{member:M,productNo:NO});say(j.message);setTimeout(()=>location.reload(),1200)};
fetch('/api/demo/state?member='+encodeURIComponent(M)).then(r=>r.json()).then(j=>{
  const ib=document.getElementById('inbox');ib.textContent='';
  if(!M)ib.textContent='–';else if(!j.inbox.length)ib.textContent='받은 문자가 없어요';
  else j.inbox.forEach(s=>{const d=document.createElement('div');d.className='sms';d.textContent=s.at+'\\n'+s.content;ib.appendChild(d)});
  document.getElementById('coupons').textContent=j.coupons.length?j.coupons.join(', '):'없어요'});
</script></body></html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
