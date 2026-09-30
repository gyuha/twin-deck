//! ZIP 쓰기. 모든 변경은 **새 임시 zip을 만들어 원자적으로 교체**한다: 도중에 실패해도 원본은 그대로다.

use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use unicode_normalization::UnicodeNormalization;

use crate::archive::{zip_name, Archive};
use crate::error::{ArchiveError, Result};
use crate::kind::{kind_for_name, Kind};

/// 아카이브에 넣을 내용의 출처.
pub enum Source {
    Bytes(Vec<u8>),
    /// 로컬 파일(내용, 수정 시각, 권한을 따른다).
    Path(PathBuf),
    /// 임의의 스트림. 읽다가 실패하면 쓰기 전체가 취소되고 원본은 그대로 남는다.
    Reader(Box<dyn Read>),
}

struct Add {
    name: String,
    source: Source,
}

/// 하나의 ZIP에 대한 변경 묶음. `commit`할 때 한 번에 적용한다.
pub struct ZipEdit {
    path: PathBuf,
    exists: bool,
    remove: Vec<String>,
    rename: Vec<(String, String)>,
    add_files: Vec<Add>,
    add_dirs: Vec<String>,
}

fn norm(s: &str) -> String {
    s.nfc().collect()
}

fn trim(name: &str) -> String {
    name.trim_matches('/').to_string()
}

/// `name`이 `target`이거나 그 아래인가(NFC 기준).
fn under(name: &str, target: &str) -> bool {
    let (n, t) = (norm(name), norm(target));
    n == t || n.starts_with(&format!("{t}/"))
}

fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// zip이 표현할 수 있는 범위(1980~2107)로 수정 시각을 변환한다.
fn zip_datetime(t: Option<SystemTime>) -> Option<zip::DateTime> {
    let secs = t?.duration_since(UNIX_EPOCH).ok()?.as_secs() as i64;
    let (y, m, d) = civil_from_days(secs.div_euclid(86_400));
    let rem = secs.rem_euclid(86_400);
    zip::DateTime::from_date_and_time(
        y as u16,
        m as u8,
        d as u8,
        (rem / 3600) as u8,
        (rem % 3600 / 60) as u8,
        (rem % 60) as u8,
    )
    .ok()
}

impl ZipEdit {
    /// 기존 ZIP을 고친다. tar 계열은 읽기 전용이라 거부한다.
    pub fn open(path: &Path, extra_zip_exts: &[String]) -> Result<Self> {
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        match kind_for_name(&name, extra_zip_exts) {
            Some(Kind::Zip) => {}
            Some(other) => return Err(ArchiveError::ReadOnly(other.name())),
            None => return Err(ArchiveError::Unsupported(name)),
        }
        if !path.is_file() {
            return Err(ArchiveError::NotFound(path.display().to_string()));
        }
        Ok(Self::raw(path, true))
    }

    /// 확장자와 무관하게 ZIP으로 고친다("Open As").
    pub fn open_as_zip(path: &Path) -> Result<Self> {
        if !path.is_file() {
            return Err(ArchiveError::NotFound(path.display().to_string()));
        }
        Ok(Self::raw(path, true))
    }

    /// 새 ZIP을 만든다. 이미 있으면 오류.
    pub fn create(path: &Path) -> Result<Self> {
        if path.exists() {
            return Err(ArchiveError::Exists(path.display().to_string()));
        }
        Ok(Self::raw(path, false))
    }

    fn raw(path: &Path, exists: bool) -> Self {
        Self {
            path: path.to_path_buf(),
            exists,
            remove: vec![],
            rename: vec![],
            add_files: vec![],
            add_dirs: vec![],
        }
    }

    /// 파일을 넣는다. 같은 이름이 이미 있으면 바꾼다.
    pub fn add_file(&mut self, name: &str, source: Source) -> &mut Self {
        self.add_files.push(Add {
            name: trim(name),
            source,
        });
        self
    }

    pub fn add_dir(&mut self, name: &str) -> &mut Self {
        self.add_dirs.push(trim(name));
        self
    }

    /// 항목(폴더면 그 아래 전부)을 지운다.
    pub fn remove(&mut self, name: &str) -> &mut Self {
        self.remove.push(trim(name));
        self
    }

    /// 항목(폴더면 그 아래 전부)의 이름을 바꾼다.
    pub fn rename(&mut self, from: &str, to: &str) -> &mut Self {
        self.rename.push((trim(from), trim(to)));
        self
    }

    /// 변경을 적용한다. 새 임시 파일에 다 쓴 뒤 원본을 바꿔치기하므로, 어느 단계에서 실패해도 원본은 온전하다.
    pub fn commit(self) -> Result<()> {
        let dir = self
            .path
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(Path::new("."));
        let tmp = tempfile::Builder::new()
            .prefix(".td-archive-")
            .suffix(".tmp")
            .tempfile_in(dir)?;
        {
            let mut w = zip::ZipWriter::new(tmp.as_file());
            let replaced: Vec<&str> = self.add_files.iter().map(|a| a.name.as_str()).collect();

            if self.exists {
                let mut src = zip::ZipArchive::new(File::open(&self.path)?)?;
                for i in 0..src.len() {
                    let f = src.by_index_raw(i)?;
                    let name = zip_name(f.name_raw(), f.name());
                    let bare = trim(&name);
                    if bare.is_empty()
                        || self.remove.iter().any(|r| under(&bare, r))
                        || replaced.iter().any(|r| norm(r) == norm(&bare))
                    {
                        continue;
                    }
                    // 이름 바꾸기: 가장 앞에서 걸리는 규칙 하나만 적용한다.
                    let renamed = self.rename.iter().find(|(from, _)| under(&bare, from)).map(
                        |(from, to)| {
                            let tail = norm(&bare)[norm(from).len()..].to_string();
                            format!("{to}{tail}")
                        },
                    );
                    let is_dir = f.is_dir();
                    let with_slash = move |n: String| if is_dir { format!("{n}/") } else { n };
                    match renamed {
                        Some(new) => w.raw_copy_file_rename(f, with_slash(new))?,
                        // UTF-8 플래그 없이 저장된 UTF-8 이름(macOS `zip`)은 zip 라이브러리가 CP437로 잘못 읽은 문자열을
                        // 그대로 다시 쓰기 때문에, 그냥 복사하면 이름이 영구히 깨진다. 올바른 이름으로 다시 써 준다.
                        None if name != f.name() => w.raw_copy_file_rename(f, with_slash(bare))?,
                        None => w.raw_copy_file(f)?,
                    }
                }
            }

            for d in &self.add_dirs {
                w.add_directory(format!("{d}/"), zip::write::SimpleFileOptions::default())?;
            }
            for a in self.add_files {
                let (mut reader, mode, mtime): (Box<dyn Read>, u32, Option<SystemTime>) =
                    match a.source {
                        Source::Bytes(b) => {
                            (Box::new(io::Cursor::new(b)), 0o644, Some(SystemTime::now()))
                        }
                        Source::Reader(r) => (r, 0o644, Some(SystemTime::now())),
                        Source::Path(p) => {
                            let meta = fs::metadata(&p)?;
                            #[cfg(unix)]
                            let mode = {
                                use std::os::unix::fs::PermissionsExt;
                                meta.permissions().mode() & 0o7777
                            };
                            #[cfg(not(unix))]
                            let mode = 0o644;
                            (Box::new(File::open(&p)?), mode, meta.modified().ok())
                        }
                    };
                let mut opts = zip::write::SimpleFileOptions::default()
                    .unix_permissions(mode)
                    .large_file(true);
                if let Some(t) = zip_datetime(mtime) {
                    opts = opts.last_modified_time(t);
                }
                w.start_file(&a.name, opts)?;
                io::copy(&mut reader, &mut w)?;
            }
            w.finish()?;
        }
        tmp.as_file().sync_all()?;
        if self.exists {
            // 임시 파일은 0600으로 만들어지므로 원본의 권한을 이어받는다.
            fs::set_permissions(tmp.path(), fs::metadata(&self.path)?.permissions())?;
        }
        tmp.persist(&self.path)
            .map_err(|e| ArchiveError::Io(e.error))?;
        Ok(())
    }
}

/// `outer` 안의 중첩 아카이브 `nested`(바깥에서 안쪽 순서)를 따라 들어가 가장 안쪽 ZIP을 고치고,
/// 바뀐 아카이브를 한 단계씩 바깥에 되쓴다 (ARC-03). 가운데에 읽기 전용(tar) 아카이브가 있으면 거부한다.
pub fn edit_in(
    outer: &Path,
    nested: &[String],
    extra_zip_exts: &[String],
    f: &mut dyn FnMut(&mut ZipEdit),
) -> Result<()> {
    let Some((first, rest)) = nested.split_first() else {
        let mut e = ZipEdit::open(outer, extra_zip_exts)?;
        f(&mut e);
        return e.commit();
    };
    let parent = Archive::open(outer, extra_zip_exts)?;
    if !parent.kind().writable() {
        return Err(ArchiveError::ReadOnly(parent.kind().name()));
    }
    let scratch = tempfile::tempdir()?;
    let child = scratch
        .path()
        .join(first.rsplit('/').next().unwrap_or(first));
    parent.read_to(first, &mut File::create(&child)?)?;
    edit_in(&child, rest, extra_zip_exts, f)?;
    let mut e = ZipEdit::open(outer, extra_zip_exts)?;
    e.add_file(first, Source::Path(child));
    e.commit()
}
