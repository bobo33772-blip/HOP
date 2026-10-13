// 카페24에서 찜꽁을 실행 · 설치하다 실패했을 때 첫 화면(/)에 보여 줄 안내 (#28, 기획서 정할 것 6).
// 라우트는 JSON 대신 첫 화면으로 보내고, 주소에는 정해 둔 코드만 넘긴다. 화면 문구는 여기 있는 것만 보여 준다
// (주소에 아무 글이나 넣어 판매자 화면에 띄우지 못하게).

export const LAUNCH_ERRORS = {
  launch: "카페24 연결을 확인하지 못했어요. 카페24 관리자 › 앱 › 마이앱에서 찜꽁을 다시 실행해 주세요.",
  denied: "카페24 권한 동의를 마치지 않아 설치되지 않았어요. 설치 링크를 다시 열고 동의해 주세요.",
  install_retry: "설치가 끝나지 않았어요. 설치 링크를 다시 열거나, 카페24 관리자 › 앱 › 마이앱에서 찜꽁을 다시 실행해 주세요.",
  install_failed: "카페24와 연결하지 못했어요. 잠시 뒤 카페24 관리자에서 찜꽁을 다시 실행해 주세요. 계속되면 찜꽁 운영팀에 알려 주세요.",
  bad_mall: "쇼핑몰 ID가 올바르지 않아요. 받은 설치 링크를 다시 확인해 주세요.",
  demo: "데모 모드에서는 설치할 필요가 없어요. 아래 '데모 쇼핑몰로 시작하기'를 눌러 주세요.",
} as const;

export type LaunchError = keyof typeof LAUNCH_ERRORS;

/** 첫 화면으로 보내는 주소 (예: /?error=launch) */
export const launchErrorUrl = (base: string, code: LaunchError) => new URL(`/?error=${code}`, base);

/** 주소의 error 값 → 안내 문구. 모르는 값이면 null */
export function launchErrorMessage(code: unknown): string | null {
  return typeof code === "string" && Object.hasOwn(LAUNCH_ERRORS, code) ? LAUNCH_ERRORS[code as LaunchError] : null;
}
