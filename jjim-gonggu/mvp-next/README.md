# 찜 공구

자사몰에서 찜하거나 장바구니에 담은 고객을 모아, 목표 수량을 채우면 할인가로 여는 카페24 판매자용 예약 공동구매 앱.

- 단계별 진행: [docs/ROADMAP.md](docs/ROADMAP.md)
- 카페24 앱 등록: [docs/CAFE24_SETUP.md](docs/CAFE24_SETUP.md)

## 로컬 실행
```
corepack pnpm install
cp .env.example .env.local     # CAFE24_MOCK=1이면 카페24 없이 데모 쇼핑몰로 동작
corepack pnpm dev -p 3100
corepack pnpm test
```

## 구조
```
src/lib/core      공구 규칙 (상태 머신, 신청, 광고 문자, 요금) — 외부 의존 없음, 테스트 대상
src/lib/cafe24    카페24 OAuth·HMAC·API 호출기·가짜 쇼핑몰
src/db            Drizzle 스키마 (Postgres / 로컬 PGlite)
src/app/api       앱 실행·OAuth 콜백·웹훅·헬스체크
drizzle/          마이그레이션 SQL (pnpm db:generate)
```
