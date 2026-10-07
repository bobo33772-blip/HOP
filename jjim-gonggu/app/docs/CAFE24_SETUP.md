# 카페24 개발자 앱 등록 안내 (1단계 · 사용자가 직접 할 일)

카페24 공식 개발가이드(2026-10-07 확인) 기준입니다. 화면 이름이 다르면 비슷한 메뉴를 찾아 주세요.

## 1. 가입 ✅
- 카페24 통합 회원가입 → 개발자센터 로그인 → 개발사(자) 등록(약관 동의 > 정보 입력).

## 2. 테스트 쇼핑몰 — 이미 있어요
- **카페24에 가입하면 쇼핑몰이 자동으로 만들어지고, 이것을 테스트몰로 씁니다.**
- 테스트몰 ID(mall_id) = 카페24 회원 아이디. 관리자 주소: `https://<아이디>.cafe24.com/admin`
- 테스트용 데이터 준비:
  1. 관리자 > 상품 > 상품 등록에서 상품 3~5개 등록 (진열·판매 상태 '함'으로)
  2. 쇼핑몰 화면에서 테스트 회원 2~3명 가입 (가입할 때 SMS 수신동의를 일부는 '예', 일부는 '아니오'로)
  3. 각 테스트 회원으로 로그인해 상품 몇 개를 찜하고 장바구니에 담기

## 3. 공개 https 주소 만들기 (터널)
카페24는 https 도메인만 받아요(http·IP 불가). 개발 중에는 내 PC의 `localhost:3100`을 터널로 엽니다.
주소가 바뀌지 않는 **ngrok 무료 고정 도메인**을 권장해요(주소가 바뀌면 카페24 설정도 매번 고쳐야 함).
1. https://ngrok.com 가입 → 대시보드 > Domains에서 무료 고정 도메인 1개 받기 (예: `jjim-dev.ngrok-free.app`)
2. 설치·로그인 (토큰은 ngrok 대시보드에 있어요. 채팅에 붙이지 말고 직접 실행)
   ```
   winget install ngrok.ngrok
   ngrok config add-authtoken <내 토큰>
   ```
3. 실행: `ngrok http --url=<내 고정 도메인> 3100`

## 4. 앱 만들기
개발자 어드민 > **Apps > App 관리 > [ADD PRODUCT]**
| 항목 | 입력값 |
|---|---|
| App 유형 | **Web Application** (나중에 못 바꿈) |
| 관리 상품명 | `찜꽁` (쇼핑몰 관리자 로그에 처리 주체로 표시, 20byte) |
| App URL | `https://<고정 도메인>/api/cafe24/launch` |
| Redirect URI | `https://<고정 도메인>/api/cafe24/callback` |

저장 후 **App 관리 > STEP 1. 개발정보관리**에서:
- **권한(Scope)**: 아래 11개를 Read/Write 맞춰 선택 (`src/lib/cafe24/scopes.ts`와 같아야 함)
  | 분류 | 권한 |
  |---|---|
  | 상품 (Product) | Read |
  | 개인정보 (Privacy) | Read |
  | 개인화 정보 (Personal) | Read |
  | 고객 (Customer) | Read — 위젯에서 로그인 회원 본인 확인(암호화 회원 ID)용 |
  | 프로모션 (Promotion) | Read + Write |
  | 주문 (Order) | Read |
  | 알림 (Notification) | Read + Write |
  | 앱 (Application) | Read + Write |
- **WebHook > 등록**: 수신 URL `https://<고정 도메인>/api/cafe24/webhooks`, 이벤트
  `90023` 주문 접수 · `90025` 입금상태 변경 · `90026` 취소 · `90029` 환불 · `90084` 장바구니 담기 ·
  `90143` 회원 로그인 · `90147` 회원 탈퇴 · `90077` 앱 삭제
  (권한을 먼저 저장해야 해당 이벤트를 고를 수 있어요)
- **인증정보**에서 Client ID, Client Secret Key 확인, **Service Key "보기"**도 눌러 값이 나오는지 확인 (위젯 회원 확인에 필요)

## 5. `.env.local`에 값 넣기 (직접 파일에 — 채팅에 붙여 넣지 마세요)
```
CAFE24_CLIENT_ID=<Client ID>
CAFE24_CLIENT_SECRET=<Client Secret Key>
CAFE24_SERVICE_KEY=<Service Key>
TOKEN_ENC_KEY=<아래 명령 결과>
APP_BASE_URL=https://<고정 도메인>
CAFE24_MOCK=0
ADMIN_TOKEN=<운영자 화면 로그인 토큰, 24자 이상>
```
`TOKEN_ENC_KEY` 만들기:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
`CAFE24_SERVICE_KEY`가 비어 있으면 위젯 신청이 모두 거절돼요(안전한 기본값). 일반 앱에서 Service Key가 발급되지 않으면 알려 주세요 — 대안(OIDC 로그인)으로 바꿔요.

## 6. 테스트몰에 설치해 보기
1. 개발 서버와 ngrok를 켜 둔 상태에서
2. 개발자 어드민의 앱 화면에서 테스트 실행(내 테스트몰에 설치) 메뉴를 찾아 실행
3. 테스트몰 관리자에서 권한 동의 화면이 뜨면 동의
4. 찜꽁 홈에 "카페24 연동 모드 · 연결됨 ✓"가 보이면 1단계 연결 성공 → 알려 주시면 PoC를 이어서 진행해요.
5. 스토어 심사 전에 파일럿 몰을 직접 연결할 때는 `https://<고정 도메인>/api/cafe24/install?mall_id=<쇼핑몰ID>` 를 판매자에게 열어 달라고 하면 돼요 (PoC P7에서 가능 여부 확인).
6. 연결한 몰은 운영자 화면(`/admin`)에서 브랜드명·문자 발신번호·무료수신거부 번호를 먼저 등록해야 공구를 열 수 있어요.
