# M2(P1) 구현 상태

2026-09-29 기준. 근거는 각 행의 테스트 파일이며, 모두 로컬 macOS(Apple M1 Max, macOS 26.4.1)에서 실행한 결과다. Windows와 Linux에서는 실행하지 않았고, 실제 Tauri 창에서 앱을 띄워 확인하지도 못했다 `[알 수 없음]`. 상태 열의 `done`은 "이 행의 테스트가 통과한다"는 뜻이지 "실제 앱에서 확인했다"는 뜻이 아니다. 실제 OS 부작용(언마운트, 파일 관리자 열기, 외부 편집기, 클립보드, 창 생성)은 fake로만 검증했고 비고에 `fake만 검증`이라고 적었다.

## P1 항목

| ID | 상태 | 검증 테스트 | 비고 |
|---|---|---|---|
| PANE-03 | done | crates/td-state/tests/state.rs | 창 레이블 규칙, 창별 상태 파일, capability 패턴 일치는 실제 파일·JSON으로 검증(`window_labels_unique`, `capabilities_cover_new_windows`). **창 생성(`TauriSpawner`)은 fake만 검증** — restore-state.test.tsx |
| PANE-05 | done | apps/desktop/src/__tests__/restore-state.test.tsx | 탭·위치·커서·선택·정렬·표시 모드·숨김·활성 패널·Actions Panel 검색어. 터미널 높이는 M3. `core.state.reset`의 앱 종료(`app.exit`)는 실행하지 않음 |
| PANE-07 | done | apps/desktop/src/__tests__/action-bar.test.tsx | `layout.action_bar`, `behavior.layout.show_action_bar`, 현재 키 표기 |
| NAV-02 | done | apps/desktop/src/__tests__/columns-sort.test.tsx | Alt+PageUp/PageDown, 5행 단위 |
| NAV-05 | done | apps/desktop/src/__tests__/columns-sort.test.tsx | 다중 컬럼에서 Left/Right. 열 우선 배치 |
| NAV-06 | done | apps/desktop/src/__tests__/config.test.tsx | 순환 선택, 오른쪽 클릭 선택, Quick Select 접두 일치/아무 문자 활성화 옵션 |
| NAV-07 | done | crates/td-volumes/tests/volumes.rs | 볼륨 감지와 메뉴(menus.test.tsx). **언마운트/추출은 fake만 검증**(`SystemUnmounter`가 diskutil/umount를 실제로 부르지 않음). Windows 볼륨 감지 코드는 컴파일/실행 검증 못 함 |
| NAV-08 | done | apps/desktop/src/__tests__/menus.test.tsx | 즐겨찾기 구분선·그룹(한 단계)·숫자키·추가 액션. "편집"은 UI가 아니라 config.toml 직접 편집 |
| NAV-09 | done | apps/desktop/src/__tests__/menus.test.tsx | 탭별, 탭을 닫으면 사라짐, 비우기 |
| NAV-10 | done | apps/desktop/src/__tests__/menus.test.tsx | 루트까지의 상위 목록 |
| NAV-11 | done | apps/desktop/src/__tests__/menus.test.tsx | Tab 완성, `~` 확장. 아카이브 안 Go To Path는 M3 |
| SEL-03 | done | apps/desktop/src/__tests__/file-actions.test.tsx | 선택 반전, 현재 항목 반전 (기본 키 없음) |
| SEL-04 | done | crates/td-vfs/tests/info_glob.rs | glob 매처는 Rust가 원본, TS는 같은 26개 케이스 표로 검증(packages/ts-client/src/client.test.ts). UI: file-actions.test.tsx. Marta의 패턴 문법은 확인하지 못함 |
| OP-08 | done | crates/td-ops/tests/ops.rs | `duplicate_suffix`. 접미사 규칙은 자체 정의(`a copy.txt`). UI: file-actions.test.tsx |
| OP-09 | done | apps/desktop/src/__tests__/file-actions.test.tsx | **외부 편집기 실행은 fake만 검증**. 명령 조립은 crates/td-launch/tests/launch.rs (`launch_editor_args`) |
| OP-10 | done | apps/desktop/src/__tests__/file-actions.test.tsx | `copy.to_inactive`/`move.to_inactive`. F5/F6도 대상 경로 확인 대화상자가 없어서 같은 동작이다(docs/07 §6의 수정 가능한 확인 대화상자는 미구현) |
| OP-13 | done | apps/desktop/src/__tests__/config.test.tsx | 삭제/휴지통 확인 on/off |
| OP-14 | done | crates/td-vfs/tests/info_glob.rs | `file_info_fields`. UI: file-actions.test.tsx. 폴더는 항목 수만(재귀 크기 없음) |
| OP-15 | done | apps/desktop/src/__tests__/file-actions.test.tsx | **클립보드 쓰기는 fake만 검증**(Tauri 플러그인 호출은 실제로 실행하지 않음) |
| OP-16 | done | crates/td-launch/tests/launch.rs | `launch_reveal_args`. **파일 관리자 열기는 fake만 검증**. UI: file-actions.test.tsx |
| Q-01 | done | crates/td-queue/tests/queue.rs | 순차 실행, 일시정지/재개/중단, 실패 요약. 자체 구현(`sd-task-system` 이식 안 함) |
| Q-02 | done | apps/desktop/src/__tests__/queue-ui.test.tsx | 우상단 진행 표시, 큐가 비면 사라짐 |
| Q-03 | done | apps/desktop/src/__tests__/queue-ui.test.tsx | `=`, ↑↓/Space, P, A/D, Esc |
| VIEW-01 | done | apps/desktop/src/__tests__/preview.test.tsx | 텍스트·이미지. Space는 미리보기로 재배정(선택 토글은 Insert/Shift+Space). Rust: crates/td-vfs/tests/preview.rs |
| CFG-02 | done | apps/desktop/src/__tests__/config.test.tsx | 수정자, 인수, `none` 해제, OS 섹션. 병합 로직은 packages/actions/src/actions.test.ts, 파싱은 crates/td-config/tests/config.rs |
| CFG-03 | done | apps/desktop/src/__tests__/theme.test.tsx | 라이트/다크/system만(5종 재현은 P3). 색 대비(WCAG AA)는 검증하지 않음 |
| CFG-05 | done | apps/desktop/src/__tests__/lib.test.ts | 상대 날짜, 날짜/시간 strftime 부분집합, 크기 표기. 아이콘 크기(`icon_size`)는 M2 시점에는 설정만 받았고, 이후 파일 목록 행의 아이콘 크기로 쓰인다(Material Icon Theme, `apps/desktop/src/__tests__/file-icons.test.tsx`) |
| CFG-06 | done | crates/td-config/tests/config.rs | `columns_spec_parse`. `<`=오름차순, `>`=내림차순 해석은 가정 `[낮음]`. `added`는 값을 얻을 수 없어 "—" |
| CFG-07 | done | apps/desktop/src/__tests__/columns-sort.test.tsx | Table, 다중 컬럼 1~3, 탭별 |
| CFG-08 | done | apps/desktop/src/__tests__/columns-sort.test.tsx | `core.view.order` 인수, 기본 키는 자체 정의 |
| ACT-01 | done | apps/desktop/src/__tests__/actions-panel.test.tsx | 퍼지 검색, Enter 실행, Alt로 ID 표시 |
| ACT-03 | done | apps/desktop/src/__tests__/actions-panel.test.tsx | `Alt+H` → `core.open.directory src="~"` |

## 종단 시나리오

- 키보드만: apps/desktop/src/__tests__/keyboard-scenario-m2.test.tsx — 볼륨 메뉴 → Go To Path → 크기 정렬 → 패턴 선택 → 큐 복사(일시정지/재개) → Actions Panel 복제 → 미리보기 → 상태 저장. 백엔드는 인메모리 `FakeBackend`.
- M1 시나리오(keyboard-scenario.test.tsx)도 그대로 통과한다.

## docs/11 M2 완료 기준 대조

| 기준 | 결과 |
|---|---|
| 10만 항목 디렉터리의 열기·스크롤·정렬 시간을 측정해 임계값을 정하고 문서에 기록. 넘으면 원인 분석 | 열기·정렬은 측정하고 임계값(가설)과 판정을 docs/m2-benchmark.md에 기록. 넘은 항목(Rust 정렬 711 ms)은 원인을 분석해 34 ms로 고쳤다. **스크롤 프레임, IPC 전송, 실제 웹뷰 렌더는 측정하지 못했다** |
| 사용자 `keybindings.toml`로 기본 바인딩을 바꾸고 해제할 수 있다 | 충족 (CFG-02). 실제 파일 감시 재로딩은 `config_watch_reload`, UI 반영은 config.test.tsx |
| 3개 OS에서 Volumes 메뉴가 실제 마운트를 보여 주고 언마운트가 동작한다 | **macOS에서 마운트 목록만 실제로 확인.** 언마운트는 fake, Windows/Linux는 미검증(Linux 파서는 픽스처 테스트) |
| 큐에서 진행 중인 복사를 일시정지·재개·중단할 수 있다 | 충족 (Q-01~03). 항목(파일/폴더) 경계에서 반영되고 파일 하나를 복사하는 도중에는 멈추지 않는다 |
| 설정 파일 오류가 앱을 죽이지 않고 경고로 표시된다 | 충족 (`config_invalid_keeps_running`, config.test.tsx의 경고 표시) |

## 알려진 한계와 후속

- 실제 Tauri 런타임에서 명령·이벤트 왕복(설정 감시, 큐 이벤트, 상태 저장, 새 창)을 실행해 보지 못했다. 각 계층을 따로 검증했을 뿐이다. 이전에 이 종류의 공백 때문에 앱이 빈 화면이 된 적이 있어(권한 누락) 부팅 경로에는 IPC 모킹 테스트와 capability 검사 테스트를 두었지만, 실제 창 확인을 대신하지는 못한다.
- 간헐 실패를 두 차례 발견해 고쳤다(설정 감시 이벤트 유실에 대한 폴링 폴백, 감시 테스트의 레이스). 파일 이벤트가 늦거나 유실되는 근본 원인은 식별하지 못했다. `td-watch`(목록 갱신)에는 폴링 폴백이 없다.
- 메인 스레드 지연: 큰 폴더를 열 때 `JSON.parse`와 정렬이 각각 50 ms를 넘는다(docs/m2-benchmark.md).
- 자체 정의한 기본 키(정렬 Alt+Shift+N/S/M/C/E, 표시 모드 Mod+Alt+0~3, 선택 토글 Insert/Shift+Space, Quick Select 시작 Mod+F)는 docs/05에 없다. 웹뷰가 이 조합을 받는지 실험하지 못했다.
