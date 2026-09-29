-- 내 방 꾸미기 배치 (슬롯 → 아이템 id). 꾸미기는 외형만 바꾸므로 본인이 직접 저장한다.
alter table public.profiles
  add column room jsonb not null default '{}'::jsonb
  check (jsonb_typeof(room) = 'object' and pg_column_size(room) < 2048);

grant update (room) on public.profiles to authenticated;
