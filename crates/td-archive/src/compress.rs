//! 로컬 파일/폴더를 ZIP으로 압축한다 (OP-11). 임시 파일에 다 쓴 뒤 이름을 붙이므로 중단하거나 실패해도 반쯤 쓴 zip은 남지 않는다.

use std::fs::{self, File};
use std::io::{self};
use std::path::{Path, PathBuf};

use crate::error::{ArchiveError, Result};
use crate::writer::zip_datetime;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct CompressReport {
    pub files: usize,
    pub dirs: usize,
    /// 심볼릭 링크라서 넣지 않은 항목 수. 링크는 따라가지도, 링크로 저장하지도 않는다.
    pub skipped_links: usize,
}

fn file_options(meta: &fs::Metadata) -> zip::write::SimpleFileOptions {
    let mut opts =
        zip::write::SimpleFileOptions::default().large_file(meta.len() > u32::MAX as u64);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        opts = opts.unix_permissions(meta.permissions().mode() & 0o7777);
    }
    if let Some(t) = zip_datetime(meta.modified().ok()) {
        opts = opts.last_modified_time(t);
    }
    opts
}

struct Walker<'a> {
    zip: zip::ZipWriter<&'a File>,
    report: CompressReport,
    progress: &'a mut dyn FnMut(&Path) -> bool,
    /// 압축 결과 파일 자신(임시 파일과 최종 이름)은 넣지 않는다.
    skip: Vec<PathBuf>,
}

impl Walker<'_> {
    fn add(&mut self, path: &Path, name: &str) -> Result<()> {
        if self.skip.iter().any(|s| s == path) {
            return Ok(());
        }
        if !(self.progress)(path) {
            return Err(ArchiveError::Aborted);
        }
        let meta = fs::symlink_metadata(path)?;
        if meta.file_type().is_symlink() {
            self.report.skipped_links += 1;
        } else if meta.is_dir() {
            self.zip
                .add_directory(format!("{name}/"), file_options(&meta))?;
            self.report.dirs += 1;
            let mut children: Vec<_> = fs::read_dir(path)?.collect::<io::Result<_>>()?;
            children.sort_by_key(|c| c.file_name());
            for c in children {
                let child_name = format!("{name}/{}", c.file_name().to_string_lossy());
                self.add(&c.path(), &child_name)?;
            }
        } else if meta.is_file() {
            self.zip.start_file(name, file_options(&meta))?;
            io::copy(&mut File::open(path)?, &mut self.zip)?;
            self.report.files += 1;
        }
        // 소켓, FIFO 등은 넣지 않는다.
        Ok(())
    }
}

/// `sources`(로컬 파일/폴더)를 `dest` ZIP 하나로 압축한다. `dest`가 이미 있으면 `Exists`.
/// 최상위 이름은 각 원본의 이름이며 같은 이름이 둘 이상이면 오류다. `progress(경로)`가 false를 돌려주면 `Aborted`.
pub fn compress(
    sources: &[PathBuf],
    dest: &Path,
    progress: &mut dyn FnMut(&Path) -> bool,
) -> Result<CompressReport> {
    if dest.exists() {
        return Err(ArchiveError::Exists(dest.display().to_string()));
    }
    let mut names = Vec::new();
    for s in sources {
        let name = s
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .ok_or_else(|| ArchiveError::NotFound(s.display().to_string()))?;
        if names.contains(&name) {
            return Err(ArchiveError::Format(format!(
                "같은 이름의 항목이 둘 이상입니다: {name}"
            )));
        }
        names.push(name);
    }
    let dir = dest
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let tmp = tempfile::Builder::new()
        .prefix(".td-archive-")
        .suffix(".tmp")
        .tempfile_in(dir)?;
    let report = {
        let mut w = Walker {
            zip: zip::ZipWriter::new(tmp.as_file()),
            report: CompressReport::default(),
            progress,
            skip: vec![tmp.path().to_path_buf(), dest.to_path_buf()],
        };
        for (src, name) in sources.iter().zip(&names) {
            w.add(src, name)?;
        }
        w.zip.finish()?;
        w.report
    };
    tmp.as_file().sync_all()?;
    // 원본 폴더의 권한과 무관하게 일반 파일 권한으로 만든다(임시 파일은 0600).
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(tmp.path(), fs::Permissions::from_mode(0o644))?;
    }
    tmp.persist_noclobber(dest)
        .map_err(|e| ArchiveError::Io(e.error))?;
    Ok(report)
}
