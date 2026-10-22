//! 즐겨찾기 저장 위치. 경로는 PC마다 다르므로 동기화 폴더의 `config.toml`이 아니라 항상 로컬 폴더의 `favorites.toml`에 둔다(이슈 #106).

use std::fs;
use std::path::Path;

/// 로컬 설정 폴더의 즐겨찾기 파일 이름. 형식은 예전 `config.toml`의 `[[favorites]]`와 같다.
pub const FAVORITES_FILE: &str = "favorites.toml";

/// `local`에 즐겨찾기 파일이 없고 `config_dir/config.toml`에 `favorites`가 있으면, 그 항목을 `local/favorites.toml`로 복사한다.
/// `config.toml`은 건드리지 않는다(다른 PC가 아직 옛 버전일 수 있다). 파일이 생긴 뒤에는 `config.toml`의 `[[favorites]]`를 무시한다.
/// 옮길 것이 없거나(즐겨찾기 없음·설정 파일 없음·문법 오류) 이미 파일이 있으면 아무것도 하지 않는다.
pub fn migrate(config_dir: &Path, local: &Path) -> Result<(), String> {
    let target = local.join(FAVORITES_FILE);
    if target.exists() {
        return Ok(());
    }
    let Ok(text) = fs::read_to_string(config_dir.join("config.toml")) else {
        return Ok(());
    };
    let Ok(doc) = text.parse::<toml_edit::DocumentMut>() else {
        return Ok(());
    };
    let Some(item) = doc.get("favorites") else {
        return Ok(());
    };
    let mut out = toml_edit::DocumentMut::new();
    out.insert("favorites", item.clone());
    fs::create_dir_all(local).map_err(|e| e.to_string())?;
    let tmp = local.join(format!("{FAVORITES_FILE}.tmp"));
    fs::write(&tmp, out.to_string()).map_err(|e| e.to_string())?;
    fs::rename(&tmp, target).map_err(|e| e.to_string())
}
