//! 즐겨찾기는 PC 종속 정보라 동기화 폴더가 아니라 로컬 `favorites.toml`에 둔다(이슈 #106).

use std::fs;
use std::path::Path;
use std::time::Duration;

use td_config::{
    append_favorite_in, change_config_location, load_dir_with_local, remove_favorite_in,
    ConfigStore, LocationConflict, Platform,
};

fn write(dir: &Path, name: &str, text: &str) {
    fs::write(dir.join(name), text).unwrap();
}

fn read(dir: &Path, name: &str) -> String {
    fs::read_to_string(dir.join(name)).unwrap()
}

/// 목록의 이름만 뽑는다(그룹은 이름 하나로).
fn names(l: &td_config::Loaded) -> Vec<String> {
    l.config
        .favorites
        .iter()
        .map(|f| f.name.clone().unwrap_or_else(|| f.kind.clone()))
        .collect()
}

fn fav(name: &str, path: &str) -> String {
    format!("[[favorites]]\nname = \"{name}\"\npath = \"{path}\"\n")
}

#[test]
fn favorites_local_reads_the_local_file_not_the_synced_config() {
    let cfg = tempfile::tempdir().unwrap();
    let local = tempfile::tempdir().unwrap();
    write(local.path(), "favorites.toml", &fav("집", "/home/a"));
    let l = load_dir_with_local(cfg.path(), local.path(), Platform::Linux);
    assert_eq!(names(&l), ["집"]);
}

#[test]
fn favorites_local_file_wins_over_favorites_in_config() {
    let cfg = tempfile::tempdir().unwrap();
    let local = tempfile::tempdir().unwrap();
    write(cfg.path(), "config.toml", &fav("다른 PC", "/Users/x"));
    write(local.path(), "favorites.toml", &fav("집", "/home/a"));
    let l = load_dir_with_local(cfg.path(), local.path(), Platform::Linux);
    assert_eq!(names(&l), ["집"]);
}

#[test]
fn favorites_local_without_the_file_falls_back_to_config_until_migrated() {
    let cfg = tempfile::tempdir().unwrap();
    let local = tempfile::tempdir().unwrap();
    write(cfg.path(), "config.toml", &fav("옛", "/home/old"));
    let l = load_dir_with_local(cfg.path(), local.path(), Platform::Linux);
    assert_eq!(names(&l), ["옛"]);
    // 읽기만으로는 파일을 만들지 않는다.
    assert!(!local.path().join("favorites.toml").exists());
}

#[test]
fn favorites_local_start_copies_config_favorites_once_and_leaves_config_alone() {
    let cfg = tempfile::tempdir().unwrap();
    let local = tempfile::tempdir().unwrap();
    let original = format!(
        "[behavior.table]\nicon_size = 18\n\n{}",
        fav("옛", "/home/old")
    );
    write(cfg.path(), "config.toml", &original);
    let (store, _rx) =
        ConfigStore::start_with_local(cfg.path(), local.path(), Platform::Linux).unwrap();
    assert!(read(local.path(), "favorites.toml").contains("/home/old"));
    assert_eq!(
        read(cfg.path(), "config.toml"),
        original,
        "config.toml은 건드리지 않는다"
    );
    // 복사한 뒤에는 동기화된 config.toml의 즐겨찾기가 바뀌어도 따라가지 않는다.
    write(cfg.path(), "config.toml", &fav("다른 PC", "/Users/x"));
    assert_eq!(names(&store.refresh()), ["옛"]);
}

#[test]
fn favorites_local_start_without_any_favorites_creates_no_file() {
    let cfg = tempfile::tempdir().unwrap();
    let local = tempfile::tempdir().unwrap();
    write(
        cfg.path(),
        "config.toml",
        "[behavior.table]\nicon_size = 18\n",
    );
    let _s = ConfigStore::start_with_local(cfg.path(), local.path(), Platform::Linux).unwrap();
    assert!(!local.path().join("favorites.toml").exists());
}

#[test]
fn favorites_local_watch_picks_up_edits_to_the_local_file() {
    let cfg = tempfile::tempdir().unwrap();
    let local = tempfile::tempdir().unwrap();
    let (_store, rx) =
        ConfigStore::start_with_local(cfg.path(), local.path(), Platform::Linux).unwrap();
    while rx.recv_timeout(Duration::from_millis(500)).is_ok() {}
    write(local.path(), "favorites.toml", &fav("새", "/home/new"));
    let end = std::time::Instant::now() + Duration::from_secs(10);
    let mut seen = false;
    while std::time::Instant::now() < end {
        if let Ok(l) = rx.recv_timeout(Duration::from_millis(500)) {
            if names(&l) == ["새"] {
                seen = true;
                break;
            }
        }
    }
    assert!(seen, "로컬 favorites.toml 변경이 반영돼야 한다");
}

#[test]
fn favorites_local_syntax_error_warns_for_that_file_and_keeps_previous_list() {
    let cfg = tempfile::tempdir().unwrap();
    let local = tempfile::tempdir().unwrap();
    write(local.path(), "favorites.toml", &fav("집", "/home/a"));
    let (store, _rx) =
        ConfigStore::start_with_local(cfg.path(), local.path(), Platform::Linux).unwrap();
    write(local.path(), "favorites.toml", "[[favorites\n");
    let l = store.refresh();
    assert_eq!(names(&l), ["집"], "문법 오류면 이전 유효 목록을 유지한다");
    assert!(l.warnings.iter().any(|w| w.file == "favorites.toml"));
}

#[test]
fn favorites_local_append_writes_only_the_local_file() {
    let cfg = tempfile::tempdir().unwrap();
    let local = tempfile::tempdir().unwrap();
    write(
        cfg.path(),
        "config.toml",
        "# 공유 설정\n[behavior.table]\nicon_size = 18\n",
    );
    let before = read(cfg.path(), "config.toml");
    append_favorite_in(cfg.path(), local.path(), "집", "/home/a").unwrap();
    assert_eq!(read(cfg.path(), "config.toml"), before);
    assert!(read(local.path(), "favorites.toml").contains("/home/a"));
    let l = load_dir_with_local(cfg.path(), local.path(), Platform::Linux);
    assert_eq!(names(&l), ["집"]);
}

#[test]
fn favorites_local_append_keeps_legacy_favorites_from_config() {
    let cfg = tempfile::tempdir().unwrap();
    let local = tempfile::tempdir().unwrap();
    write(cfg.path(), "config.toml", &fav("옛", "/home/old"));
    append_favorite_in(cfg.path(), local.path(), "새", "/home/new").unwrap();
    let l = load_dir_with_local(cfg.path(), local.path(), Platform::Linux);
    assert_eq!(names(&l), ["옛", "새"]);
}

#[test]
fn favorites_local_remove_edits_only_the_local_file_including_group_items() {
    let cfg = tempfile::tempdir().unwrap();
    let local = tempfile::tempdir().unwrap();
    write(cfg.path(), "config.toml", "# 공유\n");
    write(
        local.path(),
        "favorites.toml",
        "[[favorites]]\nname = \"집\"\npath = \"/home/a\"\n\n[[favorites]]\ntype = \"group\"\nname = \"일\"\nitems = [\n  { name = \"P\", path = \"/work/p\" },\n  { name = \"Q\", path = \"/work/q\" },\n]\n",
    );
    remove_favorite_in(cfg.path(), local.path(), "/work/p").unwrap();
    remove_favorite_in(cfg.path(), local.path(), "/home/a").unwrap();
    assert_eq!(read(cfg.path(), "config.toml"), "# 공유\n");
    let text = read(local.path(), "favorites.toml");
    assert!(!text.contains("/work/p") && !text.contains("/home/a") && text.contains("/work/q"));
}

#[test]
fn favorites_local_remove_from_legacy_config_migrates_first() {
    let cfg = tempfile::tempdir().unwrap();
    let local = tempfile::tempdir().unwrap();
    let both = format!("{}\n{}", fav("A", "/a"), fav("B", "/b"));
    write(cfg.path(), "config.toml", &both);
    remove_favorite_in(cfg.path(), local.path(), "/a").unwrap();
    assert_eq!(
        read(cfg.path(), "config.toml"),
        both,
        "config.toml은 그대로"
    );
    let l = load_dir_with_local(cfg.path(), local.path(), Platform::Linux);
    assert_eq!(names(&l), ["B"]);
}

#[test]
fn favorites_local_not_synced_by_changing_the_config_location() {
    let local = tempfile::tempdir().unwrap();
    let cloud = tempfile::tempdir().unwrap();
    write(local.path(), "config.toml", "# 설정\n");
    write(local.path(), "keybindings.toml", "# 키\n");
    write(local.path(), "favorites.toml", &fav("집", "/home/a"));
    write(local.path(), "state.json", "{\"recent\":[\"/home/a\"]}");
    change_config_location(
        local.path(),
        local.path(),
        Some(cloud.path()),
        LocationConflict::UseExisting,
    )
    .unwrap();
    assert!(cloud.path().join("config.toml").exists());
    for name in ["favorites.toml", "state.json"] {
        assert!(
            !cloud.path().join(name).exists(),
            "{name}은 동기화 폴더로 가지 않는다"
        );
        assert!(local.path().join(name).exists(), "{name}은 로컬에 남는다");
    }
    // 기본 위치로 되돌려도 마찬가지다.
    change_config_location(
        local.path(),
        cloud.path(),
        None,
        LocationConflict::Overwrite,
    )
    .unwrap();
    assert!(local.path().join("favorites.toml").exists());
}
