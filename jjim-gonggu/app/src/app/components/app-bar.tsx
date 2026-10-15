// 판매자 화면 공통 상단바: 로고 · 쇼핑몰 이름 · 화면 이동 · 화면 밝기(#85). 지금 화면은 aria-current로 표시한다.
// 넓은 화면에서는 globals.css의 .appbar.side 규칙으로 왼쪽 세로 메뉴(아이콘 + 글자)가 된다.

import { ThemeButton } from "./theme-toggle";

export type Section = "home" | "list" | "new" | "radar" | "profile";

// 메뉴 아이콘 (24px 격자, 선 아이콘). 좁은 화면에서는 숨긴다
const ICONS: Record<Section, React.ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  new: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
  radar: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><path d="m12 12 5-5" /></>,
  profile: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></>,
};

const LINKS: [Section, string, string][] = [
  ["home", "홈", "/"],
  ["list", "내 공구", "/campaigns"],
  ["new", "새 공구", "/campaigns?tab=new"],
  ["radar", "수요 레이더", "/radar"],
  ["profile", "설정", "/campaigns?tab=profile"],
];

export default function AppBar({ current, shop, onNavigate }: { current: Section; shop?: string | null; onNavigate?: (s: Section) => boolean }) {
  return (
    <header className="appbar side">
      <div className="in">
        <a className="logo" href="/"><img src="/logo.svg" alt="" /><span className="logo-text">찜꽁</span></a>
        {shop && <span className="shop">{shop}</span>}
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
