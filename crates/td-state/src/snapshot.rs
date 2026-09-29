use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use specta::Type;

/// 저장 형식 버전. 호환되지 않게 바뀌면 올린다(옛 파일은 경고하고 무시한다).
pub const VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SortSnap {
    pub key: String,
    pub dir: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ViewSnap {
    /// "table" | "columns"
    pub mode: String,
    pub count: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TabSnap {
    pub path: String,
    /// 커서가 있던 항목의 이름(복원 시 이름으로 찾는다).
    pub cursor_name: Option<String>,
    /// 선택했던 항목의 전체 경로.
    pub selection: Vec<String>,
    pub sort: Option<SortSnap>,
    pub view: ViewSnap,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PaneSnap {
    pub tabs: Vec<TabSnap>,
    pub active: u32,
}

/// 창 하나의 복원 상태: 두 패널의 탭들, 활성 패널, 숨김 표시, Actions Panel 검색어.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub version: u32,
    /// "left" | "right"
    pub active_pane: String,
    pub show_hidden: bool,
    pub palette_query: String,
    pub left: PaneSnap,
    pub right: PaneSnap,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LoadedState {
    pub snapshot: Option<Snapshot>,
    /// 파일이 있었지만 읽을 수 없어 무시했다면 그 이유.
    pub warning: Option<String>,
}

/// `main` 창은 `state.json`, 다른 창은 `state-<레이블>.json`.
fn state_file(dir: &Path, label: &str) -> PathBuf {
    if label == "main" {
        return dir.join("state.json");
    }
    let safe: String = label
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    dir.join(format!("state-{safe}.json"))
}

/// 원자적으로 저장한다: 임시 파일에 쓰고 이름을 바꾼다. 도중에 죽어도 옛 파일이 온전히 남는다.
pub fn save(dir: &Path, label: &str, snapshot: &Snapshot) -> io::Result<()> {
    fs::create_dir_all(dir)?;
    let file = state_file(dir, label);
    let tmp = file.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(snapshot).map_err(io::Error::other)?;
    fs::write(&tmp, json)?;
    fs::rename(&tmp, &file)
}

fn valid(s: &Snapshot) -> Result<(), String> {
    for (name, pane) in [("left", &s.left), ("right", &s.right)] {
        if pane.tabs.is_empty() {
            return Err(format!("{name} 패널에 탭이 없습니다"));
        }
        if pane.active as usize >= pane.tabs.len() {
            return Err(format!("{name} 패널의 활성 탭 번호가 범위를 벗어났습니다"));
        }
    }
    if s.active_pane != "left" && s.active_pane != "right" {
        return Err(format!("알 수 없는 활성 패널: {}", s.active_pane));
    }
    Ok(())
}

/// 저장된 상태를 읽는다. 파일이 없으면 조용히 None, 깨졌거나 호환되지 않으면 None과 경고.
/// 어떤 경우에도 패닉하지 않고 앱은 기본 상태로 시작할 수 있다.
pub fn load(dir: &Path, label: &str) -> LoadedState {
    let file = state_file(dir, label);
    let text = match fs::read_to_string(&file) {
        Ok(t) => t,
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            return LoadedState {
                snapshot: None,
                warning: None,
            }
        }
        Err(e) => {
            return LoadedState {
                snapshot: None,
                warning: Some(format!("{}을 읽지 못했습니다: {e}", file.display())),
            }
        }
    };
    let fail = |why: String| LoadedState {
        snapshot: None,
        warning: Some(format!("{}을 무시합니다: {why}", file.display())),
    };
    let snapshot: Snapshot = match serde_json::from_str(&text) {
        Ok(s) => s,
        Err(e) => return fail(e.to_string()),
    };
    if snapshot.version != VERSION {
        return fail(format!(
            "저장 형식 버전이 다릅니다({} != {VERSION})",
            snapshot.version
        ));
    }
    if let Err(why) = valid(&snapshot) {
        return fail(why);
    }
    LoadedState {
        snapshot: Some(snapshot),
        warning: None,
    }
}

/// 모든 창의 저장 상태를 지운다(`core.state.reset`). 지운 파일 수를 돌려준다.
pub fn reset(dir: &Path) -> io::Result<usize> {
    let mut n = 0;
    let rd = match fs::read_dir(dir) {
        Ok(rd) => rd,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(0),
        Err(e) => return Err(e),
    };
    for entry in rd {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name == "state.json" || (name.starts_with("state-") && name.ends_with(".json")) {
            fs::remove_file(entry.path())?;
            n += 1;
        }
    }
    Ok(n)
}
