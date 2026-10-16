// 화면 밝기 (#85): 기본은 밝게. 판매자가 고르면 어둡게. 고른 값은 그 브라우저(localStorage)에만 저장한다.
// 기기의 다크 모드 설정은 따르지 않는다 (카페24 관리자가 항상 밝은 화면이라, 그 안에서 우리 화면만 어둡게 뜨지 않게).
// 색은 globals.css의 :root(밝게)와 :root[data-theme="dark"](어둡게) 한 곳에서 정한다.

export type Theme = "light" | "dark";

export const THEME_KEY = "jjg-theme";
/** 휴대폰 브라우저 주소창 색. 밝게는 흰 상단바, 어둡게는 다크 카드색 (globals.css --surface) */
export const THEME_COLOR: Record<Theme, string> = { light: "#ffffff", dark: "#141c26" };

/** 첫 그림 전에 <head>에서 실행: 저장된 값이 '어둡게'일 때만 바꾼다. 그래서 새로고침해도 밝은 화면이 잠깐 비치지 않는다 */
export const THEME_BOOT = `try{if(localStorage.getItem(${JSON.stringify(THEME_KEY)})==="dark"){document.documentElement.dataset.theme="dark";document.addEventListener("DOMContentLoaded",function(){var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",${JSON.stringify(THEME_COLOR.dark)})})}}catch(e){}`;
