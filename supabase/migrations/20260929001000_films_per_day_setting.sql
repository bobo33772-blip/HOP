-- 하루 필름 수를 app_settings에서 조정한다 (테스트 때 넉넉하게)
alter table public.app_settings add column films_per_day integer not null default 3 check (films_per_day between 1 and 100);

create or replace function public.take_photo(p_storage_path text)
returns public.photos language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_photo photos;
  s app_settings;
  v_minutes numeric;
begin
  select * into s from app_settings where id;
  if (select count(*) from photos where user_id = auth.uid() and day = v_today) >= s.films_per_day then
    raise exception 'FILM_EMPTY' using hint = '오늘 필름을 다 썼어요';
  end if;
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

-- 테스트 단계: 하루 30장
update public.app_settings set films_per_day = 30 where id;
