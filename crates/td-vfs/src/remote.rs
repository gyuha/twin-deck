//! 원격 서버 안 위치의 경로 표기(ADR-0019): `sftp://<연결 id>/절대/경로`, `ftp://<연결 id>/절대/경로`.
//! 연결 id는 `/`를 담지 않는 문자열이다. 경로가 비면 루트(`/`)다.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RemoteProto {
    Ftp,
    Sftp,
}

impl RemoteProto {
    pub fn scheme(self) -> &'static str {
        match self {
            RemoteProto::Ftp => "ftp",
            RemoteProto::Sftp => "sftp",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemoteLoc {
    pub proto: RemoteProto,
    pub id: String,
    /// 서버 쪽 절대 경로. 항상 `/`로 시작한다.
    pub path: String,
}

/// `sftp://id/a/b` → 분해. 원격 경로가 아니거나 id가 비면 `None`.
pub fn split_remote(s: &str) -> Option<RemoteLoc> {
    let (proto, rest) = if let Some(r) = s.strip_prefix("sftp://") {
        (RemoteProto::Sftp, r)
    } else if let Some(r) = s.strip_prefix("ftp://") {
        (RemoteProto::Ftp, r)
    } else {
        return None;
    };
    let (id, path) = match rest.find('/') {
        Some(i) => (&rest[..i], &rest[i..]),
        None => (rest, "/"),
    };
    if id.is_empty() {
        return None;
    }
    let mut path = path.to_string();
    while path.len() > 1 && path.ends_with('/') {
        path.pop();
    }
    Some(RemoteLoc {
        proto,
        id: id.to_string(),
        path,
    })
}

pub fn is_remote(s: &str) -> bool {
    split_remote(s).is_some()
}

/// 분해의 역. `path`가 `/`로 시작하지 않으면 붙인다.
pub fn remote_url(proto: RemoteProto, id: &str, path: &str) -> String {
    let sep = if path.starts_with('/') { "" } else { "/" };
    format!("{}://{id}{sep}{path}", proto.scheme())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 원격_경로를_분해한다() {
        let l = split_remote("sftp://nas/home/me/a b.txt").unwrap();
        assert_eq!(
            (l.proto, l.id.as_str(), l.path.as_str()),
            (RemoteProto::Sftp, "nas", "/home/me/a b.txt")
        );
        let l = split_remote("ftp://서버/").unwrap();
        assert_eq!(
            (l.proto, l.id.as_str(), l.path.as_str()),
            (RemoteProto::Ftp, "서버", "/")
        );
    }

    #[test]
    fn 원격_루트는_경로가_비어도_슬래시다() {
        assert_eq!(split_remote("sftp://nas").unwrap().path, "/");
        assert_eq!(split_remote("sftp://nas/a/").unwrap().path, "/a");
    }

    #[test]
    fn 원격이_아닌_경로는_분해하지_않는다() {
        assert_eq!(split_remote("/home/me"), None);
        assert_eq!(split_remote("C:\\a"), None);
        assert_eq!(split_remote("sftp:///x"), None);
        assert_eq!(split_remote("http://x/y"), None);
        assert!(!is_remote("/tmp/sftp://x"));
    }

    #[test]
    fn 원격_경로를_다시_만든다() {
        assert_eq!(
            remote_url(RemoteProto::Sftp, "nas", "/a/b"),
            "sftp://nas/a/b"
        );
        assert_eq!(remote_url(RemoteProto::Ftp, "nas", "a"), "ftp://nas/a");
    }

    #[test]
    fn 원격_경로는_슬래시로_잇고_루트가_끝이다() {
        use crate::VfsPath;
        let root = VfsPath::new("sftp://nas/");
        assert_eq!(root.join("a").to_string(), "sftp://nas/a");
        assert_eq!(
            VfsPath::new("sftp://nas").join("a").to_string(),
            "sftp://nas/a"
        );
        assert_eq!(
            VfsPath::new("ftp://nas/a/b").parent().unwrap().to_string(),
            "ftp://nas/a"
        );
        assert_eq!(
            VfsPath::new("ftp://nas/a").parent().unwrap().to_string(),
            "ftp://nas/"
        );
        assert_eq!(root.parent(), None);
        assert_eq!(
            VfsPath::new("sftp://nas/한글 폴더/x").file_name().unwrap(),
            "x"
        );
    }
}
