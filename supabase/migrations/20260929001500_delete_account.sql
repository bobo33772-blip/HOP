-- 앱 안에서 계정 삭제 (Apple·Google 스토어 필수 요건)
-- 앱이 먼저 저장소의 내 사진 파일을 지운 뒤 이 함수를 부른다.
-- auth.users를 지우면 프로필·사진 기록·좌석·반응·방명록·신고·차단이 외래 키로 함께 지워진다.

-- 내 폴더의 사진 파일은 내가 지울 수 있다
create policy films_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'films' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'NOT_SIGNED_IN'; end if;
  delete from auth.users where id = v_me;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
