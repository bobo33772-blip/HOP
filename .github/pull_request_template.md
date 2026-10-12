<!-- 제목 예: [C-04] 참여 신청 시트 · 카드 번호는 작업카드(기획서 v1.2) 기준, 한 PR = 한 카드 -->

## 작업카드

- 카드: <!-- 예: C-04 참여 신청 시트 -->
- [ ] 작업카드에서 이 카드 상태를 "검토"로 바꿨어요

## 바꾼 것

<!-- 무엇을 왜 바꿨는지 2~3줄 -->

## 다 됐다는 기준 (작업카드에서 복사)

- [ ]
- [ ]

## 화면

<!-- 바뀐 화면 스크린샷이나 짧은 영상. 데모: corepack pnpm dev -p 3100 → http://localhost:3100/demo -->

## 확인한 것

- [ ] `corepack pnpm typecheck` 통과
- [ ] `corepack pnpm test` 통과
- [ ] `corepack pnpm build` 통과
- [ ] `/demo`에서 바뀐 화면을 직접 눌러 봤어요

## 같이 쓰는 파일

<!-- 건드렸다면 체크하고 이유를 적어 주세요. 리뷰 때 먼저 봐요. -->

- [ ] `src/db/schema.ts` · `drizzle/` (PR 제목에 `[DB]`, 머지 직전 `main`을 받아 `pnpm db:generate` 다시 실행)
- [ ] `src/app/globals.css` (`:root` 디자인 토큰은 바꾸지 않아요)
- [ ] `src/app/console/provider.tsx` · `types.ts` · `format.ts`
- [ ] `public/widget.js`
- [ ] `src/lib/core/*` (규칙을 바꾸면 `tests/core.test.ts`도 같이)

## 지켜야 할 것

- [ ] 비밀값(`.env*`, 카페24 Client Secret, `TOKEN_ENC_KEY`, `ADMIN_TOKEN`)이 없어요 — 공개 저장소예요
- [ ] 고객 전화번호 · 이름 · 주소를 저장하지 않아요
- [ ] 광고 문자 규칙((광고) 표기 · 밤 9시~아침 8시 발송 금지 · 수신동의자만)을 지켜요
