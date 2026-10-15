"use client";

import { useEffect, useState, type ReactNode } from "react";
import s from "./seller-guide.module.css";

/** 홈 '셀러 가이드라인 자세히 보기' 토글 안에 펼쳐지는 찜꽁 사장님 가이드 본문 (문구는 원문 그대로) */

const STORAGE_KEY = "zzimkkong-guide-checks";
type Checks = Record<string, boolean>;

const TOC: { id: string; n: string; label: string }[] = [
  { id: "sg-principle", n: "·", label: "핵심 원칙" },
  { id: "sg-flow", n: "·", label: "한눈에 보기" },
  { id: "sg-prep", n: "0", label: "시작 전 준비" },
  { id: "sg-step1", n: "1", label: "품절 상품 보이기" },
  { id: "sg-step2", n: "2", label: "알림 버튼 켜기" },
  { id: "sg-step3", n: "3", label: "직접 확인하기" },
  { id: "sg-step4", n: "4", label: "매주 신청 수 확인" },
  { id: "sg-step5", n: "5", label: "공구 열고 알림" },
  { id: "sg-trouble", n: "?", label: "문제 해결" },
  { id: "sg-checklist", n: "✓", label: "체크리스트" },
  { id: "sg-faq", n: "Q", label: "자주 묻는 질문" },
  { id: "sg-sources", n: "·", label: "출처" },
];

const FLOW: { label: string; sub: string; kind?: "q" | "end" }[] = [
  { label: "상품 품절", sub: "재고 0" },
  { label: "진열 유지", sub: "품절 표시만" },
  { label: "신청 버튼 클릭", sub: "소비자" },
  { label: "신청 수 집계", sub: "= 수요 데이터" },
  { label: "목표 달성?", sub: "아니요 → 계속 신청 받기", kind: "q" },
  { label: "재입고 공구 오픈", sub: "신청자에게 알림", kind: "end" },
];

const SETTINGS: { item: string; pick: ReactNode; why: string }[] = [
  { item: "발송 방법", pick: <span className={s.pill}>수동 발송</span>, why: "자동발송은 재고를 입력하는 즉시 문자가 나갑니다. 공구 오픈 시점을 사장님이 정하려면 수동이 맞습니다." },
  { item: "알림 유효 기간", pick: <><span className={s.pill}>3개월</span> 이상</>, why: "기간이 지난 신청에는 알림이 가지 않습니다. 목표를 채우는 데 걸리는 기간보다 길게 잡으세요. (1·3·6·12개월 중 선택)" },
  { item: "버튼 노출 여부", pick: <span className={s.pill}>노출함</span>, why: "버튼을 켜는 스위치입니다." },
  { item: "버튼 노출 대상", pick: <span className={s.pill}>전체</span>, why: "비회원도 신청할 수 있어 수요가 더 많이 쌓입니다. 회원만 받으려면 \"회원\"을 고릅니다." },
  { item: "버튼 노출 방법", pick: <span className={s.pill}>상품별</span>, why: "카페24 안내의 기본 조건입니다. 옵션(품목)마다 따로 받으려면 품목 단위로 노출하는 선택지를 고릅니다." },
  { item: "버튼 노출 상품", pick: <>신청을 받을 품절 상품이 모두 포함되게 두기<br /><span className={s.sub}>필요하면 일부 상품만 제외</span></>, why: "단종될 상품처럼 다시 들여올 수 없는 상품은 제외합니다." },
];

const TROUBLE: { sym: string; ref: string; go: ReactNode }[] = [
  { sym: "품절 상품이 목록에 안 보여요", ref: "1단계 A", go: <>품절 상품 노출 항목이 <strong>노출함</strong>인지</> },
  { sym: "품절 상품이 목록 중간에 섞여 있어요", ref: "1단계 B", go: <>그 분류의 품절 상품 진열 항목이 <strong>품절 상품 맨 뒤로</strong>인지</> },
  { sym: "재입고 알림 신청 버튼이 안 보여요", ref: "2단계", go: <>버튼 노출 여부가 <strong>노출함</strong>, 버튼 노출 방법이 <strong>상품별</strong>인지 확인. 그래도 안 보이면 아래 스킨 안내 참고</> },
  { sym: "옵션 상품에서만 신청이 안 돼요", ref: "1단계 B 아래", go: <>품절된 옵션 품목 노출 여부 항목이 <strong>노출안함</strong>인지 확인</> },
  { sym: "알림 문자가 안 나가요", ref: "준비", go: <>SMS 잔여 건수가 남아 있는지, 알림 유효 기간이 지나지 않았는지</> },
];

const SOURCES: { href: string; label: string }[] = [
  { href: "https://support.cafe24.com/hc/ko/articles/7739172846105", label: "재입고 알림 상품 설정 및 조회" },
  { href: "https://support.cafe24.com/hc/ko/articles/40478449321497", label: "상품 상세에 재입고 알림 신청 버튼이 노출안되는데 어떻게 해야하나요?" },
  { href: "https://support.cafe24.com/hc/ko/articles/17457549008793", label: "상품 재고 관리 및 품절 관련 자주 묻는 질문" },
  { href: "https://support.cafe24.com/hc/ko/articles/8467145462681", label: "상품 목록 중간에 품절 상품이 노출됩니다." },
];

/** 카페24 관리자 메뉴 경로: 상품 › 재입고 알림 */
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
        <p className={s.lead}>품절 상품을 숨기지 말고 <strong>재입고 알림 신청</strong>을 받으세요. 신청 수가 목표에 닿으면 재입고 공구를 열고, 신청자에게 알림을 보냅니다.</p>
        <div className={s.rhythm}>
          <div><b>설정은 한 번</b><span>1~3단계 · 카페24 관리자</span></div>
          <div><b>확인은 매주</b><span>4~5단계 · 신청 수 보고 공구 오픈</span></div>
        </div>
        <p className={s.meta}>2026년 10월 14일 기준 · 메뉴 이름은 카페24 도움말 표기를 따랐습니다</p>
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
        <p><strong>품절돼도 상품을 숨기지(미진열) 마세요.</strong> 품절 상품에 &quot;재입고 알림 신청&quot; 버튼을 두면, 신청한 사람 수가 곧 수요 데이터가 됩니다.</p>
        <div className={s.compare}>
          <div>
            <h4>상품을 숨기면 (미진열)</h4>
            <dl>
              <div><dt>소비자</dt><dd>상품이 안 보여서 장바구니에 못 담음</dd></div>
              <div><dt>수요 데이터</dt><dd>쌓이지 않음 (0으로 보임)</dd></div>
              <div><dt>사장님</dt><dd>인기 상품인데 수요를 모름</dd></div>
            </dl>
          </div>
          <div className={s.good}>
            <h4>상품을 남겨 두면 (품절 표시 + 신청 버튼)</h4>
            <dl>
              <div><dt>소비자</dt><dd>신청 버튼으로 &quot;사고 싶다&quot;를 남김</dd></div>
              <div><dt>수요 데이터</dt><dd>신청 수가 그대로 쌓임</dd></div>
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
        <p className={s.sub}>목표에 못 미치면 계속 신청을 받고, 닿으면 재입고 공구를 열고 신청자에게 알립니다.</p>
      </section>

      <section id="sg-prep" className={s.section}>
        <h3 className={s.h}><span className={s.step}>준비</span>시작 전 준비</h3>
        <p>아래 두 가지를 먼저 갖춰 주세요. 특히 SMS를 충전하지 않으면 버튼은 보여도 알림 문자가 나가지 않습니다.</p>
        <ul className={s.checks}>
          <CheckItem id="c-prep1" checked={on("c-prep1")} onToggle={toggle}>카페24 쇼핑몰 관리자에 로그인할 수 있다 (상품·쇼핑몰 설정 메뉴 권한)</CheckItem>
          <CheckItem id="c-prep2" checked={on("c-prep2")} onToggle={toggle}>SMS 서비스를 신청하고 충전해 두었다 (유료, 잔여 건수가 남아 있어야 발송됨)</CheckItem>
        </ul>
        <div className={s.tip}><b>메뉴 경로 읽는 법</b> <Path items={["상품", "재입고 알림"]} /> 처럼 쓴 것은 카페24 관리자 왼쪽 메뉴를 차례로 누르는 순서입니다.</div>
      </section>

      <section id="sg-step1" className={s.section}>
        <h3 className={s.h}><span className={s.step}>1단계</span>품절 상품이 쇼핑몰에 보이게 하기</h3>
        <p>목록 노출과 진열 순서는 서로 다른 메뉴에 있습니다. <strong>A와 B를 모두 해야</strong> 품절 상품이 &quot;품절&quot; 표시와 함께 목록 끝에 보입니다.</p>

        <h4 className={s.sh}><span className={s.tag}>A</span>품절 상품을 목록에 보이기</h4>
        <Where items={["쇼핑몰 설정", "상품 설정", "상품 보기 설정", "상품 목록 화면 설정"]} />
        <ol className={s.do}>
          <li><span><strong>품절 상품 노출</strong> 항목을 <span className={s.pill}>노출함</span>으로 바꿉니다.</span></li>
          <li><span>같은 화면의 <strong>검색 페이지 품절 상품 진열</strong> 항목에서 <span className={s.pill}>품절 상품 맨 뒤로</span>를 고르고 저장합니다.</span></li>
        </ol>

        <h4 className={s.sh}><span className={s.tag}>B</span>카테고리별로 품절 상품을 맨 뒤로</h4>
        <Where items={["상품", "상품관리", "상품 분류 관리"]} />
        <ol className={s.do}>
          <li><span>분류(카테고리)를 하나 고르고, <strong>품절 상품 진열</strong> 항목에서 <span className={s.pill}>품절 상품 맨 뒤로</span>를 고른 뒤 <strong>저장</strong>합니다.</span></li>
          <li><span>다른 분류도 하나씩 같은 방법으로 바꿉니다.</span></li>
        </ol>

        <div className={s.warn}><b>옵션 상품이라면</b> 색상·사이즈 같은 옵션이 있는 상품은 품절된 옵션도 보여야 그 옵션에 알림 신청을 받을 수 있습니다. <Path items={["쇼핑몰 설정", "상품 설정", "상품 정책 설정", "상품 관련 설정"]} />의 상품옵션 설정에서 <strong>품절된 옵션 품목 노출 여부</strong>(도움말에 따라 「품절된 품목 노출 여부」로도 표기)가 <strong>노출안함</strong>으로 되어 있으면 품절된 옵션도 보이도록 바꿔 주세요. 또 옵션 상품은 품절된 품목의 진열 상태가 <strong>진열함</strong>이어야 고객이 재입고 알림을 신청할 수 있습니다.</div>
      </section>

      <section id="sg-step2" className={s.section}>
        <h3 className={s.h}><span className={s.step}>2단계</span>재입고 알림 신청 버튼 켜기</h3>
        <Where items={["상품", "재입고 알림", "재입고 알림 상품 설정"]} />
        <p>아래 표대로 설정하고 저장합니다. 버튼은 상품 상세 페이지의 판매가 오른쪽에 <strong>재입고 알림 신청</strong>이라는 이름으로 나타납니다.</p>
        <div className={s.tbl}>
          <table className={s.table} role="table">
            <thead role="rowgroup"><tr role="row"><th role="columnheader">설정 항목</th><th role="columnheader">이렇게 고르세요</th><th role="columnheader">이유</th></tr></thead>
            <tbody role="rowgroup">
              {SETTINGS.map((r) => (
                <tr key={r.item} role="row">
                  <td role="cell" data-label="설정 항목" className={s.item}>{r.item}</td>
                  <td role="cell" data-label="이렇게 고르세요">{r.pick}</td>
                  <td role="cell" data-label="이유">{r.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={s.sub}>버튼 문구는 &quot;재입고 알림 신청&quot;으로 정해져 있습니다. &quot;공구 참여하기&quot;처럼 바꾸려면 스킨(디자인) 수정이 필요하니, 먼저 기본 버튼으로 시작하세요.</p>
      </section>

      <section id="sg-step3" className={s.section}>
        <h3 className={s.h}><span className={s.step}>3단계</span>쇼핑몰에서 직접 확인하기</h3>
        <p>설정을 마쳤으면 고객이 보는 쇼핑몰 화면에서 직접 확인합니다. 재고가 0인 상품 하나를 골라 <strong>PC와 휴대폰에서 각각</strong> 봅니다.</p>
        <ul className={s.checks}>
          <CheckItem id="c-s3-1" checked={on("c-s3-1")} onToggle={toggle}>카테고리 목록에서 상품이 맨 뒤에 <strong>품절</strong> 표시와 함께 보인다</CheckItem>
          <CheckItem id="c-s3-2" checked={on("c-s3-2")} onToggle={toggle}>상품 상세 페이지의 판매가 오른쪽에 <strong>재입고 알림 신청</strong> 버튼이 보인다</CheckItem>
          <CheckItem id="c-s3-3" checked={on("c-s3-3")} onToggle={toggle}>버튼을 눌러 내 휴대폰 번호로 신청을 끝까지 마칠 수 있다</CheckItem>
          <CheckItem id="c-s3-4" checked={on("c-s3-4")} onToggle={toggle}><Path items={["상품", "재입고 알림", "신청 내역 조회"]} />에 방금 한 신청이 나타난다</CheckItem>
        </ul>
        <div className={`${s.tip} ${s.done}`}><b>확인이 끝나면</b> 테스트로 넣은 내 신청은 신청 내역 조회에서 선택해 <strong>삭제</strong>합니다. 하나라도 안 되면 <a className={s.link} href="#sg-trouble">문제 해결</a>을 보세요.</div>
      </section>

      <section id="sg-step4" className={s.section}>
        <h3 className={s.h}><span className={s.step}>4단계</span>매주 신청 수 확인하기</h3>
        <p>일주일에 한 번, 상품별로 발송되지 않은 신청이 몇 건인지 셉니다. 이 숫자가 그 상품의 수요입니다.</p>
        <Where items={["상품", "재입고 알림", "신청 내역 조회"]} />
        <ol className={s.do}>
          <li><span>검색 조건에 <strong>상품명</strong>을 넣고 <strong>검색</strong>을 누릅니다.</span></li>
          <li><span>검색 결과에서 <strong>미발송</strong> 건수를 봅니다. 아직 알림을 기다리는 신청 수입니다.</span></li>
          <li><span>여러 상품을 한눈에 보려면 <strong>엑셀 다운로드</strong>를 누르고 상품별로 셉니다.</span></li>
        </ol>
        <div className={s.tip}><b>정확하게 세는 법</b> 같은 휴대폰 번호로 여러 번 신청했을 수 있으니 엑셀에서 중복을 빼고 세세요. 품절 전에 쌓인 장바구니 수도 함께 보세요. 신청이 적더라도 관심이 높은 상품을 놓치지 않을 수 있습니다.</div>
      </section>

      <section id="sg-step5" className={s.section}>
        <h3 className={s.h}><span className={s.step}>5단계</span>공구 열고 알림 보내기</h3>
        <p>미발송 신청이 목표에 닿으면 아래 순서대로 공구를 엽니다. 못 미치면 그대로 두고 다음 주에 다시 확인합니다.</p>
        <ol className={s.do}>
          <li><span>공급처에 주문하고 입고 날짜를 정합니다.</span></li>
          <li><span>상품의 재고 수량을 입력해 판매를 다시 엽니다. 품절 표시는 재고 관리·품절 표시 설정에 따라 바뀝니다.</span></li>
          <li><span><Path items={["상품", "재입고 알림", "신청 내역 조회"]} />에서 그 상품의 미발송 신청을 모두 선택합니다.</span></li>
          <li><span><strong>일괄 발송</strong>을 누릅니다. 신청자 모두에게 재입고 알림 문자가 나갑니다.</span></li>
          <li><span>발송한 건이 <strong>발송 완료</strong>로 바뀌었는지 확인합니다.</span></li>
        </ol>
        <div className={s.warn}><b>다른 방법으로 보냈다면</b> 카카오톡 등으로 따로 알렸다면, 그 신청을 선택하고 <strong>알림 상태 변경</strong>을 눌러 발송 완료로 바꿔 두세요. 그래야 다음 주 신청 수가 정확합니다.</div>
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
        <p className={s.sub}>유료 스킨 등 일부 디자인은 버튼 소스가 없어서 설정을 켜도 버튼이 안 보입니다. 이때는 <Path items={["디자인", "디자인 보관함"]} />에서 스마트 디자인 편집창을 열고, 상품 상세(detail.html)에 카페24가 제공하는 버튼 소스를 넣어야 합니다. 소스는 <Ext href="https://support.cafe24.com/hc/ko/articles/40478449321497">카페24 도움말</Ext>에 있습니다. 카페24 기본 스킨은 이미 들어 있어 할 일이 없습니다.</p>
      </section>

      <section id="sg-checklist" className={s.section}>
        <h3 className={s.h}>사장님 체크리스트</h3>
        <p className={s.groupLabel}>처음 한 번</p>
        <ul className={s.checks}>
          <CheckItem id="c-1" tag="준비" checked={on("c-1")} onToggle={toggle}>SMS 서비스를 신청하고 충전했다</CheckItem>
          <CheckItem id="c-2" tag="1단계 A" checked={on("c-2")} onToggle={toggle}>품절 상품 노출을 &apos;노출함&apos;으로 바꿨다</CheckItem>
          <CheckItem id="c-3" tag="1단계 B" checked={on("c-3")} onToggle={toggle}>모든 분류의 품절 상품 진열을 &apos;품절 상품 맨 뒤로&apos;로 바꿨다</CheckItem>
          <CheckItem id="c-4" tag="2단계" checked={on("c-4")} onToggle={toggle}>재입고 알림 버튼을 켰다: 수동 발송, 노출함, 상품별</CheckItem>
          <CheckItem id="c-5" tag="3단계" checked={on("c-5")} onToggle={toggle}>PC·휴대폰에서 직접 신청해 보고, 테스트 신청은 지웠다</CheckItem>
        </ul>
        <p className={s.groupLabel}>매주</p>
        <ul className={s.checks}>
          <CheckItem id="c-6" tag="4단계" checked={on("c-6")} onToggle={toggle}>신청 내역 조회에서 상품별 미발송 건수를 확인했다</CheckItem>
          <CheckItem id="c-7" tag="5단계" checked={on("c-7")} onToggle={toggle}>목표에 닿은 상품은 공구를 열고 일괄 발송했다</CheckItem>
        </ul>
        <p className={s.sub}>체크 표시는 이 브라우저에만 저장됩니다.</p>
      </section>

      <section id="sg-faq" className={s.section}>
        <h3 className={s.h}>자주 묻는 질문</h3>
        <div className={s.faq}>
          <details>
            <summary>공구를 여는 목표는?</summary>
            <p className={s.answer}>목표 수량은 기본 <strong>30개</strong>입니다.</p>
            <ul><li>판매자가 공구마다 정합니다.</li><li>인원이 아니라 수량이고, 1인 최대 2개가 기본입니다.</li></ul>
          </details>
          <details>
            <summary>찜꽁은 어떤 구조인가요?</summary>
            <p className={s.answer}>판매자의 카페24 쇼핑몰에 설치하는 <strong>앱</strong>입니다.</p>
            <ul><li>고객은 상품 페이지에서 신청합니다.</li><li>결제는 쇼핑몰 주문서에서 하고, 공구 가격은 쿠폰으로 적용됩니다.</li></ul>
          </details>
          <details>
            <summary>품절 상품 공구를 별도 메뉴로 두나요?</summary>
            <p className={s.answer}>아니요. 별도 메뉴 없이 <strong>상품 페이지마다 위젯</strong>이 뜹니다.</p>
          </details>
          <details>
            <summary>신청자 알림은 무엇으로 보내나요?</summary>
            <p className={s.answer}><strong>SMS(카페24 문자)</strong>입니다.</p>
            <ul><li>알림톡은 카페24 API에 없고, 광고성인 초대 문자는 알림톡으로 보낼 수 없습니다.</li><li>문자 비용은 판매자가 카페24에 충전한 SMS 잔여 건수에서 빠집니다.</li><li>발신번호 등록이 필요합니다.</li></ul>
          </details>
          <details>
            <summary>카페24 재입고 알림과는 어떤 관계인가요?</summary>
            <p className={s.answer}><strong>별개</strong>입니다.</p>
            <ul><li>카페24 재입고 알림 위치: <Path items={["상품", "재입고 알림"]} /> (비용은 고객센터 확인 필요)</li><li>찜꽁은 상품 페이지 위젯의 &apos;공구 열리면 알림 받기&apos;로 수요를 모읍니다.</li><li>카페24 재입고 알림 신청 수는 API가 없어서 찜꽁에서 볼 수 없습니다.</li></ul>
          </details>
          <details>
            <summary>버튼 문구를 &quot;공구 참여하기&quot; 등으로 바꾸나요?</summary>
            <p className={s.answer}><span className={s.tbd}>미정</span> 카페24 기본 버튼 문구를 바꾸려면 스킨 수정이 필요합니다.</p>
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

      <p className={s.foot}>찜꽁 사장님 서비스 가이드라인 · 2026년 10월 14일 · Leekyuhyun</p>
    </div>
  );
}
