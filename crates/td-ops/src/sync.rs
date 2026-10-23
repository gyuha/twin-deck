//! 로컬 폴더 동기화 비교와 실행 직전 변경 검사. 링크는 따라가지 않는다.
use std::{
    collections::BTreeMap,
    hash::Hasher,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
};
use td_vfs::{Entry, EntryKind, ListOptions, LocalFs, Vfs, VfsPath};
use unicode_normalization::UnicodeNormalization;

#[derive(Debug, Clone, Default)]
pub struct SyncOptions {
    pub recursive: bool,
    pub by_content: bool,
    pub ignore_date: bool,
    pub asymmetric: bool,
    pub pattern: String,
    pub selected_names: Option<Vec<String>>,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Fingerprint {
    entry: Entry,
    hash: Option<u64>,
}
#[derive(Debug, Clone)]
pub struct SyncRow {
    pub relative_path: String,
    pub left: Option<Entry>,
    pub right: Option<Entry>,
    pub status: &'static str,
    pub direction: &'static str,
    pub reason: Option<String>,
}
#[derive(Debug, Clone)]
pub struct SyncComparison {
    pub left: PathBuf,
    pub right: PathBuf,
    pub rows: Vec<SyncRow>,
    row_index: BTreeMap<String, usize>,
    roots: [Fingerprint; 2],
    snapshots: BTreeMap<PathBuf, Fingerprint>,
    paths: BTreeMap<String, (Option<PathBuf>, Option<PathBuf>)>,
    asymmetric: bool,
}
#[derive(Debug, Clone)]
pub struct SyncCopy {
    pub src: PathBuf,
    pub dest: PathBuf,
    left_root: PathBuf,
    right_root: PathBuf,
    roots: [Fingerprint; 2],
    expected_src: Fingerprint,
    expected_dest: Option<Fingerprint>,
}
/// 기존 파일을 교체하지 않는 이름 변경. 서버가 배타적 이름 변경을 지원하지 않으면 안전하게 실패한다.
fn rename_new(from: &Path, to: &Path) -> std::io::Result<()> {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        use std::os::unix::ffi::OsStrExt;
        let from = std::ffi::CString::new(from.as_os_str().as_bytes())?;
        let to = std::ffi::CString::new(to.as_os_str().as_bytes())?;
        #[cfg(target_os = "macos")]
        let result = unsafe { libc::renamex_np(from.as_ptr(), to.as_ptr(), libc::RENAME_EXCL) };
        #[cfg(target_os = "linux")]
        let result = unsafe {
            libc::renameat2(
                libc::AT_FDCWD,
                from.as_ptr(),
                libc::AT_FDCWD,
                to.as_ptr(),
                libc::RENAME_NOREPLACE,
            )
        };
        if result == 0 {
            Ok(())
        } else {
            Err(std::io::Error::last_os_error())
        }
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        std::fs::hard_link(from, to)?;
        std::fs::remove_file(from)
    }
}
fn identity(entry: &Entry) -> Option<(u64, u64)> {
    entry.file_id.map(|id| (id.dev, id.ino))
}
fn same_at(a: &Fingerprint, b: &Fingerprint) -> bool {
    a.entry.kind == b.entry.kind
        && a.entry.size == b.entry.size
        && a.entry.modified == b.entry.modified
        && a.entry.created == b.entry.created
        && a.entry.file_id == b.entry.file_id
        && a.entry.mode == b.entry.mode
        && a.hash == b.hash
}
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn stopped(cancel: &AtomicBool) -> Result<(), String> {
    if cancel.load(Ordering::Relaxed) {
        Err("폴더 비교가 취소되었습니다".into())
    } else {
        Ok(())
    }
}
fn fingerprint(path: &Path, cancel: &AtomicBool) -> Result<Fingerprint, String> {
    fingerprint_with(path, &|| cancel.load(Ordering::Relaxed))
}
fn fingerprint_with(path: &Path, should_stop: &dyn Fn() -> bool) -> Result<Fingerprint, String> {
    let kind = std::fs::symlink_metadata(path).map_err(err)?.file_type();
    if !kind.is_file() && !kind.is_dir() && !kind.is_symlink() {
        return Err("일반 파일·폴더 외의 특수 파일은 동기화할 수 없습니다".into());
    }
    let entry = LocalFs.stat(&VfsPath::new(path)).map_err(err)?;
    let hash = if entry.kind == EntryKind::File {
        let mut file = std::fs::File::open(path).map_err(err)?;
        let mut h = std::collections::hash_map::DefaultHasher::new();
        let mut buf = [0u8; 65536];
        loop {
            if should_stop() {
                return Err("폴더 비교가 취소되었습니다".into());
            }
            let n = file.read(&mut buf).map_err(err)?;
            if n == 0 {
                break;
            }
            h.write(&buf[..n]);
        }
        if LocalFs.stat(&VfsPath::new(path)).map_err(err)? != entry {
            return Err("비교 중 파일이 바뀌었습니다. 다시 비교해 주세요".into());
        }
        Some(h.finish())
    } else {
        None
    };
    Ok(Fingerprint { entry, hash })
}
fn root(path: &str) -> Result<PathBuf, String> {
    if path.contains("://") || path.contains("!/") || path.ends_with('!') {
        return Err("원격·아카이브 경로는 동기화를 지원하지 않습니다".into());
    }
    let original = Path::new(path);
    let nfd: PathBuf = path.nfd().collect::<String>().into();
    let p = if std::fs::symlink_metadata(original).is_err()
        && std::fs::symlink_metadata(&nfd).is_ok()
    {
        nfd.as_path()
    } else {
        original
    };
    if std::fs::symlink_metadata(p)
        .map_err(err)?
        .file_type()
        .is_symlink()
    {
        return Err("링크 폴더는 동기화할 수 없습니다".into());
    }
    let p = p.canonicalize().map_err(err)?;
    if !p.is_dir() {
        return Err("동기화 대상이 폴더가 아닙니다".into());
    }
    Ok(p)
}
fn scan(
    root: &Path,
    options: &SyncOptions,
    cancel: &AtomicBool,
) -> Result<BTreeMap<String, Fingerprint>, String> {
    fn walk(
        root: &Path,
        rel: &str,
        o: &SyncOptions,
        c: &AtomicBool,
        out: &mut BTreeMap<String, Fingerprint>,
    ) -> Result<(), String> {
        stopped(c)?;
        for e in LocalFs
            .list(&VfsPath::new(root), &ListOptions { show_hidden: true })
            .map_err(err)?
        {
            stopped(c)?;
            let name: String = e.name.nfc().collect();
            if rel.is_empty()
                && o.selected_names
                    .as_ref()
                    .is_some_and(|s| !s.iter().any(|n| n.nfc().eq(name.chars())))
            {
                continue;
            }
            let key = if rel.is_empty() {
                name
            } else {
                format!("{rel}/{name}")
            };
            // 실제 디스크 표기를 유지하면서 비교 키만 NFC로 맞춘다.
            if e.kind == EntryKind::Dir && o.recursive {
                walk(e.path.as_path(), &key, o, c, out)?;
            }
            let fp = fingerprint(e.path.as_path(), c)?;
            if out.insert(key, fp).is_some() {
                return Err("조합형 이름이 같은 항목이 여러 개 있습니다".into());
            }
        }
        Ok(())
    }
    let mut out = BTreeMap::new();
    walk(root, "", options, cancel, &mut out)?;
    Ok(out)
}
pub fn compare(
    left: &str,
    right: &str,
    options: &SyncOptions,
    cancel: &AtomicBool,
) -> Result<SyncComparison, String> {
    let left = root(left)?;
    let right = root(right)?;
    if left.starts_with(&right) || right.starts_with(&left) {
        return Err("같거나 서로 포함된 폴더는 동기화할 수 없습니다".into());
    }
    let roots = [fingerprint(&left, cancel)?, fingerprint(&right, cancel)?];
    if identity(&roots[0].entry).is_some() && identity(&roots[0].entry) == identity(&roots[1].entry)
    {
        return Err("같은 폴더는 동기화할 수 없습니다".into());
    }
    let l = scan(&left, options, cancel)?;
    let r = scan(&right, options, cancel)?;
    let keys: std::collections::BTreeSet<_> = l.keys().chain(r.keys()).cloned().collect();
    let mut rows = Vec::new();
    let snapshots = l
        .values()
        .chain(r.values())
        .map(|f| (f.entry.path.as_path().to_path_buf(), f.clone()))
        .collect();
    let paths = keys
        .iter()
        .map(|key| {
            (
                key.clone(),
                (
                    l.get(key).map(|f| f.entry.path.as_path().to_path_buf()),
                    r.get(key).map(|f| f.entry.path.as_path().to_path_buf()),
                ),
            )
        })
        .collect();
    for key in keys {
        stopped(cancel)?;
        let a = l.get(&key);
        let b = r.get(&key);
        let (mut status, mut direction, mut reason) = if a
            .into_iter()
            .chain(b)
            .any(|f| f.entry.kind == EntryKind::Symlink)
            || a.zip(b).is_some_and(|(a, b)| a.entry.kind != b.entry.kind)
        {
            (
                "conflict",
                "skip",
                Some("링크 또는 파일·폴더 종류 충돌은 건너뜁니다".into()),
            )
        } else {
            match (a, b) {
                (Some(_), None) => ("leftOnly", "leftToRight", None),
                (None, Some(_)) => ("rightOnly", "rightToLeft", None),
                (Some(a), Some(b)) => {
                    if a.entry.kind == EntryKind::Dir
                        || (a.entry.size == b.entry.size
                            && if options.by_content {
                                a.hash == b.hash
                            } else {
                                options.ignore_date || a.entry.modified == b.entry.modified
                            })
                    {
                        ("equal", "skip", None)
                    } else if !options.ignore_date
                        && a.entry
                            .modified
                            .zip(b.entry.modified)
                            .is_some_and(|(a, b)| a > b)
                    {
                        ("leftNewer", "leftToRight", None)
                    } else if !options.ignore_date
                        && a.entry
                            .modified
                            .zip(b.entry.modified)
                            .is_some_and(|(a, b)| a < b)
                    {
                        ("rightNewer", "rightToLeft", None)
                    } else {
                        (
                            "different",
                            "skip",
                            Some("복사 방향을 직접 선택해 주세요".into()),
                        )
                    }
                }
                _ => unreachable!(),
            }
        };
        if (status == "leftOnly" && std::fs::symlink_metadata(right.join(&key)).is_ok())
            || (status == "rightOnly" && std::fs::symlink_metadata(left.join(&key)).is_ok())
        {
            status = "conflict";
            direction = "skip";
            reason = Some("대소문자 또는 이름 정규화가 충돌하는 항목입니다".into());
        }
        if options.asymmetric && direction == "rightToLeft" {
            direction = "skip";
        }
        rows.push(SyncRow {
            relative_path: key,
            left: a.map(|f| f.entry.clone()),
            right: b.map(|f| f.entry.clone()),
            status,
            direction,
            reason,
        });
    }
    let conflicts: Vec<_> = rows
        .iter()
        .filter(|r| r.status == "conflict")
        .map(|r| format!("{}/", r.relative_path))
        .collect();
    for row in &mut rows {
        if conflicts.iter().any(|p| row.relative_path.starts_with(p)) {
            row.status = "conflict";
            row.direction = "skip";
            row.reason = Some("상위 경로에 종류 충돌이 있습니다".into());
        }
    }
    for (index, p) in [&left, &right].into_iter().enumerate() {
        if identity(&fingerprint(p, cancel)?.entry) != identity(&roots[index].entry)
            || root(&p.to_string_lossy())? != *p
        {
            return Err("비교 중 루트 폴더가 바뀌었습니다".into());
        }
    }
    rows.retain(|row| {
        options.pattern.trim().is_empty()
            || options.pattern.split(';').any(|p| {
                td_vfs::glob_match(p.trim(), row.relative_path.rsplit('/').next().unwrap_or(""))
                    || td_vfs::glob_match(p.trim(), &row.relative_path)
            })
    });
    let row_index = rows
        .iter()
        .enumerate()
        .map(|(index, row)| (row.relative_path.clone(), index))
        .collect();
    Ok(SyncComparison {
        left,
        right,
        rows,
        row_index,
        roots,
        snapshots,
        paths,
        asymmetric: options.asymmetric,
    })
}
impl SyncComparison {
    pub fn plan(&self, relative: &str, direction: &str) -> Result<SyncCopy, String> {
        if self.asymmetric && direction == "rightToLeft" {
            return Err("비대칭 비교에서는 오른쪽에서 왼쪽으로 복사할 수 없습니다".into());
        }
        let index = self
            .row_index
            .get(relative)
            .ok_or("비교 결과에 없는 항목입니다")?;
        let row = &self.rows[*index];
        if row.status == "conflict" {
            return Err("종류 충돌 항목은 복사할 수 없습니다".into());
        }
        let (source, target, dest_root) = match direction {
            "leftToRight" => (&row.left, &row.right, &self.right),
            "rightToLeft" => (&row.right, &row.left, &self.left),
            _ => return Err("잘못된 복사 방향입니다".into()),
        };
        let src = source
            .as_ref()
            .ok_or("원본이 없는 방향입니다")?
            .path
            .as_path()
            .to_path_buf();
        let dest = target
            .as_ref()
            .map(|e| e.path.as_path().to_path_buf())
            .unwrap_or_else(|| {
                let mut target = dest_root.clone();
                let parts: Vec<_> = relative.split('/').collect();
                for (index, part) in parts.iter().enumerate() {
                    let key = parts[..=index].join("/");
                    let existing = self.paths.get(&key).and_then(|(left, right)| {
                        if direction == "leftToRight" {
                            right.as_ref()
                        } else {
                            left.as_ref()
                        }
                    });
                    target = existing.cloned().unwrap_or_else(|| target.join(part));
                }
                target
            });
        Ok(SyncCopy {
            expected_src: self.snapshots[&src].clone(),
            expected_dest: self.snapshots.get(&dest).cloned(),
            src,
            dest,
            left_root: self.left.clone(),
            right_root: self.right.clone(),
            roots: self.roots.clone(),
        })
    }
}
impl SyncCopy {
    pub fn validate(&self) -> Result<(), String> {
        self.validate_with(&|| false)
    }
    fn validate_with(&self, stop: &dyn Fn() -> bool) -> Result<(), String> {
        for (index, root) in [&self.left_root, &self.right_root].into_iter().enumerate() {
            if identity(&fingerprint_with(root, stop)?.entry) != identity(&self.roots[index].entry)
                || root.canonicalize().map_err(err)? != *root
                || std::fs::symlink_metadata(root)
                    .map_err(err)?
                    .file_type()
                    .is_symlink()
            {
                return Err("비교 뒤 루트 폴더가 바뀌었습니다".into());
            }
        }
        for p in [&self.src, &self.dest] {
            for ancestor in p.ancestors() {
                if let Ok(m) = std::fs::symlink_metadata(ancestor) {
                    if m.file_type().is_symlink() {
                        return Err("경로에 링크가 있어 동기화를 중단했습니다".into());
                    }
                }
            }
        }
        let source = fingerprint_with(&self.src, stop)?;
        // 폴더 수정 시각은 앞선 자식 복사로 바뀔 수 있다.
        let same = |a: &Fingerprint, b: &Fingerprint| {
            if a.entry.kind == EntryKind::Dir {
                b.entry.kind == EntryKind::Dir
                    && identity(&a.entry) == identity(&b.entry)
                    && a.entry.created == b.entry.created
            } else {
                a == b
            }
        };
        if !same(&self.expected_src, &source) {
            return Err("비교 뒤 원본이 바뀌었습니다. 다시 비교해 주세요".into());
        }
        match (&self.expected_dest, std::fs::symlink_metadata(&self.dest)) {
            (Some(expected), Ok(_)) if same(expected, &fingerprint_with(&self.dest, stop)?) => (),
            (None, Err(e)) if e.kind() == std::io::ErrorKind::NotFound => (),
            _ => return Err("비교 뒤 대상이 바뀌었습니다. 다시 비교해 주세요".into()),
        }
        Ok(())
    }
    pub fn prepare(&self) -> Result<bool, String> {
        self.prepare_with(&|| false)
    }
    fn prepare_with(&self, stop: &dyn Fn() -> bool) -> Result<bool, String> {
        self.validate_with(stop)?;
        if let Some(parent) = self.dest.parent() {
            std::fs::create_dir_all(parent).map_err(err)?;
        }
        if self.expected_src.entry.kind == EntryKind::Dir {
            std::fs::create_dir_all(&self.dest).map_err(err)?;
            Ok(true)
        } else {
            Ok(false)
        }
    }
}

impl SyncCopy {
    /// 같은 폴더 임시 파일로 복사한 뒤 재검증하고 교체한다. 실패하면 기존 대상은 복원한다.
    pub fn execute(&self, ctl: &dyn crate::Control) -> crate::Result<()> {
        let fail = |s: String| {
            if ctl.should_stop() {
                crate::OpsError::Aborted
            } else {
                crate::OpsError::Archive(s)
            }
        };
        if ctl.should_stop() {
            return Err(crate::OpsError::Aborted);
        }
        if self.prepare_with(&|| ctl.should_stop()).map_err(fail)? {
            return Ok(());
        }
        let parent = self.dest.parent().expect("대상 부모");
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let temp = parent.join(format!(".twin-deck-sync-{}-{nonce}", std::process::id()));
        let backup = temp.with_extension("backup");
        let result = (|| -> Result<(), crate::OpsError> {
            let mut output = std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temp)
                .map_err(|e| fail(err(e)))?;
            let mut input = std::fs::File::open(&self.src).map_err(|e| fail(err(e)))?;
            let mut buf = [0u8; 65536];
            let mut done = 0;
            let mut copied_hash = std::collections::hash_map::DefaultHasher::new();
            loop {
                if ctl.should_stop() {
                    return Err(crate::OpsError::Aborted);
                }
                let n = input.read(&mut buf).map_err(|e| fail(err(e)))?;
                if n == 0 {
                    break;
                }
                output.write_all(&buf[..n]).map_err(|e| fail(err(e)))?;
                copied_hash.write(&buf[..n]);
                done += n as u64;
                if let Some(sink) = ctl.bytes_sink() {
                    sink(done, self.expected_src.entry.size);
                }
            }
            if Some(copied_hash.finish()) != self.expected_src.hash {
                return Err(fail(
                    "비교 뒤 원본이 바뀌었습니다. 다시 비교해 주세요".into(),
                ));
            }
            output.sync_all().map_err(|e| fail(err(e)))?;
            std::fs::set_permissions(
                &temp,
                input.metadata().map_err(|e| fail(err(e)))?.permissions(),
            )
            .map_err(|e| fail(err(e)))?;
            if let Some(modified) = self.expected_src.entry.modified {
                output
                    .set_times(std::fs::FileTimes::new().set_modified(modified))
                    .map_err(|e| fail(err(e)))?;
            }
            drop(output);
            self.validate_with(&|| ctl.should_stop()).map_err(fail)?;
            if ctl.should_stop() {
                return Err(crate::OpsError::Aborted);
            }
            if let Some(expected) = &self.expected_dest {
                rename_new(&self.dest, &backup).map_err(|e| fail(err(e)))?;
                let verified = fingerprint_with(&backup, &|| ctl.should_stop()).and_then(|saved| {
                    if same_at(expected, &saved) {
                        Ok(())
                    } else {
                        Err("비교 뒤 대상이 바뀌었습니다. 다시 비교해 주세요".into())
                    }
                });
                if let Err(error) = verified {
                    rename_new(&backup, &self.dest).map_err(|restore| {
                        crate::OpsError::Archive(format!(
                            "{error}. 기존 대상 복원 실패: {restore}; 백업: {}",
                            backup.display()
                        ))
                    })?;
                    return Err(fail(error));
                }
            }
            if let Err(e) = rename_new(&temp, &self.dest) {
                if backup.exists() {
                    rename_new(&backup, &self.dest).map_err(|restore| {
                        crate::OpsError::Archive(format!(
                            "{e}. 기존 대상 복원 실패: {restore}; 백업: {}",
                            backup.display()
                        ))
                    })?;
                }
                return Err(fail(err(e)));
            }
            if backup.exists() {
                std::fs::remove_file(&backup).map_err(|e| {
                    crate::OpsError::Archive(format!(
                        "복사는 끝났지만 기존 대상 백업을 지우지 못했습니다: {}; {e}",
                        backup.display()
                    ))
                })?;
            }
            ctl.on_file_done();
            Ok(())
        })();
        let _ = std::fs::remove_file(temp);
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn setup() -> (tempfile::TempDir, PathBuf, PathBuf) {
        let tmp = tempfile::tempdir().unwrap();
        let left = tmp.path().join("왼쪽");
        let right = tmp.path().join("오른쪽");
        std::fs::create_dir_all(&left).unwrap();
        std::fs::create_dir_all(&right).unwrap();
        (tmp, left, right)
    }
    fn cmp(l: &Path, r: &Path, options: SyncOptions) -> SyncComparison {
        compare(
            l.to_str().unwrap(),
            r.to_str().unwrap(),
            &options,
            &AtomicBool::new(false),
        )
        .unwrap()
    }
    fn options() -> SyncOptions {
        SyncOptions {
            recursive: true,
            by_content: true,
            ..Default::default()
        }
    }
    #[test]
    fn 양쪽_고유파일과_빈폴더를_복사하고_기존파일을_지우지_않는다() {
        let (_tmp, l, r) = setup();
        std::fs::write(l.join("가.txt"), "왼쪽 내용").unwrap();
        std::fs::write(r.join("나.txt"), "오른쪽 내용").unwrap();
        std::fs::create_dir(l.join("빈폴더")).unwrap();
        let c = cmp(&l, &r, options());
        for row in &c.rows {
            c.plan(&row.relative_path, row.direction)
                .unwrap()
                .execute(&crate::NoControl)
                .unwrap();
        }
        assert_eq!(
            std::fs::read(l.join("나.txt")).unwrap(),
            std::fs::read(r.join("나.txt")).unwrap()
        );
        assert!(r.join("빈폴더").is_dir());
        assert!(l.join("가.txt").exists());
        assert!(cmp(&l, &r, options())
            .rows
            .iter()
            .all(|r| r.status == "equal"));
    }
    #[test]
    fn 날짜가_같은_다른_내용은_수동방향이며_종류충돌은_복사하지_않는다() {
        let (_tmp, l, r) = setup();
        std::fs::write(l.join("파일"), "aa").unwrap();
        std::fs::write(r.join("파일"), "bb").unwrap();
        let time = std::fs::metadata(l.join("파일"))
            .unwrap()
            .modified()
            .unwrap();
        std::fs::File::options()
            .write(true)
            .open(r.join("파일"))
            .unwrap()
            .set_times(std::fs::FileTimes::new().set_modified(time))
            .unwrap();
        std::fs::create_dir(l.join("충돌")).unwrap();
        std::fs::write(l.join("충돌/자식"), "보호").unwrap();
        std::fs::write(r.join("충돌"), "파일").unwrap();
        let c = cmp(&l, &r, options());
        assert_eq!(
            c.rows
                .iter()
                .find(|r| r.relative_path == "파일")
                .unwrap()
                .status,
            "different"
        );
        assert_eq!(
            c.rows
                .iter()
                .find(|r| r.relative_path == "파일")
                .unwrap()
                .direction,
            "skip"
        );
        assert!(c.plan("충돌/자식", "leftToRight").is_err());
        c.plan("파일", "rightToLeft")
            .unwrap()
            .execute(&crate::NoControl)
            .unwrap();
        assert_eq!(std::fs::read_to_string(l.join("파일")).unwrap(), "bb");
    }
    #[test]
    fn 비교뒤_내용이나_새_목적지가_바뀌면_덮어쓰지_않는다() {
        let (_tmp, l, r) = setup();
        std::fs::write(l.join("파일"), "old").unwrap();
        let c = cmp(&l, &r, options());
        let p = c.plan("파일", "leftToRight").unwrap();
        std::fs::write(r.join("파일"), "new").unwrap();
        assert!(p.execute(&crate::NoControl).is_err());
        assert_eq!(std::fs::read_to_string(r.join("파일")).unwrap(), "new");
        let c = cmp(&l, &r, options());
        let p = c.plan("파일", "leftToRight").unwrap();
        std::fs::write(l.join("파일"), "changed").unwrap();
        assert!(p.validate().is_err());
        assert_eq!(std::fs::read_to_string(r.join("파일")).unwrap(), "new");
    }
    #[test]
    fn 재귀_패턴_선택필터와_비대칭_방향제한을_적용한다() {
        let (_tmp, l, r) = setup();
        std::fs::create_dir(l.join("선택")).unwrap();
        std::fs::write(l.join("선택/a.txt"), "a").unwrap();
        std::fs::write(l.join("제외.txt"), "b").unwrap();
        std::fs::write(r.join("오른쪽.txt"), "c").unwrap();
        let mut o = options();
        o.pattern = "*.txt".into();
        o.selected_names = Some(vec!["선택".into()]);
        assert_eq!(cmp(&l, &r, o).rows.len(), 1);
        let mut o = options();
        o.asymmetric = true;
        let c = cmp(&l, &r, o);
        assert_eq!(
            c.rows
                .iter()
                .find(|r| r.relative_path == "오른쪽.txt")
                .unwrap()
                .direction,
            "skip"
        );
        assert!(c.plan("오른쪽.txt", "rightToLeft").is_err());
    }
    #[test]
    fn 같은폴더_중첩폴더_원격_아카이브와_취소를_거부한다() {
        let (_tmp, l, r) = setup();
        std::fs::create_dir(l.join("하위")).unwrap();
        for (a, b) in [
            (l.to_str().unwrap(), l.to_str().unwrap()),
            (l.to_str().unwrap(), l.join("하위").to_str().unwrap()),
            ("sftp://id/home", r.to_str().unwrap()),
            ("a.zip!/", r.to_str().unwrap()),
        ] {
            assert!(compare(a, b, &options(), &AtomicBool::new(false)).is_err());
        }
        assert!(compare(
            l.to_str().unwrap(),
            r.to_str().unwrap(),
            &options(),
            &AtomicBool::new(true)
        )
        .unwrap_err()
        .contains("취소"));
    }
    #[test]
    fn 복사중_취소하면_대상과_임시파일을_남기지_않는다() {
        struct Stop(AtomicBool);
        impl crate::Control for Stop {
            fn on_item(&self, _: &VfsPath) {}
            fn should_stop(&self) -> bool {
                self.0.load(Ordering::Relaxed)
            }
            fn bytes_sink(&self) -> Option<Box<dyn Fn(u64, u64) + Send + '_>> {
                Some(Box::new(|_, _| self.0.store(true, Ordering::Relaxed)))
            }
        }
        let (_tmp, l, r) = setup();
        std::fs::write(l.join("파일"), vec![42; 1024 * 1024]).unwrap();
        let p = cmp(&l, &r, options()).plan("파일", "leftToRight").unwrap();
        assert!(matches!(
            p.execute(&Stop(AtomicBool::new(false))),
            Err(crate::OpsError::Aborted)
        ));
        assert_eq!(std::fs::read_dir(r).unwrap().count(), 0);
    }
    #[cfg(unix)]
    #[test]
    fn 링크는_따라가지_않고_비교뒤_부모링크_교체도_거부한다() {
        let (_tmp, l, r) = setup();
        std::fs::create_dir(l.join("폴더")).unwrap();
        std::fs::write(l.join("폴더/파일"), "a").unwrap();
        std::os::unix::fs::symlink(&r, l.join("링크")).unwrap();
        let c = cmp(&l, &r, options());
        assert_eq!(
            c.rows
                .iter()
                .find(|r| r.relative_path == "링크")
                .unwrap()
                .status,
            "conflict"
        );
        let p = c.plan("폴더/파일", "leftToRight").unwrap();
        std::os::unix::fs::symlink(&l, r.join("폴더")).unwrap();
        assert!(p.execute(&crate::NoControl).is_err());
    }
    #[test]
    fn 이름_조합형과_분해형을_맞추고_패턴에서_빠진_부모의_실제경로를_쓴다() {
        let (_tmp, l, r) = setup();
        let nfd: String = "한글".nfd().collect();
        std::fs::create_dir(l.join("한글")).unwrap();
        std::fs::create_dir(r.join(&nfd)).unwrap();
        std::fs::write(l.join("한글/가.txt"), "a").unwrap();
        let mut o = options();
        o.pattern = "*.txt".into();
        let c = cmp(&l, &r, o);
        let p = c.plan("한글/가.txt", "leftToRight").unwrap();
        assert_eq!(p.dest, r.canonicalize().unwrap().join(&nfd).join("가.txt"));
        p.execute(&crate::NoControl).unwrap();
        assert_eq!(
            std::fs::read_to_string(r.join(&nfd).join("가.txt")).unwrap(),
            "a"
        );
    }
    #[test]
    fn 최종_교체직전_생긴_목적지도_덮어쓰지_않는다() {
        use std::sync::atomic::AtomicUsize;
        struct Race {
            dest: PathBuf,
            staged: PathBuf,
            calls: AtomicUsize,
        }
        impl crate::Control for Race {
            fn on_item(&self, _: &VfsPath) {}
            fn should_stop(&self) -> bool {
                // 최종 검증이 끝난 뒤 실행하는 취소 확인에서 목적지를 만든다.
                if self.staged.read_dir().is_ok_and(|mut d| {
                    d.any(|e| {
                        e.is_ok_and(|e| {
                            e.file_name()
                                .to_string_lossy()
                                .starts_with(".twin-deck-sync-")
                        })
                    })
                }) {
                    let n = self.calls.fetch_add(1, Ordering::SeqCst);
                    if n == 4 {
                        std::fs::write(&self.dest, "사용자 새 내용").unwrap();
                    }
                }
                false
            }
        }
        let (_tmp, l, r) = setup();
        std::fs::write(l.join("파일"), "원본").unwrap();
        let p = cmp(&l, &r, options()).plan("파일", "leftToRight").unwrap();
        let ctl = Race {
            dest: r.join("파일"),
            staged: r.clone(),
            calls: AtomicUsize::new(0),
        };
        assert!(p.execute(&ctl).is_err());
        assert_eq!(
            std::fs::read_to_string(r.join("파일")).unwrap(),
            "사용자 새 내용"
        );
    }
    #[cfg(unix)]
    #[test]
    fn 특수파일은_열지_않고_명시적으로_거부한다() {
        use std::os::unix::ffi::OsStrExt;
        let (_tmp, l, r) = setup();
        let fifo = l.join("파이프");
        let c = std::ffi::CString::new(fifo.as_os_str().as_bytes()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(c.as_ptr(), 0o600) }, 0);
        assert!(compare(
            l.to_str().unwrap(),
            r.to_str().unwrap(),
            &options(),
            &AtomicBool::new(false)
        )
        .unwrap_err()
        .contains("특수 파일"));
    }
}
