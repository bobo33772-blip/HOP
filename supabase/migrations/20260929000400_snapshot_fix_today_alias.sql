-- snapshot(): today CTE의 열 이름 d가 destinations 별칭 d와 겹쳐 행선지가 NULL이던 문제 수정
create or replace function public.snapshot()
returns jsonb language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as uid),
  today as (select (now() at time zone 'Asia/Seoul')::date as kst_day),
  my_train_ids as (
    select distinct s.train_id from train_seats s, me where s.user_id = me.uid
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
    'settings', (select to_jsonb(a) - 'id' from app_settings a),
    'destination', (select to_jsonb(dd) from destinations dd, today where dd.day = today.kst_day),
    'films_used', (select count(*) from photos p, me, today where p.user_id = me.uid and p.day = today.kst_day),
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

