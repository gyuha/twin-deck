/// 아카이브 형식. ZIP 계열만 쓸 수 있고 나머지는 읽기 전용이다.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Zip,
    Tar,
    TarGz,
    TarBz2,
}

impl Kind {
    pub fn writable(self) -> bool {
        self == Kind::Zip
    }

    pub fn name(self) -> &'static str {
        match self {
            Kind::Zip => "zip",
            Kind::Tar => "tar",
            Kind::TarGz => "tar.gz",
            Kind::TarBz2 => "tar.bz2",
        }
    }
}

/// 기본으로 ZIP 계열로 여기는 확장자. `packages/ts-client/src/archive.ts`와 같아야 한다(테스트가 확인한다).
pub const ZIP_EXTS: [&str; 8] = [
    "zip",
    "jar",
    "war",
    "aar",
    "apk",
    "nupkg",
    "klib",
    "sublime-package",
];

/// 파일 이름으로 아카이브 형식을 판별한다. `extra_zip_exts`는 설정 `file_systems.zip.additional_extensions`
/// (점 없이, 대소문자 무시). 아카이브가 아니면 None.
pub fn kind_for_name(name: &str, extra_zip_exts: &[String]) -> Option<Kind> {
    let lower = name.to_lowercase();
    for (suffix, kind) in [
        (".tar.gz", Kind::TarGz),
        (".tgz", Kind::TarGz),
        (".tar.bz2", Kind::TarBz2),
        (".tbz2", Kind::TarBz2),
        (".tbz", Kind::TarBz2),
        (".tar", Kind::Tar),
    ] {
        if lower.len() > suffix.len() && lower.ends_with(suffix) {
            return Some(kind);
        }
    }
    let ext = lower.rsplit_once('.')?.1;
    if lower.len() > ext.len() + 1
        && (ZIP_EXTS.contains(&ext)
            || extra_zip_exts
                .iter()
                .any(|e| e.trim_start_matches('.').eq_ignore_ascii_case(ext)))
    {
        return Some(Kind::Zip);
    }
    None
}

/// 파일 앞부분(매직 바이트)으로 형식을 판별한다. "Open As"처럼 확장자를 믿을 수 없을 때 쓴다.
pub fn sniff_kind(path: &std::path::Path) -> std::io::Result<Option<Kind>> {
    use std::io::Read;
    let mut head = Vec::with_capacity(512);
    std::fs::File::open(path)?
        .take(512)
        .read_to_end(&mut head)?;
    Ok(
        if head.starts_with(b"PK\x03\x04") || head.starts_with(b"PK\x05\x06") {
            Some(Kind::Zip)
        } else if head.starts_with(&[0x1f, 0x8b]) {
            Some(Kind::TarGz)
        } else if head.starts_with(b"BZh") {
            Some(Kind::TarBz2)
        } else if head.get(257..262) == Some(b"ustar") {
            Some(Kind::Tar)
        } else {
            None
        },
    )
}
