//! 간단 조건(종류) 판별. 확장자와 권한 비트만 본다(내용을 열지 않는다).

use td_archive::{kind_for_name, Kind};
use td_vfs::{Entry, EntryKind};

/// 질의에서 쓸 수 있는 종류 이름.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SimpleKind {
    Folder,
    File,
    Archive,
    DiskImage,
    Text,
    Rtf,
    Html,
    Xml,
    SourceCode,
    Image,
    Video,
    Audio,
    Executable,
    Zip,
}

/// 종류 이름(질의 문자열)의 해석 결과.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum KindName {
    Supported(SimpleKind),
    /// 이 백엔드(라이브 순회)가 판별할 수 없는 종류(Application, Bundle).
    Unsupported(String),
}

/// `Image`, `Disk Image`, `source code` 등을 해석한다(대소문자, 공백, `-`/`_` 무시). 모르는 이름이면 None.
pub fn kind_from_name(text: &str) -> Option<KindName> {
    let key: String = text
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-' && *c != '_')
        .flat_map(char::to_lowercase)
        .collect();
    use SimpleKind::*;
    let k = match key.as_str() {
        "folder" => Folder,
        "file" => File,
        "archive" => Archive,
        "diskimage" => DiskImage,
        "text" => Text,
        "rtf" => Rtf,
        "html" => Html,
        "xml" => Xml,
        "sourcecode" => SourceCode,
        "image" => Image,
        "video" => Video,
        "audio" => Audio,
        "executable" => Executable,
        "zip" => Zip,
        "application" => return Some(KindName::Unsupported("Application".into())),
        "bundle" => return Some(KindName::Unsupported("Bundle".into())),
        _ => return None,
    };
    Some(KindName::Supported(k))
}

const OTHER_ARCHIVES: &[&str] = &[
    "rar", "7z", "xz", "gz", "bz2", "zst", "cab", "lzh", "lha", "cpio", "rpm", "deb", "ar", "xar",
];
const DISK_IMAGES: &[&str] = &["dmg", "iso", "img", "vhd", "vhdx", "vmdk", "cdr"];
const TEXT: &[&str] = &[
    "txt", "md", "markdown", "log", "csv", "tsv", "ini", "cfg", "conf", "toml", "yaml", "yml",
    "json", "rst", "tex", "text",
];
const HTML: &[&str] = &["html", "htm", "xhtml"];
const XML: &[&str] = &["xml", "xsd", "xsl", "xslt", "plist", "rss", "atom"];
const SOURCE: &[&str] = &[
    "rs", "c", "h", "cc", "cpp", "cxx", "hpp", "cs", "java", "kt", "swift", "go", "py", "rb", "js",
    "mjs", "cjs", "ts", "tsx", "jsx", "php", "sh", "bash", "zsh", "pl", "lua", "r", "scala", "sql",
    "m", "mm", "css", "scss", "vue", "svelte", "dart", "ex", "exs", "hs",
];
const IMAGE: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "bmp", "tiff", "tif", "webp", "heic", "heif", "svg", "ico", "avif",
];
const VIDEO: &[&str] = &[
    "mp4", "mov", "mkv", "avi", "wmv", "flv", "webm", "m4v", "mpg", "mpeg",
];
const AUDIO: &[&str] = &[
    "mp3", "wav", "flac", "aac", "m4a", "ogg", "opus", "wma", "aiff",
];
const WIN_EXEC: &[&str] = &["exe", "bat", "cmd", "com", "msi"];

fn ext(name: &str) -> Option<String> {
    let (stem, ext) = name.rsplit_once('.')?;
    (!stem.is_empty()).then(|| ext.to_lowercase())
}

fn in_list(name: &str, list: &[&str]) -> bool {
    ext(name).is_some_and(|e| list.contains(&e.as_str()))
}

pub fn matches(kind: SimpleKind, entry: &Entry, extra_zip_exts: &[String]) -> bool {
    use SimpleKind::*;
    let is_file = entry.kind != EntryKind::Dir;
    let name = entry.name.as_str();
    match kind {
        Folder => entry.kind == EntryKind::Dir,
        File => is_file,
        _ if !is_file => false,
        Archive => kind_for_name(name, extra_zip_exts).is_some() || in_list(name, OTHER_ARCHIVES),
        Zip => kind_for_name(name, extra_zip_exts) == Some(Kind::Zip),
        DiskImage => in_list(name, DISK_IMAGES),
        Text => in_list(name, TEXT),
        Rtf => in_list(name, &["rtf", "rtfd"]),
        Html => in_list(name, HTML),
        Xml => in_list(name, XML),
        SourceCode => in_list(name, SOURCE),
        Image => in_list(name, IMAGE),
        Video => in_list(name, VIDEO),
        Audio => in_list(name, AUDIO),
        Executable => {
            entry.kind == EntryKind::File
                && (entry.mode.is_some_and(|m| m & 0o111 != 0) || in_list(name, WIN_EXEC))
        }
    }
}
