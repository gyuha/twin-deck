<!-- forge-slug: archive-entry-preview -->
<!-- task: 114 -->
<!-- tdd: off -->
# 압축 파일 안의 파일(`foo.zip!/a.txt`)을 미리보기에서 내용으로 보여 준다

## 목표 / 하지 않을 것
- 목표: 압축 파일을 폴더처럼 연 패널에서 안의 파일(`foo.zip!/inner/a.txt`)에 커서를 두고 미리보기를 열면 내용이 보인다. 텍스트·코드·마크다운은 글로, 이미지는 그림으로 보인다. 보기 전용이며 **편집 기능은 동작하지 않는다**(더블클릭 편집·`Mod+S` 저장이 압축 안 파일에서는 시작되지 않는다). (GitHub 이슈 #37)
  - 원인(코드로 확인, [높음]): `Service::preview`는 압축 안 경로에서 `Path::is_file()`이 거짓이라 `archive_preview`(압축 파일 자체의 트리)를 건너뛰고, `td_vfs::read_preview`가 `fs::metadata`로 실제 파일시스템을 직접 읽어 실패한다. 이슈 #5(`archive-preview-tree`)가 "압축 안 파일의 내용 미리보기"를 하지 않을 것으로 남겨 둔 곳이다.
  - 구현 방향: 압축 안 경로(`CompositeFs::is_archive_path`가 참인 경로)는 `Vfs::read_head`/`stat`으로 읽는다. 텍스트·이미지 판정과 한도(`PreviewLimits`)는 `read_preview`와 같게 쓴다. 폴더 항목은 압축 안 폴더의 하위 트리 또는 `Directory`로 처리하고, 없는 항목은 오류다.
- 하지 않을 것: 영상·오디오·PDF·3D·Office·cbz 등 바이트가 아닌 방식으로 보는 종류(이 경우 '미리볼 수 없음'으로 두고 한계를 CHANGELOG에 한 줄 적는다) · 압축 안 파일의 편집·저장(막는다) · 임시 폴더로 풀어서 보여 주기 · 비밀번호 압축 · 새 설정 키 · 릴리스·버전 변경

## 기준 문서
- 용어: `.forge/CONTEXT.md`에 해당 용어 없음
- 관련 ADR: `docs/adr/0012-archive-path-notation.md`(압축 경로 표기 `foo.zip!/inner`)
- 관련 이슈: GitHub 이슈 #37
- 이슈 추적: GitHub 이슈 #37
- 갱신할 문서: `docs/` 중 미리보기 설명(있으면), 키 변경은 없다
- 완료 정의(DoD) = `.forge/loop.md`의 C1~C5:
  1. `cargo test -p twin-deck-desktop preview_archive_entry` 통과 ≥ 1, 실패 0 (사전 상태: 그 이름의 테스트가 없어 0건 — 앞으로 가는 확인). zip 안 텍스트·PNG를 만들어 `svc.preview("<zip>!/x.txt")`가 `Text`와 실제 내용을, 이미지는 원본 바이트로 만든 `data_url`을, 없는 항목은 오류를 돌려주는지 단언한다.
  2. `cd apps/desktop && bunx vitest run src/__tests__ -t "압축 안 파일 미리보기"` 통과 ≥ 2, 실패 0 (사전 상태: 0건 — 앞으로 가는 확인). 내용이 보이는 테스트와, 압축 안 파일에서 더블클릭·`Mod+S`로 편집·저장이 시작되지 않는 테스트(기존 `editBlockReason` 경로 활용)를 포함한다.
  3. 회귀 방지(이미 통과 중): `cargo test -p td-vfs -p td-archive -p td-ops` 전부 통과, `cargo test -p twin-deck-desktop`은 기준선 소음(`coalesce_*`)만 예외, `cd apps/desktop && bunx vitest run`은 기준선 소음(`pdf-preview`)만 예외.
  4. `task gen-types` 뒤 `cargo test -p twin-deck-desktop up_to_date` 통과, `cargo clippy -p twin-deck-desktop -p td-vfs -p td-archive -- -D warnings`, `cd apps/desktop && bunx tsc --noEmit` 통과 (회귀 방지).
  5. 회귀 방지: `cargo test -p twin-deck-desktop preview_archive`, `preview_cbz`, `preview_dto_maps_kinds`가 계속 통과한다.
  6. 실제 앱 확인(자동 테스트가 못 보는 부분): 압축 패널에서 안의 텍스트·이미지에 미리보기를 열어 본다. WKWebView 동작은 기계로 검증하지 않으므로 사람이 본다.

## 작업 조각
- [ ] S1. 백엔드 — `Service::preview`가 압축 안 경로를 `CompositeFs`로 읽어 텍스트·이미지 미리보기를 돌려준다(없는 항목 오류, 한도·잘림 처리), 테스트 `preview_archive_entry_*` 추가. — 완료 기준: DoD 1, 5
- [ ] S2. 연결 — 바인딩이 바뀌면 `task gen-types`, `Backend`·`fake.ts`가 압축 안 경로 미리보기를 돌려주게 하고, `Preview.tsx`가 그대로 보여 주는지 확인해 필요한 만큼만 고친다. 테스트 "압축 안 파일 미리보기" 추가(편집 차단 포함, 압축 안 경로면 `editBlockReason`이 막는다). (depends: S1) — 완료 기준: DoD 2, 4
- [ ] S3. 문서·정리 — 미리보기 설명 문서에 압축 안 파일 지원과 한계(영상·PDF 등 미지원)를 적는다. (depends: S2) — 완료 기준: `grep -rc "압축 안" docs/` 로 해당 문장이 1 이상
