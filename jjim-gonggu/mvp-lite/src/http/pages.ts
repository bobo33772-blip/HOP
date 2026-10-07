import { esc } from './router.ts';
import { fmtKst } from '../time.ts';
import { won } from '../context.ts';
import type { buildReport } from '../services/report.ts';

const BASE_CSS = `
:root{--ink:#16233F;--primary:#2F5BEA;--primary-2:#E8EEFF;--ok:#12B886;--warn:#E8950A;--bad:#E03131;--muted:#6B7590;--bg:#F4F6FA;--surface:#fff;--line:#DDE2EB;--soft:#EDF0F6;--fg:#16233F;--fg2:#4B5671;
--font:"IBM Plex Sans KR","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif;--mono:"IBM Plex Mono",ui-monospace,Menlo,monospace}
@media (prefers-color-scheme:dark){:root{--ink:#E6EBF5;--primary:#6F8FF5;--primary-2:#1E2A4D;--ok:#2FD3A0;--warn:#F5B342;--bad:#FF6B6B;--muted:#8E98AD;--bg:#0E1424;--surface:#172038;--line:#28344F;--soft:#1E2944;--fg:#E6EBF5;--fg2:#AAB4C8;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 var(--font)}
h1,h2,h3{margin:0;line-height:1.3}a{color:var(--primary)}.mono{font-family:var(--mono);font-variant-numeric:tabular-nums}
.wrap{max-width:1080px;margin:0 auto;padding-inline:16px;padding-block:20px 60px;display:grid;gap:16px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px 18px;display:grid;gap:10px;min-width:0}
.muted{color:var(--fg2);font-size:13.5px}.small{font-size:12.5px;color:var(--muted)}
.btn{font:inherit;font-size:14px;font-weight:600;border:0;border-radius:9px;background:var(--primary);color:#fff;padding:9px 14px;cursor:pointer}
.btn.ghost{background:var(--surface);color:var(--fg);border:1.5px solid var(--line)}.btn:disabled{opacity:.45;cursor:not-allowed}
.btn:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:9px 10px;border-top:1px solid var(--line);text-align:left;vertical-align:top}
th{font-size:12.5px;color:var(--fg2);background:var(--soft);border-top:0;white-space:nowrap}.tw{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:var(--surface)}
.chip{display:inline-block;font-size:12px;font-weight:700;padding:2px 9px;border-radius:99px;background:var(--soft);color:var(--fg2)}
.chip.open{background:var(--primary-2);color:var(--primary)}.chip.ok{background:color-mix(in srgb,var(--ok) 16%,transparent);color:var(--ok)}.chip.bad{background:color-mix(in srgb,var(--bad) 14%,transparent);color:var(--bad)}.chip.warn{background:color-mix(in srgb,var(--warn) 18%,transparent);color:var(--warn)}
.bar{height:10px;border-radius:5px;background:var(--soft);overflow:hidden}.bar i{display:block;height:100%;background:var(--primary)}.bar.ok i{background:var(--ok)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}.kpi{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px 12px;display:grid}
.kpi small{font-size:12px;color:var(--fg2)}.kpi b{font:600 22px var(--mono);font-variant-numeric:tabular-nums}
`;

const page = (title: string, body: string, extraCss = '') => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>${BASE_CSS}${extraCss}</style></head><body>${body}</body></html>`;

const pct = (r: number | null) => (r == null ? '–' : `${(r * 100).toFixed(1)}%`);

/** 판매자에게 링크로 주는 읽기 전용 확정 리포트. 회원 ID 등 개인정보는 넣지 않는다 */
export function reportPage(r: ReturnType<typeof buildReport>) {
  const c = r.campaign;
  const stateLabel = { open: ['진행 중', 'open'], reached: ['목표 달성 · 결제 기간', 'ok'], failed: ['진행 안 됨', 'bad'], settled: ['확정 완료', 'ok'] }[c.state];
  const hero = c.state === 'settled'
    ? `<div class="card" style="border-color:var(--ok)"><span class="small">확정 수량 (결제 완료 기준)</span><div class="mono" style="font-size:44px;font-weight:700;line-height:1">${r.confirmed.qty}<span style="font-size:18px"> 개</span></div><p class="muted" style="margin:0">이 숫자만큼 생산·발주하면 재고가 남지 않아요.</p></div>`
    : c.state === 'reached'
      ? `<div class="card"><span class="small">결제 기간 ${esc(fmtKst(c.pay_until))}까지 · 지금까지 결제</span><div class="mono" style="font-size:36px;font-weight:700">${r.confirmed.qty}개</div><p class="muted" style="margin:0">결제 기간이 끝나면 확정 수량이 정해져요. 아직 발주하지 마세요.</p></div>`
      : c.state === 'failed'
        ? `<div class="card"><b>목표에 못 미쳐 진행되지 않았어요.</b><p class="muted" style="margin:0">결제된 금액이 없고, 만든 재고도 없어요. 목표 수량을 낮춰 다시 열 수 있어요.</p></div>`
        : `<div class="card"><b>모집 중이에요.</b><div class="bar"><i style="width:${Math.min(100, r.funnel.pledged_qty / c.target_qty * 100)}%"></i></div><span class="muted">${r.funnel.pledged_qty} / ${c.target_qty}개 · ${esc(fmtKst(c.deadline_at))} 마감</span></div>`;
  return page(`${c.product_name} 공구 리포트`, `<div class="wrap" style="max-width:720px">
  <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap"><h1 style="font-size:24px">${esc(c.product_name)} 공구 리포트</h1><span class="chip ${stateLabel[1]}">${stateLabel[0]}</span></div>
  <p class="muted" style="margin:0">정가 ${won(c.list_price)} → 공구가 ${won(c.deal_price)} · 목표 ${c.target_qty}개 · 마감 ${esc(fmtKst(c.deadline_at))} · 예상 출고 ${esc(c.ship_eta)}</p>
  ${hero}
  <div class="kpis">
    <div class="kpi"><small>초대 문자</small><b>${r.funnel.invited_sent}</b></div>
    <div class="kpi"><small>신청 (명)</small><b>${r.funnel.pledgers}</b></div>
    <div class="kpi"><small>쿠폰 발급</small><b>${r.funnel.coupon_issued}</b></div>
    <div class="kpi"><small>결제 (명)</small><b>${r.funnel.paid_members}</b></div>
  </div>
  <div class="tw"><table><tbody>
    <tr><td>초대 → 신청</td><td class="mono">${pct(r.rates.invite_to_pledge)}</td></tr>
    <tr><td>신청 → 결제</td><td class="mono">${pct(r.rates.pledge_to_paid)}</td></tr>
    <tr><td>확정 매출</td><td class="mono">${won(r.confirmed.revenue)}</td></tr>
    <tr><td>미결제 · 취소 · 기한 뒤 결제</td><td class="mono">${r.confirmed.unpaid_members}명 · ${r.confirmed.cancelled_orders}건 · ${r.confirmed.late_orders}건</td></tr>
    <tr><td>성공 수수료 (스타터 1.5%)</td><td class="mono">${won(r.confirmed.success_fee)} <span class="small">· 파일럿 기간은 받지 않아요</span></td></tr>
    ${c.decision ? `<tr><td>생산·발주 결정</td><td>${c.decision.qty}개 · ${esc(c.decision.note)} <span class="small">(${esc(fmtKst(c.decision.at))})</span></td></tr>` : ''}
  </tbody></table></div>
  <p class="small">결제 완료 수량은 쇼핑몰 주문 기록과 매일 밤 다시 대조해요. 이 페이지는 읽기 전용이고, 고객 개인정보는 담지 않아요.</p>
</div>`);
}

export function loginPage(msg = '') {
  return page('찜 공구 운영자 로그인', `<div class="wrap" style="max-width:420px;padding-top:80px">
  <form class="card" method="post" action="/admin/login"><h1 style="font-size:20px">찜 공구 운영자</h1>
  <label class="muted" for="token">운영자 토큰</label><input id="token" name="token" type="password" autocomplete="current-password" required style="font:inherit;padding:10px;border:1.5px solid var(--line);border-radius:9px;background:var(--surface);color:var(--fg)">
  ${msg ? `<p role="alert" style="color:var(--bad);margin:0">${esc(msg)}</p>` : ''}<button class="btn" type="submit">로그인</button></form></div>`);
}

export function adminPage() {
  return page('찜 공구 운영자', ADMIN_BODY, ADMIN_CSS);
}

const ADMIN_CSS = `
header{background:var(--surface);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}
header .in{max-width:1080px;margin:0 auto;padding:10px 16px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
.logo{font-weight:700;display:flex;gap:8px;align-items:center}.logo i{font-style:normal;width:24px;height:24px;border-radius:7px;background:var(--primary);color:#fff;display:grid;place-items:center;font-size:12px}
nav.tabs{display:flex;gap:2px;margin-left:auto;flex-wrap:wrap}nav.tabs button{font:inherit;font-size:14px;border:0;background:none;color:var(--fg2);padding:8px 12px;border-radius:8px;cursor:pointer}
nav.tabs button[aria-selected=true]{background:var(--soft);color:var(--fg);font-weight:600}
.form{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}.form label{display:grid;gap:4px;font-size:13px;color:var(--fg2);font-weight:600}
.form input,.form select,#decide input{font:inherit;font-size:15px;color:var(--fg);background:var(--surface);border:1.5px solid var(--line);border-radius:9px;padding:9px 10px;width:100%}
.msg{white-space:pre-wrap;background:var(--soft);border-radius:10px;padding:10px 12px;font-size:13.5px}
.err{color:var(--bad);font-size:14px}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.camps{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}.camp{cursor:pointer;text-align:left;font:inherit;color:inherit}
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--surface);padding:10px 16px;border-radius:10px;font-size:14px;z-index:20}
`;

const ADMIN_BODY = `
<header><div class="in"><div class="logo"><i>찜</i>찜 공구 운영자</div>
<label class="small" for="mall">쇼핑몰</label><select id="mall" style="font:inherit;padding:6px 8px;border-radius:8px;border:1.5px solid var(--line);background:var(--surface);color:var(--fg)"></select>
<nav class="tabs" role="tablist"><button role="tab" data-tab="list" aria-selected="true">공구 목록</button><button role="tab" data-tab="new" aria-selected="false">새 공구</button><button role="tab" data-tab="score" aria-selected="false">4주 판정표</button></nav></div></header>
<main class="wrap">
<section id="tab-list"></section>
<section id="tab-new" hidden></section>
<section id="tab-score" hidden></section>
</main>
<script>
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const won=n=>Math.round(n).toLocaleString('ko-KR')+'원';
const pct=r=>r==null?'–':(r*100).toFixed(1)+'%';
const kst=iso=>iso?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso)):'–';
const CH={open:['진행 중','open'],reached:['달성 · 결제 기간','ok'],failed:['진행 안 됨','bad'],settled:['확정 완료','ok']};
async function api(m,p,b){const r=await fetch(p,{method:m,headers:{'Content-Type':'application/json','X-JJG':'1'},body:b?JSON.stringify(b):undefined});if(r.status===401){location.href='/admin';throw new Error('로그인이 필요해요')}const j=await r.json();if(!r.ok)throw new Error(j.message||'요청 실패');return j}
function toast(t){const d=document.createElement('div');d.className='toast';d.setAttribute('role','status');d.textContent=t;document.body.appendChild(d);setTimeout(()=>d.remove(),2600)}
let MALL=null, PICK=null;
document.querySelectorAll('nav.tabs button').forEach(b=>b.onclick=()=>show(b.dataset.tab));
function show(t){document.querySelectorAll('nav.tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===t));['list','new','score'].forEach(x=>$('#tab-'+x).hidden=x!==t);({list:renderList,new:renderNew,score:renderScore})[t]()}
let MALLS=[];
async function boot(){const {malls}=await api('GET','/admin/api/malls');MALLS=malls;$('#mall').innerHTML=malls.map(m=>'<option value="'+esc(m.mall_id)+'">'+esc(m.brand_name)+' ('+esc(m.mall_id)+')</option>').join('');MALL=malls[0]?.mall_id;$('#mall').onchange=e=>{MALL=e.target.value;show('list')};if(!MALL){$('#tab-list').innerHTML='<div class="card">연결된 쇼핑몰이 없어요. 카페24 설치(/oauth/start?mall_id=…)를 먼저 진행해 주세요.</div>';return}show('list')}

function profileCard(){const m=MALLS.find(x=>x.mall_id===MALL);if(!m||/^[0-9-]{8,20}$/.test(m.unsubscribe_no||''))return '';return '<div class="card" style="border-color:var(--warn)"><b>먼저 쇼핑몰 정보를 등록해 주세요</b><p class="muted" style="margin:0">광고 문자에는 브랜드명과 무료수신거부 번호가 반드시 들어가요.</p><div class="form"><label>브랜드명<input id="p-brand" value="'+esc(m.brand_name)+'"></label><label>무료수신거부 번호<input id="p-unsub" placeholder="080-000-0000"></label><label>문자 발신번호 (카페24 등록 번호)<input id="p-sender" placeholder="02-000-0000"></label></div><div><button class="btn" onclick="saveProfile()">저장</button></div></div>'}
async function saveProfile(){try{await api('POST','/admin/api/malls/'+MALL+'/profile',{brand_name:$('#p-brand').value,unsubscribe_no:$('#p-unsub').value,sender_no:$('#p-sender').value});toast('저장했어요');boot()}catch(e){toast(e.message)}}
async function renderList(){const el=$('#tab-list');el.innerHTML='<p class="muted">불러오는 중…</p>';const {campaigns}=await api('GET','/admin/api/malls/'+MALL+'/campaigns');const pc=profileCard();
 if(!campaigns.length){el.innerHTML=pc+'<div class="card"><b>아직 연 공구가 없어요.</b><p class="muted" style="margin:0">새 공구 탭에서 찜이 많은 상품을 골라 시작해 보세요.</p><div><button class="btn" onclick="show(\\'new\\')">새 공구 열기</button></div></div>';return}
 el.innerHTML=pc+'<div class="camps">'+campaigns.map(c=>{const s=CH[c.state];return '<button class="card camp" data-id="'+esc(c.id)+'"><div class="row" style="justify-content:space-between"><b>'+esc(c.product_name)+'</b><span class="chip '+s[1]+'">'+s[0]+'</span></div><div class="mono" style="font-size:20px">'+c.pledged_qty+' / '+c.target_qty+'개</div><div class="bar'+(c.pledged_qty>=c.target_qty?' ok':'')+'"><i style="width:'+Math.min(100,c.pledged_qty/c.target_qty*100)+'%"></i></div><span class="small">마감 '+esc(kst(c.deadline_at))+(c.pay_until?' · 결제 기한 '+esc(kst(c.pay_until)):'')+'</span></button>'}).join('')+'</div><div id="detail"></div>';
 el.querySelectorAll('.camp').forEach(b=>b.onclick=()=>renderDetail(b.dataset.id))}

async function renderDetail(id){const d=$('#detail');const j=await api('GET','/admin/api/campaigns/'+id);const r=j.report,c=r.campaign,s=CH[c.state];
 const now=Date.now(), past=now>=new Date(c.deadline_at).getTime();
 d.innerHTML='<div class="card" style="margin-top:14px"><div class="row" style="justify-content:space-between"><h2 style="font-size:19px">'+esc(c.product_name)+'</h2><span class="chip '+s[1]+'">'+s[0]+'</span></div>'+
 '<p class="muted" style="margin:0">'+won(c.list_price)+' → '+won(c.deal_price)+' · 목표 '+c.target_qty+'개 · 마감 '+esc(kst(c.deadline_at))+' · 출고 '+esc(c.ship_eta)+'</p>'+
 '<div class="kpis"><div class="kpi"><small>초대</small><b>'+r.funnel.invited+'</b></div><div class="kpi"><small>신청 수량</small><b>'+r.funnel.pledged_qty+'</b></div><div class="kpi"><small>쿠폰 발급</small><b>'+r.funnel.coupon_issued+'</b></div><div class="kpi"><small>확정 수량</small><b>'+r.confirmed.qty+'</b></div><div class="kpi"><small>초대→신청</small><b>'+pct(r.rates.invite_to_pledge)+'</b></div><div class="kpi"><small>신청→결제</small><b>'+pct(r.rates.pledge_to_paid)+'</b></div></div>'+
 '<div class="row"><button class="btn ghost" id="copy">판매자 리포트 링크 복사</button><button class="btn ghost" id="judge" '+(c.state==='open'&&past?'':'disabled')+'>마감 판정 실행</button><button class="btn ghost" id="recon" '+(['reached','settled'].includes(c.state)?'':'disabled')+'>주문 대사 실행</button></div>'+
 (c.state==='settled'?'<div class="card" id="decide" style="background:var(--soft)"><b>원씽 기록: 판매자가 이 확정 수량으로 생산·발주를 결정했나요?</b>'+(c.decision?'<p style="margin:0">기록됨: '+c.decision.qty+'개 · '+esc(c.decision.note)+'</p>':'<div class="form"><label>생산·발주 수량<input id="dq" type="number" min="1" value="'+r.confirmed.qty+'"></label><label>확인 근거 (발주서 번호, 가마 일정 등)<input id="dn" maxlength="300"></label></div><div><button class="btn" id="dsave">결정 기록</button></div>')+'</div>':'')+
 '<h3 style="font-size:16px">문자</h3><div class="tw"><table><thead><tr><th>종류</th><th>대상</th><th>상태</th><th>발송 예정·완료</th><th></th></tr></thead><tbody>'+j.messages.map(m=>'<tr><td>'+(m.kind==='invite_ad'?'초대 (광고)':'결과 안내')+'</td><td class="mono">'+m.recipients+'명</td><td><span class="chip '+({sent:'ok',failed:'bad',scheduled:'warn'}[m.status])+'">'+({sent:'발송',failed:'실패',scheduled:'예약'}[m.status])+'</span>'+(m.error?'<div class="small">'+esc(m.error)+'</div>':'')+'</td><td>'+esc(kst(m.sent_at||m.send_after))+'</td><td>'+(m.status==='failed'?'<button class="btn ghost" data-retry="'+esc(m.id)+'">다시 보내기</button>':'')+'</td></tr>').join('')+'</tbody></table></div>'+
 '<details><summary>문자 내용 보기</summary>'+j.messages.map(m=>'<div class="msg">'+esc(m.content)+'</div>').join('')+'</details>'+
 '<h3 style="font-size:16px">확인할 일 '+(j.issues.length?'<span class="chip bad">'+j.issues.length+'</span>':'')+'</h3>'+(j.issues.length?'<div class="tw"><table><tbody>'+j.issues.map(i=>'<tr><td>'+esc(kst(i.at))+'</td><td><b>'+esc(i.kind)+'</b></td><td class="small">'+esc(i.detail)+'</td></tr>').join('')+'</tbody></table></div>':'<p class="muted" style="margin:0">없어요.</p>')+'</div>';
 $('#copy').onclick=async()=>{const u=location.origin+'/r/'+j.report_token;try{await navigator.clipboard.writeText(u);toast('리포트 링크를 복사했어요')}catch{toast(u)}};
 $('#judge').onclick=async()=>{try{await api('POST','/admin/api/campaigns/'+id+'/judge');toast('판정했어요');renderList();renderDetail(id)}catch(e){toast(e.message)}};
 $('#recon').onclick=async()=>{try{const x=await api('POST','/admin/api/campaigns/'+id+'/reconcile');toast('주문 '+x.checked+'건을 대조했어요');renderDetail(id)}catch(e){toast(e.message)}};
 d.querySelectorAll('[data-retry]').forEach(b=>b.onclick=async()=>{await api('POST','/admin/api/messages/'+b.dataset.retry+'/retry');toast('다시 보내도록 예약했어요');renderDetail(id)});
 const ds=$('#dsave');if(ds)ds.onclick=async()=>{try{await api('POST','/admin/api/campaigns/'+id+'/decision',{qty:Number($('#dq').value),note:$('#dn').value});toast('생산 결정을 기록했어요');renderDetail(id)}catch(e){toast(e.message)}};
 d.scrollIntoView({behavior:'smooth',block:'start'})}

async function renderNew(){const el=$('#tab-new');el.innerHTML='<p class="muted">찜 많은 상품을 불러오는 중… (상품이 많으면 몇 분 걸려요)</p>';const {products}=await api('GET','/admin/api/malls/'+MALL+'/radar');
 el.innerHTML='<div class="card"><h2 style="font-size:18px">1. 상품 고르기 · 찜 많은 상위 20개</h2><p class="muted" style="margin:0">판매자와 통화하며 함께 고르세요. 이 목록을 판매자에게 그대로 보여 줘도 괜찮아요 (숫자만 있어요).</p><div class="tw"><table><thead><tr><th>#</th><th>상품</th><th>정가</th><th>찜</th><th>장바구니</th><th></th></tr></thead><tbody>'+products.map((p,i)=>'<tr><td class="mono">'+(i+1)+'</td><td>'+esc(p.product_name)+(p.sold_out?' <span class="chip">품절</span>':'')+'</td><td class="mono">'+won(p.price)+'</td><td class="mono">'+p.wishlist+'</td><td class="mono">'+p.cart+'</td><td><button class="btn ghost" data-pick="'+p.product_no+'">선택</button></td></tr>').join('')+'</tbody></table></div></div><div id="form"></div>';
 el.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{PICK=products.find(p=>p.product_no==b.dataset.pick);renderForm()})}

async function renderForm(){const p=PICK,f=$('#form');const {now}=await api('GET','/admin/api/now');const dl=new Date(new Date(now).getTime()+5*864e5);const kd=new Date(dl.getTime()+9*36e5).toISOString().slice(0,10);const ship=new Date(dl.getTime()+14*864e5+9*36e5).toISOString().slice(0,10);
 f.innerHTML='<div class="card" style="margin-top:14px"><h2 style="font-size:18px">2. 조건 정하기 · '+esc(p.product_name)+' (정가 '+won(p.price)+')</h2><div class="form">'+
 '<label>목표 수량 (가마 1회분·원단 1롤 같은 최소 생산 수량)<input id="f-target" type="number" min="1" value="30"></label>'+
 '<label>공구가 (원)<input id="f-deal" type="number" min="0" step="500" value="'+Math.round(p.price*.75/500)*500+'"></label>'+
 '<label>원가 (고객에게 안 보여요)<input id="f-cost" type="number" min="0" step="500"></label>'+
 '<label>1인 최대 수량<input id="f-limit" type="number" min="1" max="5" value="2"></label>'+
 '<label>마감 (한국 시간, 실제 마감)<input id="f-deadline" type="datetime-local" value="'+kd+'T14:00"></label>'+
 '<label>결제 기간<select id="f-pay"><option value="72">달성 후 72시간</option><option value="48">달성 후 48시간</option></select></label>'+
 '<label>예상 출고일 (필수 · 고객에게 보여요)<input id="f-ship" type="date" value="'+ship+'"></label>'+
 '<label style="align-content:end"><span><input id="f-below" type="checkbox" style="width:auto"> 원가 미만이어도 열기</span></label></div>'+
 '<div class="row"><button class="btn ghost" id="pv">미리보기</button></div><div id="pvout"></div></div>';
 $('#pv').onclick=preview}
function input(){const v=id=>$('#'+id).value;return {product_no:PICK.product_no,target_qty:Number(v('f-target')),deal_price:Number(v('f-deal')),cost_price:v('f-cost')?Number(v('f-cost')):null,per_member_limit:Number(v('f-limit')),deadline_at:v('f-deadline')?new Date(v('f-deadline')+':00+09:00').toISOString():'',pay_window_h:Number(v('f-pay')),ship_eta:v('f-ship'),confirm_below_cost:$('#f-below').checked}}
async function preview(){const o=$('#pvout');try{const j=await api('POST','/admin/api/malls/'+MALL+'/campaigns/preview',input());
 o.innerHTML='<div class="kpis"><div class="kpi"><small>찜</small><b>'+j.audience.wishlist+'</b></div><div class="kpi"><small>장바구니</small><b>'+j.audience.cart+'</b></div><div class="kpi"><small>중복 제외</small><b>'+j.audience.unique+'</b></div><div class="kpi"><small>문자 발송 대상 (수신 동의)</small><b>'+j.audience.reachable+'</b></div></div>'+
 (j.margin_per_unit!=null?'<p class="muted" style="margin:0">개당 마진 '+won(j.margin_per_unit)+'</p>':'')+'<p class="muted" style="margin:0">초대 문자 발송: '+esc(kst(j.send_at))+' (밤 9시~오전 8시는 자동으로 미뤄요)</p><div class="msg">'+esc(j.message)+'</div>'+
 (j.errors.length?'<div class="err" role="alert">'+j.errors.map(esc).join('<br>')+'</div>':'<div class="row"><b>판매자에게 조건을 다시 읽어 주고 동의를 받았나요?</b><button class="btn" id="open">공구 열기 · 쿠폰 생성 · 초대 '+j.audience.reachable+'명 예약</button></div>')
 const ob=$('#open');if(ob)ob.onclick=async()=>{ob.disabled=true;try{const r=await api('POST','/admin/api/malls/'+MALL+'/campaigns',input());toast('공구를 열었어요 · 초대 '+r.invited+'명');show('list');setTimeout(()=>renderDetail(r.campaign.id),300)}catch(e){ob.disabled=false;toast(e.message)}}}catch(e){o.innerHTML='<div class="err" role="alert">'+esc(e.message)+'</div>'}}

async function renderScore(){const el=$('#tab-score');const j=await api('GET','/admin/api/scorecard');const V={go:['Go · 다음 단계로','ok'],iterate:['보완 · 결제 조건 실험 2주','warn'],rethink:['재검토 · 가정 다시 보기','bad'],in_progress:['진행 중','open']}[j.verdict];
 el.innerHTML='<div class="card"><div class="row" style="justify-content:space-between"><h2 style="font-size:18px">4주 성공 기준</h2><span class="chip '+V[1]+'">'+V[0]+'</span></div><p class="muted" style="margin:0">28일 차에 이 표로만 판정해요. 기준은 결과를 보기 전에 정해 두었어요.</p><div class="tw"><table><thead><tr><th>지표</th><th>현재</th><th>기준</th><th></th></tr></thead><tbody>'+j.rows.map(r=>'<tr><td>'+esc(r.label)+'</td><td class="mono">'+(typeof r.value==='number'&&r.value<=1&&r.key!=='one_thing'&&r.key!=='accuracy'?pct(r.value):esc(r.value??'–'))+'</td><td>'+esc(r.goal)+'</td><td><span class="chip '+(r.pass?'ok':'warn')+'">'+(r.pass?'충족':'미충족')+'</span></td></tr>').join('')+'</tbody></table></div></div>'}
boot().catch(e=>toast(e.message));
</script>`;
