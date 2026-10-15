"use client";

import { useEffect, useState, type ReactNode } from "react";
import s from "./seller-guide.module.css";

/** 홈 '셀러 가이드라인 자세히 보기' 토글 안에 펼쳐지는 찜꽁 사장님 가이드 본문.
 *  판매자 할 일은 '품절 상품 숨기지 않기' 하나이고, 알림 버튼은 찜꽁 위젯이 품절 상품에 저절로 보여 준다(#67).
 *  카페24 자체 재입고 알림은 쓰지 않는다(신청 수를 찜꽁에서 볼 수 없음). 화면 이름은 앱 화면 그대로 옮긴다. */

// 예전 가이드(카페24 재입고 알림 기준)의 체크 항목과 섞이지 않게 저장 이름을 바꿨다
const STORAGE_KEY = "zzimkkong-guide-checks-v2";
type Checks = Record<string, boolean>;

const TOC: { id: string; n: string; label: string }[] = [
  { id: "sg-principle", n: "·", label: "핵심 원칙" },
  { id: "sg-flow", n: "·", label: "한눈에 보기" },
  { id: "sg-prep", n: "0", label: "시작 전 준비" },
  { id: "sg-step1", n: "1", label: "품절 상품 숨기지 않기" },
  { id: "sg-step2", n: "2", label: "위젯 확인하기" },
  { id: "sg-step3", n: "3", label: "매주 모니터링 보기" },
  { id: "sg-step4", n: "4", label: "공구 열기" },
  { id: "sg-step5", n: "5", label: "달성되면 재고 넣기" },
  { id: "sg-trouble", n: "?", label: "문제 해결" },
  { id: "sg-checklist", n: "✓", label: "체크리스트" },
  { id: "sg-faq", n: "Q", label: "자주 묻는 질문" },
  { id: "sg-sources", n: "·", label: "출처" },
];

const FLOW: { label: string; sub: string; kind?: "q" | "end" }[] = [
  { label: "상품 품절", sub: "재고 0" },
  { label: "그대로 두기", sub: "진열함 · 판매함" },
  { label: "알림 신청", sub: "고객 · 찜꽁 위젯" },
  { label: "모니터링", sub: "알림 신청 + 장바구니" },
  { label: "열 만한가?", sub: "아니요 → 계속 신청 받기", kind: "q" },
  { label: "공구 열기", sub: "기다리던 고객에게 초대 문자", kind: "end" },
];

const TROUBLE: { sym: string; ref: string; go: ReactNode }[] = [
  { sym: "'재입고 · 공구 알림 받기'가 안 보여요", ref: "1단계 A · B", go: <>진열상태 <strong>진열함</strong> · 판매상태 <strong>판매함</strong> · <strong>품절표시</strong> 체크인지, 그 상품에 모집 중인 공구가 있는지(있으면 알림 대신 공구가 보여요), 찜꽁 홈에 위젯 <strong>설치하기</strong> 버튼이 보이는지 확인. 재고를 방금 0으로 바꿨다면 10분쯤 뒤에 다시 보기</> },
  { sym: "옵션 상품에서만 버튼이 안 나와요", ref: "1단계", go: <>모든 옵션이 품절인지 확인. 일부 옵션만 품절이면 상품 전체가 품절이 아니어서 나오지 않을 수 있어요</> },
  { sym: "품절 상품이 목록에 안 보여요", ref: "1단계 C", go: <>품절 상품 노출 항목이 <strong>노출함</strong>인지</> },
  { sym: "품절 상품이 목록 중간에 섞여 있어요", ref: "1단계 D", go: <>그 분류의 품절 상품 진열 항목이 <strong>품절 상품 맨 뒤로</strong>인지</> },
  { sym: "고객이 '회원만 신청할 수 있어요'를 봤대요", ref: "2단계", go: <>정상이에요. 알림은 로그인한 회원만 신청할 수 있어요</> },
  { sym: "장바구니 숫자가 그대로예요", ref: "3단계", go: <>모니터링에서 <strong>다시 수집</strong>을 눌렀는지. 장바구니는 수집할 때만 새로 모여요</> },
  { sym: "초대 문자가 안 나가요", ref: "준비 · 4단계", go: <>쇼핑몰 정보를 등록했는지, SMS 잔여 건수와 발신번호가 있는지. 밤 9시~오전 8시에 연 공구는 아침 8시에 나가요. 공구 상세의 문자 표도 확인</> },
  { sym: "달성했는데 고객이 주문을 못 한대요", ref: "5단계", go: <>재고를 넣어 주문할 수 있게 했는지</> },
];

const SOURCES: { href: string; label: string }[] = [
  { href: "https://support.cafe24.com/hc/ko/articles/17461090719641", label: "쇼핑몰 상품 진열 및 진열 순서 관련 자주 묻는 질문" },
  { href: "https://support.cafe24.com/hc/ko/articles/18839414290969", label: "상품등록/수정 시 자주 묻는 질문" },
  { href: "https://support.cafe24.com/hc/ko/articles/17457549008793", label: "상품 재고 관리 및 품절 관련 자주 묻는 질문" },
  { href: "https://support.cafe24.com/hc/ko/articles/7739119840281", label: "품절 상품 관리" },
  { href: "https://support.cafe24.com/hc/ko/articles/7751351141657", label: "상품 목록 화면 설정" },
  { href: "https://support.cafe24.com/hc/ko/articles/8467145462681", label: "상품 목록 중간에 품절 상품이 노출됩니다." },
  { href: "https://support.cafe24.com/hc/ko/articles/7739172846105", label: "재입고 알림 상품 설정 및 조회 (끄는 곳)" },
];

/** 메뉴 경로: 상품 › 상품 목록 */
function Path({ items }: { items: string[] }) {
  return (
    <span className={s.path}>
      {items.map((t, i) => (
        <span key={t} className={s.pathPart}>
          {i > 0 && <>{" "}<i aria-hidden="true">›</i>{" "}</>}
          {t}
        </span>
      ))}
    </span>
  );
}

function Where({ items }: { items: string[] }) {
  return (
    <div className={s.where}>
      <span className={s.whereLabel}>어디서</span>
      <Path items={items} />
    </div>
  );
}

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return <a className={s.link} href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
}

function CheckItem({ id, tag, checked, onToggle, children }: {
  id: string; tag?: string; checked: boolean; onToggle: (id: string, on: boolean) => void; children: ReactNode;
}) {
  return (
    <li>
      <label className={s.check}>
        <input type="checkbox" id={`sg-${id}`} checked={checked} onChange={(e) => onToggle(id, e.currentTarget.checked)} />
        <span className={s.checkText}>
          {children}
          {tag && <span className={s.ref}>{tag}</span>}
        </span>
      </label>
    </li>
  );
}

function readChecks(): Checks {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Checks = {};
    for (const [k, b] of Object.entries(v as Record<string, unknown>)) if (b === true) out[k] = true;
    return out;
  } catch {
    return {};
  }
}

function writeChecks(c: Checks) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch {
    /* 저장이 막혀 있어도 화면은 그대로 쓴다 */
  }
}

export default function SellerGuide() {
  // 처음 렌더는 서버와 같게(모두 해제) 두고, 저장된 체크는 마운트 뒤에 불러온다
  const [checks, setChecks] = useState<Checks>({});
  useEffect(() => {
    setChecks(readChecks());
  }, []);

  const toggle = (id: string, on: boolean) => {
    // 저장은 상태 업데이터 밖에서 한 번만 한다
    const next = { ...checks };
    if (on) next[id] = true;
    else delete next[id];
    setChecks(next);
    writeChecks(next);
  };

  const on = (id: string) => checks[id] === true;

  return (
    <div className={s.guide}>
      <header className={s.head}>
        <p className={s.kicker}>찜꽁 · 사장님용 운영 가이드</p>
        <h2 className={s.title}>품절 상품으로 재입고 공구 여는 법</h2>
        <p className={s.lead}>품절 상품을 숨기지 말고 그대로 두세요. 찜꽁 위젯이 품절 상품에 <strong>재입고 · 공구 알림 받기</strong> 버튼을 저절로 보여 줍니다. 알림 신청과 장바구니가 많은 상품으로 공구를 열면, 기다리던 고객에게 초대 문자가 갑니다.</p>
        <div className={s.rhythm}>
          <div><b>할 일은 하나</b><span>1단계 · 품절 상품 숨기지 않기</span></div>
          <div><b>확인은 매주</b><span>3~4단계 · 모니터링 보고 공구 열기</span></div>
        </div>
        <p className={s.meta}>2026년 10월 15일 기준 · 카페24 메뉴 이름은 카페24 도움말 표기를, 찜꽁 화면 이름은 앱 화면을 따랐습니다</p>
      </header>

      <nav className={s.toc} aria-label="목차">
        <p className={s.tocLabel}>목차</p>
        <ol>
          {TOC.map((t) => (
            <li key={t.id}>
              <a href={`#${t.id}`}><span className={s.tocN} aria-hidden="true">{t.n}</span>{t.label}</a>
            </li>
          ))}
        </ol>
      </nav>

      <section id="sg-principle" className={s.section}>
        <h3 className={s.h}>핵심 원칙</h3>
        <p><strong>품절돼도 상품을 숨기지(진열안함 · 판매안함) 마세요.</strong> 그대로 두면 찜꽁 위젯이 알림 버튼을 저절로 보여 주고, 신청한 사람 수가 곧 수요 데이터가 됩니다. 사장님이 따로 켤 버튼은 없습니다.</p>
        <div className={s.compare}>
          <div>
            <h4>상품을 숨기면 (진열안함 · 판매안함)</h4>
            <dl>
              <div><dt>고객</dt><dd>상품 페이지에 들어갈 수 없어 알림을 신청하지 못함</dd></div>
              <div><dt>수요 데이터</dt><dd>쌓이지 않음 (0으로 보임)</dd></div>
              <div><dt>사장님</dt><dd>인기 상품인데 수요를 모름</dd></div>
            </dl>
          </div>
          <div className={s.good}>
            <h4>상품을 남겨 두면 (품절 표시 + 찜꽁 알림 버튼)</h4>
            <dl>
              <div><dt>고객</dt><dd>&apos;재입고 · 공구 알림 받기&apos;로 &quot;사고 싶다&quot;를 남김</dd></div>
              <div><dt>수요 데이터</dt><dd>모니터링에 알림 신청 수로 쌓임</dd></div>
              <div><dt>사장님</dt><dd>몇 명이 기다리는지 보고 공구를 엶</dd></div>
            </dl>
          </div>
        </div>
        <p className={s.sub}>품절될 만큼 인기 있는 상품의 수요가 가장 중요한 데이터입니다. 그 데이터를 놓치지 않는 것이 이 가이드의 목적입니다.</p>
      </section>

      <section id="sg-flow" className={s.section}>
        <h3 className={s.h}>한눈에 보기</h3>
        <ol className={s.flow} aria-label="품절 상품 공구 흐름">
          {FLOW.map((f) => (
            <li key={f.label} className={f.kind === "q" ? s.flowQ : f.kind === "end" ? s.flowEnd : undefined}>
              {f.label}
              <small>{f.sub}</small>
            </li>
          ))}
        </ol>
        <p className={s.sub}>열 만하지 않으면 그대로 두고 신청을 더 받습니다. 공구가 목표를 채우면 재고를 넣고 결제를 받습니다.</p>
      </section>

      <section id="sg-prep" className={s.section}>
        <h3 className={s.h}><span className={s.step}>준비</span>시작 전 준비</h3>
        <p>알림 버튼은 위젯이 알아서 보여 주지만, 공구를 열 때 초대 문자를 보내려면 아래 준비가 필요합니다. 특히 SMS를 충전하지 않으면 초대 문자가 나가지 않습니다.</p>
        <ul className={s.checks}>
          <CheckItem id="c-prep1" checked={on("c-prep1")} onToggle={toggle}>카페24 SMS 서비스를 신청 · 충전하고 문자 발신번호를 등록했다 (문자 비용은 SMS 잔여 건수에서 빠짐)</CheckItem>
          <CheckItem id="c-prep2" checked={on("c-prep2")} onToggle={toggle}>찜꽁 홈 <strong>시작하기</strong>에서 쇼핑몰 정보(브랜드명 · 문자 발신번호 · 무료수신거부 번호)를 등록했다</CheckItem>
          <CheckItem id="c-prep3" checked={on("c-prep3")} onToggle={toggle}>찜꽁 홈 <strong>시작하기</strong>의 상품 페이지 위젯 설치가 끝나 있다 (앱을 설치하면 자동으로 들어가요. <strong>설치하기</strong> 버튼이 보일 때만 눌러요)</CheckItem>
        </ul>
        <div className={s.tip}><b>메뉴 경로 읽는 법</b> <Path items={["상품", "상품 목록"]} /> 처럼 쓴 것은 카페24 관리자 왼쪽 메뉴를 차례로 누르는 순서입니다. 찜꽁 화면은 찜꽁 메뉴 이름(홈 · 내 공구 · 새 공구 · 모니터링 · 설정)으로 적었습니다.</div>
      </section>

      <section id="sg-step1" className={s.section}>
        <h3 className={s.h}><span className={s.step}>1단계</span>품절 상품 숨기지 않기</h3>
        <p>사장님 할 일은 이것 하나입니다. <strong>A는 꼭</strong>, B는 처음 한 번 확인합니다. C · D는 고객이 품절 상품을 더 잘 찾게 돕는 설정입니다.</p>

        <h4 className={s.sh}><span className={s.tag}>A</span>꼭 · 품절돼도 진열 · 판매 그대로</h4>
        <Where items={["상품", "상품 목록"]} />
        <ol className={s.do}>
          <li><span>상품명을 눌러 상품 수정 화면을 엽니다.</span></li>
          <li><span>진열상태 <span className={s.pill}>진열함</span>, 판매상태 <span className={s.pill}>판매함</span>을 그대로 둡니다. 품절됐다고 진열안함 · 판매안함으로 바꾸지 마세요.</span></li>
          <li><span>상품 분류도 하나 이상 지정돼 있는지 봅니다. 진열안함이거나 분류가 없으면 고객이 상세 페이지에 들어갈 수 없어 위젯도 보이지 않습니다.</span></li>
        </ol>

        <h4 className={s.sh}><span className={s.tag}>B</span>확인 · 재고가 0이면 품절이 되게</h4>
        <Where items={["상품", "상품 목록"]} />
        <ol className={s.do}>
          <li><span>상품 수정 화면의 <strong>옵션/재고 설정</strong>에서 재고관리 사용을 <span className={s.pill}>사용함</span>으로 두고 <strong>품절표시</strong>에 체크한 뒤 <strong>상품수정</strong>을 누릅니다.</span></li>
          <li><span>여러 상품을 한 번에 바꾸려면 <Path items={["상품", "재고관리", "상품 재고 관리"]} />에서 <strong>재고관리 일괄설정</strong>을 누르고 <strong>품절기능</strong>에 체크합니다.</span></li>
        </ol>
        <p className={s.sub}>품절표시를 체크하지 않으면 재고가 0이어도 품절이 되지 않습니다. 그러면 알림 버튼이 나오지 않고 주문도 계속 받습니다.</p>

        <h4 className={s.sh}><span className={s.tag}>C</span>권장 · 품절 상품을 목록에 보이기</h4>
        <Where items={["쇼핑몰 설정", "상품 설정", "상품 보기 설정", "상품 목록 화면 설정"]} />
        <ol className={s.do}>
          <li><span><strong>품절 상품 노출</strong> 항목을 <span className={s.pill}>노출함</span>으로 바꾸고 저장합니다. 위젯이 뜨는 데는 필요 없지만, 고객이 목록에서 품절 상품을 찾아 들어오는 길이 됩니다.</span></li>
        </ol>

        <h4 className={s.sh}><span className={s.tag}>D</span>선택 · 품절 상품을 목록 맨 뒤로</h4>
        <Where items={["상품", "상품관리", "상품 분류 관리"]} />
        <ol className={s.do}>
          <li><span>분류(카테고리)를 하나 고르고, <strong>품절 상품 진열</strong> 항목에서 <span className={s.pill}>품절 상품 맨 뒤로</span>를 고른 뒤 <strong>저장</strong>합니다. 다른 분류도 같은 방법으로 바꿉니다.</span></li>
          <li><span>검색 결과도 같게 하려면 C와 같은 화면의 <strong>검색 페이지 품절 상품 진열</strong>에서 <span className={s.pill}>품절 상품 맨 뒤로</span>를 고릅니다.</span></li>
        </ol>

        <div className={s.warn}><b>옵션 상품이라면</b> 찜꽁 위젯은 상품 단위로 품절을 봅니다. 색상 · 사이즈 같은 옵션이 있는 상품은 모든 옵션이 품절이 되어 상품 전체가 품절로 보일 때 알림 버튼이 나옵니다. 일부 옵션만 품절이면 나오지 않을 수 있습니다.</div>
      </section>

      <section id="sg-step2" className={s.section}>
        <h3 className={s.h}><span className={s.step}>2단계</span>쇼핑몰에서 위젯 확인하기</h3>
        <p>재고가 0인 상품 하나를 골라, 고객이 보는 쇼핑몰 화면에서 <strong>PC와 휴대폰으로 각각</strong> 확인합니다.</p>
        <ul className={s.checks}>
          <CheckItem id="c-s2-1" checked={on("c-s2-1")} onToggle={toggle}>상품 상세 페이지의 구매 버튼 아래에 찜꽁 위젯과 <strong>재입고 · 공구 알림 받기</strong> 버튼이 보인다</CheckItem>
          <CheckItem id="c-s2-2" checked={on("c-s2-2")} onToggle={toggle}>회원으로 로그인해 버튼을 누르면 <strong>알림 신청 완료</strong>가 보인다</CheckItem>
          <CheckItem id="c-s2-3" checked={on("c-s2-3")} onToggle={toggle}>찜꽁 <strong>모니터링</strong>을 열면 그 상품에 알림 신청이 1 늘어 있다</CheckItem>
          <CheckItem id="c-s2-4" checked={on("c-s2-4")} onToggle={toggle}>(C를 했다면) 카테고리 목록에 상품이 <strong>품절</strong> 표시와 함께 보인다</CheckItem>
        </ul>
        <div className={`${s.tip} ${s.done}`}><b>확인이 끝나면</b> 위젯에서 <strong>신청 취소</strong>를 눌러 테스트 신청을 지웁니다. 재고를 방금 0으로 바꿨다면 버튼이 나오기까지 10분쯤 걸릴 수 있습니다. 하나라도 안 되면 <a className={s.link} href="#sg-trouble">문제 해결</a>을 보세요.</div>
      </section>

      <section id="sg-step3" className={s.section}>
        <h3 className={s.h}><span className={s.step}>3단계</span>매주 모니터링 보기</h3>
        <p>일주일에 한 번, 찜꽁 메뉴의 <strong>모니터링</strong>을 엽니다. 상품별로 기다리는 고객이 몇 명인지 보는 화면입니다(메뉴 이름이 &apos;수요 레이더&apos;로 보이면 같은 화면입니다).</p>
        <Where items={["찜꽁", "모니터링"]} />
        <ol className={s.do}>
          <li><span><strong>다시 수집</strong>을 눌러 장바구니 숫자를 새로 모읍니다. 알림 신청은 지금 숫자라 바로 보입니다.</span></li>
          <li><span>정렬을 <strong>전체 · 알림 신청 · 장바구니</strong>로 바꿔 가며 상품별 <strong>알림 신청 N · 장바구니 N</strong>을 봅니다.</span></li>
          <li><span>열 만한 상품을 누르면 관심 고객 수와 공구 초대를 받을 수 있는 고객 수가 나옵니다.</span></li>
        </ol>
        <div className={s.tip}><b>어떤 상품을 열까</b> 열 기준은 사장님이 정합니다. 알림 신청은 품절 상품을 기다리는 고객, 장바구니는 최근 관심을 보인 고객입니다. 장바구니는 쇼핑몰 보관 기간이 지나면 사라져 최근 관심만 반영됩니다.</div>
      </section>

      <section id="sg-step4" className={s.section}>
        <h3 className={s.h}><span className={s.step}>4단계</span>공구 열기</h3>
        <p>열 만한 상품이 있으면 찜꽁 <strong>새 공구</strong>에서 공구를 엽니다. 아직 아니면 그대로 두고 다음 주에 다시 봅니다.</p>
        <Where items={["찜꽁", "새 공구"]} />
        <ol className={s.do}>
          <li><span><strong>1 상품 고르기</strong>에서 그 상품의 <strong>선택</strong>을 누릅니다. 품절 상품에는 <strong>품절</strong> 칩이 붙어 있습니다.</span></li>
          <li><span><strong>2 조건 정하기</strong>에서 목표 수량 · 공구가 · 마감을 정합니다.</span></li>
          <li><span><strong>미리보기 · 초대 대상 확인</strong>을 눌러 초대 문자와 초대 대상 수를 확인합니다.</span></li>
          <li><span><strong>공구 열기 · 초대 N명 예약</strong>을 누릅니다. 쿠폰이 만들어지고, 알림을 신청했거나 장바구니에 담은 수신 동의 고객에게 초대 문자가 예약됩니다.</span></li>
        </ol>
        <div className={s.tip}><b>알아 두세요</b> 밤 9시~오전 8시에는 문자를 보내지 않고 아침 8시로 미룹니다. 공구를 열면 그 상품의 알림 신청은 초대로 넘어가, 모니터링 숫자가 0부터 다시 쌓입니다. 모니터링의 <strong>이 상품으로 공구 열기</strong>를 눌러도 상품이 미리 골라지지 않으니, 1 상품 고르기에서 다시 골라 주세요.</div>
      </section>

      <section id="sg-step5" className={s.section}>
        <h3 className={s.h}><span className={s.step}>5단계</span>공구가 달성되면 재고 넣기</h3>
        <p>목표를 채운 공구는 마감 시각부터 결제 기간이 시작되고, 신청한 고객이 쿠폰을 써서 상품 페이지에서 주문합니다. 상품이 계속 품절이면 주문할 수 없으니 재고를 넣어 주세요.</p>
        <ol className={s.do}>
          <li><span>찜꽁 <strong>내 공구</strong>에서 진행률이 목표에 닿았는지 봅니다.</span></li>
          <li><span>마감 전에 <Path items={["상품", "상품 목록"]} />에서 그 상품의 재고 수량을 넣어 주문할 수 있게 합니다.</span></li>
          <li><span>결제 기간이 끝나면 공구 상세의 확정 수량을 보고 생산 · 발주를 정합니다.</span></li>
          <li><span>남은 재고를 0으로 돌려 다시 품절로 두면, 다음 공구 알림을 다시 받을 수 있습니다.</span></li>
        </ol>
        <div className={s.warn}><b>목표에 못 미치면</b> 재고를 넣지 않아도 됩니다. 마감에 신청자에게 결과 문자가 자동으로 가고, 그래도 사겠다는 고객이 있으면 판매자 화면에서 <strong>그래도 진행</strong>을 고를 수 있습니다.</div>
      </section>

      <section id="sg-trouble" className={s.section}>
        <h3 className={s.h}>문제 해결</h3>
        <div className={s.trouble}>
          {TROUBLE.map((t) => (
            <div key={t.sym}>
              <span className={s.sym}>{t.sym}</span>
              <span className={s.go}><em>{t.ref}</em>{t.go}</span>
            </div>
          ))}
        </div>
        <p className={s.sub}>찜꽁 위젯은 상품 상세 페이지의 구매 버튼 아래에 자동으로 붙습니다. 스킨(디자인)을 고칠 필요는 없습니다.</p>
      </section>

      <section id="sg-checklist" className={s.section}>
        <h3 className={s.h}>사장님 체크리스트</h3>
        <p className={s.groupLabel}>처음 한 번</p>
        <ul className={s.checks}>
          <CheckItem id="c-1" tag="준비" checked={on("c-1")} onToggle={toggle}>SMS 서비스를 충전하고 발신번호를 등록했다</CheckItem>
          <CheckItem id="c-2" tag="준비" checked={on("c-2")} onToggle={toggle}>찜꽁에 쇼핑몰 정보를 등록했다</CheckItem>
          <CheckItem id="c-3" tag="1단계 A" checked={on("c-3")} onToggle={toggle}>품절 상품을 진열함 · 판매함 그대로 둔다 (숨기지 않는다)</CheckItem>
          <CheckItem id="c-4" tag="1단계 B" checked={on("c-4")} onToggle={toggle}>재고가 0이면 품절이 되게 품절표시를 체크했다</CheckItem>
          <CheckItem id="c-5" tag="1단계 C" checked={on("c-5")} onToggle={toggle}>(권장) 품절 상품 노출을 &apos;노출함&apos;으로 바꿨다</CheckItem>
          <CheckItem id="c-6" tag="2단계" checked={on("c-6")} onToggle={toggle}>위젯으로 직접 신청해 보고, &apos;신청 취소&apos;로 지웠다</CheckItem>
        </ul>
        <p className={s.groupLabel}>매주</p>
        <ul className={s.checks}>
          <CheckItem id="c-7" tag="3단계" checked={on("c-7")} onToggle={toggle}>모니터링에서 다시 수집을 누르고 알림 신청 · 장바구니를 확인했다</CheckItem>
          <CheckItem id="c-8" tag="4단계" checked={on("c-8")} onToggle={toggle}>열 만한 상품은 새 공구에서 공구를 열었다</CheckItem>
        </ul>
        <p className={s.groupLabel}>공구를 연 뒤</p>
        <ul className={s.checks}>
          <CheckItem id="c-9" tag="5단계" checked={on("c-9")} onToggle={toggle}>목표를 채우면 마감 전에 재고를 넣었다</CheckItem>
          <CheckItem id="c-10" tag="5단계" checked={on("c-10")} onToggle={toggle}>결제 기간이 끝나면 남은 재고를 0으로 돌려 다시 품절로 두었다</CheckItem>
        </ul>
        <p className={s.sub}>체크 표시는 이 브라우저에만 저장됩니다.</p>
      </section>

      <section id="sg-faq" className={s.section}>
        <h3 className={s.h}>자주 묻는 질문</h3>
        <div className={s.faq}>
          <details>
            <summary>공구 목표 수량은 어떻게 정하나요?</summary>
            <p className={s.answer}>공구를 열 때 사장님이 정합니다. 기본은 <strong>30개</strong>입니다.</p>
            <ul><li>인원이 아니라 수량이고, 1인 최대 2개가 기본입니다.</li><li>알림 신청이 몇 명 모이면 열지는 정해져 있지 않습니다. 모니터링 숫자를 보고 정하세요.</li></ul>
          </details>
          <details>
            <summary>찜꽁은 어떤 구조인가요?</summary>
            <p className={s.answer}>판매자의 카페24 쇼핑몰에 설치하는 <strong>앱</strong>입니다.</p>
            <ul><li>고객은 상품 페이지의 찜꽁 위젯에서 알림을 신청하고, 공구가 열리면 참여를 신청합니다.</li><li>결제는 쇼핑몰 주문서에서 하고, 공구 가격은 쿠폰으로 적용됩니다.</li></ul>
          </details>
          <details>
            <summary>품절 상품 공구를 별도 메뉴로 두나요?</summary>
            <p className={s.answer}>아니요. 별도 메뉴 없이 <strong>품절 상품의 상세 페이지</strong>에 찜꽁 위젯이 저절로 뜹니다.</p>
          </details>
          <details>
            <summary>신청자 알림은 무엇으로 보내나요?</summary>
            <p className={s.answer}><strong>SMS(카페24 문자)</strong>입니다.</p>
            <ul><li>공구를 열 때 초대 문자가 갑니다. 재고만 다시 채운다고 문자가 가지는 않습니다.</li><li>알림톡은 카페24 API에 없고, 광고성인 초대 문자는 알림톡으로 보낼 수 없습니다.</li><li>문자 비용은 판매자가 카페24에 충전한 SMS 잔여 건수에서 빠집니다.</li><li>발신번호 등록이 필요합니다.</li></ul>
          </details>
          <details>
            <summary>알림은 누가 신청할 수 있나요?</summary>
            <p className={s.answer}>로그인한 <strong>회원</strong>만 신청할 수 있습니다.</p>
            <ul><li>같은 회원은 한 상품에 한 번만 셉니다.</li><li>고객이 위젯에서 <strong>신청 취소</strong>로 직접 지울 수 있습니다.</li><li>쇼핑몰 문자 수신을 거부한 고객은 초대 문자를 받지 못할 수 있습니다.</li></ul>
          </details>
          <details>
            <summary>카페24 재입고 알림을 이미 켜 두었어요</summary>
            <p className={s.answer}>켤 필요가 없고, <strong>끄기를 권장</strong>합니다.</p>
            <ul>
              <li>켜 두면 상세 페이지에 카페24 버튼과 찜꽁 버튼이 함께 보여 신청이 두 곳으로 나뉩니다.</li>
              <li>카페24 재입고 알림 신청 수는 API가 없어서 찜꽁 모니터링에 잡히지 않습니다.</li>
              <li>자동 발송으로 켜 두었다면 재고를 넣는 순간 카페24 재입고 문자가 따로 나갈 수 있습니다.</li>
              <li>끄는 곳: <Path items={["상품", "재입고 알림", "재입고 알림 상품 설정"]} />의 <strong>버튼 노출 여부</strong>를 <strong>노출안함</strong>으로.</li>
              <li>카페24 버튼은 비회원도 신청할 수 있지만, 찜꽁 알림은 회원만 받습니다.</li>
            </ul>
          </details>
          <details>
            <summary>목표를 못 채우면 어떻게 되나요?</summary>
            <p className={s.answer}>마감에 신청자에게 <strong>결과 문자</strong>가 자동으로 갑니다.</p>
            <ul><li>그래도 사겠다는 고객이 있으면 판매자 화면에서 <strong>그래도 진행</strong>을 고를 수 있습니다.</li><li>공구를 열 때 초대로 넘어간 알림 신청은 되살아나지 않습니다. 다음 공구 알림은 품절 상태에서 다시 쌓입니다.</li></ul>
          </details>
          <details>
            <summary>고객에게는 버튼이 어떻게 보이나요?</summary>
            <p className={s.answer}><strong>재입고 · 공구 알림 받기</strong>입니다.</p>
            <ul><li>위젯 위쪽에 &apos;공구 알림&apos; 표시와 &apos;N명이 기다리고 있어요&apos;가 보입니다.</li><li>안내 문구는 &apos;품절된 상품이에요. 다시 만들 때 알려 드릴게요&apos;입니다.</li><li>문구는 찜꽁이 정하므로 스킨을 고칠 필요가 없습니다.</li></ul>
          </details>
        </div>
      </section>

      <section id="sg-sources" className={s.section}>
        <h3 className={s.h}>출처</h3>
        <p className={s.sub}>카페24 도움말의 메뉴 이름과 경로를 그대로 옮겨 적었습니다. 카페24 화면이 바뀌면 아래 문서를 먼저 확인하세요.</p>
        <ul className={s.sources}>
          {SOURCES.map((x) => (
            <li key={x.href}><Ext href={x.href}>{x.label}</Ext></li>
          ))}
        </ul>
      </section>

      <p className={s.foot}>찜꽁 사장님 서비스 가이드라인 · 2026년 10월 14일 · Leekyuhyun · 10월 15일 찜꽁 위젯 기준으로 고침</p>
    </div>
  );
}
