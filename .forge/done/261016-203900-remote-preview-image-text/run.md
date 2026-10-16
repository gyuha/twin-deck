# 실행 기록 — SFTP·FTP 원격 파일의 이미지·텍스트 미리보기 (task #190)

## 슬라이스 결과
- S1 Rust(TDD) — ✅ 계획대로. 공용 시험 `previews_remote_text_and_image_and_refuses_others`를 `per_protocol!`에 등록(FTP·SFTP 각 1개)하고 실패를 확인한 뒤(`찾을 수 없음: ftp://ftpbox/note.txt`), `Service::preview()`가 `td_vfs::is_remote(path)`이면 `read_preview_vfs(&self.fs, …)`로 읽게 했다. 로컬 전용 분기(cbz·PDF 직접 열기·폴더·압축 파일 미리보기)보다 앞에서 가른다.
- S2 UI(TDD) — ⚠ 계획에 없던 원인이 하나 더 있었다. 시험을 먼저 쓰고 4개 모두 실패를 확인했는데, Rust만이 아니라 **`store.ts`의 `loadPreview`가 원격 파일을 서비스에 묻지도 않고 "원격 파일은 바로 열거나 미리 볼 수 없습니다" 오류로 단락**하고 있었다. 그 단락을 지웠다. 그 밖에 `Preview.tsx`의 3D·Office·epub·HWP 판별을 `onDisk`(압축 안도 원격도 아님) 하나로 묶었고, `editBlockReason`에 원격을 추가했다(`edit.block.remote` ko·en).
- S3 문서 — ✅ README 한 쌍, `docs/01` VIEW-01, `docs/07`에 "원격 파일 미리보기"를 썼다.
- S4 실제 서버 확인 — ⚠ **하지 못함**(아래).

## 계획과 달라진 점
- ⚠ `FakeBackend.preview`를 실제 서비스처럼 고쳤다: 원격 경로의 PDF·오디오·동영상은 `other`로 돌려준다(그대로면 UI 시험이 실제로는 일어나지 않을 `video` 종류를 그린다). `packages/ts-client/src/fake.ts` 한 곳.
- ⚠ 사용자에게 보이는 안내 문구를 고쳤다: 열기·편집을 막는 `store.remote.no_open`이 "열거나 미리 볼 수 없습니다"라고 해서 이제 거짓이 됐다. "바로 열 수 없습니다 … (이미지·텍스트는 Space로 미리 볼 수 있습니다)"로 바꿨고, 이 문구를 단언하던 `remote-panel.test.tsx` 한 줄도 맞췄다. 원격 파일 열기(Enter)·편집(F4)·탐색기에서 보기를 막는 동작 자체는 그대로다.
- ⚠ **확인하지 못한 것**: 실제 서버의 지연·끊김. 시험의 가짜 SFTP는 앱이 쓰는 것과 같은 SSH/SFTP 프로토콜을 TCP로 주고받는 실제 서버(`FakeSftp`)지만 로컬 루프백이라 느린 연결·중간에 끊긴 연결은 보지 못했다. 실제 앱 창(WKWebView)에서 원격 미리보기를 열어 보지도 않았다.

## DoD baseline → after
1. `cargo test -p twin-deck-desktop 원격_미리보기 … | grep -c '^test .* ok$'`: 0 → 2 (앞방향, 빨강→초록 확인)
2. `vitest remote-preview.test.tsx`: 파일 없음 → 4 passed (앞방향, 구현 전 4개 모두 실패 확인)
3. 회귀 방어선: vitest 전체 170 files / 1444 passed · tsc 0 · `cargo test -p twin-deck-desktop` 158 passed · fmt ok · clippy ok (작성 시점에도 통과하던 것)
4. 문서: 0 → 3 (한국어 3곳), 0 → 1 (영어 README) (앞방향)
5. 실제 서버 확인: 하지 못함(위)
