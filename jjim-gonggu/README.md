# 찜 공구

자사몰에서 찜하거나 장바구니에 담은 고객을 모아, 목표 수량을 채우면 할인가로 여는 **카페24 판매자용 예약 공동구매** 앱이에요.
첫 타깃은 카페24 홈리빙 자체 브랜드예요.

> 이 폴더에도 **키나 비밀값은 들어 있지 않아요.** 두 MVP 모두 키 없이 데모(가짜 쇼핑몰) 모드로 돌아가요.

## 폴더 구조

| 경로 | 내용 |
|---|---|
| [`plans/team/`](plans/team/index.html) | **제품 기획서 (팀원용)** — 기획서 · 기술 검증 · 유저 플로우 · 프로토타입 · 부록 |
| [`plans/investor/`](plans/investor/index.html) | **투자 제안서** — 문제 · 해결책 · 데모 영상 · 시장 · 수익 모델 · 경쟁 · 첫 4주 |
| [`mvp-lite/`](mvp-lite/README.md) | **4주 MVP (파일럿용)** — Node.js 22.6+, 외부 라이브러리 없음. 초대 → 결제 없는 신청 → 판정·쿠폰 → 결제 집계 → 확정 리포트 |
| [`mvp-next/`](mvp-next/README.md) | **스토어 출시용 MVP** — Next.js 16 + Drizzle(PGlite). 카페24 앱 실행 HMAC·웹훅·수요 레이더. 단계 계획은 [`docs/ROADMAP.md`](mvp-next/docs/ROADMAP.md) |

기획서는 `index.html`을 브라우저로 열면 돼요(그림은 같은 폴더의 `images/`, `media/`를 읽어요).
온라인 원본: [팀원용](https://claude.ai/artifact/PEoPXyKhg13JmxR7JecXH5) · [투자자용](https://claude.ai/artifact/HtuYApAdoknp1DNP3thBvf) (2026-10-07 버전을 그대로 옮겼어요)

## 두 MVP의 관계

- **mvp-lite**: 4주 파일럿 목표("결제가 끝난 수량으로 생산을 결정한 홈리빙 판매자 1곳")를 검증하는 최소 시스템이에요. 판매자 앱 대신 운영자 화면(`/admin`)을 써요.
- **mvp-next**: Go 판정 뒤 카페24 스토어 심사까지 가는 본 제품 코드예요. 0단계(기반)·2단계(수요 레이더)까지 진행됐고, 1단계(카페24 개발자센터 앱 등록)는 오너 작업이에요.

## 빠르게 실행하기

```bash
cd jjim-gonggu/mvp-lite
npm run demo   # 또는 npm start, npm test (Node.js 22.6 이상)
```

```bash
cd jjim-gonggu/mvp-next
corepack pnpm install
cp .env.example .env.local   # CAFE24_MOCK=1 이면 데모 쇼핑몰
corepack pnpm dev -p 3100
```

## 보안 규칙

저장소 루트 README의 [보안 규칙](../README.md#보안-규칙-꼭-지켜-주세요)을 똑같이 따라요.
`.env`, `.env.local`, 카페24 Client Secret, `TOKEN_ENC_KEY`는 절대 커밋하지 않아요.
