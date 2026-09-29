-- 콜드 스타트 규칙 + 서버 배치
-- 사용자가 적을 때 8칸이 영영 안 차는 문제를 막는다. 수치는 app_settings에서 코드 수정 없이 조정한다.

create table public.app_settings (
  id                   boolean primary key default true check (id),   -- 한 줄만 존재
  cold_start           boolean  not null default true,
  min_departure_seats  smallint not null default 4 check (min_departure_seats between 2 and 8),
  cold_wait_hours      integer  not null default 12 check (cold_wait_hours > 0),
  drift_after_hours    integer  not null default 24 check (drift_after_hours > 0),
  updated_at           timestamptz not null default now()
);
insert into public.app_settings default values;

alter table public.app_settings enable row level security;
-- 앱이 "4명 이상이면 12시간 뒤 출발" 같은 안내를 보여 줄 수 있게 읽기만 허용
create policy app_settings_read on public.app_settings for select to authenticated using (true);

create index trains_created on public.trains (created_at) where status = 'filling';

-- ─────────────────────────────── 출발 처리 (8칸 만석 · 콜드 스타트 조기 출발 공용)
create or replace function public.depart_train(p_train uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update trains set status = 'departed', departed_at = now(), ends_at = now() + interval '7 days'
  where id = p_train and status = 'filling';
  if found then
    perform grant_xp(user_id, 'train_departed', 50, p_train) from train_seats where train_id = p_train;
  end if;
end;
$$;

-- 만석 출발 로직을 depart_train으로 교체
create or replace function public.board_train(p_photo uuid, p_train uuid)
returns smallint language plpgsql security definer set search_path = public as $$
declare v_seat smallint; v_count int; v_train trains;
begin
  perform 1 from photos where id = p_photo and user_id = auth.uid() and status = 'developed';
  if not found then raise exception 'PHOTO_NOT_READY'; end if;

  select * into v_train from trains where id = p_train for update;
  if v_train.id is null or v_train.status <> 'filling' then raise exception 'TRAIN_GONE'; end if;
  if exists (select 1 from train_seats where train_id = p_train and user_id = auth.uid()) then
    raise exception 'ALREADY_ON_BOARD';
  end if;

  select min(s) into v_seat from generate_series(1, 8) s
  where not exists (select 1 from train_seats where train_id = p_train and seat = s);
  if v_seat is null then raise exception 'TRAIN_FULL'; end if;

  insert into train_seats (train_id, seat, user_id, photo_id) values (p_train, v_seat, auth.uid(), p_photo);
  update photos set status = 'boarded' where id = p_photo;
  perform grant_xp(auth.uid(), 'hang_photo', 10, p_photo);

  select count(*) into v_count from train_seats where train_id = p_train;
  if v_count = 8 then perform depart_train(p_train); end if;
  return v_seat;
end;
$$;

-- ─────────────────────────────── 오늘의 행선지와 열차 준비 (KST 기준, 여러 번 불러도 안전)
create or replace function public.ensure_today()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_dests text[][] := array[
    ['☁️','하늘행','오늘 올려다본 하늘'],
    ['☕','한 잔행','오늘 마신 한 잔'],
    ['👟','발끝행','오늘 걸은 길과 발끝'],
    ['🪟','창밖행','창밖으로 보인 풍경'],
    ['🍙','점심행','오늘의 점심'],
    ['🌗','그림자행','빛과 그림자'],
    ['🌿','초록행','길에서 만난 초록']
  ];
  v_i int;
begin
  perform pg_advisory_xact_lock(hashtext('rollroll.ensure_today'));

  if not exists (select 1 from destinations where day = v_today) then
    v_i := ((v_today - date '2026-01-01') % 7) + 1;
    insert into destinations (day, emoji, name, prompt)
    values (v_today, v_dests[v_i][1], v_dests[v_i][2], v_dests[v_i][3]);
  end if;

  -- 오늘 행선지 열차가 모집 중이 아니면 새로 연다 (만석으로 떠났으면 다음 열차)
  if not exists (select 1 from trains where destination = v_today and not drift and status = 'filling') then
    insert into trains (day, destination) values (v_today, v_today);
  end if;

  if not exists (select 1 from trains where drift and status = 'filling') then
    insert into trains (day, destination, drift) values (v_today, null, true);
  end if;
end;
$$;

-- ─────────────────────────────── 콜드 스타트: 조기 출발 · 떠돌이 전환
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
    group by t.id   -- GROUP BY와 FOR UPDATE는 함께 못 쓴다. depart_train이 status 조건으로 중복을 막는다
  loop
    if r.seats >= s.min_departure_seats and r.created_at < now() - make_interval(hours => s.cold_wait_hours) then
      perform depart_train(r.id);
    elsif not r.drift and r.created_at < now() - make_interval(hours => s.drift_after_hours) then
      -- 인원이 모자란 열차는 떠돌이 칸으로 바꿔 누구나 이어 탈 수 있게 한다
      update trains set drift = true where id = r.id;
    end if;
  end loop;
end;
$$;

-- ─────────────────────────────── 5분 배치: 현상 → 콜드 스타트 → 여행 종료 → 오늘 열차
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
end;
$$;

-- 내부 함수는 앱에서 부를 수 없다. ensure_today만 앱 시작 시 호출을 허용한다.
revoke execute on function public.depart_train(uuid) from public, anon, authenticated;
revoke execute on function public.run_cold_start() from public, anon, authenticated;
revoke execute on function public.rollroll_tick() from public, anon, authenticated;
revoke execute on function public.ensure_today() from public, anon;
grant execute on function public.ensure_today() to authenticated;

-- ─────────────────────────────── 스케줄
create extension if not exists pg_cron;
select cron.schedule('rollroll-tick', '*/5 * * * *', $$select public.rollroll_tick()$$);

-- 첫 행선지와 열차
select public.ensure_today();
