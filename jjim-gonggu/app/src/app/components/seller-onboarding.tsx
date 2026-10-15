"use client";

// 판매자 첫 화면 온보딩: 로고가 천천히 나타난 뒤, '찜꽁 사장님 가이드'(품절 상품으로 재입고 공구 여는 법)의 흐름을
// 다섯 장면으로 보여 준다. 큰 마우스 커서가 직접 움직이고 눌러서 "이렇게 하면 돼요"를 보여 주고, 하트 캐릭터가 말풍선으로 쉽게 설명한다.
// - 처음 한 번은 저절로 열리고(이 기기에 기록), 홈의 "찜꽁 사용법 보기"로 언제든 다시 본다.
// - 움직임 줄이기 설정이면 커서 움직임 없이 장면의 마지막 모습만 보여 준다.
// - 화면 속 쇼핑몰 · 카페24 관리자 · 찜꽁 화면은 설명용 그림이다(실제 데이터 아님).

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

// ---- 장면 (가이드 1~5단계를 아주 쉽게) ----

const SCENES: Scene[] = [
  {
    title: "품절돼도 숨기지 마세요",
    say: "품절 상품을 그대로 두면, 손님이 '사고 싶어요'를 남겨요!",
    tip: "남긴 신청 수가 곧 '얼마나 팔릴지' 알려 주는 숫자예요.",
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
            <button type="button" tabIndex={-1} data-t="notify" className={`${s.notify} ${fx.n ? s.on : ""}`}>🔔 재입고 알림 신청</button>
            <span data-t="count" className={`${s.counter} ${fx.glow ? s.glow : ""}`}>기다리는 손님 <b key={String(fx.n)} className={s.bump}>{Number(fx.n ?? 0)}</b>명</span>
          </div>
        </div>
        {Number(fx.pop ?? 0) > 0 && <span key={String(fx.pop)} className={s.heartPop} aria-hidden="true">♥ +1</span>}
      </div>
    ),
  },
  {
    title: "카페24에서 버튼 한 번 켜기",
    say: "카페24 관리자에서 '재입고 알림' 버튼을 켜 주세요. 딱 한 번만요!",
    tip: "상품 › 재입고 알림 › 설정에서 '노출함'으로 바꾸면 끝이에요.",
    steps: [
      { wait: 400 }, { at: "m1" }, { click: true }, { set: { m: 1 } }, { at: "m2" }, { click: true }, { set: { m: 2 } },
      { at: "m3" }, { click: true }, { set: { m: 3 } }, { wait: 300 }, { at: "sw" }, { click: true }, { set: { sw: true } }, { wait: 500 }, { set: { done: true } },
    ],
    view: (fx) => (
      <div className={s.admin}>
        <div className={s.adminBar}><b>카페24 관리자</b></div>
        <div className={s.adminBody}>
          <ul className={s.menu}>
            {["상품", "재입고 알림", "설정"].map((m, i) => (
              <li key={m} data-t={`m${i + 1}`} className={Number(fx.m ?? 0) >= i + 1 ? s.picked : ""}>{i > 0 && <span aria-hidden="true">› </span>}{m}</li>
            ))}
          </ul>
          <div className={`${s.panel} ${Number(fx.m ?? 0) >= 3 ? s.show : ""}`}>
            <div className={s.setRow}><span>재입고 알림 버튼</span>
              <button type="button" tabIndex={-1} data-t="sw" className={`${s.switch} ${fx.sw ? s.swOn : ""}`} aria-label="노출함"><i /></button>
            </div>
            <div className={s.setRow}><span>보여 줄 손님</span><b>전체</b></div>
            {fx.done && <div className={s.stamp}>설정 끝! ✓</div>}
          </div>
        </div>
      </div>
    ),
  },
  {
    title: "매주 한 번, 기다리는 손님 보기",
    say: "일주일에 한 번, 찜꽁에서 어떤 상품을 많이 기다리는지 봐요.",
    tip: "숫자가 가장 큰 상품부터 공구를 열면 좋아요.",
    steps: [
      { wait: 300 }, { set: { a: 12, b: 6, c: 2 } }, { wait: 450 }, { set: { a: 24, b: 13, c: 5 } }, { wait: 450 }, { set: { a: 32, b: 18, c: 7 } },
      { wait: 400 }, { at: "r1" }, { click: true }, { set: { pick: true } },
    ],
    view: (fx) => (
      <div className={s.app}>
        <div className={s.appBar}><img src="/logo.svg" alt="" /><b>찜꽁 · 수요 레이더</b></div>
        <ul className={s.radar}>
          {[["워싱 린넨 이불", "a"], ["스톤웨어 접시", "b"], ["린넨 암막 커튼", "c"]].map(([name, k], i) => (
            <li key={k} data-t={`r${i + 1}`} className={i === 0 && fx.pick ? s.best : ""}>
              <span className={s.rank}>{i + 1}</span><span className={s.rname}>{name}</span>
              <span className={s.wait}>🔔 <b>{Number(fx[k] ?? 0)}</b>명</span>
              {i === 0 && fx.pick && <span className={s.crown}>이거예요!</span>}
            </li>
          ))}
        </ul>
      </div>
    ),
  },
  {
    title: "목표 정하고 공구 열기",
    say: "몇 개가 모이면 만들지 정하고 '공구 열기'만 누르세요. 결제는 아직 안 받아요!",
    tip: "기다리던 손님에게 '공구 열렸어요' 문자가 저절로 가요.",
    steps: [
      { wait: 400 }, { at: "qty" }, { click: true }, { set: { focus: true } }, { type: "30", into: "qty" }, { wait: 300 },
      { at: "open" }, { click: true }, { set: { sent: true } }, { wait: 1300 }, { set: { sentDone: true } },
    ],
    view: (fx) => (
      <div className={s.app}>
        <div className={s.appBar}><img src="/logo.svg" alt="" /><b>찜꽁 · 새 공구</b></div>
        <div className={s.form}>
          <label>몇 개 모이면 만들까요?<span data-t="qty" className={`${s.input} ${fx.focus ? s.focus : ""}`}>{String(fx.qty ?? "")}<i className={fx.focus && !fx.sent ? s.caret : ""} />개</span></label>
          <label>공구 가격<span className={s.input}>99,000원</span></label>
          <button type="button" tabIndex={-1} data-t="open" className={s.openBtn}>공구 열기</button>
        </div>
        {fx.sent && <span className={s.plane} aria-hidden="true">✉️</span>}
        {fx.sentDone && <div className={s.toast}>기다리던 손님 32명에게 문자를 보냈어요!</div>}
      </div>
    ),
  },
  {
    title: "다 모이면 그때 만들기",
    say: "목표만큼 모이면 손님에게 할인 쿠폰이 가요. 결제한 만큼만 만들면 끝!",
    tip: "남는 재고 걱정 없이, 팔린 만큼만 만들어요.",
    steps: [
      { wait: 300 }, { set: { n: 8 } }, { wait: 420 }, { set: { n: 17 } }, { wait: 420 }, { set: { n: 25 } }, { wait: 420 }, { set: { n: 30, party: true } },
      { wait: 900 }, { at: "final" }, { click: true }, { set: { final: true } },
    ],
    view: (fx) => {
      const n = Number(fx.n ?? 0);
      return (
        <div className={s.app}>
          <div className={s.appBar}><img src="/logo.svg" alt="" /><b>찜꽁 · 내 공구</b></div>
          <div className={s.goal}>
            <div className={s.goalTop}><b>워싱 린넨 이불</b>{fx.party && <span className={s.reached}>목표 달성!</span>}</div>
            <div className={s.count}><b>{n}</b> / 30개 모였어요</div>
            <div className={s.bar}><i style={{ width: `${(n / 30) * 100}%` }} /></div>
            <button type="button" tabIndex={-1} data-t="final" className={s.ghostBtn}>얼마나 만들까?</button>
            {fx.final && <div className={s.answer}>결제 완료 <b>28개</b> → 28개만 만들면 돼요 👍</div>}
          </div>
          {fx.party && <div className={s.confetti} aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ "--i": i } as React.CSSProperties} />)}</div>}
        </div>
      );
    },
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
                  <li>품절 상품은 숨기지 않기</li>
                  <li>카페24에서 재입고 알림 버튼 켜기</li>
                  <li>매주 기다리는 손님 수 보기</li>
                  <li>목표 정하고 공구 열기</li>
                  <li>결제된 만큼만 만들기</li>
                </ol>
                <a className={s.start} href="/campaigns?tab=new" onClick={() => { try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* 저장소 없음 */ } }}>첫 공구 열어 보기 →</a>
                <button type="button" className={s.ghost} onClick={() => go(0)}>처음부터 다시 보기</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
