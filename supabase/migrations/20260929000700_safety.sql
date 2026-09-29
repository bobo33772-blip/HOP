-- 안전 기능: 신고 · 자동 숨김 · 차단 · 약관 동의 · 운영자 검토 목록
-- 앱스토어 UGC 요건(신고, 차단, 부적절 콘텐츠 처리, 약관 동의)을 만족시키기 위한 최소 구성

-- ─────────────────────────────── 약관(롤롤 약속) 동의 시각
alter table public.profiles add column agreed_at timestamptz;

-- ─────────────────────────────── 신고
alter table public.reports
  add column train_id uuid references public.trains (id) on delete set null,
  add constraint reports_reason check (reason in ('inappropriate', 'privacy', 'harassment', 'other'));
-- 같은 사람이 같은 사진을 여러 번 신고해 숨김을 유도하지 못하게
create unique index reports_once on public.reports (reporter, photo_id) where photo_id is not null;

alter table public.photos add column hidden boolean not null default false;

-- 서로 다른 3명이 신고한 사진은 자동으로 숨기고 운영자 검토로 넘긴다
create or replace function public.auto_hide_reported()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.photo_id is not null and
     (select count(distinct reporter) from reports where photo_id = new.photo_id and resolved_at is null) >= 3 then
    update photos set hidden = true where id = new.photo_id;
  end if;
  return new;
end;
$$;
create trigger reports_auto_hide after insert on public.reports
  for each row execute function public.auto_hide_reported();

-- 신고는 같은 열차 크루원만 할 수 있다
drop policy reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter = auth.uid() and (train_id is null or public.is_crewmate(train_id)));

-- ─────────────────────────────── 차단
create or replace function public.is_blocked_pair(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a));
$$;
revoke execute on function public.is_blocked_pair(uuid, uuid) from public, anon;
grant execute on function public.is_blocked_pair(uuid, uuid) to authenticated;

-- 차단 관계면 인사·또 타요를 보낼 수 없다
drop policy pokes_insert on public.pokes;
create policy pokes_insert on public.pokes for insert to authenticated
  with check (from_user = auth.uid() and public.is_crewmate(train_id) and not public.is_blocked_pair(from_user, to_user));

drop policy ride_again_own on public.ride_again;
create policy ride_again_own on public.ride_again for all to authenticated
  using (from_user = auth.uid())
  with check (from_user = auth.uid() and public.is_crewmate(train_id) and not public.is_blocked_pair(from_user, to_user));

-- 차단 관계인 사람이 탄 열차에는 탈 수 없다 (누가 차단했는지는 알려주지 않는다)
create or replace function public.board_train(p_photo uuid, p_train uuid)
returns smallint language plpgsql security definer set search_path = public as $$
declare v_seat smallint; v_count int; v_train trains;
begin
  perform 1 from photos
  where id = p_photo and user_id = auth.uid() and not hidden
    and (status = 'developed' or (status = 'developing' and ready_at <= now()));
  if not found then raise exception 'PHOTO_NOT_READY'; end if;

  select * into v_train from trains where id = p_train for update;
  if v_train.id is null or v_train.status <> 'filling' then raise exception 'TRAIN_GONE'; end if;
  if exists (select 1 from train_seats where train_id = p_train and user_id = auth.uid()) then
    raise exception 'ALREADY_ON_BOARD';
  end if;
  if exists (select 1 from train_seats s where s.train_id = p_train and is_blocked_pair(s.user_id, auth.uid())) then
    raise exception 'TRAIN_UNAVAILABLE';
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

-- ─────────────────────────────── snapshot: 숨김·차단 반영, 좌석에 photo_id 포함
create or replace function public.snapshot()
returns jsonb language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as uid),
  today as (select (now() at time zone 'Asia/Seoul')::date as kst_day),
  my_train_ids as (
    select distinct s.train_id from train_seats s, me where s.user_id = me.uid
  ),
  my_blocks as (
    select b.blocked as uid from blocks b, me where b.blocker = me.uid
  ),
  visible as (
    select t.* from trains t, today
    where t.status = 'filling' and (t.drift or t.destination = today.kst_day)
    union
    select t.* from trains t where t.id in (select train_id from my_train_ids)
  )
  select jsonb_build_object(
    'now', now(),
    'profile', (select to_jsonb(p) - 'push_token' - 'birth_year' from profiles p, me where p.id = me.uid),
    'friends', (
      select coalesce(jsonb_agg(case when f.user_a = me.uid then f.user_b else f.user_a end), '[]'::jsonb)
      from friendships f, me where me.uid in (f.user_a, f.user_b)
    ),
    'blocked', (select coalesce(jsonb_agg(uid), '[]'::jsonb) from my_blocks),
    'settings', (select to_jsonb(a) - 'id' from app_settings a),
    'destination', (select to_jsonb(dd) from destinations dd, today where dd.day = today.kst_day),
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
    'trains', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'day', t.day, 'drift', t.drift, 'status', t.status,
        'created_at', t.created_at, 'departed_at', t.departed_at, 'ends_at', t.ends_at,
        'dest', (select to_jsonb(d) from destinations d where d.day = t.destination),
        'mine', t.id in (select train_id from my_train_ids),
        'seats', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'seat', s.seat, 'user_id', s.user_id, 'nickname', pr.nickname, 'animal', pr.animal, 'color', pr.color,
            'photo_id', case when t.id in (select train_id from my_train_ids) then ph.id end,
            'photo_path', case
              when t.id not in (select train_id from my_train_ids) then null
              when ph.hidden or s.user_id in (select uid from my_blocks) then null
              else ph.storage_path end,
            'hidden', ph.hidden,
            'blocked', s.user_id in (select uid from my_blocks),
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
          from train_seats s join profiles pr on pr.id = s.user_id join photos ph on ph.id = s.photo_id
          where s.train_id = t.id
        ),
        'pokes_sent', (select coalesce(jsonb_agg(k.to_user), '[]'::jsonb) from pokes k, me where k.train_id = t.id and k.from_user = me.uid),
        'ride_again', (select coalesce(jsonb_agg(r.to_user), '[]'::jsonb) from ride_again r, me where r.train_id = t.id and r.from_user = me.uid)
      )), '[]'::jsonb)
      from visible t
    )
  );
$$;

-- 숨김 사진은 크루원도 저장소에서 읽을 수 없게
drop policy films_read on storage.objects;
create policy films_read on storage.objects for select to authenticated
  using (
    bucket_id = 'films' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.photos p join public.train_seats s on s.photo_id = p.id
        where p.storage_path = storage.objects.name and not p.hidden and public.is_crewmate(s.train_id)
      )
    )
  );

-- ─────────────────────────────── 운영자 검토 목록 (대시보드 SQL 편집기·Table Editor에서만 본다)
create view public.moderation_queue with (security_invoker = true) as
select
  p.id as photo_id, p.storage_path, p.hidden, owner.nickname as owner,
  count(distinct r.reporter) as reporters,
  array_agg(distinct r.reason) as reasons,
  max(r.created_at) as last_reported_at
from reports r
join photos p on p.id = r.photo_id
join profiles owner on owner.id = p.user_id
where r.resolved_at is null
group by p.id, owner.nickname
order by count(distinct r.reporter) desc, max(r.created_at) desc;
revoke all on public.moderation_queue from anon, authenticated;
