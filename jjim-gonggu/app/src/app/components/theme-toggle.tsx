"use client";

// 화면 밝기 바꾸기 (#85). 상단바 · 사이드바 버튼(ThemeButton)과 설정 화면의 고르기(ThemeSetting)가 같은 값을 쓴다.
// 휴대폰 폭에서는 상단바 메뉴가 꽉 차서 버튼을 숨기고(globals.css), 설정 화면에서 바꾼다.

import { useEffect, useState } from "react";
import { THEME_COLOR, THEME_KEY, type Theme } from "@/lib/theme";

const EVENT = "jjg-theme"; // 한 화면에 버튼과 설정이 같이 있을 때 서로 맞춘다

function apply(t: Theme) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[t]);
  try { localStorage.setItem(THEME_KEY, t); } catch { /* 저장이 막힌 브라우저면 이번 화면에서만 바뀐다 */ }
  window.dispatchEvent(new Event(EVENT));
}

function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const read = () => setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    read();
    window.addEventListener(EVENT, read);
    return () => window.removeEventListener(EVENT, read);
  }, []);
  return [theme, apply];
}

/** 상단바 · 사이드바의 '어둡게' 켜고 끄기 버튼 */
export function ThemeButton() {
  const [theme, set] = useTheme();
  const dark = theme === "dark";
  return (
    <button type="button" className="theme-toggle" aria-pressed={dark} onClick={() => set(dark ? "light" : "dark")}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
      </svg>
      어둡게
    </button>
  );
}

/** 설정 화면의 '화면 밝기' (휴대폰에서도 보이는 곳) */
export function ThemeSetting() {
  const [theme, set] = useTheme();
  return (
    <div className="card">
      <div className="row" style={{ flexWrap: "wrap" }}>
        <b id="theme-label">화면 밝기</b>
        <div className="seg" role="radiogroup" aria-labelledby="theme-label">
          {([["light", "밝게"], ["dark", "어둡게"]] as const).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={theme === k} onClick={() => set(k)}>{label}</button>
          ))}
        </div>
      </div>
      <p className="small">이 브라우저에만 저장돼요. 기본은 밝게예요.</p>
    </div>
  );
}
