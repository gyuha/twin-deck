<!-- forge-slug: windows-path-compat -->
# 실행 기록 — Windows 경로 호환

워크플로 없이 직접 실행했다(소규모, 파일 몇 개).

## 슬라이스별 결과
- S0 Windows에서 vitest 실행 환경 — ✅ Node 24 LTS 설치. `bunx vitest`는 `File URL path must be an absolute path`로 실패하므로 `node ..\..\node_modules\vitest\vitest.mjs run`으로 돌린다.
- S1 ts-client 경로 도우미 — ✅ `parentPath`/`baseName`/`joinPath`가 `\`·`/`·드라이브 루트를 이해하고 `isDriveRoot`를 추가. 테스트를 먼저 써서 실패(2개)를 확인한 뒤 통과.
- S2 UI 사용처 — ⚠ Breadcrumb·TabBar·multiRename(`[P]`)·MultiRename·`transferDestError`·`gotoComplete` 수정. **테스트를 구현 뒤에 썼다**(TDD 이탈): `windows-paths.test.tsx` 4개.
- S3 Windows cargo test — ⚠ 계획보다 범위가 커졌다. 아래 "추가로 고친 것".
- S4 실제 앱 확인 — ⏳ 사람이 확인(UAT).

## 계획 밖에서 고친 것 (S3에서 드러난 실제 경로 버그)
- `td-vfs` `VfsPath::join`: Windows `PathBuf::join`이 `x.zip!\inner`를 만들어 UI로 내려가던 것을 아카이브 경계 뒤에서는 `/`로 잇게 함.
- `td-archive` `split_archive_path_with`: 경계 뒤의 `\`를 `/`로 정규화(Windows 한정). 외부에서 `!\`로 들어온 경로도 아카이브로 라우팅된다.
- 테스트의 OS 구분자 가정 보정: `td-search` lookup/usage, `service.rs` `short_ops_...`.

## 남은 Windows 실패 (경로 문제가 아니라 고치지 않음)
- `zip`/`unzip` 명령 없음(테스트가 외부 CLI를 부름): td-archive read/write/compress/first_image/composite 일부, service `preview_cbz_*`, `compress_extract_*`, `editing_an_archive_*` — 대략 20개.
- 점(.)으로 시작하는 파일은 Windows에서 숨김이 아님: `hidden_files_filtered_and_optional`, `list_dir_sorts_dirs_first_and_filters_hidden`.
- `composite_nested_and_readonly_and_trash`: 중첩 아카이브(`outer.zip!/inner.zip!/n.txt`)에 쓰기 시 `PermissionDenied`(코드 5). 경로 형식은 이제 맞다. 열린 파일 핸들/교체 의미의 Windows 차이로 보이며 조사하지 않았다. **사용자 영향 가능**.
- `bindings_are_up_to_date`/`default_config_fixture_is_up_to_date`: 저장소 파일이 CRLF(autocrlf)라 생성 결과(LF)와 다름.
- vitest `pdf-preview`(알려진 소음). `keyboard-scenario-m3`는 cargo와 병렬일 때만 실패, 단독 통과.

## DoD baseline → after
1. `tsc --noEmit` — 0 → 0 (회귀 방지, 이미 통과)
2. vitest — (실행 불가) → 65개 파일 중 `pdf-preview`만 실패(알려진 소음), m3는 단독 통과
3. ts-client 경로 케이스 — 없음 → 49개 통과
4. Breadcrumb 테스트 — 없음 → 4개 통과
5. cargo test 경로 관련 실패 — 약 20개 → 0 (남은 것은 위 목록, 모두 비경로)
6. 실제 앱 — 미확인

## 추가 수정: 커서를 따라 스크롤이 안 됨 (UAT 중 발견)
- 증상: Windows에서 커서가 아래로 가도 스크롤이 따라가지 않고, 목록 위쪽에 빈 영역이 생김(스크롤바 썸은 맨 위).
- 원인(가설, 재현 테스트로 확인): `ui/FileTable.tsx` `scrollToFn`의 jsdom용 보정이 실제 브라우저에서도 발동했다. 읽은 `scrollTop`이 설정값과 다르면 `scrollTop`을 가짜 속성으로 덮는데, 배율이 100%가 아닌 Windows는 `scrollTop`을 물리 픽셀로 반올림해 늘 달라진다. 가짜 속성이 박히면 이후 실제 스크롤이 막히고 가상 리스트만 그 값을 따라 행을 그려 빈 영역이 생긴다.
- 수정: 보정을 `navigator.userAgent`에 jsdom이 들어 있을 때만 하도록 좁힘. 보정을 아예 지우면 jsdom 테스트가 깨진다(jsdom은 scrollTop 설정이 안 남음).
- 테스트: `scroll-follow.test.tsx` — 반올림되는 scrollTop·소수 clientHeight를 흉내 내 수정 전 실패(red) 확인 후 통과.
- 실제 앱에서 눈으로는 아직 확인 못 함(UAT).
- 알려진 flaky: `keyboard-scenario-m3`는 전체 실행에서 3회 중 1회쯤 실패(`cursorName`이 `docs.zip` 대신 `pack.zip`), 단독 실행은 통과. 이 수정과 무관.
