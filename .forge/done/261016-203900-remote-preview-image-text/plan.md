<!-- forge-slug: remote-preview-image-text -->
<!-- task: 190 -->
<!-- tdd: on -->
# SFTP·FTP 원격 파일의 이미지·텍스트 미리보기

## 목표 / 하지 않을 것
- 목표: `sftp://…`·`ftp://…` 원격 패널에서 `Space`로 미리보기를 열면 **텍스트·코드·Markdown·JSON(앞 64KB)** 과 **이미지(설정 `preview.image_max_mb` 한도 안)** 가 로컬·압축 파일 안과 같게 보인다. 나머지 형식은 "미리 볼 수 없는 형식입니다"로 둔다.
- 원인: 서비스 `preview()`가 원격 경로를 로컬 파일처럼 `read_preview(LocalFs)`로 읽어 실패한다. 압축 파일 안 경로는 이미 가상 파일시스템 경로(`read_preview_vfs`)를 타고, 그 안의 원격 `read_head`는 구현돼 있다. 원격 경로도 같은 경로로 보내면 된다.
- 하지 않을 것:
  - PDF·오디오·동영상·Office·epub·HWP·3D 형식의 원격 미리보기(임시 다운로드가 필요하다. 별도 작업).
  - 원격 텍스트 **편집·저장**. 보기 전용이다(압축 안과 같이 편집을 막는다). 복사 버튼과 `Mod+C` 선택 복사는 그대로 둔다.
  - 원격만의 이미지 한도 설정 추가. 로컬과 같은 `image_max_mb`를 쓴다.
  - 원격 이미지 복사 변경: `copy_image_to_clipboard`는 이미 `self.fs`(합성 VFS)로 읽어 원격 이미지도 복사된다. 코드는 건드리지 않고 시험으로만 지킨다.
  - 새 설정 키, 새 Tauri 명령, 바인딩 변경. 버전·`CHANGELOG.md`·배포.

## 기준 문서
- 용어집: `.forge/CONTEXT.md` "미리보기" 절(변경 없음). 관련 ADR: 없음(되돌리기 쉬운 경로 분기라 ADR 조건을 채우지 않는다).
- 완료 정의(DoD) — 아래 명령은 작성 시점(2026-10-16)에 한 번씩 돌렸다:
  1. `cargo test -p twin-deck-desktop 원격_미리보기 2>&1 | grep -c '^test .* ok$'` → **2** (FTP·SFTP 각 1개). 작성 시점 0이다(앞방향 검사). **빨강→초록**: 구현 전에 새 시험이 실패(원격 경로 읽기 오류)함을 한 번 확인하고 `run.md`에 적는다. 이 시험은 텍스트(작은 파일·한도 초과로 잘림)·이미지(한도 안은 데이터 주소, 한도 초과는 `truncated`)·PDF·동영상·오디오(`Other`)·폴더(`Directory`)·없는 파일(오류)을 `Service`에 원격 URL을 넣어 단언한다. (필터 `원격_미리보기`로 0개가 돌아도 종료 코드는 0이라, 개수를 센다.)
  2. `cd apps/desktop && bunx vitest run src/__tests__/remote-preview.test.tsx`가 통과한다. 파일이 없어 지금은 실패(앞방향). 시험은 `FakeBackend`로 SFTP를 연결해 (a) 텍스트가 본문으로 보이고, (b) 이미지가 `img`로 보이고, (c) docx·pdf·mp4가 "미리 볼 수 없는 형식입니다"로 보이며 `fileUrl` fetch가 한 번도 일어나지 않고, (d) 텍스트 편집을 시작하면 "원격 파일은 미리보기에서 편집할 수 없습니다"가 보이고 편집창이 열리지 않고, (e) 원격 이미지 복사 버튼은 그대로 동작함을 확인한다.
  3. 회귀 방어선(작성 시점에도 통과): `cd apps/desktop && bunx vitest run` 전체 · `bunx tsc --noEmit` · `cargo test -p twin-deck-desktop` · `cargo fmt --check` · `cargo clippy -p twin-deck-desktop -- -D warnings`. 알려진 소음: 병렬 실행에서 `service::tests::coalesce_*`가 실패해도 단독 재실행이 통과하면 인정한다.
  4. 문서: `git grep -l '원격 파일 미리보기' -- README.md docs/01-feature-spec.md docs/07-ui-spec.md | wc -l` → **3**, `git grep -l 'Remote file preview' -- README.en.md | wc -l` → **1** (작성 시점 둘 다 0, 앞방향). README 한 쌍은 같은 커밋에서 맞춘다.
  5. 실제 서버 확인(자동 검사 불가, 사람이 확인): 실제 SFTP 서버에서 텍스트·이미지가 보이고, 느린 연결·끊긴 연결에서 오류 문구가 뜨는지. 못 하면 `run.md`와 완료 보고에 "확인하지 못함"으로 적는다(단위 시험의 가짜 서버만으로는 실제 지연을 모른다).

## 작업 쪼개기
- [ ] S1. Rust(TDD): `service.rs`의 `per_protocol!`에 `원격_미리보기는_텍스트와_이미지를_보여_주고_나머지는_거절한다` 시험(공용 함수 `previews_remote_text_and_image_and_refuses_others(make)`)을 먼저 쓰고 실패를 확인한 뒤, `Service::preview()`가 `td_vfs::is_remote(path)`이면 `read_preview_vfs(&self.fs, …)`로 읽게 한다(압축 안 분기와 같은 방식, `cbz`·PDF 직접 열기·`dir_preview`·`archive_preview`의 로컬 전용 분기보다 앞에서 가른다). — 완료 기준: DoD 1, 3
- [ ] S2. UI(TDD): `remote-preview.test.tsx`를 먼저 쓰고(FakeBackend가 원격 경로의 `preview`·`fileUrl`을 어떻게 다루는지 확인해 필요하면 시험용 지원만 `fake.ts`에 더한다), 실패를 확인한 뒤 `Preview.tsx`에서 3D·Office·epub·HWP 판별이 원격 경로를 로컬 파일로 보지 않게 한다(`isArchivePath` 조건을 "로컬 디스크 파일" 판별 하나로 묶는다). `lib/previewEdit.ts`의 `editBlockReason`에 원격 경로를 추가하고 문구 `edit.block.remote`("원격 파일은 미리보기에서 편집할 수 없습니다" / "Remote files cannot be edited in the preview")를 `ko.ts`·`en.ts`에 넣는다. 압축 파일 안 경로는 현행 동작을 그대로 지킨다. — 완료 기준: DoD 2, 3 (depends: S1)
- [ ] S3. 문서: `README.md`·`README.en.md`(미리보기 절), `docs/01-feature-spec.md` VIEW-01, `docs/07-ui-spec.md`에 "원격 파일 미리보기"(이미지·텍스트만, 보기 전용, 나머지 형식은 미리 볼 수 없음, 이미지 한도는 `image_max_mb`)를 쓴다. 기존 "압축 파일 안" 문장과 같은 자리에 넣는다. — 완료 기준: DoD 4 (depends: S2)
- [ ] S4. 실제 서버 확인과 기록: 가능하면 실제 SFTP 서버로 DoD 5를 확인하고, 확인한 것과 못 한 것을 `run.md`에 있는 그대로 적는다. — 완료 기준: DoD 5 (depends: S3)
