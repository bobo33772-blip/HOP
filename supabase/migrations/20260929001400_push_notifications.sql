-- 서버 푸시 알림: Expo Push API로 보낸다 (pg_net 비동기 HTTP)
-- 열차 출발 · 말랑 꾹 인사 · 새 단골 승객
create extension if not exists pg_net with schema extensions;

create or replace function public.send_push(p_users uuid[], p_title text, p_body text, p_data jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_messages jsonb;
begin
  select jsonb_agg(jsonb_build_object(
    'to', p.push_token, 'title', p_title, 'body', p_body, 'data', p_data,
    'sound', 'default', 'channelId', 'default', 'priority', 'high'
  ))
  into v_messages
  from profiles p
  where p.id = any(p_users) and p.push_token is not null and p.push_token like 'ExponentPushToken%';

  if v_messages is null then return; end if;

  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := v_messages,
    headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
  );
exception when others then
  -- 알림 실패가 출발·인사 같은 본래 동작을 막지 않게 한다
  raise warning 'send_push failed: %', sqlerrm;
end;
$$;
revoke execute on function public.send_push(uuid[], text, text, jsonb) from public, anon, authenticated;

-- 열차 출발 알림
create or replace function public.depart_train(p_train uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_riders uuid[]; v_dest text;
begin
  update trains set status = 'departed', departed_at = now(), ends_at = now() + interval '7 days'
  where id = p_train and status = 'filling';
  if not found then return; end if;

  perform grant_xp(user_id, 'train_departed', 50, p_train) from train_seats where train_id = p_train;

  select array_agg(user_id) into v_riders from train_seats where train_id = p_train;
  select coalesce(d.name, '떠돌이') into v_dest from trains t left join destinations d on d.day = t.destination where t.id = p_train;
  perform send_push(
    v_riders,
    '🚂 ' || v_dest || ' 열차가 출발했어요',
    coalesce(array_length(v_riders, 1), 0) || '명의 롤 크루가 탄생했어요. 크루 앨범에서 인사해 보세요.',
    jsonb_build_object('url', '/crew/' || p_train)
  );
end;
$$;
revoke execute on function public.depart_train(uuid) from public, anon, authenticated;

-- 말랑 꾹 인사 알림
create or replace function public.notify_poke()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_from text;
begin
  select nickname into v_from from profiles where id = new.from_user;
  perform send_push(
    array[new.to_user],
    v_from || '님이 말랑 꾹 인사를 보냈어요 👉',
    '크루 앨범에서 인사를 돌려줘 보세요.',
    jsonb_build_object('url', '/crew/' || new.train_id)
  );
  return new;
end;
$$;
revoke execute on function public.notify_poke() from public, anon, authenticated;
create trigger pokes_notify after insert on public.pokes for each row execute function public.notify_poke();

-- 새 단골 승객(친구) 알림
create or replace function public.notify_friendship()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform send_push(
    array[new.user_a, new.user_b],
    '새 단골 승객이 생겼어요 💞',
    '서로 "또 타요"를 골랐어요. 내 방에서 성장을 확인해 보세요.',
    jsonb_build_object('url', '/room')
  );
  return new;
end;
$$;
revoke execute on function public.notify_friendship() from public, anon, authenticated;
create trigger friendships_notify after insert on public.friendships for each row execute function public.notify_friendship();
