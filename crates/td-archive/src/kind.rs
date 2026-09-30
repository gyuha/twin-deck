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

const ZIP_EXTS: [&str; 8] = [
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
