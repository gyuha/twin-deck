//! 설정 파일 저장 경로. 사용자가 고른 폴더(iCloud Drive·Google Drive 폴더 등)에 `config.toml`·`keybindings.toml`을 두게 한다.
//! 고른 경로는 로컬 앱 설정 폴더의 `location.toml`에 적는다. 그 경로 안의 `config.toml`에 적으면 경로를 읽으려고 경로를 알아야 하는 문제가 생긴다.
//! 탭·커서·창 상태(`state.json`)는 늘 로컬 폴더에 남는다(커서만 움직여도 저장돼 클라우드 폴더에 두면 충돌 사본이 생긴다).

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::load::Warning;

/// 로컬 앱 설정 폴더에 두는, 지정 경로를 적은 파일.
pub const LOCATION_FILE: &str = "location.toml";

/// 저장 경로를 따라가는 설정 파일.
pub const CONFIG_FILES: [&str; 2] = ["config.toml", "keybindings.toml"];

/// 설정 폴더를 정한 결과.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedDir {
    /// 실제로 설정을 읽고 쓸 폴더.
    pub dir: PathBuf,
    /// `location.toml`에 적힌 경로(쓸 수 없어 로컬로 돌아갔어도 적힌 값 그대로).
    pub custom: Option<PathBuf>,
    /// 적힌 경로를 쓰지 못해 로컬 폴더로 돌아갔을 때의 경고.
    pub warning: Option<Warning>,
}

/// 새 경로에 이미 설정 파일이 있을 때 어떻게 할지.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum LocationConflict {
    /// 그 경로의 설정을 그대로 쓴다.
    UseExisting,
    /// 지금 설정으로 덮어쓴다. 그 경로에 있던 파일은 `.bak`으로 남긴다.
    Overwrite,
}

/// `location.toml`에 적힌 경로. 파일이 없거나, 비었거나, 읽지 못하면 None.
pub fn read_config_location(local: &Path) -> Option<PathBuf> {
    let text = fs::read_to_string(local.join(LOCATION_FILE)).ok()?;
    let table = text.parse::<toml::Table>().ok()?;
    let dir = table.get("dir")?.as_str()?.trim();
    (!dir.is_empty()).then(|| PathBuf::from(dir))
}

/// 설정을 읽고 쓸 폴더를 정한다. 지정 경로가 없으면 로컬 폴더, 있지만 폴더가 아니면(지워졌거나 클라우드 드라이브가 아직 안 붙음) 로컬 폴더와 경고.
pub fn resolve_config_dir(local: &Path) -> ResolvedDir {
    let Some(custom) = read_config_location(local) else {
        return ResolvedDir {
            dir: local.to_path_buf(),
            custom: None,
            warning: None,
        };
    };
    if custom.is_dir() {
        return ResolvedDir {
            dir: custom.clone(),
            custom: Some(custom),
            warning: None,
        };
    }
    ResolvedDir {
        dir: local.to_path_buf(),
        warning: Some(Warning::new(
            LOCATION_FILE,
            format!(
                "설정 저장 경로 '{}'를 찾을 수 없어 기본 위치의 설정을 씁니다",
                custom.display()
            ),
        )),
        custom: Some(custom),
    }
}

/// 폴더에 설정 파일(`config.toml`·`keybindings.toml`)이 하나라도 있는가.
pub fn has_config_files(dir: &Path) -> bool {
    CONFIG_FILES.iter().any(|f| dir.join(f).is_file())
}

fn same_dir(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(a), Ok(b)) => a == b,
        _ => a == b,
    }
}

/// 설정 폴더를 `current`에서 `target`으로 옮긴다. `target`이 None이면 기본 위치(`local`)로 되돌린다. 새 설정 폴더를 돌려준다.
/// - `target`에 설정 파일이 없으면 지금 파일을 복사한다(`conflict`는 보지 않는다).
/// - 있으면 `conflict`에 따라 그 파일을 쓰거나, `.bak`으로 남기고 지금 파일로 덮어쓴다.
/// - 마지막에 `location.toml`을 고친다. 그 전에 실패하면 경로는 바뀌지 않는다.
pub fn change_config_location(
    local: &Path,
    current: &Path,
    target: Option<&Path>,
    conflict: LocationConflict,
) -> Result<PathBuf, String> {
    let to = target.unwrap_or(local);
    if !to.is_dir() {
        return Err(format!("'{}'는 폴더가 아닙니다", to.display()));
    }
    if !same_dir(current, to) {
        let copy = !has_config_files(to) || conflict == LocationConflict::Overwrite;
        if copy {
            for name in CONFIG_FILES {
                let dest = to.join(name);
                if dest.is_file() {
                    fs::rename(&dest, to.join(format!("{name}.bak")))
                        .map_err(|e| format!("{name}을 백업하지 못했습니다: {e}"))?;
                }
                let src = current.join(name);
                if src.is_file() {
                    fs::copy(&src, &dest)
                        .map_err(|e| format!("{name}을 복사하지 못했습니다: {e}"))?;
                }
            }
        }
    }
    if target.is_none() || same_dir(to, local) {
        match fs::remove_file(local.join(LOCATION_FILE)) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(format!("{LOCATION_FILE}을 지우지 못했습니다: {e}")),
        }
    } else {
        let mut table = toml::Table::new();
        table.insert(
            "dir".into(),
            toml::Value::String(to.to_string_lossy().into_owned()),
        );
        fs::create_dir_all(local).map_err(|e| e.to_string())?;
        let tmp = local.join(format!("{LOCATION_FILE}.tmp"));
        fs::write(&tmp, table.to_string()).map_err(|e| e.to_string())?;
        fs::rename(&tmp, local.join(LOCATION_FILE)).map_err(|e| e.to_string())?;
    }
    Ok(to.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(dir: &Path, name: &str, text: &str) {
        fs::write(dir.join(name), text).unwrap();
    }

    fn read(dir: &Path, name: &str) -> String {
        fs::read_to_string(dir.join(name)).unwrap()
    }

    #[test]
    fn location_without_pointer_is_the_local_dir() {
        let local = tempfile::tempdir().unwrap();
        let r = resolve_config_dir(local.path());
        assert_eq!(r.dir, local.path());
        assert_eq!(r.custom, None);
        assert_eq!(r.warning, None);
    }

    #[test]
    fn location_pointer_to_existing_dir_is_used() {
        let local = tempfile::tempdir().unwrap();
        let cloud = tempfile::tempdir().unwrap();
        write(
            local.path(),
            LOCATION_FILE,
            &format!("dir = {:?}\n", cloud.path().to_string_lossy()),
        );
        let r = resolve_config_dir(local.path());
        assert_eq!(r.dir, cloud.path());
        assert_eq!(r.custom.as_deref(), Some(cloud.path()));
        assert_eq!(r.warning, None);
    }

    #[test]
    fn location_pointer_to_missing_dir_falls_back_with_warning() {
        let local = tempfile::tempdir().unwrap();
        let gone = local.path().join("없는 폴더");
        write(
            local.path(),
            LOCATION_FILE,
            &format!("dir = {:?}\n", gone.to_string_lossy()),
        );
        let r = resolve_config_dir(local.path());
        assert_eq!(r.dir, local.path());
        assert_eq!(r.custom.as_deref(), Some(gone.as_path()));
        let w = r.warning.expect("경고");
        assert_eq!(w.file, LOCATION_FILE);
        assert!(w.message.contains("없는 폴더"), "{}", w.message);
    }

    #[test]
    fn location_empty_or_broken_pointer_is_ignored() {
        let local = tempfile::tempdir().unwrap();
        write(local.path(), LOCATION_FILE, "dir = \"\"\n");
        assert_eq!(resolve_config_dir(local.path()).dir, local.path());
        write(local.path(), LOCATION_FILE, "dir = [");
        assert_eq!(resolve_config_dir(local.path()).dir, local.path());
    }

    #[test]
    fn location_change_to_empty_dir_copies_files_and_writes_pointer() {
        let local = tempfile::tempdir().unwrap();
        let cloud = tempfile::tempdir().unwrap();
        write(
            local.path(),
            "config.toml",
            "[behavior]\ntheme = \"dark\"\n",
        );
        write(local.path(), "keybindings.toml", "# keys\n");
        write(local.path(), "state.json", "{}");
        let dir = change_config_location(
            local.path(),
            local.path(),
            Some(cloud.path()),
            LocationConflict::UseExisting,
        )
        .unwrap();
        assert_eq!(dir, cloud.path());
        assert_eq!(
            read(cloud.path(), "config.toml"),
            "[behavior]\ntheme = \"dark\"\n"
        );
        assert_eq!(read(cloud.path(), "keybindings.toml"), "# keys\n");
        assert!(!cloud.path().join("state.json").exists());
        assert_eq!(resolve_config_dir(local.path()).dir, cloud.path());
    }

    #[test]
    fn location_change_use_existing_keeps_target_files() {
        let local = tempfile::tempdir().unwrap();
        let cloud = tempfile::tempdir().unwrap();
        write(
            local.path(),
            "config.toml",
            "[behavior]\ntheme = \"dark\"\n",
        );
        write(
            cloud.path(),
            "config.toml",
            "[behavior]\ntheme = \"light\"\n",
        );
        change_config_location(
            local.path(),
            local.path(),
            Some(cloud.path()),
            LocationConflict::UseExisting,
        )
        .unwrap();
        assert_eq!(
            read(cloud.path(), "config.toml"),
            "[behavior]\ntheme = \"light\"\n"
        );
        assert!(!cloud.path().join("config.toml.bak").exists());
    }

    #[test]
    fn location_change_overwrite_backs_up_target_files() {
        let local = tempfile::tempdir().unwrap();
        let cloud = tempfile::tempdir().unwrap();
        write(
            local.path(),
            "config.toml",
            "[behavior]\ntheme = \"dark\"\n",
        );
        write(
            cloud.path(),
            "config.toml",
            "[behavior]\ntheme = \"light\"\n",
        );
        write(cloud.path(), "keybindings.toml", "# 옛 키\n");
        change_config_location(
            local.path(),
            local.path(),
            Some(cloud.path()),
            LocationConflict::Overwrite,
        )
        .unwrap();
        assert_eq!(
            read(cloud.path(), "config.toml"),
            "[behavior]\ntheme = \"dark\"\n"
        );
        assert_eq!(
            read(cloud.path(), "config.toml.bak"),
            "[behavior]\ntheme = \"light\"\n"
        );
        // 지금 설정에 없는 파일은 백업만 남고 사라진다(덮어쓴 결과가 지금 설정과 같아야 한다).
        assert!(!cloud.path().join("keybindings.toml").exists());
        assert_eq!(read(cloud.path(), "keybindings.toml.bak"), "# 옛 키\n");
    }

    #[test]
    fn location_reset_removes_pointer_and_copies_back() {
        let local = tempfile::tempdir().unwrap();
        let cloud = tempfile::tempdir().unwrap();
        write(
            cloud.path(),
            "config.toml",
            "[behavior]\ntheme = \"dark\"\n",
        );
        write(
            local.path(),
            LOCATION_FILE,
            &format!("dir = {:?}\n", cloud.path().to_string_lossy()),
        );
        let dir = change_config_location(
            local.path(),
            cloud.path(),
            None,
            LocationConflict::UseExisting,
        )
        .unwrap();
        assert_eq!(dir, local.path());
        assert!(!local.path().join(LOCATION_FILE).exists());
        assert_eq!(
            read(local.path(), "config.toml"),
            "[behavior]\ntheme = \"dark\"\n"
        );
    }

    #[test]
    fn location_change_to_non_dir_fails_without_writing_pointer() {
        let local = tempfile::tempdir().unwrap();
        let err = change_config_location(
            local.path(),
            local.path(),
            Some(&local.path().join("없음")),
            LocationConflict::UseExisting,
        )
        .unwrap_err();
        assert!(err.contains("폴더가 아닙니다"), "{err}");
        assert!(!local.path().join(LOCATION_FILE).exists());
    }
}
