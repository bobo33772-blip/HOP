-- 이어하기(다른 계정 불러오기)나 온보딩 이탈로 남은 빈 익명 계정을 하루 뒤 정리한다
create or replace function public.rollroll_tick()
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  update photos set status = 'developed' where status = 'developing' and ready_at <= now();
  perform run_cold_start();
  for r in select id from trains where status = 'departed' and ends_at <= now() loop
    perform close_trip(r.id);
  end loop;
  perform ensure_today();

  -- 프로필 없이 하루가 지난 익명 계정
  delete from auth.users u
  where u.is_anonymous
    and u.created_at < now() - interval '1 day'
    and not exists (select 1 from profiles p where p.id = u.id);
end;
$$;

revoke execute on function public.rollroll_tick() from public, anon, authenticated;
