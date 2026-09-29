-- 테스트 봇과 테스트 계정(@rollroll.test), 프로필 없이 남은 익명 계정을 지운다.
-- 연결된 프로필·사진 기록·좌석·반응은 외래 키로 함께 지워진다(사진 파일은 저장소에 남을 수 있음).
-- 먼저 아래 select로 지울 대상을 확인한 뒤 delete를 실행할 것.
select u.id, u.email, p.nickname
from auth.users u left join public.profiles p on p.id = u.id
where u.email like '%@rollroll.test'
   or (u.is_anonymous and p.id is null);

-- delete from auth.users u
-- where u.email like '%@rollroll.test'
--    or (u.is_anonymous and not exists (select 1 from public.profiles p where p.id = u.id));

-- 좌석이 모두 사라진 지난 열차 정리
-- delete from public.trains t
-- where t.status <> 'filling' and not exists (select 1 from public.train_seats s where s.train_id = t.id);
