// 판매자 화면 공통 메뉴: 로고 · 쇼핑몰 이름 · 화면 이동 · 화면 밝기(#85). 지금 화면은 aria-current로 표시한다.
// 넓은 화면에서는 왼쪽 세로 메뉴, 휴대폰(560px 이하)에서는 아래 탭 바(큰 아이콘 위 · 글자 아래)가 된다 (globals.css 시안 3).
// 메뉴 이름은 대시보드 구역 이름과 같다: 공구 관리 · 공구 열기 · 매출 리포트 · 쇼핑몰 설정

import { ThemeButton } from "./theme-toggle";

export type Section = "home" | "list" | "new" | "radar" | "profile";

// 메뉴 아이콘 (24px 격자, 얇은 선 아이콘). 사이드바와 휴대폰 아래 탭 바에서 보이고, 중간 폭 위쪽 메뉴에서는 숨긴다
const ICONS: Record<Section, React.ReactNode> = {
  home: <path d="M3 3h8v10H3zM13 3h8v6h-8zM13 11h8v10h-8zM3 15h8v6H3z" />,
  list: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  new: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
  radar: <path d="M4 20h16M7 16v-6M12 16V5M17 16v-4" />,
  profile: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></>,
};

const LINKS: [Section, string, string][] = [
  ["home", "대시보드", "/"],
  ["list", "공구 관리", "/campaigns"],
  ["new", "공구 열기", "/campaigns?tab=new"],
  ["radar", "매출 리포트", "/radar"],
  ["profile", "쇼핑몰 설정", "/campaigns?tab=profile"],
];

export default function AppBar({ current, shop, onNavigate }: { current: Section; shop?: string | null; onNavigate?: (s: Section) => boolean }) {
  return (
    <header className="appbar side">
      <div className="in">
        <a className="logo" href="/"><img src="/logo.svg" alt="" /><span className="logo-text">찜꽁</span></a>
        {shop && <span className="shop">{shop}<small>● 카페24 연결됨</small></span>}
        <nav className="tabs" aria-label="찜꽁 메뉴">
          {LINKS.map(([k, label, href]) => (
            <a key={k} href={href} aria-current={current === k ? "page" : undefined}
              onClick={onNavigate ? (e) => { if (onNavigate(k)) e.preventDefault(); } : undefined}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[k]}</svg>
              {label}
            </a>
          ))}
        </nav>
        <ThemeButton />
      </div>
    </header>
  );
}
