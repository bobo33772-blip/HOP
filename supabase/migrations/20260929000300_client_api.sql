-- 앱 연결용 API
-- 1) 현상 시각이 지난 사진은 5분 배치를 기다리지 않고 바로 탈 수 있게 한다
-- 2) snapshot(): 앱이 화면을 그리는 데 필요한 데이터를 한 번에 돌려준다 (본인 권한 범위만)

create or replace function public.board_train(p_photo uuid, p_train uuid)
returns smallint language plpgsql security definer set search_path = public as $$
declare v_seat smallint; v_count int; v_train trains;
begin
  perform 1 from photos
  where id = p_photo and user_id = auth.uid()
    and (status = 'developed' or (status = 'developing' and ready_at <= now()));
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

create or replace function public.snapshot()
returns jsonb language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as uid),
  today as (select (now() at time zone 'Asia/Seoul')::date as d),
  my_train_ids as (
    select distinct s.train_id from train_seats s, me where s.user_id = me.uid
  ),
  visible as (
    select t.* from trains t, today
    where t.status = 'filling' and (t.drift or t.destination = today.d)
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
    'settings', (select to_jsonb(a) - 'id' from app_settings a),
    'destination', (select to_jsonb(d) from destinations d, today where d.day = today.d),
    'films_used', (select count(*) from photos p, me, today where p.user_id = me.uid and p.day = today.d),
    'photos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'path', p.storage_path, 'taken_at', p.taken_at, 'ready_at', p.ready_at,
        'status', p.status, 'train_id', s.train_id
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
            -- 사진 경로는 같은 열차에 탄 사람에게만
            'photo_path', case when t.id in (select train_id from my_train_ids) then ph.storage_path end,
            'reactions', (
              select coalesce(jsonb_object_agg(q.sticker, q.n), '{}'::jsonb)
              from (select r.sticker, count(*) as n from reactions r where r.train_id = t.id and r.seat = s.seat group by r.sticker) q
            ),
            'my_reaction', (select r.sticker from reactions r, me where r.train_id = t.id and r.seat = s.seat and r.user_id = me.uid),
            'comments', (
              select coalesce(jsonb_agg(jsonb_build_object('nickname', gp.nickname, 'body', g.body, 'mine', g.user_id = me.uid) order by g.created_at), '[]'::jsonb)
              from guestbook g join profiles gp on gp.id = g.user_id, me
              where t.id in (select train_id from my_train_ids) and g.train_id = t.id and g.seat = s.seat
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

revoke execute on function public.snapshot() from public, anon;
grant execute on function public.snapshot() to authenticated;
