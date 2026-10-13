// 카페24 실행 · 설치 · 콜백이 실패하면 JSON 대신 첫 화면의 한국어 안내로 보낸다 (#28, 기획서 정할 것 6).

import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { launchErrorMessage } from "@/lib/launch-errors";
import * as launchRoute from "@/app/api/cafe24/launch/route";
import * as callbackRoute from "@/app/api/cafe24/callback/route";
import * as installRoute from "@/app/api/cafe24/install/route";

const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; });

/** 실제 카페24 연동 모드처럼 (DB 없이 끝나는 실패 경로만 부른다) */
const realMode = () => Object.assign(process.env, {
  CAFE24_MOCK: "0", CAFE24_CLIENT_ID: "cid", CAFE24_CLIENT_SECRET: "secret", TOKEN_ENC_KEY: "k".repeat(32), APP_BASE_URL: "https://app.example",
});
const req = (path: string) => new NextRequest(`https://app.example${path}`);
const where = (r: Response) => { const u = new URL(r.headers.get("location")!); return u.pathname + u.search; };

describe("실행 · 설치 오류 안내 (#28)", () => {
  it("실행 서명이 맞지 않으면 첫 화면의 '다시 실행' 안내로 보낸다", async () => {
    realMode();
    const r = await launchRoute.GET(req("/api/cafe24/launch?mall_id=m&timestamp=1&hmac=bad"));
    expect(r.status).toBe(307);
    expect(where(r)).toBe("/?error=launch");
  });

  it("콜백에 code가 없으면 설치 다시 하기, 판매자가 동의를 거절했으면 동의 안내로 보낸다", async () => {
    realMode();
    expect(where(await callbackRoute.GET(req("/api/cafe24/callback")))).toBe("/?error=install_retry");
    expect(where(await callbackRoute.GET(req("/api/cafe24/callback?error=access_denied&state=s")))).toBe("/?error=denied");
  });

  it("설치 주소의 쇼핑몰 ID가 이상하거나 데모 모드면 안내로 보낸다", async () => {
    realMode();
    expect(where(await installRoute.GET(req("/api/cafe24/install?mall_id=A!")))).toBe("/?error=bad_mall");
    process.env.CAFE24_MOCK = "1";
    expect(where(await installRoute.GET(req("/api/cafe24/install")))).toBe("/?error=demo");
  });

  it("주소의 error는 정해 둔 코드만 문구로 바꾸고, 나머지는 보여 주지 않는다", () => {
    expect(launchErrorMessage("launch")).toMatch(/다시 실행해 주세요/);
    expect(launchErrorMessage("<script>alert(1)</script>")).toBeNull();
    expect(launchErrorMessage(["launch"])).toBeNull();
    expect(launchErrorMessage("toString")).toBeNull();
    expect(launchErrorMessage(undefined)).toBeNull();
  });
});
