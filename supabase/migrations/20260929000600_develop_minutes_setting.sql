-- 현상 시간을 app_settings에서 조정한다 (0이면 즉시 현상)
alter table public.app_settings
  add column develop_min_minutes integer not null default 60 check (develop_min_minutes >= 0),
  add column develop_max_minutes integer not null default 180 check (develop_max_minutes >= 0),
  add constraint develop_range check (develop_max_minutes >= develop_min_minutes);

create or replace function public.take_photo(p_storage_path text)
returns public.photos language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_photo photos;
  s app_settings;
  v_minutes numeric;
begin
  if (select count(*) from photos where user_id = auth.uid() and day = v_today) >= 3 then
    raise exception 'FILM_EMPTY' using hint = '오늘 필름을 다 썼어요';
  end if;
  select * into s from app_settings where id;
  v_minutes := s.develop_min_minutes + random() * (s.develop_max_minutes - s.develop_min_minutes);
  insert into photos (user_id, storage_path, day, ready_at, status)
  values (
    auth.uid(), p_storage_path, v_today,
    now() + v_minutes * interval '1 minute',
    case when v_minutes = 0 then 'developed'::photo_status else 'developing'::photo_status end
  )
  returning * into v_photo;
  return v_photo;
end;
$$;

revoke execute on function public.take_photo(text) from public, anon;
grant execute on function public.take_photo(text) to authenticated;

-- 테스트 단계: 즉시 현상
update public.app_settings set develop_min_minutes = 0, develop_max_minutes = 0 where id;
