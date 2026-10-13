<!-- forge-slug: system-icons-2of3 -->
<!-- task: 146 -->
<!-- part: 2/3 -->
<!-- tdd: off -->
# 시스템 파일 아이콘 (2/3): 설정 옵션과 파일 목록 아이콘

## 목표 / 하지 않을 것
- 목표: 설정 `behavior.table.system_icons`(기본 **false**)가 켜지면 파일 목록 행의 아이콘을 시스템 아이콘으로 보여 준다. 선행: `system-icons-1of3`(`Backend.systemIcon`).
  - 설정: `td-config`의 `BehaviorTable.system_icons: bool`, `default.toml`(주석: 켜면 목록의 아이콘을 운영체제가 쓰는 파일 아이콘으로 보여 준다, macOS·Windows), `task gen-types`, `ui/Settings.tsx`의 `SECTIONS`(`behavior.table.system_icons`, 부울) + ko·en 제목·ⓘ 설명(이 옵션은 아이콘을 얻지 못하면 기본 아이콘으로 보인다는 말 포함), `docs/06-config-plugins.md`.
  - 화면: `FileIcon`이 `path`·`systemIcons`를 받아, 켜져 있으면 시스템 아이콘을 요청해 보여 주고 응답이 올 때까지·`null`·거부일 때는 머티리얼 아이콘을 그대로 둔다(자리가 바뀌지 않는다). `lib/`에 훅 `useSystemIcon`과 모듈 캐시(`(키, 크기)` → 약속)를 둔다. 키는 폴더는 `dir`(디스크 위 `.app`·확장자 `exe`·`lnk`·`ico`·`scr`·`cur`는 경로), 파일은 소문자 확장자다(Rust 서비스의 소스 결정과 같은 규칙이며 코드 주석으로 서로를 가리킨다). 요청 크기는 `icon_size × devicePixelRatio`를 16·32·64·128 중 올림한 값이다. 설정이 꺼지면 요청을 하지 않고 머티리얼로 돌아온다. 심볼릭 링크 표식은 유지, `..` 행은 머티리얼 그대로, 압축 안 항목은 확장자 아이콘.
  - 문서: `docs/07-ui-spec.md`(파일 목록 아이콘 설명), `README.md`와 `README.en.md`(둘이 한 쌍이다 — 같이 고친다)의 설정/기능 목록에 한 줄.
- 하지 않을 것: 목록 밖 화면의 아이콘, 이미지 썸네일, 기본값을 켜는 일, Windows·Linux 구현(3of3), 머티리얼 아이콘 변경.

## 기준 문서
- 관련 ADR: 없음. 용어: 없음. 선행: `system-icons-1of3`. 참고: 설정 키 체크리스트(AGENTS.md "Config key checklist"), `preview.pdf_direct`·`preview.*_max_mb`의 td-config·Settings·i18n·docs 변경 선례.
- 완료 정의(DoD). 작성 시 기준선: `system_icons` 키·테스트 없음(grep 0).
  1. `cargo test -p td-config system_icons`: 기본 false, true 허용, 문자열은 경고+기본값. 사전 상태: 없음.
  2. `cd apps/desktop && bunx vitest run src/__tests__/system-icons.test.tsx`: 꺼짐(기본)에서는 `<img>`가 머티리얼 SVG이고 `systemIconCalls`가 비어 있음. 켜면 파일·폴더 행이 FakeBackend의 `data:image/png` 주소(확장자별로 다름)이고 같은 확장자는 한 번만 요청. `null`·거부는 머티리얼 유지. 켰다 끄면 머티리얼로 복귀. 압축 안 항목은 확장자 아이콘, 링크 표식 유지, `..` 행은 머티리얼. 요청 크기는 `icon_size × dpr` 올림 버킷(`window.devicePixelRatio`를 2로 바꿔 `icon_size` 16이면 32, 24이면 64). 설정 화면에 항목이 있고 영어에서 영어(한글 없음). 사전 상태: 파일 없음.
  3. i18n: `i18n-keys`·`i18n-no-hardcoded`·`i18n-english-screens`·설정 탭 목록 테스트 통과. 사전 상태: 통과(키를 더하므로 앞으로 가는 확인은 DoD 2의 영어 케이스).
  4. 문서: `grep -l system_icons docs/06-config-plugins.md docs/07-ui-spec.md`가 2개, README 한 쌍이 "시스템 아이콘"/"system icons"를 언급. 사전 상태: 0.
  5. 회귀: `bunx tsc --noEmit`, vitest 실패 파일 기준선 2개, `cargo clippy -p td-config -p twin-deck-desktop -- -D warnings`, `cargo fmt --check`, `cargo test -p twin-deck-desktop up_to_date`(기본 설정 JSON 재생성).
  6. 실제 앱 확인(사람, jsdom은 AppKit·WKWebView를 대신할 수 없다): 설정에서 켜고 목록을 본다 → 파일 종류별로 Finder와 같은 아이콘이 뜬다, 폴더·`.app`이 맞다, 끄면 기존 아이콘으로 돌아온다, 큰 폴더에서도 스크롤이 막히지 않는다.

## 작업 조각
- [ ] S1. `td-config` 키·기본값·테스트, `task gen-types`, 설정 화면 항목·ko·en 문구·`docs/06` — 완료 기준: DoD 1·3
- [ ] S2. `useSystemIcon`·캐시, `FileIcon`·`FileTable` 연결, `system-icons` 테스트 — 완료 기준: DoD 2 (depends: S1)
- [ ] S3. `docs/07`·README 한 쌍, 회귀 — 완료 기준: DoD 4·5 (depends: S2)
