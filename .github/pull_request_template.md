<!-- 제목 예: [공구 상세] 문자 표 줄바꿈 고치기 · 하루치 정도로 작게, 자주 올려요 -->

## 무엇을

- 이슈: Closes #<!-- 이슈 번호. 없으면 이 줄 전체를 지워요 -->
- 작업카드: <!-- 있으면 카드 이름. 예: S-09 공구 상세 · 진행 중 -->

## 바꾼 것

<!-- 무엇을 왜 바꿨는지 2~3줄 -->

## 정한 것

<!-- 고치면서 정한 규칙을 한 줄씩 적고, 같은 줄을 jjim-gonggu/app/docs/DESIGN.md에도 PR 번호와 함께 옮겨 적어요. 없으면 "없음" -->
<!-- 예: 확정 수량은 초록(--success) · 상태 이름은 "모집 중"으로 통일 · 날짜는 10/17(토) 14:00 -->

- [ ] **새 기능이면** `jjim-gonggu/app/docs/features/`에 기능 기록(문제 · 결정 · 안 한 것 · 가정 · 성공 확인)을 썼어요. 버그 · 문구 수정이면 지워요

## 다 됐다는 기준 (이슈나 작업카드에서 복사)

- [ ]
- [ ]

## 화면

<!-- 바뀌기 전/후 스크린샷. 휴대폰 화면은 390px 폭으로 찍어요. 데모: corepack pnpm dev -p 3100 → http://localhost:3100/demo -->

## 확인한 것

- [ ] `corepack pnpm typecheck` 통과
- [ ] `corepack pnpm test` 통과
- [ ] `corepack pnpm build` 통과
- [ ] `/demo`에서 바뀐 화면을 직접 눌러 봤어요

## 같이 쓰는 파일

<!-- 건드렸다면 체크하고 이유를 적어 주세요. 리뷰 때 먼저 봐요. -->

- [ ] `src/db/schema.ts` · `drizzle/` (PR 제목에 `[DB]`, 머지 직전 `main`을 받아 `pnpm db:generate` 다시 실행)
- [ ] `src/app/globals.css` (모든 화면이 같이 바뀌어요. 같이 작업하는 사람에게 먼저 말하고, 영향받는 화면의 전/후 스크린샷을 붙여요)
- [ ] `src/app/console/provider.tsx` · `types.ts` · `format.ts`
- [ ] `public/widget.js`
- [ ] `src/lib/core/*` (규칙을 바꾸면 `tests/core.test.ts`도 같이)

## 지켜야 할 것

- [ ] 비밀값(`.env*`, 카페24 Client Secret, `TOKEN_ENC_KEY`, `ADMIN_TOKEN`)이 없어요 — 공개 저장소예요
- [ ] 고객 전화번호 · 이름 · 주소를 저장하지 않아요
- [ ] 광고 문자 규칙((광고) 표기 · 밤 9시~아침 8시 발송 금지 · 수신동의자만)을 지켜요
