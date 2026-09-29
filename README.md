# HOP

**롤롤(RollRoll)**: 낮에 잠깐 쉬어서 티켓을 모으고, 그 티켓으로 밤 막차 여행을 떠나는 말랑볼 앱이에요.
Expo SDK 57 · React Native 0.86 · expo-router · Supabase로 만들었어요.

> 이 저장소에는 **키나 비밀값이 들어 있지 않아요.** 키가 없어도 앱은 **로컬 모드**(가짜 승객)로 처음부터 끝까지 돌아가요.
> 실제 서버에 연결하는 방법은 아래 [서버 모드](#서버-모드-실제-supabase-연결)에 있어요.

## 빠르게 실행하기 (로컬 모드, 키 필요 없음)

Node.js LTS와 npm이 필요해요.

```bash
npm install
npx expo start --web
```

위 명령은 브라우저에서 앱을 여는 방법이에요.

### 안드로이드 폰에서 실행하기

이 프로젝트는 개발 빌드(expo-dev-client)로 실행해요.

1. Android Studio(Android SDK)와 JDK 17을 설치해요.
2. 폰을 USB나 무선 디버깅으로 PC에 연결해요.
3. 아래 명령을 실행해요.

```bash
npx expo run:android
```

- 처음 실행할 때는 `android/` 폴더를 만들고 빌드하느라 시간이 오래 걸려요.
- `android/`와 `ios/`는 자동으로 만들어지는 폴더라 커밋하지 않아요. 네이티브 설정은 `app.json`에서 바꿔요.
- 개발 빌드를 한 번 설치하면, 그다음부터는 `npx expo start`만 켜면 돼요. 폰과 PC가 같은 와이파이에 있으면 폰의 롤롤 앱이 접속해요.
- Android Studio를 설치하기 어렵다면 오너에게 개발 빌드 APK를 받아서 설치해도 돼요.
- iOS는 Mac과 Xcode가 있으면 `npx expo run:ios`로 실행해요. 지금까지는 안드로이드 위주로 확인했어요.

## 서버 모드 (실제 Supabase 연결)

1. `.env.example`을 복사해서 `.env`를 만들어요.

   ```bash
   cp .env.example .env
   ```

2. 값은 **오너에게 개인 채널(DM)로 받아서** 채워요. 이슈, PR, 커밋, 단체방에 붙여 넣지 마세요.
3. Metro(`npx expo start`)를 다시 켜요. `.env`는 번들을 만들 때 읽히기 때문에, 값을 바꾸면 Metro를 재시작해야 해요.

알아 둘 점:

- `EXPO_PUBLIC_`으로 시작하는 값은 **앱 번들에 그대로 들어가요.** 그래서 여기에는 publishable 키만 넣어요. `service_role`이나 `sb_secret_` 같은 서버 비밀 키는 절대 넣지 않아요.
- 내 Supabase 프로젝트로 따로 테스트하는 방법:
  1. `supabase/migrations`를 순서대로 적용해요(pg_cron과 pg_net 확장을 써요).
  2. 그 프로젝트의 URL과 publishable 키를 `.env`에 넣어요.
  3. 시간 설정은 `supabase/scripts/settings-test.sql`(테스트용)과 `settings-release.sql`(출시용)에 있어요.

## 개발용 기능 (개발 빌드에서만 보여요)

- 정거장의 **지금 막차 출발 (2분 뒤 도착)** 버튼: 막차가 출발하고 도착하는 흐름을 바로 확인해요.
  - 서버 모드에서는 서버 설정 `app_settings.dev_tools`가 켜져 있어야 보여요.
- 카메라의 **샘플 사진으로 찍기**, 내 방의 **캐릭터 도감**
- 연출 미리보기 링크: `rollroll://departure?preview=1`, `rollroll://evolve?preview=banjjak`
- 개발 모드에서는 사진 현상처럼 기다리는 시간이 짧아져요(`src/lib/rules.ts`의 `FAST_DEV`).

## 폴더 구조

| 경로 | 내용 |
|---|---|
| `src/app/` | 화면(expo-router): 파일 하나가 화면 하나예요 |
| `src/app/(tabs)/` | 정거장 · 크루 · 현상소 · 내 방 탭 |
| `src/app/play/` | 쉼 놀이: 말랑볼 조물조물(`squish`) · 면치기 숨쉬기(`noodle`) · 창밖 색 채우기(`color`) |
| `src/components/` | 정거장 장면, 말랑볼, 놀이 부품 |
| `src/lib/` | 상태(`store.tsx`), 서버 연결(`remote.tsx`), 규칙과 숫자(`rules.ts`), 소리(`sound.ts`) |
| `supabase/migrations/` | DB 구조, RPC, 크론(매분 막차 처리) |
| `assets/` | 그림과 소리 |
| `tools/sound/` | 효과음과 배경음 합성: `python tools/sound/make_sounds.py`(numpy, scipy 필요) |
| `tools/art/` | 아트 생성 기록과 굽기 스크립트. 생성 서비스 계정이 있어야 해서 앱 개발에는 쓰지 않아요 |
| `docs/` | 개인정보처리방침, 이용약관, 스토어 스크린샷 |

## 커밋하기 전에

```bash
npx tsc --noEmit
```

```bash
npx expo lint
```

## 보안 규칙 (꼭 지켜 주세요)

저장소에 올린 내용은 저장소를 볼 수 있는 모든 사람에게 보여요. 공개 저장소라면 누구나 볼 수 있어요.

- 아래 파일은 `.gitignore`에 들어 있어요. **절대 커밋하지 않아요.**
  - `.env`
  - `google-services.json`
  - 파이어베이스 서비스 계정 키(`*-firebase-adminsdk-*.json`)
  - 서명 키(`*.jks`, `*.p8`, `*.p12`, `*.key`, `*.pem`)
  - `tools/art/urls.json`
- 커밋하기 전에 `git status`로 올라가는 파일을 한 번 더 확인해요.
- 실수로 키를 올렸다면 커밋을 지우는 것만으로는 부족해요. 바로 오너에게 알리고 그 키를 **새로 발급(교체)**해야 해요.
- 코드와 SQL에는 키, 계정 이메일, 개인 PC 경로(`C:/Users/...`)를 적지 않아요. 경로는 저장소 기준 상대 경로로 써요.
- GitHub 설정 → Emails에서 **Keep my email addresses private**를 켜 두면, 커밋에 개인 이메일 대신 `…@users.noreply.github.com`이 들어가요.

## 오너 계정이 필요한 일

- 실서버 Supabase 대시보드와 마이그레이션 적용
- EAS 빌드와 제출(Expo 조직 `kyulak`)
- 원격 푸시(파이어베이스)
- 스토어 콘솔

`google-services.json`이 없어도 빌드는 돼요. `app.config.js`가 이 파일이 있을 때만 연결하기 때문이에요. 파일이 없으면 원격 푸시 알림만 빠져요.

## 출시 전에 되돌릴 것

- `supabase/scripts/settings-release.sql`을 적용해서 테스트용 짧은 시간을 출시값으로 바꿔요.
- 서버 설정 `app_settings.dev_tools`를 꺼요.
