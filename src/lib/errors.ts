/** 서버 오류 코드를 사용자 문장으로 */
export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  if (msg.includes('FILM_EMPTY')) return '오늘 필름을 다 썼어요.';
  if (msg.includes('NO_TICKET')) return '먼저 쉼 놀이로 티켓을 받아 주세요.';
  if (msg.includes('BAD_SESSION')) return '놀이 기록을 저장하지 못했어요. 다시 시작해 주세요.';
  if (msg.includes('TRAIN_FULL')) return '방금 마지막 칸이 찼어요. 다른 열차를 골라 주세요.';
  if (msg.includes('TRAIN_UNAVAILABLE')) return '이 열차는 지금 탈 수 없어요. 다른 열차를 골라 주세요.';
  if (msg.includes('DEV_TOOLS_OFF')) return '테스트 도구가 꺼져 있어요.';
  if (msg.includes('TRAIN_GONE')) return '이 열차는 이미 출발했어요.';
  if (msg.includes('ALREADY_ON_BOARD')) return '이 열차에는 이미 탔어요.';
  if (msg.includes('PHOTO_NOT_READY')) return '아직 현상 중인 사진이에요.';
  if (msg.includes('UNDER_14')) return '만 14세 이상만 가입할 수 있어요.';
  if (msg.includes('anonymous_provider_disabled') || msg.includes('Anonymous sign-ins are disabled'))
    return '서버에서 익명 로그인이 꺼져 있어요. Supabase 설정에서 켜 주세요.';
  if (msg.includes('already been registered') || msg.includes('email_exists') || msg.includes('already registered'))
    return '이미 다른 롤롤 계정에 연결된 이메일이에요. 처음 화면의 "이어하기"로 불러와 주세요.';
  if (msg.includes('Signups not allowed for otp') || msg.includes('otp_disabled') || msg.includes('User not found'))
    return '이 이메일로 연결된 롤롤 계정이 없어요.';
  if (msg.includes('Token has expired') || msg.includes('otp_expired') || msg.includes('invalid'))
    return '코드가 맞지 않거나 만료됐어요. 다시 받아 주세요.';
  if (msg.includes('rate limit') || msg.includes('over_email_send_rate_limit') || msg.includes('For security purposes'))
    return '메일을 너무 자주 보냈어요. 잠시 뒤에 다시 시도해 주세요.';
  if (msg.includes('Error sending') || msg.includes('not authorized'))
    return '인증 메일을 보내지 못했어요. 잠시 뒤에 다시 시도해 주세요.';
  if (msg.includes('Network request failed') || msg.includes('Failed to fetch')) return '인터넷 연결을 확인해 주세요.';
  return '잠시 문제가 생겼어요. 다시 시도해 주세요.';
}
