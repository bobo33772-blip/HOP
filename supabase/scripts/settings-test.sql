-- 개발·테스트 설정 (빠르게 돌려 보기). 출시 전에는 settings-release.sql로 되돌린다.
update public.app_settings set
  films_per_day       = 30,
  develop_min_minutes = 0,
  develop_max_minutes = 0,
  cold_start          = true,
  min_departure_seats = 2,
  cold_wait_minutes   = 10,
  drift_after_hours   = 24,
  dev_tools           = true,
  last_train_time     = '23:30',
  travel_minutes      = 480,
  min_play_seconds    = 10,    -- 놀이 한 판 최소 시간(초). 테스트는 짧게
  updated_at          = now()
where id
returning films_per_day, develop_min_minutes, develop_max_minutes, dev_tools, last_train_time, travel_minutes, min_play_seconds;
