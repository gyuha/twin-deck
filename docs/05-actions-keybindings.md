# 05. 액션과 키바인딩

## 1. 개요

twin-deck의 모든 동작은 **액션**이다. 파일 복사부터 탭 전환, 테마 변경까지 같은 모델을 쓴다. 키 입력, Action Bar 버튼, Actions Panel, 플러그인이 모두 하나의 레지스트리를 거치므로([ADR-0007](adr/0007-action-registry.md)) 단축키를 바꾸거나 버튼을 추가할 때 실행 로직을 건드리지 않는다.

Marta의 내장 액션 ID 전체와 기본 키맵은 공개 문서에 없다 `[알 수 없음]`. 이 문서의 카탈로그는 Marta 문서에서 확인된 것을 "확인", 문서에서 추정한 것을 "추정", twin-deck이 정한 것을 "자체"로 표시한다. Marta 사용자가 Marta 설정 편집기의 읽기 전용 기본값으로 대조하면 "추정"과 "자체" 항목을 보정할 수 있다.

## 2. 액션 모델

| 필드 | 설명 |
|---|---|
| `id` | 점으로 구분한 고유 문자열. 규칙: `core.<영역>.<동작>` (내장), `gadget.<이름>` (Gadget), `<plugin_id>.<action_id>` (플러그인) |
| `title` | Actions Panel과 Action Bar에 보이는 이름 |
| `category` | Actions Panel 그룹 (File, Navigation, View, Selection, Tab, Search, Terminal, Config) |
| `args` | 인수 스키마. 인수는 바인딩 설정에서 `id`와 같은 레벨의 키로 준다 |
| `isApplicable(context)` | 현재 컨텍스트에서 실행 가능한지. 불가하면 Actions Panel에서 흐리게, 키 입력은 무시 |
| `run(context, args)` | 실행 |
| `scopes` | 바인딩이 유효한 범위 (3절) |
| `defaultKeys` | OS별 기본 키 |

컨텍스트(`context`)는 활성 패널, 비활성 패널, 활성 탭, 선택/커서 항목, 창 상태를 담는다. 이 구조는 Marta Lua API의 컨텍스트 개념(Global, Window, Pane, Action)과 대응한다 `[중간]`.

## 3. 키 입력 처리

### 3.1 스코프

Spacedrive의 키바인드 레지스트리는 스코프를 갖는다(`global | explorer | settings | mediaViewer | tagAssigner | quickPreview`) `[높음]`. twin-deck은 이 구조를 유지하고 스코프 목록을 아래로 교체한다.

| 스코프 | 활성 조건 |
|---|---|
| `global` | 항상 |
| `pane` | 포커스가 파일 목록에 있을 때 |
| `quickSelect` | Quick Select 입력 중 |
| `queue` | 큐 팝업이 열려 있을 때 |
| `preview` | 미리보기가 열려 있을 때 |
| `terminal` | 포커스가 터미널에 있을 때 |
| `dialog` | 모달 다이얼로그가 열려 있을 때 |
| `panel` | Actions Panel 등 팝업 메뉴가 열려 있을 때 |

키 입력은 활성 스코프 스택의 가장 안쪽부터 바인딩을 찾는다. 모달(`dialog`, `panel`)이 열려 있으면 그 아래 스코프의 바인딩은 무시한다. `terminal` 스코프에서는 앱 단축키를 최소화하고 나머지 키는 pty로 전달한다.

```
키 입력 → 가장 안쪽 스코프에서 바인딩 검색
            ↓ 없음
         바깥 스코프로 이동 (global까지)
            ↓ 없음
         pane 스코프이고 문자 키 → Quick Select로 전달
         terminal 스코프 → pty로 전달
```

### 3.2 단일 문자 키와 Quick Select의 충돌

Marta에서는 수정자 없는 단일 키 바인딩이 Quick Select에 가로채이는 문제가 보고되어 있고(Marta 이슈 트래커 #671), 이를 조절하는 `quickSelect.activateOnAnyCharacter` 옵션이 있다 `[중간]`(옵션은 문서 확인, 이슈는 검색 결과 기준). twin-deck은 규칙을 명확히 한다.

- `pane` 스코프에서 **수정자 없는 문자 키**는 Quick Select 입력이다. 이 키에 액션을 바인딩할 수 없다(설정 로더가 경고). 단, 큐 열기(`=`)처럼 `global` 스코프에 **예약된 키**는 키 조회가 바깥 스코프까지 올라가 먼저 잡히므로 Quick Select로 가지 않는다. 예약 키 목록은 내장 액션 정의에서 관리하며 사용자가 추가할 수 없다.
- 수정자 없는 단일 키 바인딩은 `queue`, `preview`, `dialog`, `panel` 같은 모달 스코프에서만 허용한다. 큐의 `P`, `A`, `D`가 그 예다.
- F1~F20, 방향키, Return, Space, Tab, Backspace, Escape, Delete 등 **문자가 아닌 키**는 수정자 없이도 `pane`에서 바인딩할 수 있다.

## 4. 키 표기와 OS 매핑

설정 파일의 키 표기는 OS 중립이다([ADR-0010](adr/0010-cross-platform-keymap.md)).

| 표기 | macOS | Windows/Linux |
|---|---|---|
| `Mod` | Cmd | Ctrl |
| `Alt` | Opt | Alt |
| `Shift` | Shift | Shift |
| `Ctrl` | Ctrl (실제 Control) | Ctrl (`Mod`와 동일) |

- 조합은 `+`로 잇는다: `Mod+Shift+P`.
- 키 이름은 Marta와 같은 어휘를 쓴다: `Up`, `Down`, `Left`, `Right`, `PageUp`, `PageDown`, `Home`, `End`, `F1`~`F20`, `Backspace`, `Escape`(별칭 `Esc`), `Delete`, `Return`, `Space`, `Tab`, `Keypad0`~`Keypad9`, `KeypadEnter`, `KeypadDecimal`.
- 사용자 설정에서 OS별로 다르게 지정하려면 `[keybindings.macos]`, `[keybindings.windows]`, `[keybindings.linux]` 섹션을 쓴다([06](06-config-plugins.md)).
- macOS 노트북에서 F키는 `fn`이 필요하다. Marta도 F키가 중심이라 같은 제약이며, 이는 기본 키맵의 결함이 아니라 하드웨어 설정 문제다.
- `Mod+Q`, `Mod+W`, `Alt+F4`, `Alt+Tab`, `Mod+Space` 등 OS가 선점하는 키는 웹뷰가 받지 못한다. 기본 키맵에서 피한다.

## 5. 기본 키맵과 액션 카탈로그

"Marta 키"는 Marta 문서(macOS 기준)에 확인된 값이다. "twin-deck 키"는 이 문서가 정한 기본값이며, macOS는 Marta 키를 그대로 따르고 Windows/Linux는 4절 규칙으로 변환한 값에 아래 예외를 적용한다. `출처` 열: 확인 = Marta 문서에서 ID와 키 모두 확인, 추정 = 검색 결과에서 ID를 추정, 자체 = twin-deck 정의.

### 5.1 파일 작업

| 액션 ID | 이름 | macOS 키 | Windows/Linux 키 | 스코프 | 출처 |
|---|---|---|---|---|---|
| `core.copy` | 복사 (비활성 패널로) | `F5` | `F5` | pane | ID 추정, 키 확인 |
| `core.move` | 이동 | `F6` | `F6` | pane | ID 추정, 키 확인 |
| `core.rename` | 이름 변경 (2개 이상 선택하면 다중 이름 바꾸기) | `Shift+F6`, `F2` | `Shift+F6`, `F2` | pane | ID 추정, 키 확인 |
| `core.rename.multi` | 다중 이름 바꾸기 (2개 이상 선택했을 때) | `Mod+Shift+R` | `Ctrl+Shift+R` | pane | 자체 ID |
| `core.file.new_folder` | 새 폴더 | `F7` | `F7` | pane | 자체 ID, 키 확인 |
| `core.file.new_file` | 새 파일 | `Shift+F7` | `Shift+F7` | pane | 자체 ID, 키 확인 |
| `core.trash` | 휴지통으로 이동 | `F8` | `F8` | pane | 자체 ID, 키 확인 |
| `core.delete` | 영구 삭제 | `Shift+F8` 또는 `Delete` | `Shift+F8` 또는 `Delete` | pane | 자체 ID, 키 확인 |
| `core.clipboard.copy` | 클립보드로 복사 | `Mod+C` | `Ctrl+C` | pane | 운영체제 파일 클립보드에 쓴다(Finder/탐색기에 붙여 넣을 수 있다) |
| `core.clipboard.cut` | 클립보드로 잘라내기 | `Mod+X` | `Ctrl+X` | pane | 붙여 넣을 때 이동한다(붙여 넣기 전에는 원본 유지) |
| `core.clipboard.paste` | 클립보드에서 붙여넣기 | `Mod+V` | `Ctrl+V` | pane | 클립보드의 파일을 현재 폴더로 복사/이동. 이름이 겹치면 충돌 창 |
| `core.duplicate` | 복제 | `Mod+D` | `Ctrl+D` | pane | 자체 ID, 키 확인 |
| `core.edit` | 편집 | `F4` | `F4` | pane | ID 확인, 키 확인 |
| `core.edit.folder` | 폴더 편집 | `Shift+F4` | `Shift+F4` | pane | 자체 ID, 키 확인 |
| `core.copy.to_inactive` | 비활성 패널로 복사(대화상자 없음) | 없음 | 없음 | pane | 자체 |
| `core.move.to_inactive` | 비활성 패널로 이동(대화상자 없음) | 없음 | 없음 | pane | 자체 |
| `core.compress` | 압축 | 없음 | 없음 | pane | 자체 |
| `core.extract` | 추출 (선택한 아카이브 옆의 새 폴더로) | 없음 | 없음 | pane | 자체 |
| `core.extract.to_inactive` | 추출 (반대편 패널 폴더 아래 새 폴더로) | 없음 | 없음 | pane | 자체 |
| `core.file.symlink` | 심볼릭 링크 만들기 | 없음 | 없음 | pane | 자체 (키 미확인) |
| `core.file.info` | 파일 정보 | `Mod+I` | `Ctrl+I` | pane | 자체 ID, 키 확인 |
| `core.path.copy_folder` | 폴더 경로 복사 | `F12` | `F12` | pane | 자체 ID, 키 확인 |
| `core.path.copy_files` | 파일 경로 복사 | `Mod+F12` | `Ctrl+F12` | pane | 자체 ID, 키 확인 |
| `core.reveal` | 파일 관리자에서 보기 | 없음 | 없음 | pane | 자체 |
| `core.open.with` | Open With… | `Mod+Return` | `Ctrl+Return` | pane | 자체 ID, 키 확인 |

### 5.2 탐색

| 액션 ID | 이름 | macOS 키 | Windows/Linux 키 | 출처 |
|---|---|---|---|---|
| `core.open` | 열기 | `Return` | `Return` | ID 확인 |
| `core.open.directory` | 폴더 열기 (인수 `src`) | 없음 | 없음 | ID 확인, 인수 확인 |
| `core.open.as_archive` | 아카이브로 열기 (Open As, ARC-04) | 없음 | 없음 | 자체 ID |
| `core.go.up` | 상위 폴더 | `Backspace` | `Backspace`, `Alt+Up` | ID 확인 |
| `core.go.path` | Go To Path | `Mod+G` | `Ctrl+G` | 자체 ID, 키 확인 |
| `core.move.up` / `core.move.down` | 커서 위/아래 | `Up` / `Down` | 같음 | ID 확인 |
| `core.move.left` / `core.move.right` | 여러 컬럼 보기: 컬럼 좌/우. 그 밖: `Left`는 상위 폴더, `Right`는 폴더면 들어가고 파일이면 미리보기 | `Left` / `Right` | 같음 | `left`는 ID 확인, `right`는 추정 |
| `core.move.page_up` / `page_down` | 페이지 이동 | `PageUp` / `PageDown` | 같음 | 자체 |
| `core.move.half_page_up` / `half_page_down` | 반 페이지 | `Alt+PageUp` / `Alt+PageDown` | 같음 | 자체 ID, 키 확인 |
| `core.move.home` / `core.move.end` | 처음/끝 | `Home` / `End` | 같음 | 자체 |
| `core.pane.switch` | 활성 패널 전환 | `Tab` | `Tab` | 자체 ID, 키 확인 |
| `core.pane.swap` | 좌우 패널 바꾸기 | `Mod+U` | `Ctrl+U` | 자체 ID. 탭·폴더·커서·선택을 통째로 맞바꾸고 활성 패널은 내용을 따라간다. Ctrl+U는 Total·Double·Midnight Commander의 "패널 맞바꾸기" 키와 같다 |
| `core.menu.volumes` | Volumes 메뉴 | `Alt+1` | `Alt+1` | 자체 ID, 키 확인 |
| `core.menu.favorites` | Favorites 메뉴 (열린 뒤 글자·숫자 입력으로 이름·경로 필터, `Alt+숫자`로 n번째 선택, `Ctrl+=`로 현재 폴더 추가·이미 있으면 무시, `Ctrl+-`로 커서 항목을 즐겨찾기에서 삭제(폴더는 그대로)) | `Alt+2` | `Alt+2` | 자체 ID, 키 확인 |
| `core.menu.recent` | Recent Locations (열린 뒤 글자·숫자 입력으로 경로 필터, `Alt+숫자`로 n번째 선택) | `Alt+3` | `Alt+3` | 자체 ID, 키 확인 |
| `core.menu.hierarchy` | Hierarchy | `Alt+0` | `Alt+0` | 자체 ID, 키 확인 |
| `core.favorites.add` / `core.favorites.edit` | Favorites 추가/편집 | 없음 | 없음 | 자체 |
| `core.recent.clear` | Recent 비우기 (최근 위치 메뉴 안) | `Ctrl+Backspace` | `Ctrl+Backspace` | 자체 |
| `core.volume.unmount` / `core.volume.eject` | 언마운트 / 추출 | 없음 | 없음 | 자체 |

Windows/Linux에서 `Alt+숫자`는 일부 데스크톱 환경이나 앱과 충돌할 수 있다 `[낮음]`. 충돌이 확인되면 `Ctrl+Alt+숫자` 대안을 검토한다.

### 5.3 선택

| 액션 ID | 이름 | macOS 키 | Windows/Linux 키 | 출처 |
|---|---|---|---|---|
| `core.select.all` | 전체 선택 | `Mod+A` | `Ctrl+A` | 자체 ID, 키 확인 |
| `core.select.none` | 선택 해제 | `Escape` | `Escape` | 자체 ID, 키 확인 |
| `core.select.invert` | 선택 반전 | 없음 | 없음 | 자체 |
| `core.select.invert_current` | 현재 항목 반전 | 없음 | 없음 | 자체 |
| `core.select.group` / `core.deselect.group` | 그룹 선택/해제 | 없음 | 없음 | 자체 |

Shift+이동 키(범위의 선택 반전)는 액션이 아니라 `pane` 스코프의 입력 규칙이다. 패널의 `selection.shift_mode` 설정(`invert` 또는 `extend`)으로 Marta 방식과 일반 방식을 전환한다.

### 5.4 탭, 창

| 액션 ID | 이름 | macOS 키 | Windows/Linux 키 | 출처 |
|---|---|---|---|---|
| `core.tab.new` | 새 탭 | `Mod+T` | `Ctrl+T` | 자체 (Marta 키는 서드파티 정보) |
| `core.tab.close` | 탭 닫기 | `Mod+W` | `Ctrl+W` | 자체 (같음). `Mod+W`는 창 닫기와 충돌하지 않게 앱이 가로챈다 |
| `core.tab.next` / `core.tab.prev` | 다음/이전 탭 | `Alt+Mod+Right` / `Alt+Mod+Left`, `Ctrl+Tab` / `Ctrl+Shift+Tab` | `Ctrl+PageDown` / `Ctrl+PageUp`, `Ctrl+Tab` / `Ctrl+Shift+Tab` | `next`는 ID 추정 |
| `core.window.new` | 새 창 | `Mod+N` | `Ctrl+N` | 자체 |

### 5.5 보기, 검색, 도구

| 액션 ID | 이름 | macOS 키 | Windows/Linux 키 | 출처 |
|---|---|---|---|---|
| `core.view.hidden` | 숨김 파일 표시 토글 | `Mod+Shift+.` | `Ctrl+H` | 자체 ID. macOS 키 확인, 나머지는 관례 |
| `core.view.drive_bar` | 드라이브 바 표시 토글 | `Mod+Shift+D` | `Ctrl+Shift+D` | 자체 ID. 이슈 #6. 상태 줄 토글 버튼·macOS View 메뉴에도 키를 표시한다 |
| `core.view.action_bar` | Action Bar 표시 토글 | `Mod+Shift+A` | `Ctrl+Shift+A` | 자체 ID. 이슈 #6 |
| `core.view.mode` | 표시 모드 (인수) | 없음 | 없음 | 자체 (인수 이름 미확인) |
| `core.view.order` | 정렬 (인수) | 없음 | 없음 | 자체 (인수 이름 미확인) |
| `core.preview` | 미리보기 (폴더·파일 모두). `Shift+Right`는 폴더에서도 안으로 들어가지 않고 미리보기를 연다(여러 컬럼 보기 포함). 파일에서는 `Right`도 연다. 미리보기가 열려 있는 동안 `Shift+Right`는 아무것도 하지 않는다 | `Mod+Y` / `Shift+Right` | `Ctrl+Y` / `Shift+Right` | 자체 ID, 키 확인. 이슈 #19 |
| `core.preview.forward` | 미리보기: 폴더 위에서는 그 안으로 들어가 첫 항목을 미리보고(항목이 없으면 미리보기를 닫는다), 파일 위에서는 다음 항목으로 넘어간다 | `Right` | `Right` | preview | 자체 ID. `Down`은 폴더 위에서도 다음 항목(`core.preview.next`) |
| `core.preview.open` | 미리보기 닫고 열기. 압축 파일(아카이브) 미리보기에서는 열지 않고 압축을 푼다(`core.extract`와 같이 압축 파일 옆의 새 폴더로) | `Return` | `Return` | preview | 자체 ID. 이슈 #9 |
| `core.preview.page_up` / `core.preview.page_down` | 미리보기: 본문을 한 화면 위/아래로 스크롤 (텍스트·코드·JSON·Markdown). PDF는 한 쪽씩 넘긴다. 다른 파일로 넘어가면 맨 위로 돌아간다 | `PageUp` / `PageDown` | `PageUp` / `PageDown` | preview | 자체 ID |
| `core.preview.delete` | 미리보기: 파일 삭제 (영구 삭제 확인을 거친다. 다음 파일로 넘어가고 남은 파일이 없으면 닫는다) | `Delete`, `Shift+F8` | `Delete`, `Shift+F8` | preview | 자체 ID |
| `core.preview.save` | 미리보기: 편집 중인 내용을 파일에 저장한다(저장한 뒤에도 편집 상태 유지). 본문을 더블클릭해 편집을 시작한 뒤에만 동작한다 | `Mod+S` | `Mod+S` | preview | 자체 ID, 이슈 #38 |
| `core.find.open` | 파일 찾기(Double Commander "파일 찾기" 기본 탭, 하위 폴더 검색) | `Mod+F` | `Ctrl+F` | 자체 ID. 결과는 새 가상 탭. Quick Select는 이 키를 내주고 `Mod+Shift+F`로 옮겼다 |
| `core.quickselect.start` | Quick Select 시작 | `Mod+Shift+F` | `Ctrl+Shift+F` | pane | 자체 ID. 문자 키를 치면 자동으로 시작되므로(`activate_on_any_character`) 이 키는 그 설정을 껐을 때 쓴다. 이전 기본 키 `Mod+F`는 파일 찾기가 가져갔다 |
| `core.lookup.global` | Look Up (전역) | `Mod+P` | `Ctrl+P` | 자체 ID, 키 확인 |
| `core.lookup.folder` | Look Up (현재 폴더) | `Alt+Mod+P` | `Ctrl+Alt+P` | 자체 ID, 키 확인 |
| `core.flatten` | Flatten | 없음 | 없음 | 자체 |
| `core.disk_usage` | Analyze Disk Usage (인수) | 없음 | 없음 | 자체 |
| `core.disk_usage.treemap` | 디스크 사용량 treemap (인수 `src`) | 없음 (`Alt+T`가 같은 일을 한다) | 없음 (`Alt+T`) | 자체 ID, 이슈 #25. 같은 Disk Usage 탭을 처음부터 treemap(크기에 비례한 사각형 타일) 보기로 연다. 전체의 0.5% 미만 항목은 "기타 N개" 타일로 묶는다. treemap 보기에서 방향키 `←` `→` `↑` `↓`는 화면에서 그 방향으로 인접한 타일로 선택을 옮기고(가장자리에서는 그대로, 이슈 #29), `Enter`/타일 클릭은 반대쪽 패널에 그 폴더를 열고, `Shift+→`/`Mod+Enter`/더블클릭은 그 폴더로 내려가 다시 그리며(파일 타일의 `Shift+→`는 미리보기), `Backspace`는 한 단계 위로 올라간다. `Home`/`End`는 목록과 같은 크기순 처음/끝이다 |
| `core.disk_usage.descend` | 디스크 사용량 treemap에서 폴더 안으로 내려가기 | `Mod+Enter` | `Mod+Enter` | 자체 ID, 이슈 #29. Disk Usage 탭에서 선택한 폴더 타일 안으로 내려가 다시 그린다(파일 타일에서는 아무 일도 없다). `Shift+→`(폴더면 내려가고 파일이면 미리보기)와 더블클릭도 같은 일을 한다 |
| `core.disk_usage.toggle_view` | 디스크 사용량 treemap 켜기/전환 | `Alt+T` | `Alt+T` | 자체 ID. 일반 폴더에서는 그 폴더를 treemap으로 열고(`core.disk_usage.treemap`과 같다), Disk Usage 탭에서는 새 스캔 없이 목록 ↔ treemap을 바꾼다. 단독 `T`는 Quick Select가 가져가서 `Alt+T`로 정했다 |
| `core.search.cancel` | 검색/분석 취소 (진행 중인 가상 탭에서는 선택이 없을 때 `Escape`도 같다) | 없음 | 없음 | 자체 |
| `core.reveal_in_tab` | 해당 폴더로 이동 (가상 탭 항목이 있는 폴더를 새 탭으로) | 없음 | 없음 | 자체 |
| `core.queue.open` | 큐 열기 | `=` | `=` | 자체 ID, 키 확인. `=`는 문자 키이므로 `pane` 스코프에서는 Quick Select와 충돌한다. 3.2절 규칙에 따라 `global` 스코프의 예약 키로 지정한다 |
| `core.actions.panel` | Actions Panel | `Mod+Shift+P` | `Ctrl+Shift+P` | 자체 ID, 키 확인 |
| `core.terminal.focus` | 터미널 열기/포커스 | `Mod+O` | `Ctrl+O` | 자체 ID, 키 확인 |
| `core.terminal.toggle` | 터미널 표시 토글 | `Alt+Mod+O` | `Ctrl+Alt+O` | 자체 ID, 키 확인 |
| `core.terminal.external` | 외부 터미널 | `F11` | `F11` | 자체 ID, 키 확인 |
| `core.config.open` | 설정 폴더 열기 | 없음 | 없음 | 자체 |
| `core.app.check_update` | 업데이트 확인 (GitHub 최신 릴리스를 보고, 새 버전이면 확인 창을 거쳐 설치 후 다시 시작) | 없음 | 없음 | 자체 |
| `core.state.reset` | 상태 초기화 후 종료 | 없음 | 없음 | 자체 |
| `core.theme.switch` | 테마 전환 | 없음 | 없음 | 자체 |

큐 화면 안의 키(`queue` 스코프): 방향키/Space로 이동, `P` 일시정지, `A` 또는 `D` 중단, `Escape` 닫기 (Marta 문서 확인).

### 5.6 Action Bar 기본 구성

Marta의 Action Bar는 액션과 단축키를 한 줄로 보여 주는 하단 버튼이다. 기본 구성은 자체 정의이며 설정(`layout.action_bar`)으로 바꾼다.

`F4 편집` `F5 복사` `F6 이동` `F7 새 폴더` `F8 휴지통` `Shift+F8 삭제`

### 5.7 F키 설정과 조합키

설정의 `[fkeys]`(와 앱 실행용 `[fkey_apps]`)는 `F1`~`F12` 외에 조합키를 키로 받는다. 수식키는 `Mod`, `Ctrl`, `Alt`, `Shift`를 이 순서로 쓰고 마지막에 `F1`~`F12`가 온다(예: `"Ctrl+F5"`, `"Mod+Shift+F2"`). 같은 F키에 서로 다른 조합을 여럿 걸 수 있고, 형식에 맞지 않는 키(`Ctrl+A`, `F13`, 순서가 틀린 `Shift+Ctrl+F1`)는 경고와 함께 무시한다. `Mod`는 macOS에서 Cmd, 그 밖에서 Ctrl이다.

설정의 `[fkey_bar]`는 F키 줄(`F5`, `Ctrl+F5` …)마다 그 동작을 Action Bar에 보일지(`true`/`false`, 기본 `false`)를 정한다. 설정 화면의 F키 탭에서는 줄마다 "Action Bar" 스위치다. 켠 줄은 `layout.action_bar` 구성 뒤에 F1→F12, 그 뒤에 조합키 순서로 이어 붙고, 줄의 키 표기와 동작 이름을 보여 준다. 동작이 "기본값"이면 그 키의 내장 동작이, "해제"이면 아무것도 보이지 않는다. 같은 동작이 이미 기본 구성에 있으면(인수가 없는 경우) 중복해서 붙이지 않는다.

## 6. Actions Panel

- `Mod+Shift+P`로 열고, 입력한 문자열로 액션 이름을 퍼지 검색한다. `Return`으로 실행한다.
- 마지막 검색어를 재시작 후에도 복원한다(PANE-05).
- `Alt`를 누르고 있으면 각 항목 옆에 액션 ID를 표시한다(ACT-01). 사용자가 키바인딩 설정에 쓸 ID를 찾는 경로다.
- `isApplicable`이 거짓인 액션은 흐리게 표시하고 실행할 수 없다.

## 7. 바인딩 충돌과 검증

설정 로더는 다음을 경고로 보고한다. 경고는 앱 동작을 막지 않는다.

| 조건 | 처리 |
|---|---|
| 같은 스코프에서 같은 키가 둘 이상의 액션에 바인딩됨 | 나중 정의가 이기며 경고 |
| 존재하지 않는 액션 ID | 무시 + 경고 |
| `pane` 스코프에 수정자 없는 문자 키 바인딩 | 무시 + 경고 (3.2절) |
| OS가 선점하는 키 | 경고 (동작 보장 불가) |
| 알 수 없는 키 이름 | 무시 + 경고 |

바인딩 해제는 `"F5" = "none"` 형식(TOML에는 `null`이 없다)으로 한다. 문법은 [06](06-config-plugins.md).

## 8. 미확인 과제

| 항목 | 확인 방법 |
|---|---|
| "ID 추정" 항목의 실제 Marta ID | Marta 설정 편집기 기본값 대조 |
| Marta의 기본 키맵 전체 | 같음 |
| Windows/Linux에서 `Alt+숫자`, `Ctrl+Alt+P`, `F11`, `F12`의 충돌 | M1에서 3개 OS 수동 확인 |
| 웹뷰가 F키와 `Ctrl+W` 등 OS 예약 조합을 받는지 | M1 3개 OS 확인 |
| `Shift+이동`의 Marta 동작이 "반전"임이 실제 UI에서도 그런지 | Marta 실행 확인 |
