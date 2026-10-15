"use client";

// 판매자 첫 화면 온보딩: 로고가 천천히 나타난 뒤, '찜꽁 사장님 셀러 가이드라인'(품절 상품으로 재입고 공구 여는 법)의
// 핵심 원칙과 1~5단계를 여섯 장면으로 보여 준다. 큰 마우스 커서가 직접 움직이고 눌러서 "이렇게 하면 돼요"를 보여 주고, 하트 캐릭터가 말풍선으로 쉽게 설명한다.
// - 처음 한 번은 저절로 열리고(이 기기에 기록), 홈의 "찜꽁 사용법 보기"로 언제든 다시 본다.
// - 움직임 줄이기 설정이면 커서 움직임 없이 장면의 마지막 모습만 보여 준다.
// - 화면 속 쇼핑몰 · 카페24 관리자 화면은 설명용 그림이다(실제 데이터 아님). 메뉴 이름은 가이드라인 표기를 줄여 썼다.

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

// ---- 장면 (사장님 가이드: 핵심 원칙 + 1~5단계를 아주 쉽게) ----

/** 카페24 관리자 모양 틀: 위쪽 메뉴 경로를 커서가 차례로 누르면 아래 설정 칸이 열린다 */
function Admin({ path, fx, done, children }: { path: string[]; fx: Fx; done?: string; children: React.ReactNode }) {
  const m = Number(fx.m ?? 0);
  return (
    <div className={s.admin}>
      <div className={s.adminBar}><b>카페24 관리자</b>{done && fx.done && <span className={s.barStamp}>{done}</span>}</div>
      <div className={s.crumbs}>
        {path.map((p, i) => (
          <span key={p} data-t={`p${i + 1}`} className={m >= i + 1 ? s.picked : ""}>{i > 0 && <i aria-hidden="true">›</i>}{p}</span>
        ))}
      </div>
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
    say: "품절 상품을 그대로 두면, 손님이 '재입고 알림 신청'을 눌러요!",
    tip: "신청한 사람 수가 곧 '얼마나 팔릴지' 알려 주는 숫자예요.",
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
            <span data-t="count" className={`${s.counter} ${fx.glow ? s.glow : ""}`}>신청한 손님 <b key={String(fx.n)} className={s.bump}>{Number(fx.n ?? 0)}</b>명</span>
          </div>
        </div>
        {Number(fx.pop ?? 0) > 0 && <span key={String(fx.pop)} className={s.heartPop} aria-hidden="true">♥ +1</span>}
      </div>
    ),
  },
  {
    title: "1단계 · 품절 상품이 보이게",
    say: "카페24 관리자에서 품절 상품을 '노출함'으로, 자리는 '맨 뒤로' 바꿔요.",
    tip: "쇼핑몰 설정 › 상품 설정 › 상품 보기 설정. 상품 분류마다 '품절 상품 맨 뒤로'도 같이 해 주세요.",
    steps: [{ wait: 300 }, ...walk(3), { wait: 250 }, { at: "o1" }, { click: true }, { set: { o1: true } }, { at: "o2" }, { click: true }, { set: { o2: true } }, { wait: 450 }, { set: { done: true } }],
    view: (fx) => (
      <Admin path={["쇼핑몰 설정", "상품 설정", "상품 보기 설정"]} fx={fx} done="보이게 완료! ✓">
        <Opt t="o1" label="품절 상품 노출" from="노출안함" to="노출함" on={!!fx.o1} />
        <Opt t="o2" label="품절 상품 진열" from="그대로" to="맨 뒤로" on={!!fx.o2} />
      </Admin>
    ),
  },
  {
    title: "2단계 · 재입고 알림 버튼 켜기",
    say: "버튼을 켜고, 문자는 '수동 발송'으로 해 두세요. 공구 여는 날은 사장님이 정해요!",
    tip: "상품 › 재입고 알림 › 재입고 알림 상품 설정. 유효 기간은 3개월 이상, 노출 방법은 상품별이에요.",
    steps: [
      { wait: 300 }, ...walk(3), { wait: 250 }, { at: "sw" }, { click: true }, { set: { sw: true } },
      { at: "send" }, { click: true }, { set: { send: true } }, { at: "keep" }, { click: true }, { set: { keep: true } }, { wait: 450 }, { set: { done: true } },
    ],
    view: (fx) => (
      <Admin path={["상품", "재입고 알림", "상품 설정"]} fx={fx} done="설정 끝! ✓">
        <div className={s.setRow}><span>버튼 노출</span>
          <button type="button" tabIndex={-1} data-t="sw" className={`${s.switch} ${fx.sw ? s.swOn : ""}`} aria-label="노출함"><i /></button>
        </div>
        <Opt t="send" label="발송 방법" from="자동 발송" to="수동 발송" on={!!fx.send} />
        <Opt t="keep" label="알림 유효 기간" from="1개월" to="3개월" on={!!fx.keep} />
      </Admin>
    ),
  },
  {
    title: "3단계 · 휴대폰으로 직접 확인",
    say: "손님처럼 휴대폰으로 열어 봐요. 품절 표시 · 버튼 · 신청까지 되면 성공!",
    tip: "PC로도 한 번 더 보고, 테스트로 넣은 신청은 신청 내역에서 지워 주세요.",
    steps: [
      { wait: 400 }, { at: "item" }, { click: true }, { set: { c1: true, open: true } }, { wait: 500 },
      { at: "pbtn" }, { click: true }, { set: { c2: true, ok: true } }, { wait: 500 }, { set: { c3: true } },
    ],
    view: (fx) => (
      <div className={s.checkScene}>
        <div className={s.phone}>
          <div className={s.notch} aria-hidden="true" />
          {!fx.open ? (
            <ul className={s.plist}>
              <li><i style={{ background: "#c9d6e3" }} />린넨 앞치마</li>
              <li><i style={{ background: "#e3d9c9" }} />라탄 바구니</li>
              <li data-t="item" className={s.soldItem}><i style={{ background: "#d9c3a5" }} />워싱 린넨 이불 <em>품절</em></li>
            </ul>
          ) : (
            <div className={s.pdetail}>
              <i className={s.pphoto} />
              <b>워싱 린넨 이불</b>
              <span data-t="pbtn" className={`${s.pbtn} ${fx.ok ? s.on : ""}`}>{fx.ok ? "신청 완료!" : "🔔 재입고 알림 신청"}</span>
            </div>
          )}
        </div>
        <ul className={s.checks}>
          <li className={fx.c1 ? s.ticked : ""}>목록 맨 뒤에 품절 표시</li>
          <li className={fx.c2 ? s.ticked : ""}>상세에 신청 버튼</li>
          <li className={fx.c3 ? s.ticked : ""}>신청이 끝까지 됨</li>
        </ul>
      </div>
    ),
  },
  {
    title: "4단계 · 매주 신청 수 확인",
    say: "일주일에 한 번, 상품 이름으로 검색해요. '미발송' 숫자가 기다리는 손님이에요!",
    tip: "상품 › 재입고 알림 › 신청 내역 조회. 엑셀로 받아 같은 번호는 한 번만 세요.",
    steps: [
      { wait: 300 }, ...walk(3), { at: "q" }, { click: true }, { set: { focus: true } }, { type: "린넨 이불", into: "q" },
      { at: "find" }, { click: true }, { set: { found: true } }, { wait: 500 }, { at: "wait" }, { set: { glow: true } },
    ],
    view: (fx) => (
      <Admin path={["상품", "재입고 알림", "신청 내역 조회"]} fx={fx}>
        <div className={s.searchRow}>
          <span data-t="q" className={`${s.input} ${fx.focus ? s.focus : ""}`}>{String(fx.q ?? "")}<i className={fx.focus && !fx.found ? s.caret : ""} /></span>
          <span data-t="find" className={s.findBtn}>검색</span>
        </div>
        {fx.found && (
          <div className={s.result}>
            <div className={s.resRow}><span>워싱 린넨 이불</span><span data-t="wait" className={`${s.waitBadge} ${fx.glow ? s.glow : ""}`}>미발송 <b>32</b>건</span></div>
            <p className={s.resNote}>= 이 상품을 기다리는 손님 32명</p>
          </div>
        )}
      </Admin>
    ),
  },
  {
    title: "5단계 · 공구 열고 알림 보내기",
    say: "목표만큼 모이면 재고를 넣고, 미발송 신청을 모두 골라 '일괄 발송'! 손님에게 문자가 가요.",
    tip: "공급처 주문 → 재고 입력 → 미발송 전체 선택 → 일괄 발송 → '발송 완료'인지 확인.",
    steps: [
      { wait: 300 }, { at: "stock" }, { click: true }, { set: { sf: true } }, { type: "30", into: "stock" }, { wait: 250 },
      { at: "all" }, { click: true }, { set: { all: true } }, { at: "send" }, { click: true }, { set: { sent: true } }, { wait: 1100 }, { set: { done: true } },
    ],
    view: (fx) => (
      <div className={s.admin}>
        <div className={s.adminBar}><b>카페24 관리자</b></div>
        <div className={`${s.panel} ${s.show}`}>
          <div className={s.setRow}><span>① 재고 수량</span><span data-t="stock" className={`${s.input} ${s.small} ${fx.sf ? s.focus : ""}`}>{String(fx.stock ?? "0")}<i className={fx.sf && !fx.all ? s.caret : ""} />개</span></div>
          <div className={s.setRow}>
            <span data-t="all" className={s.checkAll}><i className={fx.all ? s.boxOn : s.box} aria-hidden="true">{fx.all ? "✓" : ""}</i>② 미발송 32건 전체 선택</span>
          </div>
          <span data-t="send" className={s.sendBtn}>③ 일괄 발송</span>
          {fx.done && <div className={s.statusOk}><b>발송 완료</b> · 손님 32명에게 문자가 갔어요 ✓</div>}
        </div>
        {fx.sent && !fx.done && <span className={s.plane} aria-hidden="true">✉️</span>}
      </div>
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
                  <li>품절 상품이 보이게 (노출함 · 맨 뒤로)</li>
                  <li>재입고 알림 버튼 켜기 (수동 발송)</li>
                  <li>휴대폰 · PC로 직접 확인</li>
                  <li>매주 미발송 신청 수 보기</li>
                  <li>재고 넣고 일괄 발송으로 공구 열기</li>
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
