//! 원격 경로 `td://별칭/원격경로` (ADR-0018). 별칭 뒤는 원격 PC의 경로 그대로이고, 아카이브 `!/`도 원격이 해석한다.

pub const SCHEME: &str = "td://";

/// 원격 경로면 (별칭, 원격 PC의 경로)를 돌려준다. `td://별칭`과 `td://별칭/`은 원격 루트(`/`)다.
/// Windows 원격은 `td://win/C:/Users` → `C:/Users`.
pub fn split_remote_path(path: &str) -> Option<(&str, String)> {
    let rest = path.strip_prefix(SCHEME)?;
    let (alias, inner) = rest.split_once('/').unwrap_or((rest, ""));
    if alias.is_empty() {
        return None;
    }
    let inner = if is_drive(inner) {
        inner.to_string()
    } else {
        format!("/{inner}")
    };
    Some((alias, inner))
}

/// 원격 PC의 경로를 이쪽에서 쓰는 원격 경로로 바꾼다. Windows 경로의 `\`는 `/`로 바꾼다.
pub fn to_remote_path(alias: &str, inner: &str) -> String {
    let inner = inner.replace('\\', "/");
    let inner = inner.trim_start_matches('/');
    format!("{SCHEME}{alias}/{inner}")
}

fn is_drive(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() >= 2 && b[0].is_ascii_alphabetic() && b[1] == b':'
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 별칭과_원격_경로로_나눈다() {
        assert_eq!(
            split_remote_path("td://office/Users/me"),
            Some(("office", "/Users/me".into()))
        );
        assert_eq!(
            split_remote_path("td://office/"),
            Some(("office", "/".into()))
        );
        assert_eq!(
            split_remote_path("td://office"),
            Some(("office", "/".into()))
        );
        assert_eq!(
            split_remote_path("td://office/a/x.zip!/d"),
            Some(("office", "/a/x.zip!/d".into()))
        );
        assert_eq!(
            split_remote_path("td://win/C:/Users"),
            Some(("win", "C:/Users".into()))
        );
    }

    #[test]
    fn 원격_경로가_아니면_none() {
        assert_eq!(split_remote_path("/Users/me"), None);
        assert_eq!(split_remote_path("td://"), None);
        assert_eq!(split_remote_path("td:///x"), None);
    }

    #[test]
    fn 원격_pc_경로를_원격_경로로_되돌린다() {
        assert_eq!(
            to_remote_path("office", "/Users/me/a.txt"),
            "td://office/Users/me/a.txt"
        );
        assert_eq!(to_remote_path("office", "/"), "td://office/");
        assert_eq!(
            to_remote_path("win", "C:\\Users\\a.txt"),
            "td://win/C:/Users/a.txt"
        );
        for p in [
            "td://office/Users/me",
            "td://win/C:/Users",
            "td://office/a/x.zip!/d",
        ] {
            let (alias, inner) = split_remote_path(p).unwrap();
            assert_eq!(to_remote_path(alias, &inner), p);
        }
    }
}
