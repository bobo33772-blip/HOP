// Next.js가 서버를 켤 때 한 번 부른다. 서버 안 정기 작업(예약 문자·마감 판정·결제 기간 종료·야간 대사)을 시작한다.
// 서버를 여러 대 띄울 때는 SCHEDULER=off로 끄고 외부 크론이 /api/cron/tick 을 부르게 한다.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if ((process.env.SCHEDULER ?? "inline") === "off") return;
  const { startScheduler } = await import("./lib/server");
  // 데모 모드는 시간을 앞당겨 보는 일이 잦아 더 자주 돈다
  startScheduler((process.env.CAFE24_MOCK ?? "1") === "1" ? 5_000 : 30_000);
}
