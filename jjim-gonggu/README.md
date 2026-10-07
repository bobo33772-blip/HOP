# 찜꽁

자사몰에서 찜하거나 장바구니에 담은 고객을 모아, 목표 수량을 채우면 할인가로 여는 **카페24 판매자용 예약 공동구매** 앱이에요.
첫 타깃은 카페24 홈리빙 자체 브랜드예요.

> 이 폴더에는 **키나 비밀값이 들어 있지 않아요.** 앱은 키 없이 데모(모의 쇼핑몰) 모드로 처음부터 끝까지 돌아가요.

## 폴더 구조

| 경로 | 내용 |
|---|---|
| [`app/`](app/README.md) | **찜꽁 서버** — Next.js 16 + Drizzle(Postgres/PGlite). 판매자 화면·운영자 화면·고객 위젯·공구 엔진을 한 서버에서 돌려요. 단계 계획은 [`app/docs/ROADMAP.md`](app/docs/ROADMAP.md) |
| [`plans/team/`](plans/team/index.html) | **제품 기획서 (팀원용)** — 기획서 · 기술 검증 · 유저 플로우 · 프로토타입 · 부록 |
| [`plans/investor/`](plans/investor/index.html) | **투자 제안서** — 문제 · 해결책 · 데모 영상 · 시장 · 수익 모델 · 경쟁 · 첫 4주 |

기획서는 `index.html`을 브라우저로 열면 돼요(그림은 같은 폴더의 `images/`, `media/`를 읽어요).
온라인 원본: [팀원용](https://claude.ai/artifact/PEoPXyKhg13JmxR7JecXH5) · [투자자용](https://claude.ai/artifact/HtuYApAdoknp1DNP3thBvf) (2026-10-07 버전을 그대로 옮겼어요)

## 빠르게 실행하기

```bash
cd jjim-gonggu/app
corepack pnpm install
corepack pnpm dev -p 3100
```

`http://localhost:3100/demo` 에서 공구 한 번(초대 → 결제 없는 신청 → 판정·쿠폰 → 결제 → 확정 리포트 → 생산 결정)을 끝까지 눌러 볼 수 있어요.

## 지금 어디까지 왔나

- ✅ 공구 엔진 전체(F1~F10)와 운영자 화면·판매자 리포트·위젯이 모의 쇼핑몰에서 동작해요.
- ⏳ **카페24 개발자센터 앱 등록과 테스트몰 확인**: 오너 작업이에요 ([안내](app/docs/CAFE24_SETUP.md)). 이게 끝나야 실제 쇼핑몰 데이터로 PoC를 할 수 있어요.
- 다음: 운영 배포(HTTPS·Postgres) → 파일럿 3몰 → 4주 판정 → (Go면) 판매자 앱·스토어 심사

예전의 두 MVP(4주 파일럿용 Node 서버, 스토어 출시용 Next.js)는 `app/` 하나로 합쳤어요. 이전 코드는 git 기록에 남아 있어요.

## 보안 규칙

저장소에 올린 내용은 누구나 볼 수 있어요(공개 저장소).
`.env`, `.env.local`, 카페24 Client Secret, `TOKEN_ENC_KEY`, `ADMIN_TOKEN`은 절대 커밋하지 않아요. 실수로 올렸다면 커밋을 지우는 것만으로는 부족하니 바로 키를 새로 발급(교체)해 주세요.
