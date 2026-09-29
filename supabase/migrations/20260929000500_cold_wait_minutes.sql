-- 조기 출발 대기를 분 단위로 조정할 수 있게 한다 (테스트 때 10분처럼 짧게)
alter table public.app_settings add column cold_wait_minutes integer not null default 720 check (cold_wait_minutes > 0);
update public.app_settings set cold_wait_minutes = cold_wait_hours * 60;
alter table public.app_settings drop column cold_wait_hours;

create or replace function public.run_cold_start()
returns void language plpgsql security definer set search_path = public as $$
declare s app_settings; r record;
begin
  select * into s from app_settings where id;
  if not s.cold_start then return; end if;

  for r in
    select t.id, t.drift, t.created_at, count(ts.seat) as seats
    from trains t left join train_seats ts on ts.train_id = t.id
    where t.status = 'filling'
    group by t.id
  loop
    if r.seats >= s.min_departure_seats and r.created_at < now() - make_interval(mins => s.cold_wait_minutes) then
      perform depart_train(r.id);
    elsif not r.drift and r.created_at < now() - make_interval(hours => s.drift_after_hours) then
      update trains set drift = true where id = r.id;
    end if;
  end loop;
end;
$$;

revoke execute on function public.run_cold_start() from public, anon, authenticated;
