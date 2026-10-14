---
last_mapped_commit: 8a4f46c193d6d3ec7cab83bab41bfbf703e170c8
mapped: 2026-10-14
---

# 주의 지점과 검증 한계

## 근거와 범위

- 이 문서는 소스와 저장소 지침을 읽어 작성했다. 이번 지도 작성에서는 테스트, 실제 앱, Windows 빌드를 실행하지 않았다.
- 아래의 구조적 위험은 확인된 장애나 보안 취약점이라는 뜻이 아니다. 재현 없이 결함으로 단정하지 않는다.
- `AGENTS.md`에 기록된 기존 검사 문제와 플랫폼 검증 한계는 현재 실행 결과와 구별한다.

## 알려진 검사 문제

- `AGENTS.md`는 `apps/desktop/src-tauri/src/service.rs`의 `coalesce_*` 테스트가 병렬 실행에서 간헐적으로 실패하고 단독 실행에서는 통과한다고 기록한다. 실제 테스트는 1ms 간격 송신, 50ms 모으기, 배치 수와 마지막 처리 시각을 비교한다. 스케줄링 부하가 있는 환경에서 실패 원인을 제품 회귀와 분리해야 한다.
- 같은 지침은 `service.rs` 테스트의 기존 `root.clone()` 때문에 전체 대상 Clippy가 실패한다고 기록한다. 해당 코드가 존재하지만 이번 작업에서 오류 재현은 하지 않았다. 크레이트 단위 `cargo clippy -p <crate> -- -D warnings`와 전체 대상 검사의 차이를 검증 보고에 남긴다.
- 이전 `Blob`/Spacedrive 시험 경로 문제는 `apps/desktop/src/test-setup.ts`, `apps/desktop/src/__tests__/spacedrive-path.ts`에서 해결되었다고 `AGENTS.md`에 기록되어 있다. 현재 미해결 결함 목록으로 재사용하지 않는다.

## 변경 영향이 큰 파일

- `apps/desktop/src/state/store.ts`는 3,470줄에 상태와 큰 `api` 객체를 담는다. 탐색, 선택, 설정, 전송, 미리보기의 변경이 같은 파일에서 만나는 구조이므로 인접 비동기 흐름과 상태 복원을 함께 확인한다.
- `apps/desktop/src-tauri/src/service.rs`는 테스트 포함 3,316줄이다. 파일 작업, 큐, 감시, 검색, 미리보기 기능의 연결점이므로 단순 명령 래퍼만 시험해서는 서비스 동작을 확인할 수 없다.
- `apps/desktop/src/ui/useKeyboard.ts`, `apps/desktop/src/actions.ts`, `packages/actions/src/defaults.ts`가 키 처리 책임을 나눈다. 대화상자의 특수 처리와 액션 범위를 건너뛰면 같은 키가 다른 화면에서 다르게 처리될 수 있다.
- 타입·명령 변경은 `apps/desktop/src-tauri/src/commands.rs`, `packages/ts-client/src/generated/bindings.ts`, `packages/ts-client/src/backend.ts`, `packages/ts-client/src/tauri.ts`, `packages/ts-client/src/fake.ts`를 함께 맞춰야 한다. 자동 생성 파일만 수동으로 고치면 이후 생성 결과와 어긋난다.

## 파일 작업과 경로

- `crates/td-vfs/src/local.rs`의 `retry_nfd`는 NFC 표시 경로와 macOS/SMB의 NFD 경로 차이를 처리한다. 새 파일 작업에서도 기존 재시도 방식을 유지해야 한다. 모든 운영체제의 경로 동작이 동일하다고 가정하지 않는다.
- `crates/td-ops/src/ops.rs`는 동일 경로와 하위 경로 판정에 정규화된 실제 경로를 사용하고, 정규화 실패 시 원래 경로로 돌아간다. 존재하지 않는 대상, 링크, 네트워크 볼륨을 바꾸는 작업은 관련 보호 조건을 별도로 검증할 가치가 있다. 이 분기 자체를 결함으로 판정하지 않는다.
- `crates/td-archive/src/archive.rs`는 추출 전 전체 항목의 경로와 링크·특수 파일을 검사하고 기존 파일을 덮어쓰지 않는다. 이 방어는 `crates/td-archive/tests/read.rs`에 시험이 있으므로 추출 구현을 바꿀 때 유지한다.
- 같은 아카이브 구현의 `read()`는 전체 내용을 메모리에 읽고, `open_nested()`는 중첩 내용을 임시 파일로 푼다. 대형·고압축률 입력의 자원 사용은 호출부 제한과 함께 검토해야 하며, 해당 함수 자체에는 읽을 바이트 수 인수가 없다.

## 웹뷰와 외부 문서의 경계

- `apps/desktop/src-tauri/tauri.conf.json`은 CSP를 `null`로 두고 asset protocol 범위를 `**`로 연다. 파일 관리자와 미리보기에 필요한 접근 범위이지만, 신뢰하지 않는 문서가 실행 가능한 앱 콘텐츠로 들어오지 않도록 렌더링 경계를 유지해야 한다. 설정만으로 실제 공격 가능성을 입증한 것은 아니다.
- `apps/desktop/src/lib/office/index.ts`는 DOMPurify로 문서 HTML을 정화한다. `apps/desktop/src/__tests__/office-sanitize.test.ts`가 회귀 방어를 담당한다. HTML 변환기 교체 시 정화 단계를 우회하지 않는다.
- `apps/desktop/src/ui/QuickLookView.tsx`, `apps/desktop/src/ui/EpubView.tsx`는 스크립트를 허용하지 않는 `sandbox="allow-same-origin"` iframe을 사용한다. 미리보기 상호작용을 늘릴 때 sandbox 권한 변경을 따로 검토한다.
- `apps/desktop/src-tauri/capabilities/default.json`은 `main`과 `win-*` 창에 기본 권한을 부여한다. 새 창이나 외부 콘텐츠 로딩을 추가하면 창 범위와 권한 연결을 다시 확인한다.

## 성능과 비동기 처리

- `apps/desktop/src/ui/FileTable.tsx`는 TanStack 가상 목록과 overscan 8을 사용한다. DOM 행 수 제한이 디렉터리 읽기·정렬·IPC 비용까지 없애지는 않는다. `crates/td-vfs/src/local.rs`의 목록 읽기는 항목별 메타데이터를 얻어 `Vec`에 모은다.
- `crates/td-vfs/src/preview.rs`는 텍스트·이미지·오디오·PDF 크기를 제한하며, `apps/desktop/src-tauri/src/service.rs`에도 아카이브 미리보기의 크기·행·깊이 제한이 있다. 새 미리보기 경로가 기존 제한을 적용하는지 확인한다.
- `crates/td-terminal/src/lib.rs`, `crates/td-queue/src/queue.rs`에는 공유 상태 잠금의 `unwrap()`이 있다. 잠금 안에서 패닉이 발생하면 후속 접근도 실패할 수 있는 구조적 특성이며, 이번 조사에서 실제 패닉은 확인하지 않았다.

## 플랫폼과 검증 공백

- `apps/desktop/src/ui/DragLayer.tsx`의 포인터 드래그와 창 밖 네이티브 드래그 전환은 DOM 시험만으로 OS 커서와 수정자 키 동작을 보장할 수 없다.
- `apps/desktop/src/ui/PdfView.tsx`, `apps/desktop/src/ui/previewScroll.ts`의 iframe/PDF 처리와 영상 asset protocol은 실제 WKWebView에서 확인해야 한다. `packages/ts-client/src/fake.ts` 기반 시험은 네이티브 웹뷰의 대체물이 아니다.
- `AGENTS.md`에 따르면 macOS에서 전체 앱의 Windows 교차 검사는 `zstd-sys`의 MSVC 도구 체인 요구로 제한된다. `crates/td-cli`의 교차 검사와 실제 Windows 앱·`apps/desktop/src-tauri/windows/hooks.nsh` 설치기 실행 검증을 구분한다.
- `docs/09-platform-support.md`에는 설계안과 과거 미확인 과제가 섞여 있다. 예컨대 단일 인스턴스 구현 설명 뒤에도 이를 미확인으로 적은 표가 있으므로, 현행 지원 여부는 소스와 실제 플랫폼 결과로 확인한다.

## 최근 확장자 컬럼 변경의 회귀 지점

- `apps/desktop/src/ui/Settings.tsx`의 확장자 컬럼 스위치는 독립 불리언이 아니라 `view.table.columns` 배열을 수정한다. 다른 컬럼의 순서와 설정을 보존하는지가 후속 변경의 확인 지점이다.
- `apps/desktop/src/ui/FileTable.tsx`와 `apps/desktop/src/__tests__/columns-sort.test.tsx`에서 헤더 정렬, 빈 확장자 셀, 확장자를 유지한 파일명을 함께 유지한다. 컬럼 표시 여부와 이미 선택된 정렬 기준을 같은 상태로 취급하지 않는다.
- 확장자 컬럼 적용 범위: `apps/desktop/src/ui/FileTable.tsx`의 `hasExtColumn`은 여러 열 보기(`multi`)에서 꺼져 있어 이름에서 확장자를 빼지 않는다. 빠른 선택 중에는 `QuickHighlight`가 `e.name` 전체를 그려 확장자를 포함해 보여 준다. 두 경로가 일반 표 행과 이름 표시 방식이 다르므로 이름 표시를 바꿀 때 함께 확인한다.

## 배포와 공개 경계

- `.github/workflows/release.yml`의 `publish` job은 `environment: release`를 쓰지만 Required reviewers가 없어, 두 OS 업로드가 끝나면 승인 없이 곧바로 공개하고 Homebrew tap을 갱신한다. 공개는 되돌릴 수 없다. `Taskfile.yml`의 `deploy`도 Required reviewers 존재 점검을 없앴으므로 환경 보호 설정이 빠져 있어도 막지 않는다. 승인 단계는 Environment 설정에서 다시 지정해야만 되살아난다.
- `AGENTS.md`의 "배포해줘" 절차(7번)는 승인 없이 공개되는 현재 워크플로에 맞춰져 있고, 에이전트가 `task deploy`를 사용자 요청 없이 실행하지 않는다는 규칙이 공개 전 유일한 사람 확인(요청 자체와 `task deploy`의 `[y/N]` 프롬프트)이다.

## 터미널과 설정 호환

- `crates/td-terminal/src/lib.rs`의 `resolve_shell`은 Unix에서 `$SHELL`(없으면 `/bin/sh`)을 로그인 셸(`-l`)로 연다. 사용자의 `.zprofile`/`.zshrc`가 실행되므로 느리거나 출력을 내는 프로필이 터미널 시작에 영향을 줄 수 있다. 시험은 `/bin/zsh`가 있을 때만 프로필 로딩을 확인한다. Windows 셸 선택 경로는 그대로이며 이 환경에서 실행 검증되지 않았다.
- 같은 파일의 `ensure_utf8_locale`은 locale이 비었거나 `C`/`POSIX`일 때만 자식 PTY에 UTF-8 locale(macOS `en_US.UTF-8`, 그 밖 `C.UTF-8`)을 채운다. 해당 locale이 대상 시스템에 설치돼 있는지는 시험하지 않는다.
- 글자색은 `behavior.text_color_dark`/`text_color_light`와 이전 공통 키 `text_color`가 공존한다(`crates/td-config/src/config.rs`, `apps/desktop/src/ui/fonts.ts`의 `useTextColor`). 테마 키가 비면 `text_color`로 폴백하고, 세 키 모두 `crates/td-config/src/load.rs`의 `validate_text_color`가 검증한다. 설정 화면은 `text_color`를 `hideWhenEmpty`로 숨기므로 값이 있는 기존 사용자만 보인다. 폴백 규칙을 바꾸면 `default.toml`, 생성 파일, 설정 화면을 함께 맞춘다.

## 도움말 검색

- `apps/desktop/src/lib/helpSearch.ts`는 `es-hangul`의 `disassemble`로 자소 단위 비교를 한다. 매 호출마다 모든 필드를 다시 분해(`helpMatches`)하므로 도움말 항목이 많거나 입력이 잦으면 비용이 늘 수 있다. 측정한 문제는 아니다. 외부 의존성(`apps/desktop/package.json`)이 추가되었으며 하이라이트 위치 계산은 `starts` 매핑에 의존하므로, 서로게이트 쌍과 NFC 정규화 경계는 `apps/desktop/src/__tests__/help-screen.test.tsx`로 확인한다.
