-- 기획서 v0.6 1단계: 쉼 티켓 · 짐 · 막차
-- 오감 놀이의 만족 게이지를 채우면 티켓 1장 (놀이마다 막차 한 번에 1장, 놀이 3종이라 최대 3장).
-- 티켓이 1장이라도 있으면 오늘 밤 막차에 탈 수 있고, 막차 시각(기본 23:30)에 모든 열차가 떠나
-- travel_minutes(기본 8시간) 뒤 도착한다. 탑승을 깜빡해도 짐을 챙긴 말랑볼은 막차가 태우고 간다.
-- 조기 출발(콜드 스타트)과 떠돌이 칸은 더 쓰지 않는다. 빈자리는 3단계에서 NPC 승객이 채운다.
-- 사진 탑승(board_train)과 예전 테스트 도구는 이전 버전 앱(웹 배포본)을 위해 남겨 둔다.

-- ─────────────────────────────── 설정
alter table public.app_settings
  add column last_train_time  time    not null default '23:30',
  add column travel_minutes   integer not null default 480 check (travel_minutes between 1 and 1440),
  add column min_play_seconds integer not null default 15 check (min_play_seconds between 0 and 600);

-- 다음 막차 시각 (KST). p_at이 막차 시각이거나 지났으면 다음 날 막차.
create or replace function public.next_departure(p_at timestamptz default now())
returns timestamptz language sql stable security definer set search_path = public as $$
  select (case when c.cand > c.local then c.cand else c.cand + interval '1 day' end) at time zone 'Asia/Seoul'
  from (
    select (p_at at time zone 'Asia/Seoul') as local,
           ((p_at at time zone 'Asia/Seoul')::date + (select last_train_time from app_settings where id)) as cand
  ) c;
$$;

-- ─────────────────────────────── 열차: 막차 시각 · 도착 시각
alter table public.trains
  add column departs_at timestamptz,
  add column arrives_at timestamptz;
create index trains_departs on public.trains (departs_at) where status = 'filling';

-- 사진은 선택이 된다 (티켓으로 탄 자리에는 사진이 없을 수 있다)
alter table public.train_seats alter column photo_id drop not null;

-- ─────────────────────────────── 오감 놀이 · 티켓
create type public.play_kind as enum ('squish', 'noodle', 'color');

-- 놀이 한 판. active_ms는 실제로 만지거나 숨 쉰 시간(앱이 재고 서버가 흐른 시간으로 상한을 둔다)
create table public.play_sessions (
  id         uuid primary key,                -- 앱이 만든 id (같은 판을 여러 번 기록해도 한 줄)
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       public.play_kind not null,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  active_ms  integer not null default 0 check (active_ms >= 0),
  filled     boolean not null default false,  -- 만족 게이지를 채웠는지
  detail     jsonb check (detail is null or (jsonb_typeof(detail) = 'object' and pg_column_size(detail) < 4096))
);
create index play_sessions_user on public.play_sessions (user_id, started_at desc);

-- 티켓 = 쉰 증거 + 가방에 담긴 짐. cycle은 이 티켓이 탈 막차 출발 시각.
create table public.tickets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       public.play_kind not null,
  cycle      timestamptz not null,
  session_id uuid references public.play_sessions (id) on delete set null,
  detail     jsonb,
  earned_at  timestamptz not null default now(),
  train_id   uuid references public.trains (id) on delete set null,
  unique (user_id, kind, cycle)                -- 놀이마다 막차 한 번에 1장
);
create index tickets_open on public.tickets (cycle) where train_id is null;
create index tickets_train on public.tickets (train_id);

alter table public.play_sessions enable row level security;
alter table public.tickets enable row level security;
-- 읽기만 본인 것. 쓰기는 모두 아래 함수로만 한다 (티켓 조작 방지).
create policy play_sessions_own on public.play_sessions for select to authenticated using (user_id = auth.uid());
create policy tickets_own on public.tickets for select to authenticated using (user_id = auth.uid());

-- ─────────────────────────────── 행선지 · 오늘 밤 막차 준비
create or replace function public.ensure_destination(p_day date)
returns void language plpgsql security definer set search_path = public as $$
declare
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
  if exists (select 1 from destinations where day = p_day) then return; end if;
  v_i := (((p_day - date '2026-01-01') % 7) + 7) % 7 + 1;
  insert into destinations (day, emoji, name, prompt)
  values (p_day, v_dests[v_i][1], v_dests[v_i][2], v_dests[v_i][3])
  on conflict (day) do nothing;
end;
$$;

-- 정거장에 서 있을 오늘 밤 막차를 준비한다 (여러 번 불러도 안전)
create or replace function public.ensure_today()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_cycle timestamptz := next_departure(now());
  v_day date := (v_cycle at time zone 'Asia/Seoul')::date;
begin
  perform pg_advisory_xact_lock(hashtext('rollroll.ensure_today'));
  perform ensure_destination((now() at time zone 'Asia/Seoul')::date);
  perform ensure_destination(v_day);
  if not exists (select 1 from trains where status = 'filling' and departs_at = v_cycle and not drift) then
    insert into trains (day, destination, departs_at) values (v_day, v_day, v_cycle);
  end if;
end;
$$;

-- ─────────────────────────────── 자리 배정 (내부용)
-- 이미 이 막차에 탔으면 그 열차, 아니면 빈칸이 있는 열차(차단 관계 제외), 없으면 새 열차.
create or replace function public.seat_user(p_user uuid, p_cycle timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_day date := (p_cycle at time zone 'Asia/Seoul')::date;
  v_train uuid;
  v_seat smallint;
begin
  select s.train_id into v_train
  from train_seats s join trains t on t.id = s.train_id
  where s.user_id = p_user and t.departs_at = p_cycle
  limit 1;
  if v_train is not null then return v_train; end if;

  perform ensure_destination(v_day);
  for v_train in
    select t.id from trains t
    where t.status = 'filling' and t.departs_at = p_cycle and not t.drift
      and not exists (select 1 from train_seats s where s.train_id = t.id and is_blocked_pair(s.user_id, p_user))
    order by t.created_at
  loop
    perform 1 from trains where id = v_train and status = 'filling' for update;   -- 열차 한 대 단위로 줄 세우기
    if not found then continue; end if;
    select min(x) into v_seat from generate_series(1, 8) x
    where not exists (select 1 from train_seats where train_id = v_train and seat = x);
    if v_seat is not null then
      insert into train_seats (train_id, seat, user_id) values (v_train, v_seat, p_user);
      return v_train;
    end if;
  end loop;

  insert into trains (day, destination, departs_at) values (v_day, v_day, p_cycle) returning id into v_train;
  insert into train_seats (train_id, seat, user_id) values (v_train, 1, p_user);
  return v_train;
end;
$$;

-- 이번 막차 전에 찍은 창밖 사진이 있으면 자리에 함께 싣는다 (선택)
create or replace function public.attach_photo(p_user uuid, p_train uuid, p_cycle timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare v_photo uuid;
begin
  if exists (select 1 from train_seats where train_id = p_train and user_id = p_user and photo_id is not null) then
    return;
  end if;
  select p.id into v_photo from photos p
  where p.user_id = p_user and not p.hidden
    and (p.status = 'developed' or (p.status = 'developing' and p.ready_at <= now()))
    and p.taken_at > p_cycle - interval '1 day'
  order by p.taken_at desc
  limit 1;
  if v_photo is null then return; end if;
  update train_seats set photo_id = v_photo where train_id = p_train and user_id = p_user;
  update photos set status = 'boarded' where id = v_photo;
end;
$$;

-- ─────────────────────────────── 놀이 기록 · 티켓 받기
-- 앱은 놀이를 시작할 때, 게이지가 찼을 때, 나갈 때 같은 p_session으로 부른다.
create or replace function public.record_play(
  p_session uuid, p_kind public.play_kind, p_active_ms integer, p_filled boolean, p_detail jsonb default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_s play_sessions;
  v_min int;
  v_cycle timestamptz := next_departure(now());
  v_ticket uuid;
  v_train uuid;
begin
  if v_me is null then raise exception 'NOT_SIGNED_IN'; end if;

  insert into play_sessions (id, user_id, kind) values (p_session, v_me, p_kind) on conflict (id) do nothing;
  select * into v_s from play_sessions where id = p_session for update;
  if v_s.user_id <> v_me or v_s.kind <> p_kind then raise exception 'BAD_SESSION'; end if;

  -- 실제로 흐른 시간보다 오래 쉬었다고 할 수는 없다 (네트워크 지연 여유 5초)
  update play_sessions set
    active_ms = least(greatest(active_ms, coalesce(p_active_ms, 0)),
                      (extract(epoch from now() - started_at) * 1000)::int + 5000),
    filled = filled or coalesce(p_filled, false),
    detail = coalesce(p_detail, detail),
    updated_at = now()
  where id = p_session
  returning * into v_s;

  -- 티켓을 받은 뒤에도 계속 놀면 짐(색칠한 창밖 등)도 마지막 모습으로
  update tickets set detail = v_s.detail where session_id = p_session and v_s.detail is not null;

  select min_play_seconds into v_min from app_settings where id;
  if v_s.filled and v_s.active_ms >= v_min * 1000 then
    insert into tickets (user_id, kind, cycle, session_id, detail)
    values (v_me, p_kind, v_cycle, p_session, v_s.detail)
    on conflict (user_id, kind, cycle) do nothing
    returning id into v_ticket;
    if v_ticket is not null then
      perform grant_xp(v_me, 'ticket', 10, v_ticket);
      -- 이미 오늘 밤 막차에 탔다면 새 짐도 같은 자리로
      select s.train_id into v_train
      from train_seats s join trains t on t.id = s.train_id
      where s.user_id = v_me and t.departs_at = v_cycle
      limit 1;
      if v_train is not null then update tickets set train_id = v_train where id = v_ticket; end if;
    end if;
  end if;

  return jsonb_build_object(
    'ticket', v_ticket is not null,
    'has_ticket', exists (select 1 from tickets where user_id = v_me and kind = p_kind and cycle = v_cycle),
    'active_ms', v_s.active_ms,
    'cycle', v_cycle
  );
end;
$$;

-- ─────────────────────────────── 오늘 밤 막차 타기
create or replace function public.board_tonight()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_cycle timestamptz := next_departure(now());
  v_train uuid;
begin
  if v_me is null then raise exception 'NOT_SIGNED_IN'; end if;
  if not exists (select 1 from tickets where user_id = v_me and cycle = v_cycle) then
    raise exception 'NO_TICKET' using hint = '먼저 쉼 놀이로 티켓을 받아 주세요';
  end if;
  v_train := seat_user(v_me, v_cycle);
  update tickets set train_id = v_train where user_id = v_me and cycle = v_cycle and train_id is null;
  perform attach_photo(v_me, v_train, v_cycle);
  return jsonb_build_object('train_id', v_train, 'departs_at', v_cycle);
end;
$$;

-- ─────────────────────────────── 출발 · 도착
create or replace function public.depart_train(p_train uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_riders uuid[]; v_dest text; v_travel int; v_arrive timestamptz; v_n int;
begin
  -- 아무도 안 탄 열차는 떠나지 않고 치운다
  if not exists (select 1 from train_seats where train_id = p_train) then
    delete from trains where id = p_train and status = 'filling';
    return;
  end if;

  select travel_minutes into v_travel from app_settings where id;
  v_arrive := now() + make_interval(mins => v_travel);
  update trains set status = 'departed', departed_at = now(), arrives_at = v_arrive, ends_at = v_arrive
  where id = p_train and status = 'filling';
  if not found then return; end if;

  perform grant_xp(user_id, 'train_departed', 50, p_train) from train_seats where train_id = p_train;

  select array_agg(user_id) into v_riders from train_seats where train_id = p_train;
  v_n := coalesce(array_length(v_riders, 1), 0);
  select coalesce(d.name, '떠돌이') into v_dest from trains t left join destinations d on d.day = t.destination where t.id = p_train;
  perform send_push(
    v_riders,
    '🚂 ' || v_dest || ' 막차가 출발했어요',
    case when v_n > 1 then v_n || '명의 말랑볼이 함께 떠났어요. ' else '말랑볼이 여행을 떠났어요. ' end
      || '도착은 ' || to_char(v_arrive at time zone 'Asia/Seoul', 'FMMM"월" FMDD"일" HH24:MI') || '이에요.',
    jsonb_build_object('url', '/crew/' || p_train)
  );
end;
$$;

create or replace function public.run_departures()
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_train uuid;
begin
  -- 1) 짐을 챙기고 탑승을 깜빡한 말랑볼도 막차가 태우고 간다
  for r in
    select distinct tk.user_id, tk.cycle from tickets tk
    where tk.train_id is null and tk.cycle <= now() and tk.cycle > now() - interval '1 day'
  loop
    v_train := seat_user(r.user_id, r.cycle);
    update tickets set train_id = v_train where user_id = r.user_id and cycle = r.cycle and train_id is null;
    perform attach_photo(r.user_id, v_train, r.cycle);
  end loop;

  -- 2) 막차 시각이 된 열차는 모두 출발
  for r in select id from trains where status = 'filling' and departs_at <= now() loop
    perform depart_train(r.id);
  end loop;
end;
$$;

create or replace function public.run_arrivals()
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_riders uuid[];
begin
  for r in
    select t.id, coalesce(d.name, '떠돌이') as dest, t.arrives_at
    from trains t left join destinations d on d.day = t.destination
    where t.status = 'departed' and coalesce(t.arrives_at, t.ends_at) <= now()
  loop
    perform close_trip(r.id);   -- 도착 + 서로 또 타요를 고른 사람끼리 친구
    if r.arrives_at is not null then
      select array_agg(user_id) into v_riders from train_seats where train_id = r.id;
      perform send_push(
        v_riders,
        '☀️ ' || r.dest || ' 여행에서 말랑볼이 돌아왔어요',
        '여행 이야기를 들으러 가 볼까요?',
        jsonb_build_object('url', '/crew/' || r.id)
      );
    end if;
  end loop;
end;
$$;

-- 매분 배치: 현상 → 막차 출발 → 도착 → 오늘 밤 막차 준비 → 빈 익명 계정 정리
create or replace function public.rollroll_tick()
returns void language plpgsql security definer set search_path = public as $$
begin
  update photos set status = 'developed' where status = 'developing' and ready_at <= now();
  perform run_departures();
  perform run_arrivals();
  perform ensure_today();

  delete from auth.users u
  where u.is_anonymous
    and u.created_at < now() - interval '1 day'
    and not exists (select 1 from profiles p where p.id = u.id);
end;
$$;

-- ─────────────────────────────── 테스트 도구: 내 열차를 지금 막차로 출발시키기
-- 이 열차의 막차 시각을 지금으로 당겨서, 오늘 밤 막차(놀이별 티켓 1장 제한)가 다시 비게 한다.
-- 그래서 같은 날 여러 번 "놀이 → 탑승 → 출발 → 도착"을 시험할 수 있다. dev_tools가 켜져 있을 때만.
create or replace function public.dev_depart_now(p_minutes integer default 2)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_cycle timestamptz := next_departure(now());
  v_now timestamptz := now();
  v_train uuid;
  v_seat smallint;
  v_my_seat smallint;
  v_bot uuid := gen_random_uuid();
  v_animals text[] := array['pig','chick','rabbit','cat','fox','frog','sheep','bear'];
  v_colors text[] := array['pink','butter','lilac','gray','peach','mint','cream','sky'];
  v_i int := 1 + floor(random() * 8)::int;
begin
  if not (select dev_tools from app_settings where id) then raise exception 'DEV_TOOLS_OFF'; end if;

  select s.train_id into v_train
  from train_seats s join trains t on t.id = s.train_id
  where s.user_id = v_me and t.departs_at = v_cycle and t.status = 'filling'
  limit 1;
  if v_train is null then
    if not exists (select 1 from tickets where user_id = v_me and cycle = v_cycle) then raise exception 'NO_TICKET'; end if;
    v_train := seat_user(v_me, v_cycle);
    update tickets set train_id = v_train where user_id = v_me and cycle = v_cycle and train_id is null;
    perform attach_photo(v_me, v_train, v_cycle);
  end if;

  -- 함께 탈 테스트 봇 한 명 (봇 계정은 bot-*@rollroll.test, cleanup-test-accounts.sql로 지운다)
  select min(x) into v_seat from generate_series(1, 8) x
  where not exists (select 1 from train_seats where train_id = v_train and seat = x);
  if v_seat is not null then
    insert into auth.users (id, instance_id, aud, role, email)
    values (v_bot, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bot-' || v_bot || '@rollroll.test');
    insert into profiles (id, nickname, animal, color, birth_year, agreed_at)
    values (v_bot, '테스트봇' || v_seat, v_animals[v_i], v_colors[v_i], 2000, now());
    insert into train_seats (train_id, seat, user_id) values (v_train, v_seat, v_bot);
    insert into tickets (user_id, kind, cycle, train_id) values (v_bot, 'squish', v_now, v_train);
    select seat into v_my_seat from train_seats where train_id = v_train and user_id = v_me;
    if v_my_seat is not null then
      insert into guestbook (train_id, seat, user_id, body) values (v_train, v_my_seat, v_bot, '같이 떠나요! 🚂')
      on conflict do nothing;
    end if;
  end if;

  update trains set departs_at = v_now where id = v_train;
  update tickets set cycle = v_now where train_id = v_train and user_id = v_me;
  perform depart_train(v_train);
  update trains
  set arrives_at = v_now + make_interval(mins => greatest(1, p_minutes)),
      ends_at    = v_now + make_interval(mins => greatest(1, p_minutes))
  where id = v_train;
  perform ensure_today();
  return v_train;
end;
$$;

-- ─────────────────────────────── snapshot: 막차 · 티켓 · 쉰 시간 · 짐
create or replace function public.snapshot()
returns jsonb language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as uid),
  today as (select (now() at time zone 'Asia/Seoul')::date as kst_day),
  nxt as (select public.next_departure(now()) as at),
  my_train_ids as (
    select distinct s.train_id from train_seats s, me where s.user_id = me.uid
  ),
  my_blocks as (
    select b.blocked as uid from blocks b, me where b.blocker = me.uid
  ),
  visible as (
    select t.* from trains t, nxt
    where t.status = 'filling' and t.departs_at = nxt.at
    union
    select t.* from trains t where t.id in (select train_id from my_train_ids)
  )
  select jsonb_build_object(
    'now', now(),
    'next_departure', (select at from nxt),
    'profile', (select to_jsonb(p) - 'push_token' - 'birth_year' from profiles p, me where p.id = me.uid),
    'friends', (
      select coalesce(jsonb_agg(case when f.user_a = me.uid then f.user_b else f.user_a end), '[]'::jsonb)
      from friendships f, me where me.uid in (f.user_a, f.user_b)
    ),
    'blocked', (select coalesce(jsonb_agg(uid), '[]'::jsonb) from my_blocks),
    'settings', (select to_jsonb(a) - 'id' from app_settings a),
    -- 정거장 전광판: 다음 막차의 행선지
    'destination', (
      select to_jsonb(dd) from destinations dd, nxt
      where dd.day = (nxt.at at time zone 'Asia/Seoul')::date
    ),
    'films_used', (select count(*) from photos p, me, today where p.user_id = me.uid and p.day = today.kst_day),
    'photos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'path', p.storage_path, 'taken_at', p.taken_at, 'ready_at', p.ready_at,
        'status', p.status, 'train_id', s.train_id, 'hidden', p.hidden
      ) order by p.taken_at desc), '[]'::jsonb)
      from photos p join me on p.user_id = me.uid
      left join train_seats s on s.photo_id = p.id
      where p.taken_at > now() - interval '30 days' and p.status <> 'hidden'
    ),
    'tickets', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', k.id, 'kind', k.kind, 'cycle', k.cycle, 'earned_at', k.earned_at,
        'train_id', k.train_id, 'detail', k.detail
      ) order by k.earned_at), '[]'::jsonb)
      from tickets k, me, nxt
      where k.user_id = me.uid and k.cycle > nxt.at - interval '3 days'
    ),
    'rest', (
      select jsonb_build_object(
        'cycle_ms', coalesce(sum(ps.active_ms) filter (where ps.started_at > nxt.at - interval '1 day'), 0),
        'total_ms', coalesce(sum(ps.active_ms), 0)
      )
      from play_sessions ps, me, nxt
      where ps.user_id = me.uid
    ),
    'trains', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'day', t.day, 'drift', t.drift, 'status', t.status,
        'created_at', t.created_at, 'departed_at', t.departed_at, 'ends_at', t.ends_at,
        'departs_at', t.departs_at, 'arrives_at', t.arrives_at,
        'dest', (select to_jsonb(d) from destinations d where d.day = t.destination),
        'mine', t.id in (select train_id from my_train_ids),
        'seats', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'seat', s.seat, 'user_id', s.user_id, 'nickname', pr.nickname, 'animal', pr.animal, 'color', pr.color,
            'photo_id', case when t.id in (select train_id from my_train_ids) then ph.id end,
            'photo_path', case
              when t.id not in (select train_id from my_train_ids) then null
              when ph.id is null or ph.hidden or s.user_id in (select uid from my_blocks) then null
              else ph.storage_path end,
            'hidden', coalesce(ph.hidden, false),
            'blocked', s.user_id in (select uid from my_blocks),
            'luggage', (
              select coalesce(jsonb_agg(k.kind order by k.earned_at), '[]'::jsonb)
              from tickets k where k.train_id = t.id and k.user_id = s.user_id
            ),
            'reactions', (
              select coalesce(jsonb_object_agg(q.sticker, q.n), '{}'::jsonb)
              from (select r.sticker, count(*) as n from reactions r where r.train_id = t.id and r.seat = s.seat group by r.sticker) q
            ),
            'my_reaction', (select r.sticker from reactions r, me where r.train_id = t.id and r.seat = s.seat and r.user_id = me.uid),
            'comments', (
              select coalesce(jsonb_agg(jsonb_build_object('nickname', gp.nickname, 'body', g.body, 'mine', g.user_id = me.uid) order by g.created_at), '[]'::jsonb)
              from guestbook g join profiles gp on gp.id = g.user_id, me
              where t.id in (select train_id from my_train_ids) and g.train_id = t.id and g.seat = s.seat
                and g.user_id not in (select uid from my_blocks)
            )
          ) order by s.seat), '[]'::jsonb)
          from train_seats s
          join profiles pr on pr.id = s.user_id
          left join photos ph on ph.id = s.photo_id
          where s.train_id = t.id
        ),
        'pokes_sent', (select coalesce(jsonb_agg(k.to_user), '[]'::jsonb) from pokes k, me where k.train_id = t.id and k.from_user = me.uid),
        'ride_again', (select coalesce(jsonb_agg(r.to_user), '[]'::jsonb) from ride_again r, me where r.train_id = t.id and r.from_user = me.uid)
      )), '[]'::jsonb)
      from visible t
    )
  );
$$;

-- ─────────────────────────────── 권한
revoke execute on function public.next_departure(timestamptz) from public, anon, authenticated;
revoke execute on function public.ensure_destination(date) from public, anon, authenticated;
revoke execute on function public.seat_user(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.attach_photo(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.depart_train(uuid) from public, anon, authenticated;
revoke execute on function public.run_departures() from public, anon, authenticated;
revoke execute on function public.run_arrivals() from public, anon, authenticated;
revoke execute on function public.rollroll_tick() from public, anon, authenticated;

revoke execute on function public.record_play(uuid, public.play_kind, integer, boolean, jsonb) from public, anon;
grant execute on function public.record_play(uuid, public.play_kind, integer, boolean, jsonb) to authenticated;
revoke execute on function public.board_tonight() from public, anon;
grant execute on function public.board_tonight() to authenticated;
revoke execute on function public.dev_depart_now(integer) from public, anon;
grant execute on function public.dev_depart_now(integer) to authenticated;
revoke execute on function public.ensure_today() from public, anon;
grant execute on function public.ensure_today() to authenticated;
revoke execute on function public.snapshot() from public, anon;
grant execute on function public.snapshot() to authenticated;

-- ─────────────────────────────── 기존 데이터 · 스케줄
-- 모집 중이던 열차(떠돌이 칸 포함)는 오늘 밤 막차로 함께 떠난다 (빈 열차는 출발 때 치운다)
update public.trains set departs_at = public.next_departure(now()) where status = 'filling';

-- 막차 시각에 늦지 않게 매분 돈다 (같은 이름이면 일정만 바뀐다)
select cron.schedule('rollroll-tick', '* * * * *', $$select public.rollroll_tick()$$);

select public.ensure_today();
