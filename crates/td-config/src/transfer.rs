//! 설정 내보내기·가져오기. `config.toml`·`keybindings.toml`을 zip 하나로 묶어 다른 기기로 옮긴다.

use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use crate::location::CONFIG_FILES;

/// 가져올 때 한 파일에서 읽는 최대 크기. 설정 파일은 몇 KB라 이보다 크면 설정 내보내기 파일이 아니다.
const MAX_FILE_BYTES: u64 = 1024 * 1024;

fn tmp_path(path: &Path) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(".tmp");
    path.with_file_name(name)
}

/// 설정 폴더 `dir`의 `config.toml`·`keybindings.toml`을 zip 파일 `dest`로 내보낸다. 없는 파일은 빼고 담는다.
/// 같은 폴더에 임시 파일로 쓴 뒤 이름을 바꾸므로, 실패해도 이미 있던 `dest`는 그대로다.
pub fn export_config_zip(dir: &Path, dest: &Path) -> Result<(), String> {
    let tmp = tmp_path(dest);
    let write = || -> Result<(), String> {
        let file =
            fs::File::create(&tmp).map_err(|e| format!("내보낼 파일을 만들지 못했습니다: {e}"))?;
        let mut zip = zip::ZipWriter::new(file);
        for name in CONFIG_FILES {
            let path = dir.join(name);
            if !path.is_file() {
                continue;
            }
            let bytes = fs::read(&path).map_err(|e| format!("{name}을 읽지 못했습니다: {e}"))?;
            zip.start_file(name, zip::write::SimpleFileOptions::default())
                .and_then(|_| zip.write_all(&bytes).map_err(Into::into))
                .map_err(|e| format!("{name}을 담지 못했습니다: {e}"))?;
        }
        zip.finish()
            .map_err(|e| format!("내보낼 파일을 마무리하지 못했습니다: {e}"))?;
        fs::rename(&tmp, dest).map_err(|e| format!("내보낼 파일을 저장하지 못했습니다: {e}"))
    };
    let result = write();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

/// zip 파일 `src`에서 설정을 가져와 설정 폴더 `dir`의 파일을 바꾼다. 지금 있던 파일은 `.bak`으로 남긴다.
/// zip 맨 위의 `config.toml`·`keybindings.toml`만 읽고 다른 항목(하위 폴더·`../` 경로 포함)은 무시한다.
/// 둘 다 없거나, TOML 문법 오류가 있으면 아무 파일도 바꾸지 않고 오류를 돌려준다.
/// 가져온 결과는 zip의 내용과 같아진다: zip에 없는 설정 파일은 `.bak`으로만 남는다.
pub fn import_config_zip(src: &Path, dir: &Path) -> Result<(), String> {
    let file = fs::File::open(src).map_err(|e| format!("가져올 파일을 열지 못했습니다: {e}"))?;
    let mut zip = zip::ZipArchive::new(file)
        .map_err(|_| "Twin Deck 설정 내보내기 파일(zip)이 아닙니다".to_string())?;
    let mut found: [Option<String>; 2] = [None, None];
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let Some(slot) = CONFIG_FILES.iter().position(|n| entry.name() == *n) else {
            continue;
        };
        let name = CONFIG_FILES[slot];
        let mut text = String::new();
        entry
            .by_ref()
            .take(MAX_FILE_BYTES + 1)
            .read_to_string(&mut text)
            .map_err(|_| format!("{name}을 읽지 못했습니다(UTF-8 텍스트가 아닙니다)"))?;
        if text.len() as u64 > MAX_FILE_BYTES {
            return Err(format!("{name}이 너무 큽니다"));
        }
        if text.parse::<toml::Table>().is_err() {
            return Err(format!("{name}에 문법 오류가 있어 가져오지 않았습니다"));
        }
        found[slot] = Some(text);
    }
    if found.iter().all(Option::is_none) {
        return Err("zip에 config.toml이나 keybindings.toml이 없습니다".into());
    }
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    for (name, text) in CONFIG_FILES.iter().zip(found) {
        let path = dir.join(name);
        if path.is_file() {
            fs::rename(&path, dir.join(format!("{name}.bak")))
                .map_err(|e| format!("{name}을 백업하지 못했습니다: {e}"))?;
        }
        if let Some(text) = text {
            let tmp = tmp_path(&path);
            fs::write(&tmp, text)
                .and_then(|_| fs::rename(&tmp, &path))
                .map_err(|e| format!("{name}을 쓰지 못했습니다: {e}"))?;
        }
    }
    Ok(())
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

    /// 테스트용 zip을 만든다.
    fn make_zip(path: &Path, entries: &[(&str, &[u8])]) {
        let mut zip = zip::ZipWriter::new(fs::File::create(path).unwrap());
        for (name, bytes) in entries {
            zip.start_file(*name, zip::write::SimpleFileOptions::default())
                .unwrap();
            zip.write_all(bytes).unwrap();
        }
        zip.finish().unwrap();
    }

    fn zip_names(path: &Path) -> Vec<String> {
        let zip = zip::ZipArchive::new(fs::File::open(path).unwrap()).unwrap();
        zip.file_names().map(str::to_string).collect()
    }

    #[test]
    fn export_then_import_round_trips_bytes() {
        let a = tempfile::tempdir().unwrap();
        let b = tempfile::tempdir().unwrap();
        let config = "# 주석 유지\n[behavior]\ntheme = \"dark\"\n";
        let keys = "[[bindings]]\naction = \"core.copy\"\nkeys = [\"F5\"]\n";
        write(a.path(), "config.toml", config);
        write(a.path(), "keybindings.toml", keys);
        write(a.path(), "state.json", "{}");
        let zip = a.path().join("twin-deck-settings.zip");
        export_config_zip(a.path(), &zip).unwrap();
        let mut names = zip_names(&zip);
        names.sort();
        assert_eq!(names, ["config.toml", "keybindings.toml"]);
        import_config_zip(&zip, b.path()).unwrap();
        assert_eq!(read(b.path(), "config.toml"), config);
        assert_eq!(read(b.path(), "keybindings.toml"), keys);
        assert!(!b.path().join("state.json").exists());
    }

    #[test]
    fn export_skips_missing_files() {
        let a = tempfile::tempdir().unwrap();
        write(a.path(), "config.toml", "[behavior]\ntheme = \"dark\"\n");
        let zip = a.path().join("out.zip");
        export_config_zip(a.path(), &zip).unwrap();
        assert_eq!(zip_names(&zip), ["config.toml"]);
        assert!(!a.path().join("out.zip.tmp").exists());

        let empty = tempfile::tempdir().unwrap();
        let zip2 = empty.path().join("empty.zip");
        export_config_zip(empty.path(), &zip2).unwrap();
        assert!(zip_names(&zip2).is_empty());
    }

    #[test]
    fn export_overwrites_existing_destination() {
        let a = tempfile::tempdir().unwrap();
        write(a.path(), "config.toml", "x = 1\n");
        let zip = a.path().join("out.zip");
        fs::write(&zip, "old").unwrap();
        export_config_zip(a.path(), &zip).unwrap();
        assert_eq!(zip_names(&zip), ["config.toml"]);
    }

    #[test]
    fn import_backs_up_existing_files() {
        let dir = tempfile::tempdir().unwrap();
        let src = tempfile::tempdir().unwrap();
        write(dir.path(), "config.toml", "[behavior]\ntheme = \"light\"\n");
        write(dir.path(), "keybindings.toml", "# 옛 키\n");
        let zip = src.path().join("s.zip");
        make_zip(&zip, &[("config.toml", b"[behavior]\ntheme = \"dark\"\n")]);
        import_config_zip(&zip, dir.path()).unwrap();
        assert_eq!(
            read(dir.path(), "config.toml"),
            "[behavior]\ntheme = \"dark\"\n"
        );
        assert_eq!(
            read(dir.path(), "config.toml.bak"),
            "[behavior]\ntheme = \"light\"\n"
        );
        // zip에 없는 파일은 백업만 남는다(가져온 결과 = zip 내용).
        assert!(!dir.path().join("keybindings.toml").exists());
        assert_eq!(read(dir.path(), "keybindings.toml.bak"), "# 옛 키\n");
    }

    #[test]
    fn import_rejects_syntax_error_without_touching_files() {
        let dir = tempfile::tempdir().unwrap();
        let src = tempfile::tempdir().unwrap();
        write(dir.path(), "config.toml", "x = 1\n");
        let zip = src.path().join("s.zip");
        make_zip(
            &zip,
            &[
                ("config.toml", b"[behavior\n"),
                ("keybindings.toml", b"# ok\n"),
            ],
        );
        let err = import_config_zip(&zip, dir.path()).unwrap_err();
        assert!(err.contains("문법 오류"), "{err}");
        assert_eq!(read(dir.path(), "config.toml"), "x = 1\n");
        assert!(!dir.path().join("config.toml.bak").exists());
        assert!(!dir.path().join("keybindings.toml").exists());
    }

    #[test]
    fn import_rejects_zip_without_config_files() {
        let dir = tempfile::tempdir().unwrap();
        let src = tempfile::tempdir().unwrap();
        write(dir.path(), "config.toml", "x = 1\n");
        let zip = src.path().join("s.zip");
        make_zip(&zip, &[("readme.txt", b"hi")]);
        let err = import_config_zip(&zip, dir.path()).unwrap_err();
        assert!(err.contains("config.toml"), "{err}");
        assert_eq!(read(dir.path(), "config.toml"), "x = 1\n");
    }

    #[test]
    fn import_rejects_non_zip() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("not.zip");
        fs::write(&src, "plain text").unwrap();
        assert!(import_config_zip(&src, dir.path()).is_err());
    }

    #[test]
    fn import_ignores_nested_and_parent_paths() {
        let root = tempfile::tempdir().unwrap();
        let dir = root.path().join("cfg");
        fs::create_dir(&dir).unwrap();
        let zip = root.path().join("s.zip");
        make_zip(
            &zip,
            &[
                ("../config.toml", b"evil = true\n"),
                ("sub/config.toml", b"evil = true\n"),
                ("keybindings.toml", "# 키\n".as_bytes()),
            ],
        );
        import_config_zip(&zip, &dir).unwrap();
        assert!(!root.path().join("config.toml").exists());
        assert!(!dir.join("config.toml").exists());
        assert!(!dir.join("sub").exists());
        assert_eq!(read(&dir, "keybindings.toml"), "# 키\n");
    }
}
