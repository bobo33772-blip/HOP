# 1분 정기 작업 (Supabase pg_cron) 설정·확인

운영 서버(Vercel)는 요청이 없으면 잠들어서 서버 안 정기 작업(`instrumentation.ts`)을 믿을 수 없어요.
그래서 Supabase의 **pg_cron**이 1분마다 `POST /api/cron/tick`을 불러 마감 판정·결제 종료·문자 발송·결제 대사를 돌립니다.

2026-10-13 운영 DB(`jjimkkong`, 서울)에서 확인한 실제 설정이에요. 다시 만들거나 다른 환경에 옮길 때 이대로 하면 됩니다.

| 항목 | 값 |
|---|---|
| 작업 이름 | `jjim-tick` |
| 주기 | `* * * * *` (1분) |
| 호출 | `net.http_post` → `https://jjimkkong-psi.vercel.app/api/cron/tick`, 제한 시간 20초 |
| 인증 | `Authorization: Bearer <CRON_SECRET>`. 비밀값은 Supabase Vault의 `jjim_cron_secret`에서 읽어요 |
| Vercel 환경 변수 | `CRON_SECRET`(Vault 값과 같게). 서버 안 30초 작업을 끄려면 `SCHEDULER=off` 권장 (켜 둬도 문자는 선점 후 보내 중복되지 않지만, 판정이 두 곳에서 돌 수 있어요). 운영 값은 이 문서 작성 때 확인하지 않았어요 |

> 비밀값은 이 저장소에 적지 않아요(공개 저장소). Vault와 Vercel 환경 변수에만 둡니다.

## 1. 처음 만들기 (SQL Editor에서)

```sql
-- 확장 (Database > Extensions에서 켜도 같아요)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 비밀값을 Vault에 저장. <CRON_SECRET>은 Vercel의 CRON_SECRET과 같은 값으로 직접 넣어요
select vault.create_secret('<CRON_SECRET>', 'jjim_cron_secret');

-- 1분마다 호출
select cron.schedule(
  'jjim-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://jjimkkong-psi.vercel.app/api/cron/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'jjim_cron_secret')
    ),
    timeout_milliseconds := 20000
  );
  $$
);
```

비밀값을 바꿀 때는 `select vault.update_secret((select id from vault.secrets where name = 'jjim_cron_secret'), '<새 값>');` 하고 Vercel의 `CRON_SECRET`도 같이 바꿔요.

## 2. 잘 돌고 있는지 확인

비밀값이 보이지 않게 **작업 명령(`command`) 열은 조회하지 않아요.**

```sql
-- 지난 1시간 실행 횟수 (정상: 60회 · 실패 0)
select j.jobname, j.schedule, j.active,
  count(d.*) filter (where d.start_time > now() - interval '1 hour') as runs_last_hour,
  count(d.*) filter (where d.start_time > now() - interval '1 hour' and d.status <> 'succeeded') as failed_last_hour,
  max(d.start_time) as last_run
from cron.job j left join cron.job_run_details d using (jobid)
group by 1, 2, 3;

-- 앱이 실제로 200으로 답했는지 (pg_cron의 succeeded는 "요청을 보냈다"까지만이에요)
select status_code, timed_out, count(*) as n, max(created) as latest
from net._http_response where created > now() - interval '1 hour'
group by 1, 2 order by n desc;
```

2026-10-13 16:54 KST 확인 결과: 지난 1시간 60회 실행, 실패 0, 응답 60건 모두 `200`.

## 3. 멈췄을 때

| 증상 | 볼 곳 |
|---|---|
| `runs_last_hour`가 0 | `cron.job.active`가 false인지, Supabase 프로젝트가 일시정지됐는지 |
| 응답이 `401` | Vault 값과 Vercel `CRON_SECRET`이 다름 |
| 응답이 `404` | `CRON_SECRET`이 비어 있으면 그 주소가 꺼져요 (`/api/cron/tick`) |
| `timed_out`이 true | 한 번에 할 일이 많음. Vercel 함수 로그에서 어느 단계가 오래 걸리는지 확인 |

정기 작업이 멈추면 마감 판정이 늦어지고(결제 기한은 늦어도 마감 + 결제 기간에서 끊겨요), 판정 뒤처리가 멈춘 공구는 운영자 화면 "확인할 일"에 `판정 뒤 쿠폰·안내 멈춤`으로 보여요.
