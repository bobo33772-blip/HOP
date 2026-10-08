// 판매자 화면 공통 상단바: 로고 · 쇼핑몰 이름 · 화면 이동. 지금 화면은 aria-current로 표시한다.

export type Section = "home" | "list" | "new" | "radar" | "profile";

const LINKS: [Section, string, string][] = [
  ["home", "홈", "/"],
  ["list", "내 공구", "/campaigns"],
  ["new", "새 공구", "/campaigns?tab=new"],
  ["radar", "수요 레이더", "/radar"],
  ["profile", "설정", "/campaigns?tab=profile"],
];

export default function AppBar({ current, shop, onNavigate }: { current: Section; shop?: string | null; onNavigate?: (s: Section) => boolean }) {
  return (
    <header className="appbar">
      <div className="in">
        <a className="logo" href="/"><img src="/logo.svg" alt="" />찜꽁</a>
        {shop && <span className="shop">{shop}</span>}
        <nav className="tabs" aria-label="찜꽁 메뉴">
          {LINKS.map(([k, label, href]) => (
            <a key={k} href={href} aria-current={current === k ? "page" : undefined}
              onClick={onNavigate ? (e) => { if (onNavigate(k)) e.preventDefault(); } : undefined}>{label}</a>
          ))}
        </nav>
      </div>
    </header>
  );
}
