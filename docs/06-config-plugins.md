# 06. 설정, Gadgets, 테마, 플러그인

## 1. 개요

설정은 **내장 기본값 위에 사용자 TOML을 덮어쓰는** 방식이다. Marta의 `conf.marco`와 같은 병합 방식이지만 형식은 TOML이다([ADR-0006](adr/0006-toml-config.md)). Marta의 Marco는 JSON 비슷한 자체 DSL이라 Rust/TS 생태계에 파서가 없고, TOML은 Rust에서 `toml`/`serde`로 바로 다뤄지며 Spacedrive도 타입 정의에 TOML을 쓴다 `[높음]`. Marta 설정 파일과의 호환은 목표가 아니다.

플러그인은 4단계(M4) 작업이며, 이 문서의 플러그인 절은 API 초안이다. 언어 선택은 아직 확정이 아니다([ADR-0008](adr/0008-plugin-language.md), Proposed).

## 2. 파일 위치

OS별 설정 디렉터리는 Tauri의 경로 API 또는 `directories` 크레이트로 얻는다. 아래는 예상 위치이며, 착수 시 실제 반환값을 확인한다 `[중간]`.

| OS | 설정 디렉터리 |
|---|---|
| macOS | `~/Library/Application Support/dev.twindeck.app/` (앱 식별자. 이름이 `.app`으로 끝나 Finder는 앱 번들로 다룬다) |
| Windows | `%APPDATA%\twin-deck\` |
| Linux | `$XDG_CONFIG_HOME/twin-deck/` (기본 `~/.config/twin-deck/`) |

| 파일/폴더 | 내용 |
|---|---|
| `config.toml` | 동작, 표시, 환경, 즐겨찾기, Gadgets, 액션 바, 파일시스템 옵션 |
| `keybindings.toml` | 키바인딩 |
| `location.toml` | 설정 저장 경로(2.1). 지정하면 `config.toml`·`keybindings.toml`은 그 폴더에 둔다 |
| `themes/*.toml` | 사용자 테마 |
| `plugins/` | 플러그인 (M4) |
| `state.json` | 재시작 복원 상태 (탭, 창, 선택, 터미널 높이, Actions Panel 검색어). 사용자가 편집하지 않는다 |

"설정 폴더 열기" 액션(`core.config.open`)이 이 디렉터리를 연다.

### 2.1 설정 저장 경로

구현됨(2026-10-15, 이슈 #71). 설정 화면 환경 섹션의 "설정 저장 경로"에서 `config.toml`·`keybindings.toml`을 둘 폴더를 고를 수 있다. iCloud Drive나 Google Drive for desktop이 동기화하는 폴더를 고르면, 서버 없이 여러 기기가 같은 설정을 쓴다. 앱은 클라우드 API를 부르지 않고 그 폴더의 파일을 읽고 쓰기만 하며, 전송은 각 클라우드 클라이언트가 맡는다.

- 고른 경로는 위 설정 디렉터리의 `location.toml`(`dir = "…"`)에 적는다. 그 경로 안의 `config.toml`에 적으면 경로를 알아야 경로를 읽을 수 있는 문제가 생긴다. 파일이 없거나 `dir`이 비면 기본 위치를 쓴다.
- 경로를 따라가는 파일은 `config.toml`과 `keybindings.toml`뿐이다. `state.json`(탭·창·커서)은 늘 기본 위치에 남는다. 커서만 움직여도 저장되는 파일이라, 클라우드 폴더에 두면 기기마다 충돌 사본이 생긴다.
- 새 폴더에 설정 파일이 없으면 지금 파일을 복사한다. 이미 있으면(다른 기기에서 먼저 지정한 경우) "그 폴더의 설정 사용"과 "지금 설정으로 덮어쓰기" 중에서 고른다. 덮어쓰면 그 폴더에 있던 파일은 `config.toml.bak`·`keybindings.toml.bak`으로 남는다. "기본 위치로"를 누르면 같은 규칙으로 기본 위치로 돌아가고 `location.toml`을 지운다.
- 바꾸면 앱을 다시 시작하지 않아도 새 폴더의 설정이 바로 적용되고, 그 폴더를 감시한다. Tauri가 뜨기 전에 읽는 `environment.single_instance`도 지정한 폴더를 따른다.
- 시작할 때 지정한 폴더가 없으면(지워졌거나 클라우드 드라이브가 아직 붙지 않음) 기본 위치의 설정을 쓰고 경고를 보인다. 이때 설정 화면에서 바꾼 값은 기본 위치에 저장된다.

한계:
- 두 기기에서 거의 동시에 설정을 바꾸면 클라우드 클라이언트가 `config 2.toml`이나 `config (1).toml` 같은 충돌 사본을 만들 수 있다. 앱은 이런 사본을 합치지 않는다.
- iCloud의 "Mac 저장 공간 최적화"가 켜져 있으면, 오래 열지 않은 파일이 내려받지 않은 상태(`.config.toml.icloud`)로 바뀔 수 있다. 그동안 앱은 설정 파일이 없는 것으로 보고 기본값을 쓴다.
- Windows 경로(`%USERPROFILE%\iCloudDrive`, `G:\내 드라이브`)도 같은 방식으로 동작하도록 만들었지만, macOS에서 컴파일만 확인했다.

```
설정 화면 "경로 바꾸기…" → 폴더 선택 → 그 폴더에 설정이 있나?
                                          ├ 없음 → 지금 파일 복사
                                          └ 있음 → 묻기: 그 설정 사용 / 덮어쓰기(.bak)
                         → location.toml 기록 → 새 폴더로 설정 저장소를 다시 열기 → 바로 적용
```

### 2.2 설정 내보내기·가져오기

구현됨(2026-10-15, 이슈 #71). 설정 화면 환경 섹션의 "설정 내보내기·가져오기" 행에서 "내보내기…"와 "가져오기…"로 설정을 파일 하나에 담아 다른 기기로 옮긴다. 클라우드 폴더를 쓰지 않을 때나 한 번만 옮길 때 쓴다.

- 내보내기는 저장 위치를 묻고(기본 이름 `twin-deck-settings.zip`) 지금 설정 폴더의 `config.toml`·`keybindings.toml`을 zip 하나로 묶는다. 없는 파일은 빼고 담는다. `state.json`은 담지 않는다. 같은 폴더에 임시 파일로 쓴 뒤 이름을 바꾼다.
- 가져오기는 zip을 고르고 한 번 확인한 뒤 지금 설정 폴더의 파일을 바꾼다. 저장 경로(2.1)를 지정했으면 그 폴더가 대상이다. 지금 있던 파일은 `config.toml.bak`·`keybindings.toml.bak`으로 남고, 가져온 설정은 바로 적용된다. 가져온 결과는 zip의 내용과 같아진다: zip에 없는 파일은 `.bak`으로만 남는다.
- 다음 경우는 아무 파일도 바꾸지 않고 이유를 보인다: zip이 아님, zip 맨 위에 `config.toml`·`keybindings.toml`이 하나도 없음, 둘 중 하나라도 TOML 문법 오류, 파일이 1MB를 넘음. zip 맨 위의 두 이름만 읽으므로, 하위 폴더나 `../`가 붙은 항목은 무시한다.

```
내보내기: 저장 위치 선택 → 두 파일을 zip으로 → 임시 파일 → 이름 바꾸기
가져오기: zip 선택 → 확인 → 검증(두 파일 중 하나 이상, TOML 문법) → 기존 파일 .bak → 쓰기 → 바로 적용
                              ↓ 실패
                     아무것도 바꾸지 않고 이유 표시
```

## 3. 병합과 검증

```
내장 기본값(앱에 포함) ──┐
                          ├→ 병합 → 검증 → Config 확정 → config://changed 이벤트
사용자 config.toml ───────┘        ↓ 오류/경고
                             UI에 경고 표시, 잘못된 값은 기본값 사용
```

- 병합은 테이블 단위 깊은 병합이다. 배열은 통째로 교체된다(즐겨찾기, 컬럼 등).
- 사용자가 기본값 파일 전체를 복사해 붙이는 것은 권장하지 않는다. 그러면 앱 업데이트로 바뀐 기본값이 반영되지 않는다 (Marta도 같은 경고를 함).
- 파일 변경은 `td-config`가 감시하며 저장 즉시 반영한다. 잘못된 TOML은 이전 유효 설정을 유지하고 오류 위치를 표시한다.
- 알 수 없는 키는 경고하며 무시한다.
- 내장 편집기(P3): 왼쪽은 읽기 전용 기본값, 오른쪽은 사용자 파일. 저장 시 검증 결과를 하단에 보여 준다.

## 4. `config.toml` 스키마 (초안)

Marta에서 확인된 옵션 이름을 그대로 옮길 수 있는 곳은 옮기고, 없는 것은 자체 정의했다. 키는 `snake_case`다.

```toml
[behavior]
theme = "system"                  # system·light·dark 또는 테마 이름(예: dracula-default)
language = "ko"                   # 화면 언어: ko(한국어), en(English)
terminal_font = ""                # 내장 터미널의 CSS font-family. 비우거나 글꼴이 없으면 기본 고정폭 글꼴

[behavior.table]
icon_size = 16
system_icons = false              # 켜면 목록의 아이콘을 운영체제가 쓰는 파일 아이콘으로 보여 준다(macOS·Windows). 얻지 못하면 기본 아이콘
circular_selection = false        # 끝에서 처음으로 순환
right_click_select = false
zebra_rows = false                # 행 배경을 번갈아 옅게 칠한다
show_marks = true                 # 행 맨 앞 표시 칸(● 선택, ▸ 폴더). false면 칸이 사라진다
folder_style = "none"             # 폴더 이름 장식: "none" | "brackets" [이름] | "parens" (이름) | "slash" 이름/ (화면 표시만)
column_lines = "none"             # 컬럼 사이 세로선: "none" | "solid" | "dash" (헤더와 모든 행)
cursor_fill = false               # 활성 패널의 커서 행을 강조색으로 꽉 채운다
show_parent_row = false          # 파일 목록 맨 위에 상위 폴더 `..` 행을 보인다(작업 대상에는 들지 않는다)
group_by_modified = false         # 켜면 목록을 수정일 구간(오늘·어제·이전 7일·이전 30일·월·연도)으로 나눠 구간 제목을 보인다(단일 컬럼 목록 보기에만 적용)
freshness = false                 # 켜면 파일 이름 글자의 밝기를 수정일로 4단계(7일 이내·30일 이내·1년 이내·그 이상)로 나눈다(이슈 #91)

[behavior.quick_select]
match_only_prefix = false
activate_on_any_character = true

[behavior.selection]
shift_mode = "invert"             # "invert"(Marta 방식) | "extend"

[behavior.layout]
show_action_bar = true
pane_highlight = true             # 활성 패널의 accent 테두리. false면 두 패널 모두 투명(폭은 그대로)
tab_style = "underline"           # "underline"(활성 탭 밑줄) | "segments"(폭 균등 분할 + 활성 탭 배경, Marta식)
tab_close_button = false          # true면 마우스를 올린 탭 오른쪽에 ✕(닫기)가 보이고 모든 탭의 좌우 패딩이 넓어진다(탭이 하나뿐이면 ✕ 숨김, 이슈 #36)
tab_position = "top"               # "top"(탭 막대가 파일 목록 위) | "bottom"(파일 목록 아래, 패널 하단. 이슈 #67)
tab_color_terminal = "auto"       # 특수 탭 색(이슈 #92): "auto"(테마에서 계산) | "off" | "#rrggbb". 터미널 탭
tab_color_smb = "auto"            # SMB 공유 안의 탭
tab_color_remote = "auto"         # SFTP·FTP 탭
tab_color_twindeck = "auto"       # Twin Deck Remote 탭

[display]
relative_date = true
date_format = "%-d %b %Y"         # strftime
time_format = "%H:%M"
size_format = "adaptive"          # adaptive | adaptive_kibi | bytes | KB | MB | GB | TB | KiB | MiB | GiB | TiB
folder_size_on_select = true      # 폴더를 선택하면 하위 파일의 총 용량을 백그라운드로 계산해 크기 칸과 상태 줄에 보여 준다 (끄면 계산하지 않는다)

[environment]
text_editor = "Visual Studio Code" # 편집 액션이 사용할 앱
single_instance = true            # 앱을 하나만 띄운다. false면 실행할 때마다 새로 뜬다(앱을 다시 시작해야 반영)
global_hotkey_enabled = true      # 전역 화면 열기 단축키 사용 여부
global_hotkey = "Mod+Alt+O"       # 앱이 뒤에 있을 때 창을 불러오는 전역 단축키(Mod는 macOS ⌘, 그 밖은 Ctrl). 비우면 끈다
terminal = "default"              # 내장 터미널의 셸(Windows): default(cmd) | cmd | powershell | gitbash(Git for Windows). 다른 OS는 $SHELL(로그인 셸)

[core.confirm]
delete = true                     # 영구 삭제 확인
trash = false                     # 휴지통 이동 확인

[file_systems.zip]
additional_extensions = ["docx"]  # ZIP으로도 열 확장자

[terminal]
shell = ""                        # 빈 값이면 OS 기본 셸
font = "Menlo"
font_size = 12
[terminal.env]
# EXAMPLE = "value"

[layout]
action_bar = ["core.edit", "core.copy", "core.move", "core.file.new_folder", "core.trash", "core.delete"]

[fonts]
# 이름 = [글꼴, 크기]. "default" 는 시스템 글꼴
file_list = ["default", 13]
breadcrumbs = ["default", 12]
tabs = ["default", 12]
action_bar = ["default", 12]
status_bar = ["default", 11]
table_header = ["default", 11]
```

Marta의 `layout.showActionBar`, `table.circularSelection` 등 옵션 이름은 `[높음]`이고 위 표는 그 이름을 `snake_case`로 옮긴 것이다. `selection.shift_mode`, `terminal.*`, `layout.action_bar`는 twin-deck 정의다.

### 4.1 즐겨찾기

Marta는 즐겨찾기를 `이름 "경로"` 목록으로 쓰고, 구분선은 `이름 null`, 중첩 그룹을 지원한다. TOML은 `null`이 없으므로 항목 종류를 명시한다.

```toml
[[favorites]]
name = "Downloads"
path = "${user.downloads}"

[[favorites]]
type = "separator"

[[favorites]]
type = "group"
name = "Work"
items = [
  { name = "Projects", path = "~/workspace" },
]
```

사용 가능한 경로 변수(Marta 확인): `${user.downloads}`, `${user.documents}`, `${user.desktop}`, `${user.pictures}`, `${user.music}`, `${user.movies}`. `${user.library}`, `${all.applications}`, `${system.applications}`는 macOS 전용이며, Windows/Linux에서는 해당 변수를 정의하지 않고 경고한다. OS별 사용자 폴더 해석은 [09](09-platform-support.md).

### 4.2 컬럼

Marta의 컬럼 명세 문법은 `[<|>]이름[:너비]`이다. `<`, `>`는 정렬 방향이다. 예: `>extension:50`. twin-deck은 이 문법을 그대로 쓰고 TOML 배열로 받는다. 목록 헤더의 컬럼 경계를 끌어 너비를 조절하면 이 배열의 해당 `:너비`가 자동으로 바뀐다(주석과 다른 키는 그대로 둔다).

```toml
[view.table]
columns = ["name", ">extension:50", "size", "modified"]
```

컬럼 이름: `name`(항상 존재), `size`, `created`, `modified`, `added`, `extension`, `permissions`(rwx), `permissions_octal`. Marta 문서는 권한 컬럼 두 개를 같은 이름으로 나열해 오타로 보이므로 twin-deck은 이름을 분리했다 `[중간]`. `permissions*`는 Windows에서 의미가 다르다([09](09-platform-support.md)).

설정 → 목록과 선택 → **확장자 컬럼 표시**로 `extension` 컬럼을 켜고 끈다(기본 OFF). 켜면 이름 컬럼 뒤에 확장자 헤더가 생기며, 클릭할 때마다 확장자 오름차순·내림차순으로 정렬한다. 폴더는 항상 먼저 두고, 확장자가 같으면 이름순으로 정렬한다. 켜져 있으면 파일은 이름 컬럼에서 확장자를 빼고 확장자 컬럼에 표시하며, 폴더는 이름을 그대로 두고 확장자 셀을 비운다. 컬럼이 꺼져 있어도 기존 `Alt+Shift+E` 확장자 정렬 단축키를 쓸 수 있다.

그 아래 **확장자 유지**(`behavior.table.keep_extension`, 기본 OFF, 이슈 #86)를 켜면 확장자 컬럼이 보여도 파일 이름에 확장자를 그대로 두고 확장자 칸은 비운다. 헤더를 눌러 확장자로 정렬하는 것은 그대로 된다. 확장자 컬럼이 꺼져 있으면 이 스위치는 비활성이고(눌러도 바뀌지 않는다) 원래대로 이름에 확장자가 보인다.

스위치는 별도 불리언 키 없이 `view.table.columns`의 `extension` 유무를 저장한다. 직접 지정한 `>extension:50` 같은 명세도 ON으로 인식한다. 끄거나 이 항목을 기본값으로 복원하면 확장자 명세만 제거하며, 다른 컬럼의 순서·너비·정렬 표시는 유지한다. 현재 탭에서 직접 선택한 정렬은 컬럼을 숨겨도 유지된다.

### 4.3 터미널 글꼴과 한글 출력

`behavior.terminal_font`는 미리보기 글꼴과 별개다. 지정한 글꼴 뒤에 `ui-monospace, Menlo, Consolas, monospace` 대체 목록을 붙이므로 글꼴을 찾지 못해도 고정폭 글꼴로 표시한다. 글꼴 로드를 기다린 뒤 터미널 칸 수를 다시 계산하며, 이미 열린 터미널에도 변경을 반영한다.

터미널은 커서 위치와 표 정렬을 위해 고정폭 칸을 사용한다. Jetendard 같은 고정폭 글꼴을 권장하며, Wanted Sans 같은 비고정폭 글꼴은 설치돼 있어도 좁은 글자 주변의 간격이 넓어질 수 있다. 글꼴 이름은 OS에 등록된 패밀리 이름을 사용한다.

macOS·Linux에서 앱을 GUI로 실행해 locale이 없거나 `C`/`POSIX`인 경우, 새 PTY 세션의 문자 환경을 UTF-8로 보완한다(macOS `en_US.UTF-8`, 그 밖의 Unix `C.UTF-8`). 기존 `LANG`이 UTF-8이면 그 지역 설정을 재사용한다. 명시적인 다른 locale과 앱 밖의 환경은 바꾸지 않는다. 셸 시작 스크립트가 이후에 locale을 다시 바꾸거나 레거시 인코딩을 지정한 경우는 별도로 조정해야 한다. 이미 열린 세션에는 소급 적용되지 않으므로 터미널 탭을 새로 연다.

## 5. `keybindings.toml`

키를 액션 ID에 대응시킨다. 인수가 없으면 문자열 하나, 있으면 인라인 테이블을 쓴다. 해제는 `"none"` 문자열이다.

```toml
[keybindings]
"F5" = "core.copy"
"Alt+H" = { id = "core.open.directory", src = "~" }
"F8" = "none"                       # 기본 바인딩 해제
"Mod+Shift+K" = { id = "gadget.open_in_editor" }

[keybindings.windows]
"Ctrl+Shift+C" = "core.path.copy_files"
```

- 스코프는 액션이 선언한 스코프를 따른다. 스코프를 강제로 지정하려면 `{ id = "...", scope = "pane" }`.
- `Mod`, `Alt`, `Shift`, `Ctrl` 표기와 키 이름은 [05](05-actions-keybindings.md)의 규칙을 따른다.
- OS별 섹션은 공통 섹션 위에 병합된다.

## 6. Gadgets

Gadget은 설정으로 정의하는 외부 명령/앱 실행 액션이다. Marta의 두 유형(application, executable)과 변수 이름을 그대로 쓴다. ID는 `gadget.<이름>`이다.

```toml
[[gadgets]]
name = "open_in_editor"
title = "Open in Editor"
type = "application"              # application | executable
application = "Visual Studio Code"
files = "${active.selection.paths}"

[[gadgets]]
name = "git_status"
title = "Git Status"
type = "executable"
executable = "git"
args = ["status"]
working_directory = "${active.folder.path}"
```

| 변수 | 의미 | 확장 방식 |
|---|---|---|
| `${active.selection.paths}` | 활성 패널 선택 항목의 경로 | 여러 인수로 확장 |
| `${active.selection.names}` | 활성 패널 선택 항목의 이름 | 여러 인수로 확장 |
| `${inactive.selection.paths}` / `${inactive.selection.names}` | 비활성 패널의 선택 항목 | 여러 인수로 확장 |
| `${current.file.path}` / `${current.file.name}` | 커서 항목 | 단일 값 |
| `${active.folder.path}` / `${inactive.folder.path}` | 각 패널의 현재 폴더 | 단일 값 |
| `${user.home}` | 홈 폴더 | 단일 값 |

`application` 유형에서 "앱 이름"으로 실행하는 방식은 macOS의 `.app` 개념에 기대므로 Windows/Linux에서는 실행 파일 경로 또는 `.desktop` 이름으로 해석한다([09](09-platform-support.md)). 보안상 Gadget은 셸을 거치지 않고 인수 배열로 직접 실행한다. 선택 항목 이름에 공백이나 메타문자가 있어도 인수 하나로 전달된다.

## 6.10 미리보기 용량 한도 (`preview.*_max_mb`)

구현됨(2026-10-09). 이미지·PDF·사운드 미리보기는 파일을 통째로 앱에 싣기 때문에 파일 크기 한도가 있고, 한도를 넘으면 "너무 커서 미리 볼 수 없습니다"가 보인다. 한도는 정수 MB이고 **0은 제한 없음**이다(큰 파일은 메모리를 많이 쓴다). 설정 화면의 **미리보기** 탭에서 바꾸며, 바꾸면 다음 미리보기부터 적용된다. 압축 파일 안의 이미지와 `.cbz`도 같은 이미지 한도를 쓴다.

| 키 | 기본값 | 대상 |
|---|---|---|
| `preview.image_max_mb` | 10 | 이미지(`.cbz`·압축 안 이미지 포함) |
| `preview.pdf_max_mb` | 10 | PDF |
| `preview.audio_max_mb` | 20 | 사운드 |

텍스트(앞 64KB)·비디오(파일 주소로 스트리밍)·3D·Office의 한도는 이 키와 별개다.

**(시험) `preview.pdf_direct`**(기본 `false`): 켜면 디스크의 PDF를 데이터로 싣지 않고 파일 주소로 웹뷰의 PDF 뷰어가 직접 읽는다. Rust가 파일을 읽지 않고 base64·Blob 복사도 없어 큰 PDF가 빨리 열리며, 이 경로에서는 `pdf_max_mb`를 쓰지 않는다. 쪽 수를 모르므로 PageDown의 위쪽 제한이 없다. 압축 안 PDF는 영향이 없다. 맨 앞이 `%PDF`가 아닌 파일(예: 앞에 업로드 본문 머리가 붙은 PDF)은 이 경로를 쓰지 않고 기존 방식(데이터로 싣기, `pdf_max_mb` 한도 적용)으로 연다. 자산 프로토콜이 맨 앞 바이트로 형식을 정해서 이런 파일을 HTML로 내보내기 때문이다. 웹뷰가 파일 주소의 PDF를 열고 `#page=N` 이동이 되는지는 실제 앱에서 확인한 뒤 기본값을 정한다.

## 6.9 화면 언어 (`behavior.language`)

구현됨(2026-10-09, 이슈 #32). `behavior.language`는 `ko`(한국어, 기본값) 또는 `en`(English)이다. 설정 화면의 모양 섹션 "언어"에서 바꾸면 바로 적용되고 `config.toml`에 저장된다. 앱 화면 문구, 네이티브 메뉴(File·View 항목, 설정…, 단축키 목록), 액션 제목이 바뀐다. README·`docs/`·CHANGELOG는 한국어다.

- 문구는 `apps/desktop/src/i18n/`의 사전(`ko.ts` 원본, `en.ts`)에 있고 `t(키, {매개변수})`로 꺼낸다. 영어 사전은 한국어 사전과 키가 같아야 하고(타입과 `i18n-keys.test.ts`가 확인) 값에 한글을 쓰지 않는다.
- 언어를 더하려면 사전 파일(예: `ja.ts`)을 만들고 `i18n/locales.ts`와 `td-config`의 `behavior.language` 허용 값(`load.rs`의 `ENUMS`)에 코드를 등록한다. 키가 빠지면 테스트가 알려 준다.
- Rust가 한국어 문자열로 돌려주는 오류·경고 문구는 `i18n/rust.ts`의 대응표로 영어로 바꾼다. Rust 소스에 새 한국어 문구를 넣으면 `i18n-rust-messages.test.ts`가 대응표 항목을 요구한다. 대응표에 없는 문구는 한국어로 보인다.
- 화면 소스(테스트 제외)에 사전 밖 한글 문자열이 없는지 `i18n-no-hardcoded.test.ts`가 확인하고, 영어에서 대표 화면에 한글이 없는지 `i18n-english-screens.test.tsx`가 확인한다.

## 7. 테마

테마는 CSS 변수(디자인 토큰)의 집합이다. `@spacedrive/tokens`를 기반으로 하고, 사용자 테마는 그 값을 덮어쓴다.

- 구현됨(2026-10-08): `behavior.theme`은 `system`, `light`, `dark`, 또는 Warp 테마 112개의 이름(`apps/desktop/themes/*.yaml`의 파일 이름, 예: `catppuccin-mocha`, `dracula-default`) 중 하나다. 기본값은 `system`이다.
  - `light`는 `catppuccin-latte`, `dark`는 `catppuccin-mocha`, `system`은 OS가 다크면 Mocha, 아니면 Latte다. 테마 이름을 고르면 그 테마 하나를 쓴다.
  - 색은 테마 YAML의 `background`·`foreground`·`accent`와 터미널 normal의 `red`·`green`·`yellow`·`blue`로 계산한다: 배경→`app`, 글자→`ink`, `accent`→`accent`(YAML 그대로, 그 위 글자는 흰색/검정 중 대비가 큰 쪽), 터미널 색→상태색(오류·경고·성공·정보). 표면 단계(`app-box`·`app-line`·`app-hover` 등)는 배경에 글자색을 6~20% 섞어 만들고, 흐린 글자는 모든 테마에서 배경과의 대비가 3.0 이상이 되게 섞는다. 계산은 `lib/themeColors.ts`다.
  - YAML은 빌드 때만 읽는다: `scripts/gen-themes.mjs`(`task gen-types`)가 `src/lib/themes.generated.ts`(색 표)와 `crates/td-config/src/themes.rs`(허용 이름 목록)를 만든다. 앱은 실행 중에 YAML을 읽지 않고, 사용자가 YAML을 넣는 기능은 아직 없다(아래 예시).
  - 설정 화면의 테마 선택은 검색 상자다(F키 동작 선택과 같은 `Combobox`). 보이는 이름(`Dracula Default · 어두움`)뿐 아니라 파일 이름(`dracula-default`)과 밝기(`어두움`/`밝음`)로도 찾고, ↑↓로 고르고 Enter로 확정한다.
  - 옛 spaceui 이름(`midnight`, `noir`, `slate`, `nord`, `mocha`)은 없어졌다. 설정에 남아 있으면 경고하고 `system`으로 돌아간다.
  - `<html>`에는 `data-theme`(dark/light), `data-color-theme`(테마 이름), 클래스(dark/light)가 걸리고 색 토큰은 인라인 `--color-*`다. 설정을 읽기 전에는 spaceui의 dark/light 기본값이 보인다.

```toml
# themes/my-theme.toml
name = "My Theme"
base = "dark"                     # 상속할 내장 테마

[colors]
background = "#1e1f22"
pane_active_border = "#4f8cff"
selection = "#2d4a7a"
cursor = "#3a3f4b"
text = "#e6e6e6"
```

- 내장 테마: Warp 테마 112개와 `system`·`light`·`dark` (위 "구현됨" 참고). Marta의 5종(Kon, Dark, Classic, Sakura, Commander)에 해당하는 테마는 P3에서 별도로 디자인한다. Marta 테마 파일은 복사하지 않는다.
- 테마 전환은 `core.theme.switch` 액션(즉시 미리보기)과 `behavior.theme` 설정으로 한다.
- 터미널 색상은 xterm.js 테마 객체로 매핑한다. Marta의 `.ettyTheme` 형식은 지원하지 않는다.
- 테마 키 이름(`pane_active_border` 등)은 토큰 목록을 [07](07-ui-spec.md)과 함께 확정한다. 지금 이름은 예시다.

## 8. 플러그인 (M4, 초안)

### 8.1 배경

Marta는 Lua 5.4.7을 번들하고 플러그인을 `.lua` 파일 또는 `init.lua` 폴더로 둔다. `plugin { id, name, apiVersion, author, ... }`으로 선언하고 `action { id, name, isApplicable, apply }`로 액션을 정의한다. `os.execute`는 막고 `martax.execute`를 제공한다. 이 사실은 Marta 문서에서 확인했으나 전체 API 표면(클래스/함수)은 확인하지 못했다 `[알 수 없음]`.

### 8.2 twin-deck 초안

| 항목 | 초안 |
|---|---|
| 언어 | Lua 5.4 (`mlua`). 근거: Marta 개념과 1:1로 대응하고, Rust 임베딩이 성숙하며, wasmer 같은 무거운 런타임이 필요 없다. 확정은 ADR-0008 |
| 위치 | 설정 디렉터리의 `plugins/<id>.lua` 또는 `plugins/<id>/init.lua` |
| 선언 | `plugin { id, name, api_version, author }` (`id`, `name`, `api_version` 필수) |
| 액션 | `action { id, name, is_applicable = function(ctx), apply = function(ctx) }`. 액션 ID는 `<plugin_id>.<action_id>` |
| 전역 | `twin` (앱 API), `twinx` (확장 헬퍼: `execute`, `alert`, `format_size`) |
| 컨텍스트 | Window, Pane, Action 컨텍스트. `ctx.active_pane`, `ctx.inactive_pane`, 각 패널의 `folder`, `active_files` |
| 파일 정보 | `name`, `is_folder`, `size`, `path` |
| 샌드박스 | 기본 차단: `os.execute`, `io.popen`, `package.loadlib`. 외부 실행은 `twinx.execute`(인수 배열, 셸 미사용)만 허용 |
| 버전 | `api_version`이 다르면 로드하지 않고 경고 |

API의 전체 목록은 M4 착수 시 별도 문서 `docs/plugin-api.md`로 확정한다. 지금은 확정하지 않는다.

### 8.3 연기 사유

플러그인은 액션 시스템이 안정된 뒤에 얹을 수 있고, 액션 레지스트리와 컨텍스트 모델이 플러그인 API의 실질적 원형이다. M1~M3에서 그 모델이 검증되기 전에 API를 확정하면 되돌리는 비용이 크다.

## 9. 미확인 과제

| 항목 | 확인 방법 |
|---|---|
| 각 OS 설정 디렉터리의 실제 경로 | Tauri 경로 API 시험 |
| 테마 토큰 목록 | M2 UI 구현과 함께 확정 |
| Marta의 컬럼/즐겨찾기/Gadget 세부 문법 중 문서에 없는 부분 | Marta 실행 확인 |
| Lua API의 실제 표면 | 접근 가능한 API 문서 재조사 |
| `application` 유형 Gadget의 OS별 앱 식별 방식 | M4에서 `file-opening` 크레이트 API 확인 후 설계 |
