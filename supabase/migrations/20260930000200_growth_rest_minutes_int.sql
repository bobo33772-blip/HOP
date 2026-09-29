-- 성장에 쓰는 쉰 시간을 정수 분으로 (소수 분이 정수 비교에서 오류를 내지 않게)
-- (20260930000100_mood_lines.sql 파일에도 반영돼 있다. 원격에는 이 순서로 적용됨)
create or replace function public.growth_stats(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'trips', (
      select count(*) from train_seats s join trains t on t.id = s.train_id
      where s.user_id = p_user and t.status = 'arrived'
    ),
    'rest_minutes', (
      select floor(coalesce(sum(least(d.ms, a.rest_daily_cap_minutes * 60000)), 0) / 60000)::int
      from (
        select (ps.started_at at time zone 'Asia/Seoul')::date as day, sum(ps.active_ms) as ms
        from play_sessions ps where ps.user_id = p_user group by 1
      ) d, app_settings a
    ),
    'riders', (
      select count(distinct o.user_id)
      from train_seats mine
      join trains t on t.id = mine.train_id and t.status in ('departed', 'arrived')
      join train_seats o on o.train_id = mine.train_id and o.user_id <> p_user
      join auth.users u on u.id = o.user_id
      where mine.user_id = p_user and coalesce(u.email, '') not like 'bot-%@rollroll.test'
    )
  );
$$;
revoke execute on function public.growth_stats(uuid) from public, anon, authenticated;
