<!-- forge-slug: docs-record-fixes -->
<!-- task: 96 -->
<!-- tdd: off -->
<!-- priority: medium -->
# 바뀐 동작과 어긋난 문서·기록을 바로잡는다 (리뷰 J, 공개 댓글 제외)

## Goal / Non-goals
- Goal: (1) `docs/07-ui-spec.md` 상위 폴더 이동 줄의 "macOS의 `Alt+↑`"는 틀렸다(`Alt+↑`는 Windows/Linux, macOS는 Backspace). 고친다 (2) 드라이브 바 설명(설정 화면 `Settings.tsx`, `config.rs` 주석, README)이 "남은 용량"을 드라이브 바 안의 것으로 적고 있어 경로 표시줄 오른쪽 끝으로 옮겨졌음을 반영한다 (3) 봉인된 #86 `run.md`의 "outline 표시"와 #87 `STATUS.md`·`run.md`의 `text_brightness` 기록에 정정 노트를 덧붙인다(원문은 지우지 않는다). 이슈 #22의 공개 댓글 정정은 이 작업에 포함하지 않는다(외부 글쓰기라 사용자 승인이 필요하다).
- 요청 경위: v0.5.1 이후 미출시 변경 전체 적대적 리뷰의 발견을 사용자가 "전체를 묶어 fg-loop로 무인 처리"로 지시했다.
- Non-goals:
- GitHub 댓글 수정
- 동작 변경
- 같은 리뷰의 다른 발견, CSP 변경, 이슈 #22 공개 댓글 정정은 이 작업 밖이다.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 이슈 추적: 없음(리뷰 발견)
- 사전 확인(작성 시점): 리뷰 J. `defaults.ts:309`의 `core.go.up` `Alt+Up`은 other 플랫폼만. `docs/05-actions-keybindings.md:118`은 맞다. 설정 화면 53행 `show_drive_bar` 설명과 `config.rs:80` 주석이 용량을 언급한다.
- Definition of Done (착수 전 기준선: vitest(pdf-preview 제외) 820건 통과 + `model-formats.test.ts` 1파일은 jsdom에 canvas가 없어 로드 실패하는 기준선 잡음, `tsc` 0):
  1. `grep -c 'macOS의 `Alt+↑`' docs/07-ui-spec.md` → 0 (착수 전 1), `docs/07-ui-spec.md`에 `Backspace`가 상위 폴더 줄에 있다
  2. `grep -c '남은 용량' apps/desktop/src/ui/Settings.tsx` → 0 (착수 전 1, 드라이브 바 항목 설명에서), `crates/td-config/src/config.rs`의 `show_drive_bar` 주석에서 "남은 용량"이 빠지거나 경로 표시줄로 옮겨졌다고 적혀 있다, README 26행이 용량을 경로 표시줄로 적는다
  3. `grep -c '정정' .forge/done/*-tab-drag-reorder/run.md .forge/done/*-text-brightness/run.md .forge/done/*-text-brightness/STATUS.md`가 각각 ≥ 1
  4. `cd apps/desktop && bunx vitest run --exclude '**/pdf-preview*'`에서 새로 실패하는 파일이 없다(설정 화면 설명 텍스트를 단언하는 테스트가 있으면 같이 맞춘다), `cargo test -p td-config` 통과, `task gen-types` 후 `up_to_date` 통과

## Work slices
- [ ] S1. 문서·설명·기록 수정 — completion criterion: DoD 1~4 (이 작업은 테스트가 아니라 grep으로 검증하므로 red 단계가 없다)
