-- 기획서 v0.6 2단계: 기분 노선 · 노선 공개 설정 · 성장 기준(여행 횟수 · 쉰 시간 · 함께 탄 말랑볼)
-- 탑승할 때 오늘 기분(날씨)을 고르면 그 기분의 노선 열차에 같은 기분의 사람끼리 탄다(8칸씩).
-- 기분을 안 고르고 막차가 태워 간 말랑볼은 떠돌이행. 노선마다 보상은 같다(차이는 분위기뿐).
-- 성장은 경험치 레벨 대신 여행 횟수 · 쉰 시간(하루 15분까지 인정) · 함께 탄 말랑볼 수로 정한다.

-- ─────────────────────────────── 설정: 성장 기준 (베타에서 조정)
alter table public.app_settings
  add column rest_daily_cap_minutes integer not null default 15 check (rest_daily_cap_minutes between 1 and 1440),
  add column banjjak_trips          integer not null default 10 check (banjjak_trips >= 0),
  add column banjjak_rest_minutes   integer not null default 20 check (banjjak_rest_minutes >= 0),
  add column rollroll_trips         integer not null default 50 check (rollroll_trips >= 0),
  add column rollroll_rest_minutes  integer not null default 90 check (rollroll_rest_minutes >= 0),
  add column rollroll_riders        integer not null default 15 check (rollroll_riders >= 0);

-- ─────────────────────────────── 노선 = 오늘 기분
alter table public.trains
  add column line text check (line in ('sky', 'field', 'shadow', 'rain', 'thunder', 'blanket', 'drift'));
-- 자리마다 그 사람이 고른 기분 (친구 크루 열차처럼 기분이 섞일 때를 위해 따로 둔다). 기본은 본인만 본다.
alter table public.train_seats
  add column mood text check (mood in ('sky', 'field', 'shadow', 'rain', 'thunder', 'blanket'));
create index trains_line_open on public.trains (departs_at, line) where status = 'filling';

-- ─────────────────────────────── 공개 설정: 친구 크루에게 내 노선을 보여줄지 (기본 꺼짐)
alter table public.profiles add column share_line boolean not null default false;
grant update (share_line) on public.profiles to authenticated;

-- ─────────────────────────────── 성장
-- 여행 횟수(다녀온 열차) · 성장에 쓰는 쉰 시간(하루 상한) · 함께 탄 실제 사용자 수(봇 · NPC 제외)
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

-- 기준을 채웠으면 한 단계씩 올린다 (내려가지는 않는다)
create or replace function public.refresh_growth(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g jsonb; a app_settings; v_stage growth_stage := 'mallang';
begin
  select * into a from app_settings where id;
  g := growth_stats(p_user);
  if (g->>'trips')::int >= a.rollroll_trips and (g->>'rest_minutes')::int >= a.rollroll_rest_minutes and (g->>'riders')::int >= a.rollroll_riders then
    v_stage := 'rollroll';
  elsif (g->>'trips')::int >= a.banjjak_trips and (g->>'rest_minutes')::int >= a.banjjak_rest_minutes then
    v_stage := 'banjjak';
  end if;
  update profiles set stage = v_stage where id = p_user and stage < v_stage;
end;
$$;

-- 경험치는 기록만 남기고, 성장은 refresh_growth가 정한다
create or replace function public.grant_xp(p_user uuid, p_reason text, p_amount int, p_ref uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into xp_events (user_id, reason, amount, ref_id) values (p_user, p_reason, p_amount, p_ref);
  update profiles set xp = xp + p_amount where id = p_user;
end;
$$;

-- ─────────────────────────────── 자리 배정: 같은 막차 · 같은 노선끼리
drop function if exists public.seat_user(uuid, timestamptz);
create or replace function public.seat_user(p_user uuid, p_cycle timestamptz, p_line text)
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
    where t.status = 'filling' and t.departs_at = p_cycle and t.line = p_line and not t.drift
      and not exists (select 1 from train_seats s where s.train_id = t.id and is_blocked_pair(s.user_id, p_user))
    order by t.created_at
  loop
    perform 1 from trains where id = v_train and status = 'filling' for update;
    if not found then continue; end if;
    select min(x) into v_seat from generate_series(1, 8) x
    where not exists (select 1 from train_seats where train_id = v_train and seat = x);
    if v_seat is not null then
      insert into train_seats (train_id, seat, user_id) values (v_train, v_seat, p_user);
      return v_train;
    end if;
  end loop;

  insert into trains (day, destination, departs_at, line) values (v_day, v_day, p_cycle, p_line) returning id into v_train;
  insert into train_seats (train_id, seat, user_id) values (v_train, 1, p_user);
  return v_train;
end;
$$;

-- ─────────────────────────────── 탑승: 오늘 기분을 고르면 그 노선으로 (출발 전까지 바꿀 수 있다)
drop function if exists public.board_tonight();
create or replace function public.board_tonight(p_line text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_cycle timestamptz := next_departure(now());
  v_cur uuid;
  v_cur_line text;
  v_photo uuid;
  v_train uuid;
begin
  if v_me is null then raise exception 'NOT_SIGNED_IN'; end if;
  if p_line is null or p_line not in ('sky', 'field', 'shadow', 'rain', 'thunder', 'blanket') then raise exception 'BAD_LINE'; end if;
  if not exists (select 1 from tickets where user_id = v_me and cycle = v_cycle) then
    raise exception 'NO_TICKET' using hint = '먼저 쉼 놀이로 티켓을 받아 주세요';
  end if;

  -- 이미 다른 노선에 탔으면 자리를 옮긴다 (실은 사진은 새 자리로 다시)
  select s.train_id, t.line, s.photo_id into v_cur, v_cur_line, v_photo
  from train_seats s join trains t on t.id = s.train_id
  where s.user_id = v_me and t.departs_at = v_cycle and t.status = 'filling'
  limit 1;
  if v_cur is not null and v_cur_line is distinct from p_line then
    delete from train_seats where train_id = v_cur and user_id = v_me;
    update tickets set train_id = null where user_id = v_me and cycle = v_cycle;
    if v_photo is not null then update photos set status = 'developed' where id = v_photo; end if;
    v_cur := null;
  end if;

  v_train := coalesce(v_cur, seat_user(v_me, v_cycle, p_line));
  update train_seats set mood = p_line where train_id = v_train and user_id = v_me;
  update tickets set train_id = v_train where user_id = v_me and cycle = v_cycle and train_id is null;
  perform attach_photo(v_me, v_train, v_cycle);
  return jsonb_build_object('train_id', v_train, 'line', p_line, 'departs_at', v_cycle);
end;
$$;

-- ─────────────────────────────── 막차: 기분을 안 고른 말랑볼은 떠돌이행으로
create or replace function public.run_departures()
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_train uuid;
begin
  for r in
    select distinct tk.user_id, tk.cycle from tickets tk
    where tk.train_id is null and tk.cycle <= now() and tk.cycle > now() - interval '1 day'
  loop
    v_train := seat_user(r.user_id, r.cycle, 'drift');
    update tickets set train_id = v_train where user_id = r.user_id and cycle = r.cycle and train_id is null;
    perform attach_photo(r.user_id, v_train, r.cycle);
  end loop;

  for r in select id from trains where status = 'filling' and departs_at <= now() loop
    perform depart_train(r.id);
  end loop;
end;
$$;

-- 도착하면 여행 횟수가 늘었으니 성장도 확인
create or replace function public.run_arrivals()
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_riders uuid[]; v_name text;
begin
  for r in
    select t.id, t.line, coalesce(d.name, '떠돌이') as dest, t.arrives_at
    from trains t left join destinations d on d.day = t.destination
    where t.status = 'departed' and coalesce(t.arrives_at, t.ends_at) <= now()
  loop
    perform close_trip(r.id);
    select array_agg(user_id) into v_riders from train_seats where train_id = r.id;
    perform refresh_growth(u) from unnest(coalesce(v_riders, '{}'::uuid[])) as u;
    if r.arrives_at is not null then
      v_name := case r.line
        when 'sky' then '하늘행' when 'field' then '들판행' when 'shadow' then '그림자행'
        when 'rain' then '빗소리행' when 'thunder' then '천둥행' when 'blanket' then '이불행'
        when 'drift' then '떠돌이행' else r.dest end;
      perform send_push(v_riders, '☀️ ' || v_name || ' 여행에서 말랑볼이 돌아왔어요', '여행 이야기를 들으러 가 볼까요?', jsonb_build_object('url', '/crew/' || r.id));
    end if;
  end loop;
end;
$$;

-- 출발 알림도 노선 이름으로
create or replace function public.depart_train(p_train uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_riders uuid[]; v_dest text; v_travel int; v_arrive timestamptz; v_n int;
begin
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
  select case t.line
      when 'sky' then '하늘행' when 'field' then '들판행' when 'shadow' then '그림자행'
      when 'rain' then '빗소리행' when 'thunder' then '천둥행' when 'blanket' then '이불행'
      when 'drift' then '떠돌이행' else coalesce(d.name, '떠돌이') end
  into v_dest
  from trains t left join destinations d on d.day = t.destination where t.id = p_train;
  perform send_push(
    v_riders,
    '🚂 ' || v_dest || ' 막차가 출발했어요',
    case when v_n > 1 then v_n || '명의 말랑볼이 함께 떠났어요. ' else '말랑볼이 여행을 떠났어요. ' end
      || '도착은 ' || to_char(v_arrive at time zone 'Asia/Seoul', 'FMMM"월" FMDD"일" HH24:MI') || '이에요.',
    jsonb_build_object('url', '/crew/' || p_train)
  );
end;
$$;

-- 오늘 밤 막차를 미리 세워 두지 않는다 (노선은 탈 사람이 고른다). 행선지 날짜만 준비.
create or replace function public.ensure_today()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform ensure_destination((now() at time zone 'Asia/Seoul')::date);
  perform ensure_destination((next_departure(now()) at time zone 'Asia/Seoul')::date);
end;
$$;

-- 놀이를 기록할 때마다 쉰 시간이 늘었으니 성장 확인 (record_play 끝에 붙인다)
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

  update play_sessions set
    active_ms = least(greatest(active_ms, coalesce(p_active_ms, 0)),
                      (extract(epoch from now() - started_at) * 1000)::int + 5000),
    filled = filled or coalesce(p_filled, false),
    detail = coalesce(p_detail, detail),
    updated_at = now()
  where id = p_session
  returning * into v_s;

  update tickets set detail = v_s.detail where session_id = p_session and v_s.detail is not null;

  select min_play_seconds into v_min from app_settings where id;
  if v_s.filled and v_s.active_ms >= v_min * 1000 then
    insert into tickets (user_id, kind, cycle, session_id, detail)
    values (v_me, p_kind, v_cycle, p_session, v_s.detail)
    on conflict (user_id, kind, cycle) do nothing
    returning id into v_ticket;
    if v_ticket is not null then
      perform grant_xp(v_me, 'ticket', 10, v_ticket);
      select s.train_id into v_train
      from train_seats s join trains t on t.id = s.train_id
      where s.user_id = v_me and t.departs_at = v_cycle
      limit 1;
      if v_train is not null then update tickets set train_id = v_train where id = v_ticket; end if;
    end if;
  end if;

  perform refresh_growth(v_me);

  return jsonb_build_object(
    'ticket', v_ticket is not null,
    'has_ticket', exists (select 1 from tickets where user_id = v_me and kind = p_kind and cycle = v_cycle),
    'active_ms', v_s.active_ms,
    'cycle', v_cycle
  );
end;
$$;

-- 테스트 도구: 기분을 안 골랐으면 떠돌이행으로 태워서 지금 출발
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
    v_train := seat_user(v_me, v_cycle, 'drift');
    update tickets set train_id = v_train where user_id = v_me and cycle = v_cycle and train_id is null;
    perform attach_photo(v_me, v_train, v_cycle);
  end if;

  select min(x) into v_seat from generate_series(1, 8) x
  where not exists (select 1 from train_seats where train_id = v_train and seat = x);
  if v_seat is not null then
    insert into auth.users (id, instance_id, aud, role, email)
    values (v_bot, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bot-' || v_bot || '@rollroll.test');
    insert into profiles (id, nickname, animal, color, birth_year, agreed_at)
    values (v_bot, '테스트봇' || v_seat, v_animals[v_i], v_colors[v_i], 2000, now());
    insert into train_seats (train_id, seat, user_id, mood) values (v_train, v_seat, v_bot, (select line from trains where id = v_train and line <> 'drift'));
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

-- ─────────────────────────────── snapshot: 노선 · 오늘 밤 노선별 인원 · 성장
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
    'destination', (
      select to_jsonb(dd) from destinations dd, nxt
      where dd.day = (nxt.at at time zone 'Asia/Seoul')::date
    ),
    'growth', (select public.growth_stats(me.uid) from me),
    -- 오늘 밤 노선별 탑승 인원 (같은 기분의 사람이 몇 명인지)
    'tonight_lines', (
      select coalesce(jsonb_object_agg(q.line, q.n), '{}'::jsonb)
      from (
        select t.line, count(s.seat) as n
        from trains t join train_seats s on s.train_id = t.id, nxt
        where t.status = 'filling' and t.departs_at = nxt.at and t.line is not null
        group by t.line
      ) q
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
        'id', t.id, 'day', t.day, 'drift', t.drift, 'status', t.status, 'line', t.line,
        'created_at', t.created_at, 'departed_at', t.departed_at, 'ends_at', t.ends_at,
        'departs_at', t.departs_at, 'arrives_at', t.arrives_at,
        'dest', (select to_jsonb(d) from destinations d where d.day = t.destination),
        'mine', true,
        'seats', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'seat', s.seat, 'user_id', s.user_id, 'nickname', pr.nickname, 'animal', pr.animal, 'color', pr.color,
            -- 기분은 본인 것만, 다른 사람은 노선 공개를 켠 경우에만
            'mood', case when s.user_id = (select uid from me) or pr.share_line then s.mood end,
            'photo_id', ph.id,
            'photo_path', case
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
              where g.train_id = t.id and g.seat = s.seat and g.user_id not in (select uid from my_blocks)
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
revoke execute on function public.growth_stats(uuid) from public, anon, authenticated;
revoke execute on function public.refresh_growth(uuid) from public, anon, authenticated;
revoke execute on function public.grant_xp(uuid, text, int, uuid) from public, anon, authenticated;
revoke execute on function public.seat_user(uuid, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.run_departures() from public, anon, authenticated;
revoke execute on function public.run_arrivals() from public, anon, authenticated;
revoke execute on function public.depart_train(uuid) from public, anon, authenticated;
revoke execute on function public.board_tonight(text) from public, anon;
grant execute on function public.board_tonight(text) to authenticated;
revoke execute on function public.record_play(uuid, public.play_kind, integer, boolean, jsonb) from public, anon;
grant execute on function public.record_play(uuid, public.play_kind, integer, boolean, jsonb) to authenticated;
revoke execute on function public.dev_depart_now(integer) from public, anon;
grant execute on function public.dev_depart_now(integer) to authenticated;
revoke execute on function public.ensure_today() from public, anon;
grant execute on function public.ensure_today() to authenticated;
revoke execute on function public.snapshot() from public, anon;
grant execute on function public.snapshot() to authenticated;

-- 지금 기준으로 모두의 성장 단계를 한 번 맞춘다 (내려가지는 않는다)
select public.refresh_growth(id) from public.profiles;
