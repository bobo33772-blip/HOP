-- friend_count는 서버 내부(grant_xp)에서만 쓴다
revoke execute on function public.friend_count(uuid) from public, anon, authenticated;
-- is_crewmate는 RLS 정책이 로그인 사용자 권한으로 호출하므로 authenticated만 남긴다
revoke execute on function public.is_crewmate(uuid) from public, anon;
grant execute on function public.is_crewmate(uuid) to authenticated;
