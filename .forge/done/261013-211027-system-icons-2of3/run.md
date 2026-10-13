<!-- forge-slug: system-icons-2of3 -->
# 실행 기록 — 시스템 파일 아이콘 (2/3) 설정 옵션과 파일 목록 아이콘

## 한 일
- `td-config`: `BehaviorTable.system_icons`(기본 false)와 `default.toml`, 테스트 1개(기본 꺼짐·true 허용·문자열은 경고+기본값·다른 키 불변). `task gen-types`로 `default-config.json` 갱신.
- 설정 화면 "모양" 탭에 스위치(`behavior.table.system_icons`), ko·en 제목·ⓘ 설명.
- `lib/systemIcons.ts`(새): `iconKey`(폴더 `dir`·`.app`/`exe`/`lnk` 등은 경로·파일은 소문자 확장자·압축 안은 종류별), `iconPixels`(`icon_size×dpr`을 16·32·64·128 올림), 백엔드(스토어 api)별 `WeakMap` 캐시(결과·null·거부 모두 보관, 끝난 값은 동기로 읽어 새로 나타난 행이 깜빡이지 않음), `useSystemIcon` 훅.
- `FileIcon`이 `path`·`systemIcons`를 받아 시스템 아이콘이 있으면 쓰고 없으면 머티리얼. `FileTable`이 설정을 넘김(`..` 행은 그대로). 스토어 `api.systemIcon` 통과 함수.
- 테스트 `system-icons.test.tsx` 12개. 문서: `docs/06`·`docs/07`, `README.md`·`README.en.md`.

## 계획과 실제
- 계획과 같다. 설정 항목은 계획에 "설정 화면"이라고만 했고 실제 위치는 "모양" 탭(`icon_size`와 같은 섹션).
- 테스트를 쓰며 내 테스트 오류 세 개를 고쳤다(응답기가 마지막 요청만 쥐던 것, 방향키 개수, 탭 이름). 구현은 그대로였다.
- 압축 안 항목은 이미 얻은 확장자를 다시 묻지 않는다(캐시). 테스트도 그 동작을 단언한다.

## 검증
- C4 `td-config system_icons` 통과, default.toml·default-config.json에 키 있음, i18n 3개 파일 통과. C5 system-icons 12 통과. C6 tsc 통과, vitest 1232 통과·실패 기준선 2개 파일뿐, clippy(td-icons·td-config·twin-deck-desktop)·fmt 통과, cargo test td-config 45·td-icons 9·twin-deck-desktop 119 통과. C7 문서 4곳 언급.
- 남은 확인(사람, 자동화 불가): 실제 앱(macOS)에서 설정을 켜고 목록에 Finder와 같은 아이콘이 뜨는지, 큰 폴더에서 스크롤이 막히지 않는지.
