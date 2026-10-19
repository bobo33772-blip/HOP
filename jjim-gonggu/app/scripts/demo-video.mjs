// 찜꽁 시연 영상 녹화 (#104). 새로 켠 데모 서버에서 판매자 → 소비자 → 데모 막대 → 소비자 결제 → 판매자 매출 → 관리자 순서로 누른다.
// 크롬 화면 녹화(screencast) 프레임을 모으고, 화면을 불러오는 동안은 잘라 낸다. 자막 · 커서는 페이지 위에 그린 층(누를 수 없음).
// 사용: 데모 서버를 새로 켠 뒤(공구가 없는 처음 상태) node scripts/demo-video.mjs http://localhost:3101 <저장 폴더>
//   크롬: CHROME (기본 Windows 경로). FFMPEG에 ffmpeg 경로를 주면 <저장 폴더>/demo.mp4까지 만든다. 없으면 frames/ · list.txt만 남긴다.
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const [BASE, outArg] = process.argv.slice(2);
const OUT = resolve(outArg);
const FR = join(OUT, "frames");
rmSync(FR, { recursive: true, force: true }); mkdirSync(FR, { recursive: true });
const PORT = 9371, W = 1280, H = 720, DSF = 1.5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(OUT, "profile")}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
let ws, seq = 0;
const pending = new Map(), handlers = [];
const send = (method, params = {}) => { const id = ++seq; ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => pending.set(id, { res, rej, method })); };

// ---------- 녹화: 프레임 시각은 '잘라 낸 시간'을 뺀 영상 시각 ----------
const rec = { frames: [], paused: true, cut: 0, at: 0, held: null, t0: 0 };
const vnow = () => Date.now() - rec.t0 - rec.cut;
const pause = () => { if (!rec.paused) { rec.paused = true; rec.at = Date.now(); } };
const resume = () => {
  if (!rec.paused) return;
  rec.cut += Date.now() - rec.at; rec.paused = false;
  if (rec.held) { rec.frames.push({ t: vnow(), f: rec.held }); rec.held = null; }
};
let nframe = 0;
function onFrame(m) {
  const { data, sessionId } = m.params;
  send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  if (!rec.t0) return;
  const f = `f${String(++nframe).padStart(6, "0")}.jpg`;
  writeFileSync(join(FR, f), Buffer.from(data, "base64"));
  if (rec.paused) rec.held = f; else rec.frames.push({ t: vnow(), f });
}

// ---------- 페이지 위에 그리는 층: 자막 · 커서 · 누름 표시 · 제목 카드 ----------
const LAYER = `(() => {
  if (window.__v) return;
  const css = \`
  nextjs-portal{display:none!important}
  #__vl{position:fixed;inset:0;pointer-events:none;z-index:2147483647;font-family:Pretendard Variable,Pretendard,"Malgun Gothic",system-ui,sans-serif}
  #__vc{position:absolute;left:50%;bottom:74px;transform:translateX(-50%);display:flex;align-items:center;gap:14px;max-width:min(1040px,calc(100vw - 48px));padding:14px 22px;border-radius:18px;background:rgba(17,20,28,.88);color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.25);transition:opacity .35s}
  #__vc .r{flex:none;font-size:15px;font-weight:800;padding:5px 12px;border-radius:99px;color:#fff}
  #__vc .t{display:grid;gap:3px}#__vc b{font-size:20px;letter-spacing:-.01em}#__vc span.s{font-size:15px;color:#c9cdd6}
  #__vk{position:absolute;width:30px;height:30px;left:0;top:0;transition:left .7s cubic-bezier(.3,.7,.2,1),top .7s cubic-bezier(.3,.7,.2,1);filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
  .__vp{position:absolute;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid rgba(233,65,98,.9);animation:__vp .6s ease-out forwards}
  @keyframes __vp{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}
  #__vt{position:absolute;inset:0;display:grid;place-content:center;gap:18px;text-align:center;background:linear-gradient(135deg,#fff5f7,#f1efff);color:#191f28;opacity:0;transition:opacity .6s}
  #__vt.on{opacity:1}#__vt img{width:96px;height:96px;margin:0 auto;border-radius:24px}#__vt h1{margin:0;font-size:46px;letter-spacing:-.02em}#__vt p{margin:0;font-size:22px;color:#4e5968}
  #__vt .roles{display:flex;gap:12px;justify-content:center;margin-top:8px}#__vt .roles span{font-size:17px;font-weight:700;padding:7px 16px;border-radius:99px;color:#fff}\`;
  const mk = () => {
    if (document.getElementById("__vl")) return;
    const st = document.createElement("style"); st.textContent = css; document.documentElement.appendChild(st);
    const l = document.createElement("div"); l.id = "__vl";
    l.innerHTML = '<div id="__vt"></div><div id="__vc" style="opacity:0"></div><svg id="__vk" viewBox="0 0 24 24"><path d="M4 2.5 19.5 13l-7 1.2 3.9 7.3-2.8 1.5-3.9-7.4L4 20.5z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(l);
  };
  window.__v = {
    mk,
    cap(c) { mk(); const e = document.getElementById("__vc"); if (!c) { e.style.opacity = 0; return; }
      e.innerHTML = '<span class="r" style="background:' + c.color + '">' + c.role + '</span><span class="t"><b></b><span class="s"></span></span>';
      e.querySelector("b").textContent = c.title; e.querySelector(".s").textContent = c.sub || ""; e.querySelector(".s").style.display = c.sub ? "" : "none"; e.style.opacity = 1; },
    cur(x, y, instant) { mk(); const k = document.getElementById("__vk"); if (instant) { k.style.transition = "none"; k.getBoundingClientRect(); }
      k.style.left = x + "px"; k.style.top = y + "px"; if (instant) { k.getBoundingClientRect(); k.style.transition = ""; } },
    tap(x, y) { mk(); const p = document.createElement("div"); p.className = "__vp"; p.style.left = x + "px"; p.style.top = y + "px"; document.getElementById("__vl").appendChild(p); setTimeout(() => p.remove(), 700); },
    title(html) { mk(); const t = document.getElementById("__vt"); if (html == null) { t.classList.remove("on"); return; } t.innerHTML = html; t.getBoundingClientRect(); t.classList.add("on"); },
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mk); else mk();
})();`;

const ROLE = {
  seller: { role: "판매자", color: "#e94162" },
  shopper: { role: "소비자", color: "#3182f6" },
  admin: { role: "관리자", color: "#7b6cf6" },
  bar: { role: "데모 막대", color: "#4e5968" },
};

async function main() {
  let url;
  for (let i = 0; i < 200 && !url; i++) { try { url = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === "page")?.webSocketDebuggerUrl; } catch {} await sleep(200); }
  ws = new WebSocket(url); await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(`${p.method}: ${m.error.message}`)) : p.res(m.result); } else if (m.method === "Page.screencastFrame") onFrame(m); else if (m.method) handlers.forEach((h) => h(m)); });
  await send("Page.enable"); await send("Runtime.enable"); await send("Page.setBypassCSP", { enabled: true });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }, { name: "prefers-reduced-motion", value: "no-preference" }] });
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DSF, mobile: false });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: LAYER });

  const evaluate = async (expression) => { const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; };
  const waitFor = async (expr, label, ms = 90000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evaluate(expr)) return; } catch {} await sleep(200); } throw new Error(`timeout: ${label}`); };
  const api = (method, path, body) => evaluate(`fetch(${JSON.stringify(path)}, { method: ${JSON.stringify(method)}, headers: { "Content-Type": "application/json", "X-JJG": "1" }, body: ${body ? JSON.stringify(JSON.stringify(body)) : "undefined"} }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))`);

  // 지금 자막 · 커서. 화면을 옮길 때마다 다시 그린다
  let cap = null, cx = W * 0.62, cy = H * 0.45;
  const redraw = async () => { await evaluate(`window.__v && (__v.mk(), __v.cur(${cx}, ${cy}, true), __v.cap(${JSON.stringify(cap)}))`); };
  const say = async (role, title, sub) => { cap = role ? { ...ROLE[role], title, sub } : null; await evaluate(`__v.cap(${JSON.stringify(cap)})`); };
  const loaded = () => new Promise((r) => { const h = (m) => { if (m.method === "Page.loadEventFired") { handlers.splice(handlers.indexOf(h), 1); r(); } }; handlers.push(h); });
  // 화면 옮기기: 불러오는 동안은 잘라 낸다
  const settle = async (ready, label) => { await waitFor(`document.readyState === "complete" && (${ready || "true"})`, label); await sleep(500); await redraw(); await sleep(250); resume(); };
  const go = async (u, ready, label = u) => { pause(); const l = loaded(); await send("Page.navigate", { url: u.startsWith("http") ? u : BASE + u }); await l; await settle(ready, label); };

  // 요소 찾기: 글자(text)가 들어 있는 sel 중 보이는 첫 번째
  const pick = (sel, text) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.getClientRects().length && ${text ? `e.textContent.replace(/\\s+/g, " ").includes(${JSON.stringify(text)})` : "true"})`;
  const el = (sel, text) => typeof sel === "object" ? sel.expr : pick(sel, text);
  const inputOf = (label) => ({ expr: `[...document.querySelectorAll(".form label")].find((l) => l.textContent.includes(${JSON.stringify(label)}))?.querySelector("input")` });
  const rectOf = async (sel, text) => evaluate(`(() => { const e = ${el(sel, text)}; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 120), y: r.top + r.height / 2, top: r.top, bottom: r.bottom }; })()`);
  const show = async (sel, text) => {
    const r = await rectOf(sel, text); if (!r) throw new Error(`없음: ${sel} ${text ?? ""}`);
    if (r.top < 70 || r.bottom > H - 150) { await evaluate(`${el(sel, text)}.scrollIntoView({ behavior: "smooth", block: "center" })`); await sleep(900); return rectOf(sel, text); }
    return r;
  };
  const moveTo = async (x, y, ms = 800) => { cx = x; cy = y; await evaluate(`__v.cur(${x}, ${y})`); await sleep(ms); };
  const hover = async (sel, text, ms = 900) => { const r = await show(sel, text); await moveTo(r.x, r.y, ms); return r; };
  const mouse = async (type, x, y) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
  // 누르기. nav=true면 눌러서 다른 화면으로 가는 것: 불러오는 동안 잘라 낸다
  const click = async (sel, text, { nav = false, ready, after = 700 } = {}) => {
    const r = await hover(sel, text, 850);
    await evaluate(`__v.tap(${r.x}, ${r.y})`); await sleep(160);
    const l = nav ? loaded() : null;
    await mouse("mousePressed", r.x, r.y); await mouse("mouseReleased", r.x, r.y);
    if (nav) { await sleep(150); pause(); await l; await settle(ready, `${sel} ${text}`); } else await sleep(after);
  };
  const type = async (sel, text, value) => {
    await click(sel, text, { after: 250 });
    await evaluate(`(() => { const e = ${el(sel, text)}; e.focus(); e.select && e.select(); })()`);
    for (const ch of value) { await send("Input.insertText", { text: ch }); await sleep(70); }
    await sleep(400);
  };
  const scrollBy = async (dy, ms = 1100) => { await evaluate(`window.scrollBy({ top: ${dy}, behavior: "smooth" })`); await sleep(ms); };
  const hold = (ms) => sleep(ms);
  const shot = async (name) => { const { data } = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64")); };
  const shopReload = async (ready = "!!document.querySelector('.jjg')") => { pause(); const l = loaded(); await evaluate("location.reload()"); await l; await settle(ready, "reload"); };

  // ---------- 준비: 관리자 토큰 · 온보딩 건너뛰기 · 관심 데이터 ----------
  await send("Page.navigate", { url: `${BASE}/demo` }); await waitFor(`!!document.querySelector("#roles-title")`, "demo");
  const token = await evaluate(`document.querySelector("code").textContent`);
  await evaluate(`localStorage.setItem("jjimkkong-onboarding-v1", "1")`);

  // 녹화 전 준비 (영상에 안 들어감): 지난 몇 달 동안 확정된 공구 3개를 만들어 매출 그래프 · 기간별 · 유입별에 칸이 차게 한다
  await send("Page.navigate", { url: `${BASE}/api/cafe24/launch` }); await waitFor(`location.pathname === "/" && document.readyState === "complete"`, "launch");
  await api("POST", "/api/seller/radar");
  for (let i = 0; i < 120; i++) { const r = await api("GET", "/api/seller/radar"); if (r.body?.run && !r.body?.current) break; await sleep(500); }
  const must = async (label, p) => { const r = await p; if (r.status >= 300) throw new Error(`${label} ${JSON.stringify(r.body)}`); return r.body; };
  const demo = (action, body) => must(action, api("POST", `/api/demo/${action}`, body));
  const kstDay = (ms) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
  const past = async (productNo, dealPrice, targetQty, pledges, rate1, rate2, gapHours) => {
    const { now } = await must("now", api("GET", "/api/seller/now"));
    const dl = new Date(now).getTime() + 5 * 86_400_000;
    await must(`open ${productNo}`, api("POST", "/api/seller/campaigns", { productNo, targetQty: String(targetQty), dealPrice: String(dealPrice), costPrice: "", perMemberLimit: "2", deadlineAt: new Date(`${kstDay(dl)}T14:00:00+09:00`).toISOString(), payWindowHours: "72", shipEta: kstDay(dl + 14 * 86_400_000), confirmBelowCost: false }));
    for (let n = pledges; n > 0; n -= 10) await demo("simulate-pledges", { productNo, n: Math.min(10, n) });
    await demo("advance", { productNo, to: "deadline" }); await demo("simulate-payments", { productNo, rate: rate1 });
    await demo("advance", { productNo, to: "24" }); await demo("simulate-payments", { productNo, rate: rate2 });
    await demo("advance", { productNo, to: "payend" });
    for (let h = gapHours; h > 0; h -= 240) await demo("advance", { productNo, to: String(Math.min(240, h)) });
  };
  if (process.env.SEED !== "0") {
    await past(103, 69000, 20, 40, 0.6, 0.5, 480); // 린넨 암막 커튼
    await past(101, 99000, 20, 40, 0.5, 0.6, 480); // 워싱 린넨 이불 커버
    await past(104, 29000, 30, 40, 0.6, 0.5, 240); // 원목 수납 트레이
    await api("POST", "/api/seller/radar");
    for (let i = 0; i < 120; i++) { const r = await api("GET", "/api/seller/radar"); if (r.body?.run && !r.body?.current) break; await sleep(500); }
  }

  await send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: W * DSF, maxHeight: H * DSF, everyNthFrame: 1 });
  rec.t0 = Date.now(); rec.paused = false;
  await go("/demo", `!!document.querySelector("#roles-title")`);

  // 0. 제목 카드
  await evaluate(`__v.title('<img src="/logo.svg" alt=""><h1>찜꽁 시연</h1><p>장바구니에 담아 둔 고객이 모이면, 그때 만들고 파는 결제 없는 공동구매</p><div class="roles"><span style="background:#e94162">판매자</span><span style="background:#3182f6">소비자</span><span style="background:#7b6cf6">관리자</span></div>')`);
  await hold(3800);
  await evaluate(`__v.title(null)`); await hold(700);

  // 1. 데모 안내: 세 역할
  await say(null);
  await say("bar", "누구의 화면을 볼까요?", "판매자(쇼핑몰 사장님) · 소비자(쇼핑몰 고객) · 관리자(찜꽁 운영팀), 화면이 셋으로 나뉘어요");
  await hover(".card b", "판매자", 1100); await hold(700);
  await hover(".card b", "소비자", 1100); await hold(700);
  await hover(".card b", "관리자", 1100); await hold(1200);

  // 2. 판매자: 홈 → 새 공구
  await say("seller", "① 판매자 · 카페24 관리자에서 찜꽁 앱 열기", "홈에서 진행 중인 공구와 매출을 한눈에 봐요");
  await click("a", "판매자로 들어가기", { nav: true, ready: `!!document.querySelector(".stats")` });
  await hold(1500);
  await hover(".stat", "모집 중인 공구", 900); await hold(900);
  await say("seller", "② 판매자 · 고객이 기다리는 상품으로 새 공구 열기", "장바구니 · 공구 알림 신청이 많은 순서로 보여요");
  await click(".appbar a", "새 공구", { nav: true, ready: `!!${pick("button", "관심 데이터 모으기")} || !!${pick("button", "다시 수집")}` });
  await hold(800);
  if (await rectOf("button", "관심 데이터 모으기")) await click("button", "관심 데이터 모으기", { after: 400 });
  const pickRow = { expr: `[...document.querySelectorAll("tr")].find((t) => t.textContent.includes("스톤웨어 디너 접시"))?.querySelector("button")` };
  await waitFor(`!!(${pickRow.expr})`, "radar list"); await hold(1200);
  await hover("tr", "스톤웨어 디너 접시", 900); await hold(500);
  await click(pickRow, null, { after: 1000 });
  await waitFor(`!!${pick("button", "미리보기 · 초대 대상 확인")}`, "form");
  await say("seller", "② 판매자 · 조건 정하기", "목표 수량 · 공구가 · 마감 일시를 정해요. 신청만 받고, 결제는 목표를 채운 뒤에 받아요");
  await type(inputOf("목표 수량"), null, "30"); await hold(600);
  await hover(".form label", "공구가", 900); await hold(1000);
  await hover(".form label", "마감 일시", 900); await hold(800);
  await click("button", "미리보기 · 초대 대상 확인", { after: 1200 });
  await waitFor(`!!${pick("button", "공구 열기 · 초대")}`, "preview");
  await say("seller", "② 판매자 · 미리보기로 초대 대상과 문자 확인", "장바구니 · 알림 신청 고객 중 문자 수신에 동의한 사람에게 초대 문자가 예약돼요");
  await hover(".kpi div.hl", null, 1000); await hold(1400);
  await hover("p.msg", null, 1000); await hold(1600);
  await click("button", "공구 열기 · 초대", { after: 2200 });
  await shot("check-opened");
  await hold(1200);

  // 3. 소비자: 상품 페이지 위젯에서 신청
  await say("shopper", "③ 소비자 · 쇼핑몰 상품 페이지에 공구가 떠요", "역할을 바꿔 고객이 되어 봐요");
  await click("aside a", "역할 바꾸기", { nav: true, ready: `!!document.querySelector("#roles-title")` });
  await click("a", "상품 페이지 열기", { nav: true, ready: `!!${pick(".jjg button", "참여 신청")}` });
  await hold(1200);
  await hover(".jjg", null, 1000); await hold(1500);
  await say("shopper", "③ 소비자 · 결제 없이 참여 신청", "목표 수량이 모이면 할인 쿠폰을 받고, 못 모이면 안내만 받아요");
  await click(".jjg button", "참여 신청", { after: 900 });
  await click(".jjg button[aria-label='수량 늘리기']", null, { after: 600 });
  await hold(800);
  await click(".jjg button", "개 신청하기", { after: 1500 });
  await waitFor(`!!${pick(".jjg", "신청 완료")}`, "pledged"); await hold(1800);

  // 4. 데모 막대: 다른 고객 신청 · 마감
  await say("bar", "다른 고객들도 신청해요", "시연용 데모 막대로 다른 고객 10명씩 신청을 흉내 내요");
  for (let i = 0; i < 3; i++) {
    await click("#simP", null, { after: 1000 });
    await shopReload(); await hold(900);
  }
  if (!(await rectOf(".jjg", "목표를 채웠어요"))) {
    pause(); await api("POST", "/api/demo/simulate-pledges", { productNo: 102, n: 20 }); await shopReload(); await hold(800);
  }
  await hover(".jjg", "목표를 채웠어요", 900); await hold(1500);
  await say("bar", "④ 마감 · 목표를 채웠어요", "마감 시각이 되면 신청한 고객 모두에게 할인 쿠폰과 문자가 가요");
  await click("[data-adv='deadline']", null, { after: 300 });
  pause(); await sleep(1500); await shopReload(`!!${pick(".jjg button", "쿠폰 쓰고 결제하러 가기")}`);
  await hold(1000);
  await say("shopper", "④ 소비자 · 문자로 쿠폰을 받았어요", "고객 휴대폰 문자함과 쿠폰함에 들어와요");
  await hover("#inbox .sms", null, 1100); await hold(2200);
  await hover("#coupons", null, 900); await hold(1200);

  // 5. 소비자: 쿠폰 쓰고 결제
  await say("shopper", "⑤ 소비자 · 쿠폰 쓰고 결제", "결제 기한 안에 쇼핑몰 주문서에서 쿠폰을 적용해 결제해요");
  await click(".jjg button", "쿠폰 쓰고 결제하러 가기", { after: 1400 });
  await click("#buy", null, { after: 400 });
  pause(); await sleep(1600); await shopReload(); await hold(800);
  if (!(await rectOf(".jjg", "결제를 마쳤어요"))) { pause(); await sleep(1500); await shopReload(); }
  await hover(".jjg", null, 900); await hold(1800);

  // 6. 데모 막대: 다른 고객 결제 · 결제 기간 끝
  await say("bar", "⑥ 다른 고객도 결제하고, 결제 기간이 끝나면 공구가 확정돼요", "쿠폰 받은 고객 60% 결제 → 결제 기간 끝으로");
  await click("#simPay", null, { after: 1000 }); await shopReload(); await hold(700);
  await click("[data-adv='payend']", null, { after: 300 });
  pause(); await sleep(1200); await shopReload(); await hold(1500);

  // 7. 판매자: 매출 보기
  await say("seller", "⑦ 판매자 · 홈에서 공구 매출 확인", "확정 매출 · 결제 대기 · 매출 추이를 홈에서 바로 봐요");
  await click(".demobar a", "판매자 화면", { nav: true, ready: `!!document.querySelector("section[aria-labelledby=sales-title] .kpi")` });
  await hover("section[aria-labelledby=sales-title] .kpi div", null, 1000); await hold(1500);
  await scrollBy(260); await hold(1000);
  await say("seller", "⑦ 판매자 · 모니터링 › 리포트", "이번 달 확정 매출 · 결제 기다리는 금액 · 누적을 한눈에");
  await click(".appbar a", "모니터링", { nav: true, ready: `!!document.querySelector("section[aria-labelledby=sales-title] .kpi")` });
  await hold(1000);
  await hover("section[aria-labelledby=sales-title] .kpi div", null, 900); await hold(1200);
  await say("seller", "⑦ 판매자 · 매출 추이 · 일별 · 주별 · 월별", "막대를 누르면 그 기간의 금액 · 결제 건수 · 수량이 보여요");
  await hover("[role=radiogroup][aria-label='추이 단위']", null, 800);
  await click("[role=radio]", "월별", { after: 1200 });
  { const bars = "[role=group] button"; const n = await evaluate(`document.querySelectorAll("${bars}").length`);
    for (const i of [n - 2, n - 3, n - 1]) { if (i < 0) continue; await click({ expr: `document.querySelectorAll("${bars}")[${i}]` }, null, { after: 1100 }); } }
  await click("[role=radio]", "주별", { after: 1300 });
  await say("seller", "⑦ 판매자 · 공구별 매출과 엑셀", "목표 대비 확정 · 쿠폰 받은 사람 중 결제 인원, 엑셀로 날짜별 · 공구별 내려받기");
  await scrollBy(520, 1400); await hold(1500);
  await scrollBy(-520, 900);
  await click("button[aria-expanded]", "엑셀 내려받기", { after: 1600 });
  await evaluate(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`); await hold(500);
  await say("seller", "⑦ 판매자 · 모니터링 › 기간별", "달마다 얼마나 팔렸는지, 지난달 같은 기간과 비교해요");
  await click("[role=tab]", "기간별", { after: 1200 });
  await waitFor(`!!document.querySelector("section[aria-labelledby=period-title]")`, "period"); await hold(1500);
  { const bars = "section[aria-labelledby=period-title] [role=group] button"; const n = await evaluate(`document.querySelectorAll("${bars}").length`);
    for (const i of [n - 2, n - 3, n - 1]) { if (i < 0) continue; await click({ expr: `document.querySelectorAll("${bars}")[${i}]` }, null, { after: 1300 }); } }
  await say("seller", "⑦ 판매자 · 상품별 · 유입별", "어떤 상품이, 어떤 고객(장바구니 · 재입고 알림 · 직접 신청)이 매출을 만들었는지");
  await scrollBy(300, 1000); await hold(1300);
  await click("[role=radio]", "유입별", { after: 1800 });
  await say("seller", "⑦ 판매자 · 내 공구", "진행 중 · 확정된 공구와, 아래에 고객이 기다리는 상품 순위");
  await click(".appbar a", "내 공구", { nav: true, ready: `!!document.querySelector("#demand-title")` });
  await hold(1500);
  await hover("#demand-title", null, 900); await hold(1500);

  // 8. 관리자
  await say("admin", "⑧ 관리자 · 찜꽁 운영팀 화면", "파일럿 동안 모든 쇼핑몰의 공구 · 매출을 함께 봐요");
  await click("aside a", "역할 바꾸기", { nav: true, ready: `!!document.querySelector("#roles-title")` });
  await click("a", "관리자 화면 열기", { nav: true, ready: `!!document.querySelector("#token")` });
  await type("#token", null, token.slice(0, 10));
  await evaluate(`document.querySelector("#token").value = ${JSON.stringify(token)}`);
  await click("button", "로그인", { nav: true, ready: `!!document.querySelector(".camp")` });
  await hold(1200);
  await say("admin", "⑧ 관리자 · 확정된 공구로 생산 결정 기록", "판매자가 이 확정 수량으로 생산 · 발주를 정했는지 남겨요");
  await click(".camp", "스톤웨어", { after: 1500 });
  await waitFor(`!!${pick("button", "결정 기록")}`, "decision");
  await type(inputOf("확인 근거"), null, "가마 11월 1회분 예약");
  await click("button", "결정 기록", { after: 1800 });
  await hold(800);
  await say("admin", "⑧ 관리자 · 4주 판정표", "파일럿 28일 차에 이 표로만 다음 단계를 정해요");
  await click("[role=tab]", "4주 판정표", { after: 1200 }); await hold(2600);

  // 끝 카드
  await say(null);
  await evaluate(`__v.title('<img src="/logo.svg" alt=""><h1>찜꽁</h1><p>장바구니에 담아 둔 고객이 모이면, 그때 만들고 파세요</p><div class="roles"><span style="background:#e94162">판매자 · 공구 열기 · 매출</span><span style="background:#3182f6">소비자 · 신청 · 쿠폰 결제</span><span style="background:#7b6cf6">관리자 · 판정</span></div>')`);
  await hold(4200);
  // 화면이 그대로면 프레임이 오지 않는다: 마지막 장면을 지금까지 붙잡는다
  rec.frames.push({ t: vnow(), f: rec.frames[rec.frames.length - 1].f });
  pause();
  await send("Page.stopScreencast");
  await sleep(300);

  // concat 목록 (프레임마다 다음 프레임까지 길이)
  const fr = rec.frames;
  let list = "";
  for (let i = 0; i < fr.length; i++) {
    const d = i + 1 < fr.length ? (fr[i + 1].t - fr[i].t) / 1000 : 0.5;
    list += `file 'frames/${fr[i].f}'\nduration ${Math.max(d, 0.001).toFixed(3)}\n`;
  }
  list += `file 'frames/${fr[fr.length - 1].f}'\n`;
  writeFileSync(join(OUT, "list.txt"), list);
  if (process.env.FFMPEG) {
    const r = spawnSync(process.env.FFMPEG, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", join(OUT, "list.txt"), "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:white,fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "20", "-movflags", "+faststart", join(OUT, "demo.mp4")], { stdio: "inherit" });
    if (r.status !== 0) throw new Error("ffmpeg 실패");
  }
  console.log(`프레임 ${fr.length}개 · 길이 ${(fr[fr.length - 1].t / 1000).toFixed(1)}초`);
}
main().then(() => { chrome.kill(); process.exit(0); }, async (e) => { console.error(e); try { const { data } = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(OUT, "error.png"), Buffer.from(data, "base64")); } catch {} chrome.kill(); process.exit(1); });
