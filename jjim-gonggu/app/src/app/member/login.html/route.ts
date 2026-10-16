// 데모 쇼핑몰의 흉내 로그인 페이지 (#15). 실제 쇼핑몰에서는 카페24의 /member/login.html이 이 자리를 맡는다.
// 위젯의 '로그인하고 계속하기'가 여기로 오면 회원을 고르고 returnUrl(데모 상품 페이지)로 돌려보낸다. 데모 모드가 아니면 404.

import type { NextRequest } from "next/server";
import { getDemo } from "@/lib/server";
import { isDemoMember } from "@/lib/demo";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
// 데모 쇼핑몰의 '지금 고객'과 같은 회원
const SHOPPERS = Array.from({ length: 40 }, (_, i) => `m${(i + 30) * 2}`);

/** 돌려보낼 주소: 데모 상품 페이지만 (다른 사이트로 보내는 열린 리다이렉트를 막는다) */
function returnTo(raw: string | null, origin: string): URL {
  try {
    const u = new URL(raw ?? "", origin);
    if (u.origin === origin && /^\/demo\/shop\/\d+$/.test(u.pathname)) return u;
  } catch {}
  return new URL("/demo", origin);
}

export async function GET(req: NextRequest) {
  if (!(await getDemo())) return new Response("없는 페이지예요", { status: 404 });
  const q = req.nextUrl.searchParams;
  const back = returnTo(q.get("returnUrl"), req.nextUrl.origin);
  const member = q.get("member") ?? "";
  if (isDemoMember(member)) {
    back.searchParams.set("member", member);
    return new Response(null, { status: 303, headers: { Location: back.pathname + back.search, "Cache-Control": "no-store" } });
  }

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>로그인 · 데모 쇼핑몰</title><meta name="robots" content="noindex">
<style>:root{--fg:#16233F;--fg2:#4B5671;--line:#DDE2EB;--bg:#F7F5F1;--surface:#fff;--accent:#2F5BEA}

*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 "Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif}
form{max-width:380px;margin:48px auto;padding:20px 16px;background:var(--surface);border:1px solid var(--line);border-radius:12px;display:grid;gap:12px;word-break:keep-all}
h1{font-size:20px;margin:0}.muted{color:var(--fg2);font-size:13.5px;margin:0}
select,button{font:inherit;padding:10px 12px;border-radius:9px;border:1.5px solid var(--line);background:var(--surface);color:var(--fg)}
button{font-weight:700;background:var(--fg);color:var(--surface);border-color:var(--fg);cursor:pointer}
select:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}</style></head><body>
<form method="get" action="/member/login.html">
  <h1>로그인</h1>
  <p class="muted">시연용 데모 쇼핑몰이에요. 실제 쇼핑몰에서는 카페24 로그인 화면이 나와요. 회원을 고르면 보던 상품 페이지로 돌아가요.</p>
  <input type="hidden" name="returnUrl" value="${esc(back.pathname + back.search)}">
  <label class="muted" for="member">회원</label>
  <select id="member" name="member">${SHOPPERS.map((m) => `<option value="${m}">${m}</option>`).join("")}</select>
  <button type="submit">로그인</button>
</form></body></html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
