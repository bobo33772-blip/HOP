-- 출시(베타) 설정으로 전환한다. 대시보드 SQL 편집기에서 실행.
-- 되돌리려면 settings-test.sql
update public.app_settings set
  films_per_day       = 3,
  develop_min_minutes = 1,
  develop_max_minutes = 5,
  cold_start          = true,
  min_departure_seats = 4,
  cold_wait_minutes   = 720,   -- 12시간
  drift_after_hours   = 24,
  dev_tools           = false, -- 봇 출발 테스트 도구 끄기
  last_train_time     = '23:30', -- 막차 시각 (KST)
  travel_minutes      = 480,     -- 여행 8시간 (23:30 출발 → 07:30 도착)
  min_play_seconds    = 15,      -- 놀이 한 판 최소 시간(초). 게이지는 보통 1분 안팎에 찬다
  updated_at          = now()
where id
returning films_per_day, develop_min_minutes, develop_max_minutes, dev_tools, last_train_time, travel_minutes, min_play_seconds;
