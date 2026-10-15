<!-- forge-slug: config-export-import -->
<!-- task: 166 -->
<!-- part: 2/2 -->
<!-- tdd: off -->
# 설정 내보내기·가져오기 (zip) (이슈 #71)

## Goal / Non-goals
- Goal: 설정 화면에서 현재 `config.toml`·`keybindings.toml`을 zip 하나로 내보내고, 그 zip을 골라 가져올 수 있게 한다. 가져오면 지금 파일은 `.bak`으로 백업되고 새 설정이 바로 적용된다. 지정 저장 경로(task 165)를 쓰고 있으면 그 경로의 파일이 대상이다.
- Non-goals: 키 일부만 가져오기·병합, `state.json` 포함, 다른 형식(TOML 하나·폴더), 액션·단축키 추가.

## Source of truth
- Glossary terms: none
- Related ADRs: docs/adr/0006-toml-config.md
- Definition of Done:
  1. `cargo test -p td-config`가 통과하고, 다음을 단언하는 테스트(이름에 `export`/`import` 포함)가 있다: 내보낸 zip을 다시 열면 두 파일 내용이 원본과 바이트 단위로 같음, 빈 폴더(파일 없음)에서도 내보내기는 있는 파일만 담고 성공함, 가져오기 후 대상 폴더의 파일이 zip 내용과 같고 기존 파일이 `.bak`으로 남음, config.toml이 TOML 문법 오류이거나 zip에 config.toml·keybindings.toml이 하나도 없으면 가져오기를 거부하고 기존 파일은 그대로임, zip 안의 `../` 같은 경로는 무시하거나 거부함.
  2. `cargo test -p twin-deck-desktop`가 통과한다(`up_to_date` 포함). `export_config`/`import_config` 명령이 등록돼 있고, 서비스 또는 명령 테스트가 가져오기 후 새 Loaded가 그 값을 반영함을 확인한다.
  3. 설정 화면에 "내보내기…"(저장 위치 선택 창, 기본 이름 `twin-deck-settings.zip`)와 "가져오기…"(파일 선택 창, zip 필터) 버튼이 있다. 가져오기 전에 `ask()`로 확인하고, 성공·실패를 알린다. vitest가 FakeBackend로 두 흐름을 시험하고, 테스트 파일에 "내보내기"·"가져오기" 문구가 있다. ko·en 사전 모두 갖춘다.
  4. `bunx tsc --noEmit`, `cargo clippy -p td-config -p twin-deck-desktop -- -D warnings`, `cargo fmt --all --check`가 통과한다.
  5. `docs/06-config-plugins.md`에 `## … 내보내기` 제목의 절이 있다(zip에 담기는 파일, .bak 백업, 거부 조건).

## Work slices
- [ ] S1. td-config: `export_zip(dir, dest)`·`import_zip(src, dir)` 구현. zip 쓰기는 td-config에 `zip` 의존성(td-archive와 같은 버전 8.6.0)을 더해서 한다. 쓰기는 임시 파일 → 이름 바꾸기. 가져오기는 먼저 전부 검증한 뒤 쓴다. — 완료 기준: DoD 1
- [ ] S2. src-tauri 명령 `export_config(dest)`·`import_config(src)` 추가(현재 설정 폴더 대상, 가져온 뒤 store refresh 후 Loaded 반환·`ConfigChanged`). `task gen-types`. — 완료 기준: DoD 2 (depends: S1)
- [ ] S3. ts-client backend·tauri·fake에 추가. 파일 저장·열기 선택 창은 task 165가 넣은 `tauri-plugin-dialog`를 쓴다(`pickSaveFile`·`pickFile`). 165가 아직 없으면 같은 방식으로 이 작업에서 넣는다. — 완료 기준: tsc 통과 (depends: S2)
- [ ] S4. UI 버튼·확인 대화상자·i18n·vitest. — 완료 기준: DoD 3 (depends: S3)
- [ ] S5. docs/06 내보내기 절. — 완료 기준: DoD 5
