-- 롤롤 초기 스키마 (기획서 v0.1 기준)
-- 원칙: 클라이언트는 자기 데이터만 쓰고, 좌석 배정·출발·친구 확정처럼 여러 사람에게 영향을 주는 일은
--       security definer 함수(RPC)와 서버 배치에서만 한다.

create extension if not exists pgcrypto;

-- ─────────────────────────────── 프로필
create type public.growth_stage as enum ('mallang', 'banjjak', 'rollroll');

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nickname    text not null check (char_length(nickname) between 1 and 8),
  animal      text not null check (animal in ('bear','pig','chick','rabbit','cat','fox','frog','sheep')),
  color       text not null check (color in ('sky','pink','butter','lilac','peach','mint','cream','gray')),
  xp          integer not null default 0 check (xp >= 0),
  stage       public.growth_stage not null default 'mallang',
  birth_year  smallint not null check (birth_year between 1900 and 2100),
  push_token  text,
  created_at  timestamptz not null default now()
);

-- 만 14세 미만 가입 차단 (MVP 정책). now()는 CHECK에 쓸 수 없어 트리거로 검사한다.
create or replace function public.check_age_14()
returns trigger language plpgsql set search_path = public as $$
begin
  if extract(year from now())::int - new.birth_year < 14 then
    raise exception 'UNDER_14' using hint = '만 14세 이상만 가입할 수 있어요';
  end if;
  return new;
end;
$$;
create trigger profiles_age_14 before insert or update of birth_year on public.profiles
  for each row execute function public.check_age_14();

-- ─────────────────────────────── 행선지 (하루 1개로 시작)
create table public.destinations (
  day     date primary key,
  emoji   text not null,
  name    text not null,
  prompt  text not null
);

-- ─────────────────────────────── 사진
create type public.photo_status as enum ('developing', 'developed', 'boarded', 'hidden');

create table public.photos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null,               -- storage 버킷 'films'의 경로. 업로드 전 기기에서 EXIF 제거
  day          date not null default (now() at time zone 'Asia/Seoul')::date,
  taken_at     timestamptz not null default now(),
  ready_at     timestamptz not null,        -- 현상 완료 시각 (1~3시간 뒤, 서버가 정함)
  status       public.photo_status not null default 'developing',
  created_at   timestamptz not null default now()
);
create index photos_user_day on public.photos (user_id, day);
create index photos_ready on public.photos (ready_at) where status = 'developing';

-- ─────────────────────────────── 열차 = 필름 한 롤
create type public.train_status as enum ('filling', 'departed', 'arrived');

create table public.trains (
  id            uuid primary key default gen_random_uuid(),
  day           date not null,
  destination   date references public.destinations (day),  -- 떠돌이 칸이면 null
  drift         boolean not null default false,
  status        public.train_status not null default 'filling',
  created_at    timestamptz not null default now(),
  departed_at   timestamptz,
  ends_at       timestamptz                                   -- departed_at + 7일
);
create index trains_filling on public.trains (status, day) where status = 'filling';

create table public.train_seats (
  train_id  uuid not null references public.trains (id) on delete cascade,
  seat      smallint not null check (seat between 1 and 8),
  user_id   uuid not null references public.profiles (id) on delete cascade,
  photo_id  uuid not null unique references public.photos (id) on delete cascade,
  boarded_at timestamptz not null default now(),
  primary key (train_id, seat),
  unique (train_id, user_id)             -- 1인 1칸
);

-- ─────────────────────────────── 크루 활동 (앱 안 소통만, 1:1 대화 없음)
create table public.reactions (
  train_id  uuid not null,
  seat      smallint not null,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  sticker   text not null check (sticker in ('❤️','✨','☁️','😆')),
  created_at timestamptz not null default now(),
  primary key (train_id, seat, user_id),
  foreign key (train_id, seat) references public.train_seats (train_id, seat) on delete cascade
);

create table public.guestbook (
  train_id  uuid not null,
  seat      smallint not null,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  body      text not null check (char_length(body) between 1 and 40),
  created_at timestamptz not null default now(),
  primary key (train_id, seat, user_id),
  foreign key (train_id, seat) references public.train_seats (train_id, seat) on delete cascade
);

create table public.pokes (
  train_id  uuid not null references public.trains (id) on delete cascade,
  from_user uuid not null references public.profiles (id) on delete cascade,
  to_user   uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (train_id, from_user, to_user),
  check (from_user <> to_user)
);

-- 또 타요: 본인만 읽고 쓴다. 상대에게는 절대 노출하지 않는다.
create table public.ride_again (
  train_id  uuid not null references public.trains (id) on delete cascade,
  from_user uuid not null references public.profiles (id) on delete cascade,
  to_user   uuid not null references public.profiles (id) on delete cascade,
  primary key (train_id, from_user, to_user),
  check (from_user <> to_user)
);

-- 단골 승객 (user_a < user_b 로 한 줄만 저장)
create table public.friendships (
  user_a  uuid not null references public.profiles (id) on delete cascade,
  user_b  uuid not null references public.profiles (id) on delete cascade,
  since_train uuid references public.trains (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);

create table public.xp_events (
  id       bigint generated always as identity primary key,
  user_id  uuid not null references public.profiles (id) on delete cascade,
  reason   text not null,
  amount   integer not null,
  ref_id   uuid,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────── 안전
create table public.reports (
  id          bigint generated always as identity primary key,
  reporter    uuid not null references public.profiles (id) on delete cascade,
  target_user uuid references public.profiles (id) on delete cascade,
  photo_id    uuid references public.photos (id) on delete cascade,
  reason      text not null,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.blocks (
  blocker uuid not null references public.profiles (id) on delete cascade,
  blocked uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);

-- ─────────────────────────────── 헬퍼
create or replace function public.is_crewmate(p_train uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from train_seats where train_id = p_train and user_id = auth.uid());
$$;

create or replace function public.friend_count(p_user uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from friendships where user_a = p_user or user_b = p_user;
$$;

-- 경험치 적립 + 성장 단계 갱신 (MVP는 반짝볼까지)
create or replace function public.grant_xp(p_user uuid, p_reason text, p_amount int, p_ref uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_xp int; v_level int;
begin
  insert into xp_events (user_id, reason, amount, ref_id) values (p_user, p_reason, p_amount, p_ref);
  update profiles set xp = xp + p_amount where id = p_user returning xp into v_xp;
  v_level := v_xp / 60 + 1;
  if v_level >= 10 and friend_count(p_user) >= 3 then
    update profiles set stage = 'banjjak' where id = p_user and stage = 'mallang';
  end if;
end;
$$;

-- ─────────────────────────────── 촬영: 하루 3컷 제한, 현상 시각은 서버가 정한다
create or replace function public.take_photo(p_storage_path text)
returns public.photos language plpgsql security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Seoul')::date; v_photo photos;
begin
  if (select count(*) from photos where user_id = auth.uid() and day = v_today) >= 3 then
    raise exception 'FILM_EMPTY' using hint = '오늘 필름을 다 썼어요';
  end if;
  insert into photos (user_id, storage_path, day, ready_at)
  values (auth.uid(), p_storage_path, v_today, now() + (60 + random() * 120) * interval '1 minute')
  returning * into v_photo;
  return v_photo;
end;
$$;

-- ─────────────────────────────── 탑승: 잠금으로 9번째 승객을 막는다
create or replace function public.board_train(p_photo uuid, p_train uuid)
returns smallint language plpgsql security definer set search_path = public as $$
declare v_seat smallint; v_count int; v_train trains;
begin
  perform 1 from photos where id = p_photo and user_id = auth.uid() and status = 'developed';
  if not found then raise exception 'PHOTO_NOT_READY'; end if;

  select * into v_train from trains where id = p_train for update;   -- 열차 한 대 단위 직렬화
  if v_train.status <> 'filling' then raise exception 'TRAIN_GONE'; end if;
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
  if v_count = 8 then
    update trains set status = 'departed', departed_at = now(), ends_at = now() + interval '7 days' where id = p_train;
    perform grant_xp(user_id, 'train_departed', 50, p_train) from train_seats where train_id = p_train;
  end if;
  return v_seat;
end;
$$;

-- ─────────────────────────────── 여행 종료: 서로 또 타요를 누른 사람만 친구로 (배치에서 호출)
create or replace function public.close_trip(p_train uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  update trains set status = 'arrived' where id = p_train and status = 'departed';
  for r in
    select a.from_user as ua, a.to_user as ub
    from ride_again a
    join ride_again b on b.train_id = a.train_id and b.from_user = a.to_user and b.to_user = a.from_user
    where a.train_id = p_train and a.from_user < a.to_user
  loop
    insert into friendships (user_a, user_b, since_train) values (r.ua, r.ub, p_train) on conflict do nothing;
    if found then
      perform grant_xp(r.ua, 'friend', 30, p_train);
      perform grant_xp(r.ub, 'friend', 30, p_train);
    end if;
  end loop;
end;
$$;

-- 내부용 함수는 앱에서 직접 부를 수 없게 막는다 (경험치 조작 방지)
revoke execute on function public.grant_xp(uuid, text, int, uuid) from public, anon, authenticated;
revoke execute on function public.close_trip(uuid) from public, anon, authenticated;
revoke execute on function public.take_photo(text) from public, anon;
revoke execute on function public.board_train(uuid, uuid) from public, anon;
grant execute on function public.take_photo(text) to authenticated;
grant execute on function public.board_train(uuid, uuid) to authenticated;

-- ─────────────────────────────── RLS
alter table public.profiles     enable row level security;
alter table public.destinations enable row level security;
alter table public.photos       enable row level security;
alter table public.trains       enable row level security;
alter table public.train_seats  enable row level security;
alter table public.reactions    enable row level security;
alter table public.guestbook    enable row level security;
alter table public.pokes        enable row level security;
alter table public.ride_again   enable row level security;
alter table public.friendships  enable row level security;
alter table public.xp_events    enable row level security;
alter table public.reports      enable row level security;
alter table public.blocks       enable row level security;

-- 프로필: 누구나 아바타·닉네임은 볼 수 있다(열차에 함께 보이므로). 쓰기는 본인만, xp·stage는 함수만.
create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid() and xp = 0 and stage = 'mallang');
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid());
-- xp·stage는 함수로만 바뀐다: 테이블 단위 UPDATE 권한을 거두고 필요한 열만 다시 준다
revoke update on public.profiles from authenticated, anon;
grant update (nickname, animal, color, push_token) on public.profiles to authenticated;

create policy destinations_read on public.destinations for select to authenticated using (true);

-- 사진: 본인 것, 또는 같은 열차에 탄 크루원의 탑승 사진만
create policy photos_read on public.photos for select to authenticated using (
  user_id = auth.uid()
  or exists (select 1 from train_seats s where s.photo_id = photos.id and public.is_crewmate(s.train_id))
);

create policy trains_read on public.trains for select to authenticated using (true);
create policy seats_read on public.train_seats for select to authenticated using (true);

create policy reactions_read on public.reactions for select to authenticated using (public.is_crewmate(train_id));
create policy reactions_write on public.reactions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_crewmate(train_id));

create policy guestbook_read on public.guestbook for select to authenticated using (public.is_crewmate(train_id));
create policy guestbook_write on public.guestbook for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_crewmate(train_id));

create policy pokes_read on public.pokes for select to authenticated using (from_user = auth.uid() or to_user = auth.uid());
create policy pokes_insert on public.pokes for insert to authenticated with check (from_user = auth.uid() and public.is_crewmate(train_id));

-- 또 타요: 내가 누른 것만 보인다
create policy ride_again_own on public.ride_again for all to authenticated
  using (from_user = auth.uid()) with check (from_user = auth.uid() and public.is_crewmate(train_id));

create policy friendships_read on public.friendships for select to authenticated using (auth.uid() in (user_a, user_b));
create policy xp_read on public.xp_events for select to authenticated using (user_id = auth.uid());

create policy reports_insert on public.reports for insert to authenticated with check (reporter = auth.uid());
create policy blocks_own on public.blocks for all to authenticated using (blocker = auth.uid()) with check (blocker = auth.uid());

-- ─────────────────────────────── 사진 저장소 (비공개 버킷, 경로 첫 폴더 = 사용자 id)
insert into storage.buckets (id, name, public) values ('films', 'films', false) on conflict do nothing;

create policy films_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'films' and (storage.foldername(name))[1] = auth.uid()::text);
create policy films_read on storage.objects for select to authenticated
  using (
    bucket_id = 'films' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.photos p join public.train_seats s on s.photo_id = p.id
        where p.storage_path = storage.objects.name and public.is_crewmate(s.train_id)
      )
    )
  );
