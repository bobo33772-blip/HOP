// '공구 열리면 알림 받기' (카페24 찜 API 대체): 신청·취소, 초대 대상 합류, 개설 시 비우기, 레이더 숫자, 보관 기간.

import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { DAY } from "@/lib/time";
import { cancelAlert, myAlert, publicAlertView, requestAlert } from "@/lib/engine/alerts";
import { openCampaign, previewCampaign } from "@/lib/engine/campaigns";
import { tick } from "@/lib/engine/scheduler";
import { getRadar, runCollection, startCollection } from "@/lib/radar";
import { purgeExpired } from "@/lib/engine/retention";
import { MALL, PRODUCT, baseInput, setup, type Env } from "./helpers";

const tok = (env: Env, m: string) => ({ member_token: env.world.encryptMember(MALL, m) });

/** 사업자등록이 없는 팀: 찜 회원 조회 권한(mall.read_privacy) 없이 운영 */
async function noPrivacy() {
  const env = await setup();
  env.world.privacy = false;
  return env;
}

describe("알림 신청", () => {
  it("로그인 회원만, 같은 회원은 한 번만 세고, 취소할 수 있다", async () => {
    const env = await noPrivacy();
    await expect(requestAlert(env.ctx, MALL, PRODUCT, {})).rejects.toThrow(/로그인/);
    await expect(requestAlert(env.ctx, MALL, PRODUCT, { member_token: "forged.token.value" })).rejects.toThrow(/본인 확인/);

    const first = await requestAlert(env.ctx, MALL, PRODUCT, tok(env, "m1"));
    expect(first.alert).not.toBeNull();
    expect(first.waiting).toBe(1);
    expect((await requestAlert(env.ctx, MALL, PRODUCT, tok(env, "m1"))).waiting).toBe(1);
    await requestAlert(env.ctx, MALL, PRODUCT, tok(env, "m2"));
    expect(await publicAlertView(env.ctx, MALL, PRODUCT)).toEqual({ productNo: PRODUCT, waiting: 2 });

    expect((await myAlert(env.ctx, MALL, PRODUCT, tok(env, "m2"))).alert).not.toBeNull();
    expect(await cancelAlert(env.ctx, MALL, PRODUCT, tok(env, "m2"))).toEqual({ alert: null, waiting: 1 });
    expect((await myAlert(env.ctx, MALL, PRODUCT, tok(env, "m2"))).alert).toBeNull();
  });

  it("다른 몰 상품이나 잘못된 상품 번호는 받지 않는다", async () => {
    const env = await noPrivacy();
    await expect(requestAlert(env.ctx, "nope", PRODUCT, tok(env, "m1"))).rejects.toThrow(/연결된 쇼핑몰/);
    await expect(requestAlert(env.ctx, MALL, "abc", tok(env, "m1"))).rejects.toThrow(/상품/);
  });
});

describe("공구 개설과 알림 신청", () => {
  it("알림 신청 회원이 장바구니 회원과 함께 초대되고, 겹치면 한 번만 센다", async () => {
    const env = await noPrivacy();
    for (const m of ["m1", "m2", "m100"]) await requestAlert(env.ctx, MALL, PRODUCT, tok(env, m)); // m100은 장바구니에도 있다
    const pv = await previewCampaign(env.ctx, MALL, baseInput(env.clock));
    expect(pv.audience).toEqual({ alert: 3, wishlist: 0, cart: 40, unique: 42, reachable: 42, consentChecked: false });
    expect(pv.message).toMatch(/관심 가져 주신 스톤웨어/);

    const { campaign, invited } = await openCampaign(env.ctx, "op", MALL, baseInput(env.clock));
    expect(invited).toBe(42);
    const inv = await env.db.select().from(schema.invitations).where(eq(schema.invitations.campaignId, campaign.id));
    expect(inv.find((i) => i.memberId === "m100")?.source).toBe("alert");
    // 초대가 나갔으니 알림 신청은 비운다
    expect((await publicAlertView(env.ctx, MALL, PRODUCT)).waiting).toBe(0);
    await tick(env.ctx);
    expect(env.world.smsLog[0].memberIds).toContain("m2");
  });

  it("장바구니 고객이 없어도 알림 신청만으로 공구를 열 수 있다", async () => {
    const env = await noPrivacy();
    await requestAlert(env.ctx, MALL, 103, tok(env, "m4"));
    const input = { ...baseInput(env.clock), productNo: 103, dealPrice: 69000, costPrice: 50000 };
    const pv = await previewCampaign(env.ctx, MALL, input);
    expect(pv.audience).toMatchObject({ alert: 1, cart: 0, reachable: 1 });
    expect(pv.message).toMatch(/공구 알림을 신청하신 린넨 암막 커튼/);
    expect((await openCampaign(env.ctx, "op", MALL, input)).invited).toBe(1);
  });

  it("알림 신청도 장바구니도 없으면 열 수 없다고 알려 준다", async () => {
    const env = await noPrivacy();
    const input = { ...baseInput(env.clock), productNo: 103, dealPrice: 69000, costPrice: 50000 };
    await expect(openCampaign(env.ctx, "op", MALL, input)).rejects.toThrow(/알림을 신청했거나 장바구니/);
  });
});

describe("수요 레이더와 보관 기간", () => {
  it("레이더는 상품별 알림 신청 수를 지금 값으로 더해 정렬한다", async () => {
    const env = await noPrivacy();
    const { run } = await startCollection(env.db, MALL);
    await runCollection(env.db, await env.ctx.shop(MALL), MALL, run.id);
    for (const m of ["m1", "m2", "m3"]) await requestAlert(env.ctx, MALL, 103, tok(env, m));
    const byAlert = await getRadar(env.db, MALL, "alert");
    expect(byAlert.rows[0]).toMatchObject({ productNo: 103, alert: 3, wishlist: 0, cart: 0 });
    expect(byAlert.rows.find((r) => r.productNo === PRODUCT)).toMatchObject({ alert: 0, cart: 40 });
  });

  it("공구가 열리지 않은 알림 신청은 180일 뒤 지운다", async () => {
    const env = await noPrivacy();
    await requestAlert(env.ctx, MALL, PRODUCT, tok(env, "m1"));
    env.clock.advance(179 * DAY);
    await requestAlert(env.ctx, MALL, PRODUCT, tok(env, "m2"));
    env.clock.advance(2 * DAY);
    await purgeExpired(env.ctx);
    const left = await env.db.select().from(schema.productAlerts);
    expect(left.map((a) => a.memberId)).toEqual(["m2"]);
  });
});
