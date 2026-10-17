use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct Config {
    pub behavior: Behavior,
    pub display: Display,
    pub environment: Environment,
    pub core: CoreConfig,
    /// 미리보기 옵션.
    pub preview: PreviewConfig,
    pub layout: LayoutConfig,
    pub view: ViewConfig,
    pub file_systems: FileSystemsConfig,
    /// 폴더 단축키. 키는 "0"~"9", 값은 경로(`~`, `${user.*}` 허용). 빈 문자열이면 미지정.
    pub shortcuts: BTreeMap<String, String>,
    /// F1~F12의 동작. 빈 문자열이면 기본 바인딩 유지, "none"이면 해제, 그 밖에는 액션 ID.
    pub fkeys: BTreeMap<String, String>,
    /// `fkeys`가 "core.app.launch"인 키가 실행할 애플리케이션. 빈 문자열이면 미지정.
    pub fkey_apps: BTreeMap<String, String>,
    /// F키 줄(`F5`, `Ctrl+F5` …)마다 그 동작을 Action Bar에 보일지. 켠 줄은 `layout.action_bar` 뒤에 이어 붙는다.
    pub fkey_bar: BTreeMap<String, bool>,
    /// 병합 후 항목별로 검증해서 채운다(잘못된 항목은 경고와 함께 빠진다).
    #[serde(default)]
    pub favorites: Vec<FavoriteDto>,
    /// 저장된 SMB 서버 목록. 비밀번호는 여기 두지 않고 OS 키체인에 둔다(ADR-0018).
    pub smb: SmbConfig,
    /// 저장된 SFTP·FTP 서버 목록. 비밀번호는 여기 두지 않고 OS 키체인에 둔다(ADR-0019).
    pub remote: RemoteConfig,
    /// 이 앱 안에서 도는 SSH/SFTP 서버(Twin Deck Remote). 비밀번호는 여기 두지 않고 OS 키체인에 둔다.
    pub remote_server: RemoteServerConfig,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct Behavior {
    pub theme: String,
    /// 화면 언어(`ko`, `en`). 기본은 한국어다.
    pub language: String,
    /// 켜면 `theme` 대신 `random_themes` 중 하나를 앱을 켤 때마다 무작위로 쓴다.
    pub random_theme: bool,
    /// 랜덤 테마 후보. 테마 이름(apps/desktop/themes의 파일 이름)을 쉼표로 이은 문자열이고, 모르는 이름은 무시한다.
    pub random_themes: String,
    /// 앱 UI의 글꼴. CSS `font-family` 값이고 비우면 기본 글꼴이다.
    pub ui_font: String,
    /// 미리보기 본문의 글꼴. CSS `font-family` 값이고 비우면 기본 글꼴이다.
    pub preview_font: String,
    /// 내장 터미널의 글꼴. CSS `font-family` 값이고 비우면 기본 고정폭 글꼴이다(미리보기 글꼴과 따로 쓴다).
    pub terminal_font: String,
    /// 이전 버전의 앱 기본 글자색(`#rrggbb` 또는 `#rgb`, 모든 테마 공통). 테마별 키(`text_color_dark`/`text_color_light`)가 비어 있을 때만 쓴다(이슈 #58).
    pub text_color: String,
    /// 다크 테마의 앱 기본 글자색(`#rrggbb` 또는 `#rgb`). 비우면 `text_color`, 그것도 비면 테마 그대로다. 흐린 글자색은 이 색을 배경 쪽으로 섞어 만든다.
    pub text_color_dark: String,
    /// 라이트 테마의 앱 기본 글자색. 규칙은 `text_color_dark`와 같다.
    pub text_color_light: String,
    pub table: BehaviorTable,
    pub quick_select: QuickSelect,
    pub selection: SelectionConfig,
    pub layout: BehaviorLayout,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct BehaviorTable {
    pub icon_size: u32,
    /// 목록 행의 아이콘을 운영체제가 쓰는 파일 아이콘으로 보인다(macOS·Windows). 얻지 못하면 기본 아이콘이다.
    pub system_icons: bool,
    /// 끝에서 처음으로 순환 (NAV-06).
    pub circular_selection: bool,
    pub right_click_select: bool,
    /// 행 배경을 번갈아 옅게 칠한다.
    pub zebra_rows: bool,
    /// 행 맨 앞 표시 칸(`●` 선택, `▸` 폴더)을 보인다. 끄면 칸 자체가 사라진다.
    pub show_marks: bool,
    /// 폴더 이름 장식: "none" | "brackets" | "parens" | "slash". 화면 표시만 바꾼다.
    pub folder_style: String,
    /// 컬럼 사이 세로선: "none" | "solid" | "dash". 헤더와 모든 행에 그린다.
    pub column_lines: String,
    /// 활성 패널의 커서 행을 강조색으로 꽉 채운다.
    pub cursor_fill: bool,
    /// 파일 목록 맨 위에 상위 폴더로 가는 `..` 행을 보인다. 전체 선택·복사·이동 같은 작업 대상에는 들지 않는다.
    pub show_parent_row: bool,
    /// 파일 목록을 수정일 구간(오늘·어제·이전 7일·이전 30일·월·연도)으로 나눠 구간 제목 행을 보인다(이슈 #62). 단일 컬럼 목록 보기에만 적용된다.
    pub group_by_modified: bool,
    /// 확장자 컬럼이 보일 때도 파일 이름에 확장자를 그대로 두고 확장자 칸은 비운다(이슈 #86). 확장자 컬럼이 꺼져 있으면 영향이 없다.
    pub keep_extension: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct QuickSelect {
    pub match_only_prefix: bool,
    pub activate_on_any_character: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct SelectionConfig {
    /// "invert" | "extend"
    pub shift_mode: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct BehaviorLayout {
    pub show_action_bar: bool,
    /// true면 Action Bar가 평소엔 수식키 없는 키만 보이고, Shift/Ctrl/Alt/Cmd를 누르는 동안 그 조합 키의 항목만 보인다.
    pub action_bar_by_modifier: bool,
    /// 최근 위치 메뉴에 기억하는 폴더 수(두 패널 공용). 1 이상.
    pub recent_limit: u32,
    /// 패널 위의 드라이브 바(볼륨 버튼, 언마운트). 남은 용량은 이 바와 별개로 경로 표시줄 오른쪽 끝에 항상 보인다.
    pub show_drive_bar: bool,
    /// 활성 패널을 감싸는 accent 테두리를 보인다. 끄면 두 패널 모두 테두리가 투명이다(폭은 그대로).
    pub pane_highlight: bool,
    /// 탭 모양: "underline"(글자 + 활성 탭 밑줄) | "segments"(폭을 균등 분할, 활성 탭은 배경).
    pub tab_style: String,
    /// 탭 닫기 버튼: 켜면 모든 탭에 좌우 대칭 패딩을 두고, 마우스를 올린 탭의 오른쪽에 ✕가 보인다(탭이 하나뿐이면 숨김).
    pub tab_close_button: bool,
    /// 탭 막대 위치: "top"(파일 목록 위) | "bottom"(파일 목록 아래, 이슈 #67). 패널마다 탭 막대가 하나씩이라 두 패널 모두 따른다.
    pub tab_position: String,
    /// 특수 탭의 색(이슈 #92): "auto"(테마에서 계산) | "off" | "#rrggbb". 칸형은 배경, 밑줄형은 밑줄과 이름 앞 점에 쓴다.
    pub tab_color_terminal: String,
    pub tab_color_smb: String,
    pub tab_color_remote: String,
    pub tab_color_twindeck: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct Display {
    pub relative_date: bool,
    pub date_format: String,
    pub time_format: String,
    pub size_format: String,
    /// 폴더를 선택하면 그 하위 파일의 총 용량을 백그라운드로 계산해 크기 칸과 상태 줄에 보여 준다.
    pub folder_size_on_select: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct Environment {
    pub text_editor: String,
    pub terminal: String,
    /// 앱을 한 번에 하나만 띄울지. 켜면 이미 떠 있을 때 다시 실행해도 그 앱의 창이 앞으로 오고, 끄면 실행할 때마다 새로 뜬다. 앱을 다시 시작해야 반영된다.
    pub single_instance: bool,
    /// 전역 화면 열기 단축키를 쓸지. 끄면 `global_hotkey` 값이 있어도 등록하지 않는다.
    pub global_hotkey_enabled: bool,
    /// 앱이 뒤에 있어도 누르면 창을 앞으로 불러오는 전역 단축키(예: `Mod+Alt+O`). `Mod`는 macOS ⌘, 그 밖은 Ctrl이다. 비우면 끈다.
    pub global_hotkey: String,
}

/// 미리보기 옵션. 사운드/비디오는 기본으로 자동 재생하지 않고 재생 UI만 띄운다.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct PreviewConfig {
    /// 사운드 파일의 미리보기를 열면 바로 재생한다.
    pub audio_autoplay: bool,
    /// 비디오 파일의 미리보기를 열면 바로 재생한다.
    pub video_autoplay: bool,
    /// 미리보기 창 바깥을 클릭하면 미리보기를 닫는다.
    pub close_on_outside_click: bool,
    /// 이미지 미리보기를 싣는 최대 파일 크기(MB). 이보다 크면 "너무 커서 미리 볼 수 없습니다"가 보인다. 0은 제한 없음.
    pub image_max_mb: u32,
    /// PDF 미리보기의 최대 파일 크기(MB). 0은 제한 없음.
    pub pdf_max_mb: u32,
    /// 사운드 미리보기의 최대 파일 크기(MB). 0은 제한 없음.
    pub audio_max_mb: u32,
    /// (시험 기능) 디스크의 PDF를 데이터로 싣지 않고 파일 주소로 웹뷰가 직접 읽게 한다. 큰 PDF가 빨리 열리지만
    /// 웹뷰의 PDF 뷰어가 파일 주소를 여는지·쪽 이동이 되는지는 실제 앱에서 확인해야 한다. 켜면 `pdf_max_mb`는 이 경로에서 쓰이지 않고, 압축 안 PDF는 영향이 없다.
    pub pdf_direct: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct CoreConfig {
    pub confirm: ConfirmConfig,
}

/// 삭제/휴지통 확인 대화상자 on/off (OP-13).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct ConfirmConfig {
    pub delete: bool,
    pub trash: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct FileSystemsConfig {
    pub zip: ZipConfig,
}

/// ZIP으로도 열 확장자 (ARC-01). 점 없이 쓴다(`docx`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct ZipConfig {
    pub additional_extensions: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct LayoutConfig {
    pub action_bar: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct ViewConfig {
    pub table: TableView,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct TableView {
    /// 컬럼 명세 `[<|>]이름[:너비]`.
    pub columns: Vec<String>,
}

/// 즐겨찾기 항목. `kind`는 "item" | "separator" | "group". 그룹은 한 단계까지 지원한다.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct FavoriteDto {
    pub kind: String,
    pub name: Option<String>,
    pub path: Option<String>,
    #[serde(default)]
    pub items: Vec<FavoriteLeaf>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct FavoriteLeaf {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct SmbConfig {
    /// 병합 후 항목별로 검증해서 채운다(host나 share가 빈 항목은 경고와 함께 빠진다).
    #[serde(default)]
    pub servers: Vec<SmbServer>,
}

/// SMB 서버 항목(`[[smb.servers]]`). `name`이 비면 읽을 때 `host/share`로 채운다. `user`가 비면 게스트로 연결한다.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct SmbServer {
    pub name: String,
    pub host: String,
    pub share: String,
    pub user: String,
    /// 연결 메뉴·드라이브 바·경로 표시줄·탭 이름 앞에 붙이는 이모지(이슈 #93). 비면 붙이지 않는다.
    #[serde(default)]
    pub icon: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct RemoteConfig {
    /// 병합 후 항목별로 검증해서 채운다(protocol이 sftp·ftp·twindeck이 아니거나 host가 빈 항목은 경고와 함께 빠진다).
    #[serde(default)]
    pub servers: Vec<RemoteServer>,
}

/// SFTP·FTP 서버 항목(`[[remote.servers]]`). `name`이 비면 읽을 때 `user@host`(user가 없으면 `host`)로 채우고,
/// `port`가 0이거나 없으면 프로토콜 기본 포트(sftp 22, ftp 21, twindeck 2222)로 채운다. `twindeck`은 앱 내장 서버(Twin Deck Remote)로, 연결은 SFTP와 같다. `user`가 비면 FTP는 `anonymous`로 연결한다.
/// `base_dir`은 접속 직후 이동할 폴더이고 비면 서버가 알려 주는 홈이다.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct RemoteServer {
    pub name: String,
    pub protocol: String,
    pub host: String,
    pub port: u16,
    pub user: String,
    pub base_dir: String,
    /// 연결 메뉴·경로 표시줄·탭 이름 앞에 붙이는 이모지(이슈 #93). 비면 붙이지 않는다.
    #[serde(default)]
    pub icon: String,
}

/// 내장 서버(Twin Deck Remote) 설정. 기본은 꺼짐·로컬 전용·읽기 전용·셸 없음이다.
/// `root`가 비어 있으면 서버를 켤 수 없다(홈 폴더로 대신하지 않는다).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct RemoteServerConfig {
    pub enabled: bool,
    pub bind: String,
    pub port: u16,
    pub root: String,
    pub allow_write: bool,
    pub allow_shell: bool,
    pub user: String,
}
