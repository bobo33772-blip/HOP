# 찜꽁

자사몰에서 장바구니에 담았거나 품절 상품에 공구 알림을 신청한 고객을 모아, 목표 수량을 채우면 할인가로 여는 **카페24 판매자용 예약 공동구매** 앱이에요. 서비스 소개는 [맨 위 README](../README.md)에 있어요.
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

`http://localhost:3100/demo` 에서 판매자 · 소비자 · 관리자를 골라, 공구 한 번(초대 → 결제 없는 신청 → 판정·쿠폰 → 결제 → 확정 리포트 → 생산 결정)을 끝까지 눌러 볼 수 있어요.

## 지금 어디까지 왔나

- ✅ 공구 엔진 전체(F1~F10), 판매자 화면(홈 · 내 공구 · 새 공구 · 모니터링), 운영자 화면, 고객 위젯이 동작해요.
- ✅ 운영 배포(Vercel 서울 · Supabase 서울). `main`에 머지하면 검사 뒤 자동 배포해요.
- ✅ 카페24 개발자센터 앱 등록 · 테스트몰 설치 · 쿠폰 생성 · 위젯 확인 ([안내](app/docs/CAFE24_SETUP.md))
- ⏳ 카페24 앱스토어 출시 준비 · 파일럿 준비
- 단계별 진행은 [ROADMAP](app/docs/ROADMAP.md)에 있어요.

예전의 두 MVP(4주 파일럿용 Node 서버, 스토어 출시용 Next.js)는 `app/` 하나로 합쳤어요. 이전 코드는 git 기록에 남아 있어요.

## 보안 규칙

저장소에 올린 내용은 누구나 볼 수 있어요(공개 저장소).
`.env`, `.env.local`, 카페24 Client Secret, `TOKEN_ENC_KEY`, `ADMIN_TOKEN`은 절대 커밋하지 않아요. 실수로 올렸다면 커밋을 지우는 것만으로는 부족하니 바로 키를 새로 발급(교체)해 주세요.
