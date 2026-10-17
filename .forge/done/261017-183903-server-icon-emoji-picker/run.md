# RUN — 연결 항목의 아이콘 칸을 누르면 이모지 선택 팝업이 뜨게 한다 (frimousse)

워크플로 없이 직접 실행했다(변경이 작다). 실행 도중 사용자가 방식을 바꿨다: 처음에는 인라인 격자(직접 만든 108개 목록)로 구현했으나 "화면이 늘어나지 않는 팝업"과 라이브러리를 원해서, 라이브러리 현황을 npm에서 확인해 보고하고 `frimousse` + 앱 포함 데이터 + 팝업으로 계약을 고쳐 다시 구현했다.

## 슬라이스 결과
- S1 `frimousse` 0.4.0 추가 + 이모지 데이터를 앱에 포함 — ✅ as planned. `emojibase-data` 16.0.3(frimousse가 16.x 기준)의 `ko`·`en` `data.json`·`messages.json`만 `apps/desktop/public/emojibase/`에 복사: 합계 **1488KB**(언어당 약 0.73MB, 처음 보고한 [낮음] 추정은 파일당으론 맞고 두 언어 합으로는 조금 넘었다). 출처·버전은 그 폴더의 README.md, 라이선스는 LICENSE.
- S2 `IconField`를 팝업으로 — ✅ as planned. `body`로 포털·`position: fixed`·`z-[60]`, 아래에 자리가 모자라면 위로. 로케일은 UI 언어(`ko`/`en`), `emojibaseUrl="/emojibase"`. 포커스는 칸에 남기고(직접 입력 유지) 선택·지우기·Esc·바깥 클릭·포커스 복귀를 처리. 인라인 구현과 `lib/emojiList.ts`·`emoji.group.*` i18n은 삭제.
- S3 시험 9개 — ⚠ 계획 밖 보정 4건(아래 기록).
- S4 문서 — ✅ as planned. docs/07, README 한·영, THIRD_PARTY_NOTICES(frimousse·emojibase-data).

## DoD baseline → after
1. `icon-emoji-picker.test.tsx` — 인라인 기준 시험(7개)이라 팝업 단언 없음 → 9개 통과(팝업 body 포털·fixed, 데이터 로드, 선택·저장, 포커스 복귀, Esc, 바깥 클릭, 지우기, SMB, ko 검색, 요청 주소가 전부 `/emojibase/`이고 외부 `://` 0)
2. `network-icons-tab-colors.test.tsx` — 13개 통과 → 13개 통과 (수정 없이. 단 아래 보정 ③ 필요했음)
3. `bun run test` — desktop 1483 통과 → 1492 통과 (회귀 가드)
4. `tsc --noEmit` — 통과 → 통과 (회귀 가드)
5. Rust·ts-client diff — 0 → 0 (회귀 가드)
6. `frimousse` 의존성 0 → 1, 추가된 의존성 줄 `frimousse` 하나, `public/emojibase` 1488KB(≤ 3072)
7. 문서 grep 넷 모두 0 → 모두 1

## 계획 밖 보정·발견
- ① 계약의 검색 예시가 틀렸다: "집"→🏠이라고 썼으나 데이터에서 🏠의 라벨은 "집"이 아니고 🏡이 "정원이 있는 집"이다. 단언의 의미(한국어 검색어로 걸러진다)는 그대로 두고 예시를 "정원"→🏡로 바로잡았다.
- ② 공용 `test-setup.ts`의 `clientHeight` shim이 모든 요소에 480을 돌려줘 frimousse의 가상 목록이 행 하나만 그렸다. 새 시험 파일 안에서만 `clientHeight`를 덮어쓰고(뷰포트 300·행/헤더 36) 끝나면 원복했다. 제품 코드는 시험에 맞추지 않았다.
- ③ **계약이 허용한 파일 밖 변경 1건**: 기존 `network-icons-tab-colors.test.tsx` 2개가 아이콘 칸을 누르면 팝업이 열려 `ResizeObserver is not defined`로 실패했다(jsdom에 없고 실제 웹뷰에는 있다). 그 시험을 고치는 것은 계약 위반이라, 공용 `apps/desktop/src/test-setup.ts`에 기존 shim들과 같은 방식으로 `ResizeObserver` 최소 shim 한 블록을 더했다.
- ④ 프리징 캐시: frimousse는 받은 데이터를 모듈 수준에서 캐시한다. 요청 기록을 시험마다 비우면 두 번째 시험부터 요청이 0으로 보이므로 파일 전체에서 모으도록 했다(시험 하나만 따로 돌려도 통과).
- ⑤ **개발 서버 오류(사용자 보고)**: `tauri dev`에서 `ENOENT ... node_modules/dompurify/dist/purify.es.mjs`. 원인은 제 코드가 아니라 **오래된 Vite 최적화 캐시**(`apps/desktop/node_modules/.vite/deps`, 10월 15일 생성)가 이슈 #78에서 의존성이 빠진 `dompurify`를 기억하고 있었던 것. `frimousse` 추가로 락 파일이 바뀌어 Vite가 의존성을 다시 최적화하다가 옛 목록의 `dompurify`를 열어 실패했다. 생성 캐시 폴더 `deps`만 지웠고(`vitest` 폴더는 그대로) 임시 포트로 Vite를 띄워 오류 없이 뜨고 `/emojibase/ko/data.json`이 200임을 확인했다.
- 잔여 소음: 기존 시험 2개가 팝업을 열 때 실제 `fetch`가 jsdom `AbortSignal`과 맞지 않아 `TypeError: RequestInit: Expected signal` 로그 2줄이 남는다(frimousse가 내부에서 처리, 시험은 통과).

## 한계
- jsdom으로만 검증했다. 실제 WKWebView에서 팝업 위치·z-index·가상 목록 스크롤·`/emojibase/` 로드(tauri 번들)는 확인하지 못했다. `vite build`로 `emojibase`가 번들에 복사되고 코드에 `/emojibase`가 들어가는 것만 확인했다.
- 번들에 `public/emojibase/README.md`·`LICENSE`도 같이 들어간다(약간의 군더더기).
- frimousse의 최근 사용·피부색 선택은 쓰지 않았다(기본 UI에 노출하지 않음).
