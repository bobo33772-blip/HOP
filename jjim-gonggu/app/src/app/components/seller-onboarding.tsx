"use client";

// 판매자 첫 화면 온보딩: 로고가 천천히 나타난 뒤, '찜꽁 사장님 셀러 가이드라인'(#94, 찜꽁 위젯 기준)의
// 핵심 원칙과 1~5단계를 여섯 장면으로 보여 준다. 큰 마우스 커서가 직접 움직이고 눌러서 "이렇게 하면 돼요"를 보여 주고, 하트 캐릭터가 말풍선으로 쉽게 설명한다.
// - 처음 한 번은 저절로 열리고(이 기기에 기록), 홈의 "찜꽁 사용법 보기"로 언제든 다시 본다.
// - 움직임 줄이기 설정이면 커서 움직임 없이 장면의 마지막 모습만 보여 준다.
// - 화면 속 쇼핑몰 · 카페24 관리자 · 찜꽁 화면은 설명용 그림이다(실제 데이터 아님). 카페24 자체 재입고 알림은 쓰지 않는다(#94).

import { useCallback, useEffect, useRef, useState } from "react";
import s from "./seller-onboarding.module.css";

const SEEN_KEY = "jjimkkong-onboarding-v1";

type Fx = Record<string, string | number | boolean>;
type Step =
  | { at: string; ms?: number } // 커서를 그 자리로 옮긴다
  | { click: true } // 딸깍
  | { type: string; into: string } // 글자를 한 자씩 친다
  | { set: Fx } // 화면을 바꾼다
  | { wait: number };

interface Scene {
  title: string;
  say: string; // 하트 캐릭터 말풍선
  tip: string; // 장면 아래 한 줄
  steps: Step[];
  view: (fx: Fx) => React.ReactNode;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- 장면 (셀러 가이드라인 #94: 핵심 원칙 + 1~5단계를 아주 쉽게) ----

/** 관리 화면 모양 틀: 위쪽 경로(메뉴 · 단계)를 커서가 차례로 누르면 아래 칸이 열린다. jj면 찜꽁 화면(분홍 막대), 아니면 카페24 관리자 */
function Admin({ path, fx, done, jj, children }: { path: string[]; fx: Fx; done?: string; jj?: boolean; children: React.ReactNode }) {
  const m = Number(fx.m ?? 0);
  return (
    <div className={s.admin}>
      <div className={`${s.adminBar} ${jj ? s.jjBar : ""}`}>{jj && <img src="/logo.svg" alt="" className={s.barLogo} />}<b>{jj ? "찜꽁" : "카페24 관리자"}</b>{done && fx.done && <span className={s.barStamp}>{done}</span>}</div>
      {path.length > 0 && (
        <div className={s.crumbs}>
          {path.map((p, i) => (
            <span key={p} data-t={`p${i + 1}`} className={m >= i + 1 ? s.picked : ""}>{i > 0 && <i aria-hidden="true">›</i>}{p}</span>
          ))}
        </div>
      )}
      <div className={`${s.panel} ${m >= path.length ? s.show : ""}`}>{children}</div>
    </div>
  );
}

/** 설정 한 줄: 커서가 누르면 값이 바뀌며 반짝인다 */
function Opt({ t, label, from, to, on }: { t: string; label: string; from: string; to: string; on: boolean }) {
  return (
    <div className={s.setRow}><span>{label}</span>
      <span data-t={t} className={`${s.select} ${on ? s.changed : ""}`}>{on ? to : from}<i aria-hidden="true">▾</i></span>
    </div>
  );
}

/** 메뉴 경로를 차례로 누르는 단계 */
const walk = (n: number): Step[] => Array.from({ length: n }, (_, i): Step[] => [{ at: `p${i + 1}`, ms: 700 }, { click: true }, { set: { m: i + 1 } }]).flat();

const SCENES: Scene[] = [
  {
    title: "품절돼도 숨기지 마세요",
    say: "품절 상품을 그대로 두면, 찜꽁이 '재입고 · 공구 알림 받기' 버튼을 저절로 보여 줘요!",
    tip: "사장님이 따로 켤 버튼은 없어요. 신청한 사람 수가 곧 '얼마나 팔릴지' 알려 주는 숫자예요.",
    steps: [
      { wait: 500 }, { at: "notify" }, { click: true }, { set: { n: 1, pop: 1 } }, { wait: 700 },
      { set: { n: 2, pop: 2 } }, { wait: 380 }, { set: { n: 3, pop: 3 } }, { wait: 380 }, { set: { n: 4, pop: 4 } }, { wait: 380 },
      { set: { n: 5, pop: 5 } }, { wait: 300 }, { at: "count" }, { set: { glow: true } },
    ],
    view: (fx) => (
      <div className={s.shop}>
        <div className={s.shopBar}><b>사장님 쇼핑몰</b><span>상품 상세</span></div>
        <div className={s.product}>
          <div className={s.photo} aria-hidden="true"><span className={s.sold}>품절</span></div>
          <div className={s.pinfo}>
            <b>워싱 린넨 이불</b>
            <span className={s.price}>129,000원</span>
            <button type="button" tabIndex={-1} data-t="notify" className={`${s.notify} ${fx.n ? s.on : ""}`}>🔔 재입고 · 공구 알림 받기</button>
            <span data-t="count" className={`${s.counter} ${fx.glow ? s.glow : ""}`}>기다리는 손님 <b key={String(fx.n)} className={s.bump}>{Number(fx.n ?? 0)}</b>명</span>
          </div>
        </div>
        {Number(fx.pop ?? 0) > 0 && <span key={String(fx.pop)} className={s.heartPop} aria-hidden="true">♥ +1</span>}
      </div>
    ),
  },
  {
    title: "1단계 · 품절 상품 숨기지 않기",
    say: "할 일은 이것 하나예요. 재고가 0이어도 '진열함' · '판매함'은 그대로, '품절표시'는 체크!",
    tip: "카페24 관리자 › 상품 › 상품 관리에서 그 상품을 열어 확인해요. 진열안함 · 판매안함이면 손님이 버튼을 못 봐요.",
    steps: [
      { wait: 300 }, ...walk(3), { wait: 250 }, { at: "show" }, { click: true }, { set: { show: true } },
      { at: "sell" }, { click: true }, { set: { sell: true } }, { at: "mark" }, { click: true }, { set: { mark: true } }, { wait: 450 }, { set: { done: true } },
    ],
    view: (fx) => (
      <Admin path={["상품", "상품 관리", "상품 수정"]} fx={fx} done="숨기지 않기 완료! ✓">
        <Opt t="show" label="진열상태" from="진열안함" to="진열함" on={!!fx.show} />
        <Opt t="sell" label="판매상태" from="판매안함" to="판매함" on={!!fx.sell} />
        <div className={s.setRow}>
          <span data-t="mark" className={s.checkAll}><i className={fx.mark ? s.boxOn : s.box} aria-hidden="true">{fx.mark ? "✓" : ""}</i>품절표시 (재고 0이면 품절로 보여요)</span>
        </div>
      </Admin>
    ),
  },
  {
    title: "2단계 · 쇼핑몰에서 위젯 확인",
    say: "손님처럼 휴대폰으로 품절 상품을 열어 봐요. 구매 버튼 아래에 찜꽁 버튼이 있으면 성공!",
    tip: "회원으로 로그인해야 신청돼요. 신청하면 찜꽁 공구 관리의 알림 신청 수가 +1 돼요.",
    steps: [
      { wait: 400 }, { set: { c1: true } }, { wait: 500 }, { at: "pbtn" }, { click: true }, { set: { c2: true, ok: true } }, { wait: 500 }, { set: { c3: true } },
    ],
    view: (fx) => (
      <div className={s.checkScene}>
        <div className={s.phone}>
          <div className={s.notch} aria-hidden="true" />
          <div className={s.pdetail}>
            <i className={s.pphoto} />
            <b>워싱 린넨 이불 · 품절</b>
            <span className={s.pbuy}>구매하기 (품절)</span>
            <span data-t="pbtn" className={`${s.pbtn} ${fx.ok ? s.on : ""}`}>{fx.ok ? "알림 신청 완료!" : "🔔 재입고 · 공구 알림 받기"}</span>
          </div>
        </div>
        <ul className={s.checks}>
          <li className={fx.c1 ? s.ticked : ""}>구매 버튼 아래에 찜꽁 버튼</li>
          <li className={fx.c2 ? s.ticked : ""}>회원으로 신청됨</li>
          <li className={fx.c3 ? s.ticked : ""}>공구 관리에 +1</li>
        </ul>
      </div>
    ),
  },
  {
    title: "3단계 · 매주 고객이 기다리는 상품 보기",
    say: "일주일에 한 번, 찜꽁 공구 관리에서 '다시 수집'을 눌러요. 알림 신청과 장바구니가 많은 상품이 위에 와요!",
    tip: "장바구니 숫자는 '다시 수집'을 누를 때만 바뀌어요.",
    steps: [
      { wait: 400 }, { at: "find" }, { click: true }, { set: { found: true } }, { wait: 600 }, { at: "top" }, { set: { glow: true } },
    ],
    view: (fx) => (
      <Admin path={[]} fx={fx} jj>
        <div className={s.searchRow}>
          <span className={s.monTitle}>공구 관리</span>
          <span data-t="find" className={s.findBtn}>다시 수집</span>
        </div>
        {fx.found && (
          <div className={s.result}>
            <div className={s.resRow}><span>1 워싱 린넨 이불</span><span data-t="top" className={`${s.waitBadge} ${fx.glow ? s.glow : ""}`}>알림 <b>32</b> · 장바구니 <b>14</b></span></div>
            <div className={s.resRow}><span>2 스톤웨어 접시</span><span className={s.waitBadge}>알림 <b>18</b> · 장바구니 <b>9</b></span></div>
            <p className={s.resNote}>{fx.glow ? "이 상품부터 공구를 열면 좋아요" : ""}</p>
          </div>
        )}
      </Admin>
    ),
  },
  {
    title: "4단계 · 공구 열기",
    say: "상품을 고르고, 몇 개 모이면 만들지 정해 '공구 열기'! 기다리던 손님에게 초대 문자가 저절로 가요.",
    tip: "공구 열기 › 상품 고르기 › 조건 정하기 › 미리보기에서 초대 대상을 확인하고 열어요. 결제는 아직 받지 않아요.",
    steps: [
      { wait: 300 }, ...walk(3), { at: "qty" }, { click: true }, { set: { sf: true } }, { type: "30", into: "qty" }, { wait: 250 },
      { at: "open" }, { click: true }, { set: { sent: true } }, { wait: 1100 }, { set: { done: true } },
    ],
    view: (fx) => (
      <Admin path={["상품 고르기", "조건 정하기", "미리보기"]} fx={fx} jj>
        <div className={s.setRow}><span>목표 수량</span><span data-t="qty" className={`${s.input} ${s.small} ${fx.sf ? s.focus : ""}`}>{String(fx.qty ?? "")}<i className={fx.sf && !fx.sent ? s.caret : ""} />개</span></div>
        <span data-t="open" className={s.sendBtn}>공구 열기</span>
        {fx.done && <div className={s.statusOk}><b>공구 열림</b> · 초대 문자 46명 예약 ✓</div>}
        {fx.sent && !fx.done && <span className={s.plane} aria-hidden="true">✉️</span>}
      </Admin>
    ),
  },
  {
    title: "5단계 · 마감 전에 재고 넣기",
    say: "목표를 채웠어요! 마감 날, 마감 시각 전에 재고를 넣어 주세요. 그래야 쿠폰 받은 손님이 주문할 수 있어요.",
    tip: "결제 기간이 끝나면 다시 품절로 돌려 두세요. 결제된 만큼만 만들면 재고 걱정 끝!",
    steps: [
      { wait: 300 }, ...walk(3), { at: "stock" }, { click: true }, { set: { sf: true } }, { type: "30", into: "stock" }, { wait: 400 }, { set: { done: true } },
    ],
    view: (fx) => (
      <Admin path={["상품", "상품 관리", "상품 수정"]} fx={fx} done="주문 받을 준비 ✓">
        <div className={s.goalBadge}>🎉 공구 목표 달성 · 30 / 30개</div>
        <div className={s.setRow}><span>재고 수량</span><span data-t="stock" className={`${s.input} ${s.small} ${fx.sf ? s.focus : ""}`}>{String(fx.stock ?? "0")}<i className={fx.sf && !fx.done ? s.caret : ""} />개</span></div>
        {fx.done && <div className={s.statusOk}>쿠폰 받은 손님이 이제 주문할 수 있어요 ✓</div>}
      </Admin>
    ),
  },
];

// ---- 부품 ----

function Cursor({ x, y, clicking, hidden }: { x: number; y: number; clicking: boolean; hidden: boolean }) {
  return (
    <div className={`${s.cursor} ${clicking ? s.clicking : ""} ${hidden ? s.cursorHidden : ""}`} style={{ left: x, top: y }} aria-hidden="true">
      <span className={s.ring} />
      <svg viewBox="0 0 32 32" width="34" height="34">
        <path d="M5 3 L5 25 L11 19.5 L15 28.5 L19.2 26.6 L15.3 17.8 L23 17.8 Z" fill="#fff" stroke="#17171c" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      {clicking && <span className={s.tap}>딸깍!</span>}
    </div>
  );
}

function Intro({ onStart }: { onStart: () => void }) {
  return (
    <div className={s.intro}>
      <div className={s.floaty} aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} style={{ "--i": i } as React.CSSProperties}>♥</i>)}</div>
      <img src="/logo.svg" alt="" className={s.logo} />
      <h2 className={s.word} aria-label="찜꽁">{["찜", "꽁"].map((c, i) => <span key={c} style={{ "--i": i } as React.CSSProperties}>{c}</span>)}</h2>
      <p className={s.slogan}>손님이 먼저 모이면, 그때 만들어요</p>
      <button type="button" className={s.start} onClick={onStart} autoFocus>사용법 보기 →</button>
    </div>
  );
}

// ---- 본체 ----

export default function SellerOnboarding() {
  const [open, setOpen] = useState(false);
  const [scene, setScene] = useState(-1); // -1: 로고 인트로, 0~4: 장면, 5: 끝
  const [run, setRun] = useState(0); // 다시 보기
  const [fx, setFx] = useState<Fx>({});
  const [cur, setCur] = useState({ x: 40, y: 40, clicking: false, hidden: true });
  const [played, setPlayed] = useState(false);
  const stage = useRef<HTMLDivElement>(null);

  // 처음 한 번은 저절로 연다 (저장소가 막혀 있어도 화면은 정상)
  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === "1"; } catch { /* 저장소 없음 */ }
    if (!seen) { setScene(-1); setOpen(true); }
  }, []);

  const close = useCallback(() => {
    try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* 저장소 없음 */ }
    setOpen(false);
  }, []);

  // Esc로 닫기 · 열려 있는 동안 뒤 화면 스크롤 막기
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", key); document.body.style.overflow = prev; };
  }, [open, close]);

  // 장면 재생: 커서를 옮기고, 누르고, 화면을 바꾼다
  useEffect(() => {
    if (!open || scene < 0 || scene >= SCENES.length) return;
    let alive = true;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const steps = SCENES[scene].steps;
    setFx({});
    setPlayed(false);
    if (reduce) {
      // 움직임 없이 마지막 모습만
      const last: Fx = {};
      for (const st of steps) {
        if ("set" in st) Object.assign(last, st.set);
        if ("type" in st) last[st.into] = st.type;
      }
      setFx(last);
      setCur((c) => ({ ...c, hidden: true }));
      setPlayed(true);
      return;
    }
    setCur({ x: 30, y: 30, clicking: false, hidden: false });
    (async () => {
      await sleep(250);
      for (const st of steps) {
        if (!alive) return;
        if ("at" in st) {
          const box = stage.current, el = box?.querySelector<HTMLElement>(`[data-t="${st.at}"]`);
          if (box && el) {
            const b = box.getBoundingClientRect(), r = el.getBoundingClientRect();
            setCur((c) => ({ ...c, x: r.left - b.left + r.width * 0.55, y: r.top - b.top + r.height * 0.55 }));
          }
          await sleep(st.ms ?? 850);
        } else if ("click" in st) {
          setCur((c) => ({ ...c, clicking: true }));
          await sleep(380);
          setCur((c) => ({ ...c, clicking: false }));
        } else if ("type" in st) {
          for (let i = 1; i <= st.type.length; i++) {
            if (!alive) return;
            setFx((f) => ({ ...f, [st.into]: st.type.slice(0, i) }));
            await sleep(260);
          }
        } else if ("set" in st) {
          setFx((f) => ({ ...f, ...st.set }));
        } else {
          await sleep(st.wait);
        }
      }
      if (!alive) return;
      // 다 보여 준 뒤에는 커서를 치워 결과 화면을 가리지 않는다
      await sleep(700);
      if (alive) { setCur((c) => ({ ...c, hidden: true })); setPlayed(true); }
    })();
    return () => { alive = false; };
  }, [open, scene, run]);

  const go = (n: number) => { setScene(n); setRun((r) => r + 1); };
  const sc = scene >= 0 && scene < SCENES.length ? SCENES[scene] : null;

  return (
    <>
      <button type="button" className={s.trigger} onClick={() => { go(-1); setOpen(true); }}>
        <span aria-hidden="true">▶</span> 찜꽁 사용법 1분 만에 보기
      </button>
      {open && (
        <div className={s.backdrop} role="dialog" aria-modal="true" aria-label="찜꽁 사용법">
          <div className={s.sheet}>
            <button type="button" className={s.skip} onClick={close}>{scene >= SCENES.length ? "닫기" : "건너뛰기"}</button>

            {scene < 0 && <Intro onStart={() => go(0)} />}

            {sc && (
              <>
                <div className={s.head}>
                  <span className={s.stepNo}>{scene + 1} / {SCENES.length}</span>
                  <h2>{sc.title}</h2>
                </div>
                <div className={s.stage} ref={stage}>
                  {sc.view(fx)}
                  <Cursor {...cur} />
                </div>
                <div className={s.talk}>
                  <img src="/logo.svg" alt="" className={s.buddy} />
                  <p className={s.bubble} aria-live="polite">{sc.say}</p>
                </div>
                <p className={s.tip}>{sc.tip}</p>
                <div className={s.foot}>
                  <button type="button" className={s.ghost} onClick={() => go(scene - 1)} disabled={scene === 0}>이전</button>
                  <span className={s.dots} aria-hidden="true">{SCENES.map((_, i) => <i key={i} className={i === scene ? s.dotOn : ""} />)}</span>
                  <button type="button" className={s.ghost} onClick={() => go(scene)} aria-label="이 장면 다시 보기">↻</button>
                  <button type="button" className={`${s.next} ${played ? s.ready : ""}`} onClick={() => go(scene + 1)}>{scene === SCENES.length - 1 ? "마치기" : "다음"}</button>
                </div>
              </>
            )}

            {scene >= SCENES.length && (
              <div className={s.end}>
                <img src="/logo.svg" alt="" className={s.endLogo} />
                <h2>준비 끝! 이제 사장님 차례예요</h2>
                <ol className={s.recap}>
                  <li>품절 상품 숨기지 않기 (진열함 · 판매함)</li>
                  <li>쇼핑몰에서 찜꽁 위젯 확인</li>
                  <li>매주 고객이 기다리는 상품 보기</li>
                  <li>공구 열기</li>
                  <li>마감 전에 재고 넣기</li>
                </ol>
                <button type="button" className={s.start} onClick={close}>시작하기 →</button>
                <button type="button" className={s.ghost} onClick={() => go(0)}>처음부터 다시 보기</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
