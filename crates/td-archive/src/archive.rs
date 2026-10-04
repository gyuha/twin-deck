use std::collections::BTreeMap;
use std::fs::{self, File};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use unicode_normalization::UnicodeNormalization;

use crate::error::{ArchiveError, Result};
use crate::kind::{kind_for_name, Kind};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EntryInfo {
    /// 아카이브 안 전체 경로(구분자 `/`, 앞뒤 `/` 없음).
    pub name: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    /// 압축을 푼 크기.
    pub size: u64,
    pub modified: Option<SystemTime>,
    pub mode: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct ExtractReport {
    pub files: usize,
    pub dirs: usize,
}

/// 열린 아카이브. 항목 목록은 열 때 한 번 읽어 둔다.
pub struct Archive {
    kind: Kind,
    file: File,
    entries: Vec<EntryInfo>,
    /// ZIP에서 `entries[i]`가 몇 번째 항목인지(빈 이름을 건너뛰므로 인덱스가 다를 수 있다).
    zip_index: Vec<usize>,
}

/// 숫자 덩어리는 크기로, 나머지는 소문자 글자로 비교하는 자연 정렬.
fn natural_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    use std::cmp::Ordering;
    let (a, b) = (a.to_lowercase(), b.to_lowercase());
    let (mut x, mut y) = (a.chars().peekable(), b.chars().peekable());
    loop {
        match (x.peek().copied(), y.peek().copied()) {
            (None, None) => return Ordering::Equal,
            (None, _) => return Ordering::Less,
            (_, None) => return Ordering::Greater,
            (Some(c), Some(d)) if c.is_ascii_digit() && d.is_ascii_digit() => {
                let num = |it: &mut std::iter::Peekable<std::str::Chars>| {
                    let mut s = String::new();
                    while let Some(&ch) = it.peek() {
                        if !ch.is_ascii_digit() {
                            break;
                        }
                        s.push(ch);
                        it.next();
                    }
                    s.trim_start_matches('0').to_string()
                };
                let (p, q) = (num(&mut x), num(&mut y));
                let ord = p.len().cmp(&q.len()).then_with(|| p.cmp(&q));
                if ord != Ordering::Equal {
                    return ord;
                }
            }
            (Some(c), Some(d)) => {
                if c != d {
                    return c.cmp(&d);
                }
                x.next();
                y.next();
            }
        }
    }
}

fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn zip_time(t: Option<zip::DateTime>) -> Option<SystemTime> {
    let t = t?;
    let days = days_from_civil(t.year().into(), t.month().into(), t.day().into());
    let secs = days * 86_400
        + i64::from(t.hour()) * 3600
        + i64::from(t.minute()) * 60
        + i64::from(t.second());
    u64::try_from(secs)
        .ok()
        .map(|s| UNIX_EPOCH + Duration::from_secs(s))
}

/// 조회용 정규화. macOS의 `zip`은 한글 이름을 NFD로 저장하므로 NFC/NFD를 구분하지 않고 찾는다.
fn norm(s: &str) -> String {
    s.nfc().collect()
}

/// 저장된 이름을 항목 이름으로 다듬는다: 앞의 `./`와 끝의 `/`(폴더 표시)만 지운다.
/// 앞의 `/`는 **지우지 않는다** — 절대 경로 항목이 상대 경로로 둔갑하면 추출 검사(`safe_relative`)가 놓친다.
fn clean(name: &str) -> String {
    let mut n = name;
    while let Some(rest) = n.strip_prefix("./") {
        n = rest;
    }
    n.trim_end_matches('/').to_string()
}

/// 추출 대상 이름이 안전한 상대 경로인지 검사한다(zip-slip 방어). `\`도 구분자로 보고 `..`를 찾는다.
fn safe_relative(name: &str) -> std::result::Result<PathBuf, &'static str> {
    if name.contains('\0') {
        return Err("널 문자가 든 이름");
    }
    if name.starts_with('/') || name.starts_with('\\') {
        return Err("절대 경로");
    }
    let b = name.as_bytes();
    if b.len() >= 2 && b[0].is_ascii_alphabetic() && b[1] == b':' {
        return Err("드라이브 경로");
    }
    if name.split(['/', '\\']).any(|c| c == "..") {
        return Err("상위 경로(..)를 포함");
    }
    Ok(name
        .split('/')
        .filter(|c| !c.is_empty() && *c != ".")
        .collect())
}

impl Archive {
    /// 파일 이름으로 형식을 판별해 연다. `extra_zip_exts`는 설정의 추가 ZIP 확장자.
    pub fn open(path: &Path, extra_zip_exts: &[String]) -> Result<Self> {
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let kind = kind_for_name(&name, extra_zip_exts)
            .ok_or_else(|| ArchiveError::Unsupported(name.clone()))?;
        Self::open_as(path, kind)
    }

    /// 확장자와 무관하게 지정한 형식으로 연다 ("Open As", ARC-04).
    pub fn open_as(path: &Path, kind: Kind) -> Result<Self> {
        Self::from_file(File::open(path)?, kind)
    }

    pub fn from_file(file: File, kind: Kind) -> Result<Self> {
        let (entries, zip_index) = scan(&file, kind)?;
        Ok(Self {
            kind,
            file,
            entries,
            zip_index,
        })
    }

    pub fn kind(&self) -> Kind {
        self.kind
    }

    /// 저장된 항목들(암묵적 폴더는 없다).
    pub fn entries(&self) -> &[EntryInfo] {
        &self.entries
    }

    fn dir_info(name: &str) -> EntryInfo {
        EntryInfo {
            name: name.to_string(),
            is_dir: true,
            is_symlink: false,
            size: 0,
            modified: None,
            mode: Some(0o755),
        }
    }

    /// `dir`의 바로 아래 항목. 아카이브에 폴더 항목이 따로 없어도 경로에서 폴더를 만들어 낸다.
    pub fn list(&self, dir: &str) -> Vec<EntryInfo> {
        let dir = dir.trim_matches('/');
        let prefix = if dir.is_empty() {
            String::new()
        } else {
            format!("{dir}/")
        };
        let mut out: BTreeMap<String, EntryInfo> = BTreeMap::new();
        for e in &self.entries {
            let Some(rest) = e.name.strip_prefix(&prefix) else {
                continue;
            };
            if rest.is_empty() {
                continue;
            }
            match rest.split_once('/') {
                Some((first, _)) => {
                    let stored = &e.name[..e.name.len() - rest.len() + first.len()];
                    out.entry(norm(first))
                        .or_insert_with(|| Self::dir_info(stored));
                }
                None => {
                    out.insert(norm(rest), e.clone());
                }
            }
        }
        out.into_values().collect()
    }

    pub fn stat(&self, path: &str) -> Option<EntryInfo> {
        let path = norm(path.trim_matches('/'));
        if path.is_empty() {
            return Some(Self::dir_info(""));
        }
        if let Some(e) = self.entries.iter().find(|e| norm(&e.name) == path) {
            return Some(e.clone());
        }
        let dir_prefix = format!("{path}/");
        self.entries
            .iter()
            .any(|e| norm(&e.name).starts_with(&dir_prefix))
            .then(|| Self::dir_info(&path))
    }

    fn rewound(&self) -> Result<File> {
        let mut f = self.file.try_clone()?;
        f.seek(SeekFrom::Start(0))?;
        Ok(f)
    }

    fn tar_reader(&self) -> Result<Box<dyn Read>> {
        let f = self.rewound()?;
        Ok(match self.kind {
            Kind::TarGz => Box::new(flate2::read::GzDecoder::new(f)),
            Kind::TarBz2 => Box::new(bzip2::read::BzDecoder::new(f)),
            _ => Box::new(f),
        })
    }

    /// 파일 하나의 내용을 `out`으로 흘려 보낸다. 쓴 바이트 수를 돌려준다.
    pub fn read_to(&self, path: &str, out: &mut dyn Write) -> Result<u64> {
        let path = norm(path.trim_matches('/'));
        let path = path.as_str();
        match self.kind {
            Kind::Zip => {
                let pos = self
                    .entries
                    .iter()
                    .position(|e| norm(&e.name) == path)
                    .ok_or_else(|| ArchiveError::NotFound(path.to_string()))?;
                if self.entries[pos].is_dir {
                    return Err(ArchiveError::NotFound(format!("{path} (폴더)")));
                }
                let mut z = zip::ZipArchive::new(self.rewound()?)?;
                let mut f = z.by_index(self.zip_index[pos])?;
                Ok(io::copy(&mut f, out)?)
            }
            _ => {
                let mut t = tar::Archive::new(self.tar_reader()?);
                for entry in t.entries()? {
                    let mut entry = entry?;
                    if clean(&entry.path()?.to_string_lossy()) == path
                        && entry.header().entry_type().is_file()
                    {
                        return Ok(io::copy(&mut entry, out)?);
                    }
                }
                Err(ArchiveError::NotFound(path.to_string()))
            }
        }
    }

    /// 파일 전체를 메모리로 읽는다(작은 파일용).
    pub fn read(&self, path: &str) -> Result<Vec<u8>> {
        let mut v = Vec::new();
        self.read_to(path, &mut v)?;
        Ok(v)
    }

    /// 이미지 파일 중 이름이 자연 정렬(`2.jpg` < `10.jpg`, 대소문자 무시)로 가장 앞선 것. cbz 미리보기용.
    /// 폴더, `__MACOSX/`, 점으로 시작하는 파일(`._1.jpg`, `.DS_Store`)은 건너뛴다. 이미지가 없으면 None.
    pub fn first_image(&self) -> Option<&EntryInfo> {
        self.entries
            .iter()
            .filter(|e| {
                let name = e.name.as_str();
                !e.is_dir
                    && !e.is_symlink
                    && !name
                        .split('/')
                        .any(|p| p.starts_with('.') || p == "__MACOSX")
                    && td_vfs::image_mime(name).is_some()
            })
            .min_by(|a, b| natural_cmp(&a.name, &b.name))
    }

    /// 안에 든 아카이브(중첩)를 임시 파일로 꺼내 연다 (ARC-03).
    pub fn open_nested(&self, path: &str, extra_zip_exts: &[String]) -> Result<Archive> {
        let path = path.trim_matches('/');
        let name = path.rsplit('/').next().unwrap_or(path);
        let kind = kind_for_name(name, extra_zip_exts)
            .ok_or_else(|| ArchiveError::Unsupported(name.to_string()))?;
        let mut tmp = tempfile::tempfile()?;
        self.read_to(path, &mut tmp)?;
        tmp.seek(SeekFrom::Start(0))?;
        Archive::from_file(tmp, kind)
    }

    /// 아카이브 전체를 `dest`에 푼다. **먼저 모든 항목을 검사**해서 하나라도 안전하지 않으면(경로 탈출, 절대 경로,
    /// 심볼릭 링크·특수 파일) 아무것도 쓰지 않고 오류를 돌려준다. 이미 있는 파일은 덮어쓰지 않는다.
    pub fn extract_all(&self, dest: &Path) -> Result<ExtractReport> {
        self.extract_all_with(dest, &mut |_| true)
    }

    /// `extract_all`과 같지만 항목마다 `progress(이름)`을 부르고, false를 돌려주면 `Aborted`로 멈춘다.
    /// 파일의 수정 시각과 권한(유닉스, setuid/setgid 제외)을 항목에서 이어받는다.
    pub fn extract_all_with(
        &self,
        dest: &Path,
        progress: &mut dyn FnMut(&str) -> bool,
    ) -> Result<ExtractReport> {
        for e in &self.entries {
            if e.is_symlink {
                return Err(ArchiveError::Unsafe {
                    name: e.name.clone(),
                    reason: "심볼릭 링크 또는 특수 파일",
                });
            }
            safe_relative(&e.name).map_err(|reason| ArchiveError::Unsafe {
                name: e.name.clone(),
                reason,
            })?;
        }
        fs::create_dir_all(dest)?;
        let mut report = ExtractReport::default();
        for e in &self.entries {
            if !progress(&e.name) {
                return Err(ArchiveError::Aborted);
            }
            let target = dest.join(safe_relative(&e.name).expect("위에서 검사함"));
            if e.is_dir {
                fs::create_dir_all(&target)?;
                report.dirs += 1;
                continue;
            }
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }
            let mut f = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&target)
                .map_err(|err| {
                    if err.kind() == io::ErrorKind::AlreadyExists {
                        ArchiveError::Exists(target.display().to_string())
                    } else {
                        err.into()
                    }
                })?;
            self.read_to(&e.name, &mut f)?;
            if let Some(t) = e.modified {
                let _ = f.set_modified(t);
            }
            #[cfg(unix)]
            if let Some(mode) = e.mode {
                use std::os::unix::fs::PermissionsExt;
                let _ = fs::set_permissions(&target, fs::Permissions::from_mode(mode & 0o777));
            }
            report.files += 1;
        }
        Ok(report)
    }
}

/// ZIP 항목 이름. UTF-8 플래그가 없어도 바이트가 유효한 UTF-8이면 UTF-8로 읽는다 —
/// macOS의 `zip`은 한글 이름을 플래그 없이 UTF-8로 저장하고, 그대로 두면 CP437로 해석되어 깨진다.
pub(crate) fn zip_name(raw: &[u8], decoded: &str) -> String {
    std::str::from_utf8(raw)
        .map(str::to_string)
        .unwrap_or_else(|_| decoded.to_string())
}

fn scan(file: &File, kind: Kind) -> Result<(Vec<EntryInfo>, Vec<usize>)> {
    let mut f = file.try_clone()?;
    f.seek(SeekFrom::Start(0))?;
    let mut out = Vec::new();
    let mut zip_index = Vec::new();
    match kind {
        Kind::Zip => {
            let mut z = zip::ZipArchive::new(f)?;
            for i in 0..z.len() {
                let e = z.by_index(i)?;
                let name = clean(&zip_name(e.name_raw(), e.name()));
                if name.is_empty() {
                    continue;
                }
                zip_index.push(i);
                let mode = e.unix_mode();
                out.push(EntryInfo {
                    is_dir: e.is_dir(),
                    is_symlink: e.is_symlink(),
                    size: e.size(),
                    modified: zip_time(e.last_modified()),
                    mode: mode.map(|m| m & 0o7777),
                    name,
                });
            }
        }
        _ => {
            let reader: Box<dyn Read> = match kind {
                Kind::TarGz => Box::new(flate2::read::GzDecoder::new(f)),
                Kind::TarBz2 => Box::new(bzip2::read::BzDecoder::new(f)),
                _ => Box::new(f),
            };
            let mut t = tar::Archive::new(reader);
            for entry in t.entries()? {
                let entry = entry?;
                let name = clean(&entry.path()?.to_string_lossy());
                if name.is_empty() {
                    continue;
                }
                let h = entry.header();
                let ty = h.entry_type();
                out.push(EntryInfo {
                    is_dir: ty.is_dir(),
                    // 일반 파일과 폴더 외(링크, 장치, FIFO 등)는 모두 "특수"로 취급한다.
                    is_symlink: !(ty.is_file() || ty.is_dir()),
                    size: h.size().unwrap_or(0),
                    modified: h.mtime().ok().map(|s| UNIX_EPOCH + Duration::from_secs(s)),
                    mode: h.mode().ok().map(|m| m & 0o7777),
                    name,
                });
            }
        }
    }
    Ok((out, zip_index))
}
