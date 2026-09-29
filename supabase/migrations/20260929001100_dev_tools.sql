-- 테스트 도구: 내가 탄 열차에 봇 승객을 태우고 바로 출발시킨다
-- app_settings.dev_tools가 켜져 있을 때만 동작한다. 출시 전에 반드시 끈다.
alter table public.app_settings add column dev_tools boolean not null default false;

create or replace function public.dev_depart_with_bot(p_train uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_path text;
  v_bot uuid := gen_random_uuid();
  v_photo uuid;
  v_seat smallint;
  v_animals text[] := array['pig','chick','rabbit','cat','fox','frog','sheep','bear'];
  v_colors text[] := array['pink','butter','lilac','gray','peach','mint','cream','sky'];
  v_i int := 1 + floor(random() * 8)::int;
begin
  if not (select dev_tools from app_settings where id) then
    raise exception 'DEV_TOOLS_OFF';
  end if;
  -- 내가 탄, 아직 모집 중인 열차만
  select p.storage_path into v_path
  from train_seats s join photos p on p.id = s.photo_id join trains t on t.id = s.train_id
  where s.train_id = p_train and s.user_id = v_me and t.status = 'filling';
  if v_path is null then raise exception 'TRAIN_GONE'; end if;

  select min(x) into v_seat from generate_series(1, 8) x
  where not exists (select 1 from train_seats where train_id = p_train and seat = x);

  if v_seat is not null then
    insert into auth.users (id, instance_id, aud, role, email)
    values (v_bot, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bot-' || v_bot || '@rollroll.test');
    insert into profiles (id, nickname, animal, color, birth_year, agreed_at)
    values (v_bot, '테스트봇' || v_seat, v_animals[v_i], v_colors[v_i], 2000, now());
    -- 봇의 사진은 내 사진을 함께 쓴다
    insert into photos (user_id, storage_path, ready_at, status) values (v_bot, v_path, now(), 'boarded') returning id into v_photo;
    insert into train_seats (train_id, seat, user_id, photo_id) values (p_train, v_seat, v_bot, v_photo);
    insert into guestbook (train_id, seat, user_id, body)
    select p_train, s.seat, v_bot, '같이 떠나요! 🚂' from train_seats s where s.train_id = p_train and s.user_id = v_me;
  end if;

  perform depart_train(p_train);
  perform ensure_today();
end;
$$;

revoke execute on function public.dev_depart_with_bot(uuid) from public, anon;
grant execute on function public.dev_depart_with_bot(uuid) to authenticated;

-- 테스트 단계: 켜 둔다
update public.app_settings set dev_tools = true where id;
