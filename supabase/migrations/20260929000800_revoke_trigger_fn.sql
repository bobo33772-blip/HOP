-- 트리거 전용 함수는 API로 호출할 수 없게 (트리거 실행에는 영향 없음)
revoke execute on function public.auto_hide_reported() from public, anon, authenticated;
revoke execute on function public.check_age_14() from public, anon, authenticated;
