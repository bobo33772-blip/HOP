-- 롤롤(3단계) 성장 열기: Lv.25 + 친구 8명 (앱 stageFor와 같은 기준)
create or replace function public.grant_xp(p_user uuid, p_reason text, p_amount int, p_ref uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_xp int; v_level int; v_friends int;
begin
  insert into xp_events (user_id, reason, amount, ref_id) values (p_user, p_reason, p_amount, p_ref);
  update profiles set xp = xp + p_amount where id = p_user returning xp into v_xp;
  v_level := v_xp / 60 + 1;
  v_friends := friend_count(p_user);
  if v_level >= 25 and v_friends >= 8 then
    update profiles set stage = 'rollroll' where id = p_user and stage <> 'rollroll';
  elsif v_level >= 10 and v_friends >= 3 then
    update profiles set stage = 'banjjak' where id = p_user and stage = 'mallang';
  end if;
end;
$$;

revoke execute on function public.grant_xp(uuid, text, int, uuid) from public, anon, authenticated;
