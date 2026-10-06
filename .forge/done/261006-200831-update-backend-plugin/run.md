# 실행 기록 — 업데이트 확인·설치 백엔드 (Tauri updater 플러그인 연결)

## 슬라이스 결과
- S1 의존성·플러그인 등록·권한·`tauri.conf.json` — ✅ `tauri-plugin-updater = "2"`, `main.rs`에 등록, capability에 `updater:default`, conf에 `plugins.updater`(엔드포인트 + 공개 키 자리표시 `REPLACE_WITH_UPDATER_PUBKEY`)
- S2 `check_update`/`install_update` command와 `UpdateInfoDto` — ✅ 계획대로. 재시작은 별도 process 플러그인 없이 `AppHandle::restart()`로 했다(의존성 하나 덜 추가).
- S3 `task gen-types`와 `Backend`·`TauriBackend`·`FakeBackend` — ✅ 계획대로. `FakeBackend`에 `updateScenario`(정보·확인 오류·설치 오류)와 `updateCalls`(호출 횟수)를 두었다.

## DoD baseline → after
1. `cargo build`, `cargo clippy -p twin-deck-desktop -- -D warnings` — 통과
2. `up_to_date` 통과, bindings에 `checkUpdate`/`installUpdate` 2건
3. conf JSON 파싱 성공, 엔드포인트 일치. ⚠ 계획과 다르게 `bundle.createUpdaterArtifacts`는 **켜지 않았다**(값 undefined): 켜면 서명 키가 없는 `task bundle`·`task install`이 실패한다. 릴리스 빌드에서만 `--config`로 켠다(3of3 몫, 계획 문구도 고침).
4. `tsc --noEmit` 통과, FakeBackend 시나리오 메서드 사용 가능(2of3에서 사용)
5. 회귀 없음: vitest(pdf-preview 제외) 83파일 721건 통과(기준선은 pull로 늘어난 값 — 착수 시 루프 파일의 81파일 713건보다 크다)
6. 한계: GUI 없이는 앱 시작 시 플러그인 초기화가 패닉하지 않는지 직접 보지 못했다. 근거는 Tauri 문서의 동작(공개 키는 설치 시점에 검증)뿐이다. `capabilities_cover_plugins`는 통과.

## 판단·발견
- `tauri-plugin-updater` 최신 2.x(2.12.0)를 썼다. crates.io 검색에는 3.0 알파가 먼저 나오지만 Tauri 2 라인과 맞는 2.x를 택했다.
- `install_update`는 설치 직전에 한 번 더 `check()`를 한다(업데이트 객체를 command 사이에 들고 있지 않으려고). 확인과 설치 사이에 더 새 버전이 나오면 그 버전을 설치한다.
- 진행률 콜백은 비워 두었다(Non-goal: 진행률 막대 없음).
