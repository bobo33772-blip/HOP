# 롤롤 아트 파이프라인 (Higgsfield · gpt_image_2_5)

앱에 들어간 최종 아트를 다시 만들거나 늘릴 때 쓰는 스크립트와 기록.

## 캐릭터 (assets/characters, 96장)
- 모든 캐릭터는 **하늘색(#8CC8F2) 한 벌**만 만든다. 다른 몸 색은 앱이 기기에서 입힌다(`src/lib/tint.ts`).
- 기준 렌더: 곰 3단계 happy (job `dc677fb2…`, `53bb89a9…`, `c24dc341…`) + 3종 차트 시안 `c43f50ab…`를 참조 이미지로.
- `prompts.py`: 동물·단계 happy 프롬프트. `mkexpr.py`: happy 렌더를 참조로 표정(wink·sleepy·surprised)만 바꾸는 편집 프롬프트.
- `norm.py`: 발 사이 중앙 + 왼쪽 몸 가장자리로 몸 폭을 재서 512×512에 같은 크기·같은 발 높이로 맞춘다.
- `install.py`: out/*.webp → assets/characters 복사 + `src/lib/character-art.ts` 생성.
- `recolor.py`: 앱 셰이더와 같은 Oklab 색 이동(미리보기·열차 객차 색 만들기에 사용).
- `urls.json`: 키(동물_단계_표정) → 결과 URL(파일명에 job id). 생성 서비스 계정 ID가 들어 있어 **저장소에 올리지 않는다**(로컬 전용, `.gitignore`).

## 정거장 (assets/world)
- `layout_station.png`(앱 좌표 360×440 배치도)를 참조로 낮 그림 생성(job `a60c5b7a…`), 그 그림을 편집해 아침·노을·밤.
- 앱 비율(9:11)에 맞게 위쪽을 잘라 1080×1320 webp. 오버레이 좌표는 `station-world.tsx` 주석 참고.
- 열차: 기관차 `dcd8e46a…`, 객차 `0303df46…`(하늘색) → recolor로 6색 + 빈 칸.

## 내 방 (assets/room, 25개)
- `room_prompts.py`: 아이템별 프롬프트·비율. `roomjobs.json`: 아이템 → job id.
- 자리(rect)와 크루 액자 사진 칸 비율은 `src/components/room-view.tsx`.

주의: 투명 배경 렌더 중 가끔 가장자리에 옅은 안개(반투명 테두리)가 생긴다 → 불투명 핵심 영역을 7~9px 넓힌 마스크로 알파를 곱해 정리.

## 2차: 화면 배경·행선지·아이콘·스티커 (assets/scenes, dest, icons)
- `scene_prompts.py` / `scene_jobs.json`: 현상소·출발·성장·온보딩 배경, 행선지 8곳(하늘행은 정거장 참조를 줄여 재생성), 탭 아이콘 4, 반응 스티커 4.
- 화면 연결은 `src/lib/art.ts`. 출발·성장 화면은 배경 속 선로(57%)·받침대(68%) 높이에 맞춰 배치.

## 스토어 스크린샷 (docs/store)
- `store.py <Jua ttf>`: 폰 실기 캡처(ss_*.png, 상태 표시줄 96px 잘라냄) + 파스텔 배경 + Jua 헤드라인 + 폰 프레임.
- App Store 1290×2796, Google Play 1080×1920 각 6장. Jua에는 ×, → 글리프가 없으니 헤드라인에 쓰지 말 것.
- 출발·성장 캡처는 개발 빌드 미리보기 링크: `rollroll://departure?preview=1`, `rollroll://evolve?preview=banjjak`.
- 01 정거장·04 앨범·06 방은 실제로 찍은 사진이 들어 있어 **저장소에 올리지 않는다**(로컬 전용, `.gitignore`). 다시 만들 때는 개발용 **샘플 사진으로 찍기**로 찍은 사진만 보이게 캡처할 것.

## 3차: 3D(아이소메트릭) 정거장·방 (assets/station, assets/room3d)
- 시안(메인 022779b5, 방 7e0078af, 앨범 f9719f0c)을 참조로 생성. job id는 `iso_jobs.json`.
- **정거장**: 기차 있는 그림(st_T, 칸 8개 모두 하늘색·빈 창)을 만들고 → 같은 그림에서 기차만 지운 편집(st_0)을 배경으로 쓴다.
  - 기차 오리기: 두 그림 차이 + Higgsfield 배경 제거로 기차 마스크 → 창 위치를 씨앗으로 watershed 분할 → 기관차 + 8칸.
  - 칸마다 9색(승객 몸 색 8 + 빈 칸) recolor. 위치·창 기울기는 `station_train_meta.json` → `src/lib/station-art.ts`.
  - 시간대 3종은 st_0 편집. 기차 스프라이트는 앱에서 시간대 색을 얇게 덧칠(tintColor).
- **방**: 빈 방 껍데기(room_base)를 편집해 벽지 4종·바닥 2종. 바닥 2종은 바닥만 오린 덮개(base와의 차이 마스크).
  - 가구 6·러그 3·카메라 선반은 3D로 생성(투명 배경). 창문·벽장식·전구는 정면 그림을 벽 기울기(왼쪽 -18.5°, 오른쪽 22.1°)만큼 skewY.
  - 배치 좌표(2048 정사각 기준)는 `room3d_layout.json`, 미리보기 합성은 `room3d_preview.py`. 앱 값은 `src/components/room-view.tsx`.

### 안드로이드 skew 주의 (2026-09-29)
- React Native의 `skewX/skewY` 변환은 안드로이드에서 회전으로 바뀌어 그려진다(안드로이드 View에 skew가 없음). 기울어진 것은 쓰지 말 것.
- 대신: 벽 장식·간판 글씨·전광판 이름·빈 칸 번호는 `room3d_wall_bake.py`, `station_bake.py`로 **그림에 미리 기울여 굽는다.**
- 사용자 사진처럼 바뀌는 것(방 액자·정거장 게시판)은 **react-native-svg `<Image transform="matrix(1 t 0 1 0 0)">`**로 그린다 (모든 플랫폼에서 정확).
- 객차 창은 구멍을 뚫고 승객을 차 뒤에 똑바로 그려, 창 모양대로 보이게 한다.
