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
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct Behavior {
    pub theme: String,
    /// 앱 UI의 글꼴. CSS `font-family` 값이고 비우면 기본 글꼴이다.
    pub ui_font: String,
    /// 미리보기 본문의 글꼴. CSS `font-family` 값이고 비우면 기본 글꼴이다.
    pub preview_font: String,
    pub table: BehaviorTable,
    pub quick_select: QuickSelect,
    pub selection: SelectionConfig,
    pub layout: BehaviorLayout,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct BehaviorTable {
    pub icon_size: u32,
    /// 끝에서 처음으로 순환 (NAV-06).
    pub circular_selection: bool,
    pub right_click_select: bool,
    /// 행 배경을 번갈아 옅게 칠한다.
    pub zebra_rows: bool,
    /// 행 맨 앞 표시 칸(`●` 선택, `▸` 폴더)을 보인다. 끄면 칸 자체가 사라진다.
    pub show_marks: bool,
    /// 폴더 이름 장식: "none" | "brackets" | "parens" | "slash". 화면 표시만 바꾼다.
    pub folder_style: String,
    /// 활성 패널의 커서 행을 강조색으로 꽉 채운다.
    pub cursor_fill: bool,
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
    /// 패널 위의 드라이브 바(볼륨 버튼, 남은 용량, 언마운트).
    pub show_drive_bar: bool,
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
