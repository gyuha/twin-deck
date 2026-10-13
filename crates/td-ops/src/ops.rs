use std::sync::atomic::{AtomicBool, Ordering};

use td_vfs::{Entry, EntryKind, ListOptions, Vfs, VfsError, VfsPath};
use unicode_normalization::UnicodeNormalization;

use crate::{OpsError, Result, Trasher};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConflictPolicy {
    Overwrite,
    Skip,
    Rename,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Outcome {
    /// 작업 결과가 놓인 경로.
    Done(VfsPath),
    Skipped,
}

/// 이 크기 이상인 파일만 복사 중 진행을 읽는다(작은 파일은 순식간에 끝나 스레드 비용이 더 크다).
const BYTES_POLL_MIN: u64 = 1024 * 1024;
const BYTES_POLL_INTERVAL: std::time::Duration = std::time::Duration::from_millis(100);

/// 긴 작업이 파일 단위로 진행을 알리고 중단 요청을 확인하는 지점.
pub trait Control {
    /// 파일/폴더 하나를 처리하기 직전에 호출된다.
    fn on_item(&self, path: &VfsPath);
    /// true이면 작업을 멈추고 `OpsError::Aborted`를 돌려준다.
    fn should_stop(&self) -> bool;
    /// 파일(또는 심볼릭 링크) 하나를 다 처리한 직후에 호출된다.
    fn on_file_done(&self) {}
    /// true이면 폴더 안의 항목 하나가 실패해도 거기서 멈추지 않고 `on_error`로 알린 뒤 나머지를 계속 처리한다(작업 큐).
    /// false(기본)이면 첫 오류에서 바로 돌려준다.
    fn collects_errors(&self) -> bool {
        false
    }
    /// `collects_errors`가 true일 때 실패한 항목의 경로와 오류를 알린다.
    fn on_error(&self, _path: &VfsPath, _message: &str) {}
    /// 파일 하나를 복사하는 동안 (처리한 바이트, 전체 바이트)를 받을 함수. 복사하는 동안 다른 스레드에서 호출된다.
    /// 필요 없으면 `None`(기본)이고, 그러면 진행을 읽는 스레드도 만들지 않는다.
    fn bytes_sink(&self) -> Option<Box<dyn Fn(u64, u64) + Send + '_>> {
        None
    }
}

/// 진행 알림도 중단도 없는 기본 제어.
pub struct NoControl;

impl Control for NoControl {
    fn on_item(&self, _path: &VfsPath) {}
    fn should_stop(&self) -> bool {
        false
    }
}

/// 추출용으로 압축 파일을 연다. 확장자로 형식을 알 수 없으면(설정의 추가 확장자, Open As 등) 내용으로 판별한다.
fn open_archive_for_extract(src: &VfsPath) -> Result<td_archive::Archive> {
    Ok(
        td_archive::Archive::open(src.as_path(), &[]).or_else(|e| match e {
            td_archive::ArchiveError::Unsupported(_) => td_archive::sniff_kind(src.as_path())
                .ok()
                .flatten()
                .map(|k| td_archive::Archive::open_as(src.as_path(), k))
                .unwrap_or(Err(e)),
            other => Err(other),
        })?,
    )
}

/// 이름을 조합형(NFC)으로 고친 결과.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct NormalizeReport {
    /// (원래 경로, 고친 경로).
    pub renamed: Vec<(VfsPath, VfsPath)>,
    /// 같은 조합형 이름의 다른 항목이 이미 있어 건드리지 않은 경로.
    pub conflicts: Vec<VfsPath>,
    /// 이름을 바꾸지 못한 경로와 이유.
    pub failed: Vec<(VfsPath, String)>,
}

pub struct Ops<V: Vfs, T: Trasher> {
    vfs: V,
    trasher: T,
}

/// 덮어쓰기로 옆에 치워 둔 기존 대상이 놓인 임시 경로.
struct Displaced {
    aside: VfsPath,
}

/// 충돌 정책을 적용해 정한 쓸 경로. Overwrite였다면 치워 둔 기존 대상이 같이 든다.
struct Target {
    path: VfsPath,
    displaced: Option<Displaced>,
}

impl Target {
    fn new(path: VfsPath) -> Self {
        Self {
            path,
            displaced: None,
        }
    }
}

fn valid_name(name: &str) -> Result<()> {
    let bad = name.is_empty()
        || name == "."
        || name == ".."
        || name.contains('/')
        || name.contains('\\')
        || name.contains('\0');
    if bad {
        Err(OpsError::InvalidName(name.to_string()))
    } else {
        Ok(())
    }
}

/// 치워 둔 임시 이름의 최대 바이트 수. 흔한 파일시스템의 파일 이름 한도(255)다.
const ASIDE_NAME_MAX: usize = 255;

/// rename이 다른 볼륨 사이라 실패한 오류인가(유닉스 EXDEV, Windows ERROR_NOT_SAME_DEVICE).
fn crosses_devices(e: &std::io::Error) -> bool {
    if e.kind() == std::io::ErrorKind::CrossesDevices {
        return true;
    }
    #[cfg(unix)]
    return e.raw_os_error() == Some(18);
    #[cfg(windows)]
    return e.raw_os_error() == Some(17);
    #[cfg(not(any(unix, windows)))]
    false
}

/// `name (1).ext` 형태로 겹치지 않는 이름을 만든다.
fn numbered(name: &str, n: u32) -> String {
    match name.rfind('.') {
        Some(i) if i > 0 => format!("{} ({}){}", &name[..i], n, &name[i..]),
        _ => format!("{name} ({n})"),
    }
}

/// 복제 이름 규칙(자체 정의, Marta의 실제 접미사는 확인하지 못했다): `a.txt` → `a copy.txt` → `a copy 2.txt`.
/// 확장자는 마지막 점 뒤이고, 맨 앞 점(`.env`)은 확장자로 보지 않는다. `taken`이 true인 이름은 건너뛴다.
pub fn duplicate_name(name: &str, taken: impl Fn(&str) -> bool) -> String {
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    };
    (1..)
        .map(|n| {
            if n == 1 {
                format!("{stem} copy{ext}")
            } else {
                format!("{stem} copy {n}{ext}")
            }
        })
        .find(|c| !taken(c))
        .expect("무한 반복자")
}

/// 기본 압축 파일 이름. 원본이 하나면 그 이름(파일은 확장자 제외), 여럿이면 압축 위치의 폴더 이름.
fn default_zip_name(sources: &[VfsPath], dest_dir: &VfsPath, first: &VfsPath) -> String {
    let base = if sources.len() == 1 {
        let name = first.file_name().unwrap_or_default();
        let is_dir = first.as_path().is_dir();
        match name.rfind('.') {
            Some(i) if i > 0 && !is_dir => name[..i].to_string(),
            _ => name,
        }
    } else {
        dest_dir
            .file_name()
            .unwrap_or_else(|| "archive".to_string())
    };
    format!("{base}.zip")
}

/// 아카이브 파일 이름에서 확장자를 뺀 추출 폴더 이름 (`a.tar.gz` → `a`, `a.zip` → `a`).
fn archive_stem(name: &str) -> String {
    let lower = name.to_lowercase();
    for suffix in [".tar.gz", ".tar.bz2", ".tgz", ".tbz2", ".tbz", ".tar"] {
        if lower.len() > suffix.len() && lower.ends_with(suffix) {
            return name[..name.len() - suffix.len()].to_string();
        }
    }
    match name.rfind('.') {
        Some(i) if i > 0 => name[..i].to_string(),
        _ => format!("{name} 추출"),
    }
}

impl<V: Vfs, T: Trasher> Ops<V, T> {
    pub fn new(vfs: V, trasher: T) -> Self {
        Self { vfs, trasher }
    }

    fn exists(&self, path: &VfsPath) -> bool {
        self.vfs.stat(path).is_ok()
    }

    fn remove_any(&self, path: &VfsPath) -> Result<()> {
        match self.vfs.stat(path)?.kind {
            EntryKind::Dir => self.vfs.remove_dir_all(path)?,
            _ => self.vfs.remove_file(path)?,
        }
        Ok(())
    }

    /// 로컬 경로면 심볼릭 링크를 풀어 정규화한 경로, 아니면(아카이브 안 등) 그대로.
    fn canonical(path: &VfsPath) -> std::path::PathBuf {
        std::fs::canonicalize(path.as_path()).unwrap_or_else(|_| path.as_path().to_path_buf())
    }

    /// 두 경로가 같은 항목인가. 철자가 달라도(대소문자, NFC/NFD, 심볼릭 링크 경유, 하드 링크) 같은 파일이면 true다.
    fn same_entry(&self, a: &VfsPath, b: &VfsPath) -> bool {
        if a == b {
            return true;
        }
        if let (Ok(ea), Ok(eb)) = (self.vfs.stat(a), self.vfs.stat(b)) {
            if let (Some(x), Some(y)) = (ea.file_id, eb.file_id) {
                if x.dev == y.dev && x.ino == y.ino {
                    return true;
                }
            }
        }
        Self::canonical(a) == Self::canonical(b)
    }

    /// `path`가 `root` 자신이거나 그 안에 있는가. 문자열 접두어가 아니라 실제 위치로 판단한다.
    fn is_within(&self, path: &VfsPath, root: &VfsPath) -> bool {
        if Self::canonical(path).starts_with(Self::canonical(root)) {
            return true;
        }
        // 대소문자·정규화만 다른 철자는 정규화한 경로로는 안 잡히므로 file_id로 조상을 훑는다(root는 한 번만 읽는다).
        let Some(root_id) = self.vfs.stat(root).ok().and_then(|e| e.file_id) else {
            return false;
        };
        path.as_path().ancestors().any(|a| {
            self.vfs
                .stat(&VfsPath::new(a.to_path_buf()))
                .ok()
                .and_then(|e| e.file_id)
                .is_some_and(|id| id.dev == root_id.dev && id.ino == root_id.ino)
        })
    }

    /// 새 폴더. 중첩 경로도 만든다 (OP-01).
    pub fn mkdir(&self, path: &VfsPath) -> Result<()> {
        Ok(self.vfs.mkdir(path)?)
    }

    /// 새 0바이트 파일 (OP-02).
    pub fn touch(&self, path: &VfsPath) -> Result<()> {
        Ok(self.vfs.create_file(path)?)
    }

    /// `dest_dir` 안에서 `src`가 놓일 경로가 이미 있으면 그 경로를 돌려준다. UI가 충돌 다이얼로그를 띄울 때 쓴다.
    pub fn detect_conflict(&self, src: &VfsPath, dest_dir: &VfsPath) -> Option<VfsPath> {
        let dest = dest_dir.join(&src.file_name()?);
        self.exists(&dest).then_some(dest)
    }

    /// 덮어쓰기로 옆에 치워 둔 기존 대상. 작업이 성공하면 `discard`, 실패하거나 중단되면 `rollback`한다.
    fn displace(&self, dest: &VfsPath) -> Result<Displaced> {
        let dir = dest
            .parent()
            .ok_or_else(|| OpsError::InvalidName(dest.to_string()))?;
        // 점으로 시작해 평소 목록에는 안 보이게 하되, 원래 이름을 담아 둔다. 작업이 비정상 종료돼 남아도 무엇의 옛 내용인지 알 수 있다.
        let name = dest
            .file_name()
            .ok_or_else(|| OpsError::InvalidName(dest.to_string()))?;
        let aside = (0u32..)
            .map(|n| {
                let suffix = format!(".td-replaced-{}-{n}", std::process::id());
                // 이름 한도(255바이트)를 넘지 않게 원래 이름은 글자 경계에서 자른다.
                let room = ASIDE_NAME_MAX - 1 - suffix.len();
                let mut end = name.len().min(room);
                while !name.is_char_boundary(end) {
                    end -= 1;
                }
                dir.join(&format!(".{}{suffix}", &name[..end]))
            })
            .find(|c| !self.exists(c))
            .expect("무한 반복자");
        self.vfs.rename(dest, &aside)?;
        Ok(Displaced { aside })
    }

    /// 새 결과가 자리를 잡았으니 치워 둔 옛 대상을 지운다. 지우지 못해도 작업 자체는 성공이라 오류로 치지 않는다.
    fn discard(&self, displaced: Option<Displaced>) {
        if let Some(d) = displaced {
            let _ = self.remove_any(&d.aside);
        }
    }

    /// 실패·중단한 작업이 만든 부분 결과를 치우고 치워 둔 옛 대상을 제자리로 돌린다. `cause`를 그대로 돌려준다.
    fn rollback(&self, dest: &VfsPath, displaced: Option<Displaced>, cause: OpsError) -> OpsError {
        let Some(d) = displaced else {
            return cause;
        };
        if self.exists(dest) {
            let _ = self.remove_any(dest);
        }
        match self.vfs.rename(&d.aside, dest) {
            Ok(()) => cause,
            Err(e) => OpsError::RestoreFailed {
                cause: cause.to_string(),
                aside: d.aside,
                restore: e.to_string(),
            },
        }
    }

    /// 충돌 정책을 적용해 실제로 쓸 경로를 정한다. `None`이면 건너뛴다.
    /// Overwrite면 기존 대상을 지우지 않고 옆으로 치워 두고, 호출한 쪽이 `discard`/`rollback`으로 마무리한다.
    fn resolve_dest(
        &self,
        src: &VfsPath,
        dest_dir: &VfsPath,
        policy: ConflictPolicy,
    ) -> Result<Option<Target>> {
        let name = src
            .file_name()
            .ok_or_else(|| OpsError::InvalidName(src.to_string()))?;
        let dest = dest_dir.join(&name);
        if !self.exists(&dest) {
            return Ok(Some(Target::new(dest)));
        }
        match policy {
            ConflictPolicy::Skip => Ok(None),
            ConflictPolicy::Overwrite => {
                self.check_overwritable(&dest, std::slice::from_ref(src))?;
                let displaced = self.displace(&dest)?;
                Ok(Some(Target {
                    path: dest,
                    displaced: Some(displaced),
                }))
            }
            ConflictPolicy::Rename => {
                let mut n = 1;
                loop {
                    let candidate = dest_dir.join(&numbered(&name, n));
                    if !self.exists(&candidate) {
                        return Ok(Some(Target::new(candidate)));
                    }
                    n += 1;
                }
            }
        }
    }

    /// 이미 이름이 정해진 결과물(`압축 파일`, `추출 폴더`)의 충돌 처리. `None`이면 건너뛴다.
    /// `sources`는 이 결과물을 만드는 데 읽을 원본이라, Overwrite가 그 원본 자신이나 조상을 지우지 못하게 막는 데 쓴다.
    fn resolve_name(
        &self,
        dest_dir: &VfsPath,
        name: &str,
        policy: ConflictPolicy,
        sources: &[VfsPath],
    ) -> Result<Option<Target>> {
        let dest = dest_dir.join(name);
        if !self.exists(&dest) {
            return Ok(Some(Target::new(dest)));
        }
        match policy {
            ConflictPolicy::Skip => Ok(None),
            ConflictPolicy::Overwrite => {
                self.check_overwritable(&dest, sources)?;
                let displaced = self.displace(&dest)?;
                Ok(Some(Target {
                    path: dest,
                    displaced: Some(displaced),
                }))
            }
            ConflictPolicy::Rename => {
                let mut n = 1;
                loop {
                    let candidate = dest_dir.join(&numbered(name, n));
                    if !self.exists(&candidate) {
                        return Ok(Some(Target::new(candidate)));
                    }
                    n += 1;
                }
            }
        }
    }

    /// `dest`를 덮어써도 `sources` 중 하나를 잃지 않는지 본다. 같은 파일이거나(철자가 달라도), `dest`가 원본의 조상이면 거부한다.
    fn check_overwritable(&self, dest: &VfsPath, sources: &[VfsPath]) -> Result<()> {
        for src in sources {
            if self.same_entry(dest, src) {
                return Err(OpsError::SameFile(dest.clone()));
            }
            if self.is_within(src, dest) {
                return Err(OpsError::SourceInsideDest(dest.clone()));
            }
        }
        Ok(())
    }

    fn check_not_inside(&self, src: &VfsPath, dest_dir: &VfsPath) -> Result<()> {
        if self.vfs.stat(src)?.kind == EntryKind::Dir && self.is_within(dest_dir, src) {
            return Err(OpsError::DestInsideSource(dest_dir.clone()));
        }
        Ok(())
    }

    /// 파일 하나를 복사한다. `ctl`이 바이트 진행을 받으면, 큰 파일은 복사하는 동안 대상 파일 크기를 주기적으로 읽어 알리고
    /// 끝나면 (전체, 전체)를 알린다. `fs::copy` 자체는 그대로 둬서 OS의 빠른 복사 경로를 잃지 않는다.
    fn copy_file_reporting(&self, entry: &Entry, dest: &VfsPath, ctl: &dyn Control) -> Result<()> {
        let Some(sink) = ctl.bytes_sink() else {
            self.vfs.copy_file(&entry.path, dest)?;
            return Ok(());
        };
        let total = entry.size;
        let sink = if total >= BYTES_POLL_MIN {
            let done = AtomicBool::new(false);
            std::thread::scope(|scope| {
                let poller = scope.spawn(|| {
                    while !done.load(Ordering::Acquire) {
                        if let Ok(m) = std::fs::metadata(dest.as_path()) {
                            sink(m.len().min(total), total);
                        }
                        std::thread::park_timeout(BYTES_POLL_INTERVAL);
                    }
                    sink
                });
                let copied = self.vfs.copy_file(&entry.path, dest);
                done.store(true, Ordering::Release);
                poller.thread().unpark();
                let sink = poller.join().expect("진행 읽기 스레드");
                copied.map(|_| sink)
            })?
        } else {
            self.vfs.copy_file(&entry.path, dest)?;
            sink
        };
        sink(total, total);
        Ok(())
    }

    /// 항목 하나(폴더면 그 안 전부)를 복사한다. 돌려주는 값은 `ctl.collects_errors()`일 때 건너뛰고 알린 실패 개수다.
    fn copy_entry(&self, entry: &Entry, dest: &VfsPath, ctl: &dyn Control) -> Result<usize> {
        if ctl.should_stop() {
            return Err(OpsError::Aborted);
        }
        ctl.on_item(&entry.path);
        match entry.kind {
            EntryKind::File => {
                self.copy_file_reporting(entry, dest, ctl)?;
                ctl.on_file_done();
            }
            EntryKind::Symlink => {
                let target = self.vfs.read_link(&entry.path)?;
                let is_dir = std::fs::metadata(entry.path.as_path())
                    .map(|m| m.is_dir())
                    .unwrap_or(false);
                self.vfs.symlink(&target, dest, is_dir)?;
                ctl.on_file_done();
            }
            EntryKind::Dir => {
                self.vfs.mkdir(dest)?;
                let opts = ListOptions { show_hidden: true };
                let mut failed = 0;
                for child in self.vfs.list(&entry.path, &opts)? {
                    match self.copy_entry(&child, &dest.join(&child.name), ctl) {
                        Ok(n) => failed += n,
                        Err(OpsError::Aborted) => return Err(OpsError::Aborted),
                        // 항목 하나가 실패해도 폴더 전체를 포기하지 않고 나머지를 계속 복사한다.
                        Err(e) if ctl.collects_errors() => {
                            ctl.on_error(&child.path, &e.to_string());
                            failed += 1;
                        }
                        Err(e) => return Err(e),
                    }
                }
                return Ok(failed);
            }
        }
        Ok(0)
    }

    /// `src` 아래의 파일 수(심볼릭 링크 포함, 폴더는 세지 않는다). 진행률의 분모로 쓴다.
    pub fn count_files(&self, src: &VfsPath) -> Result<usize> {
        let entry = self.vfs.stat(src)?;
        self.count_entry(&entry)
    }

    fn count_entry(&self, entry: &Entry) -> Result<usize> {
        if entry.kind != EntryKind::Dir {
            return Ok(1);
        }
        let opts = ListOptions { show_hidden: true };
        let mut n = 0;
        for child in self.vfs.list(&entry.path, &opts)? {
            n += self.count_entry(&child)?;
        }
        Ok(n)
    }

    /// 복사 (OP-03). 심볼릭 링크는 링크로 복사한다.
    pub fn copy(
        &self,
        src: &VfsPath,
        dest_dir: &VfsPath,
        policy: ConflictPolicy,
    ) -> Result<Outcome> {
        self.copy_with(src, dest_dir, policy, &NoControl)
    }

    /// `copy`와 같지만 항목마다 `ctl`로 진행을 알리고 중단 요청을 확인한다.
    pub fn copy_with(
        &self,
        src: &VfsPath,
        dest_dir: &VfsPath,
        policy: ConflictPolicy,
        ctl: &dyn Control,
    ) -> Result<Outcome> {
        self.check_not_inside(src, dest_dir)?;
        let entry = self.vfs.stat(src)?;
        let Some(Target {
            path: dest,
            displaced,
        }) = self.resolve_dest(src, dest_dir, policy)?
        else {
            return Ok(Outcome::Skipped);
        };
        match self.copy_entry(&entry, &dest, ctl) {
            // 오류를 모으는 작업 큐에서는 일부 항목이 실패해도 Ok가 온다. 기존 대상을 이미 치웠다면 되돌린다.
            Ok(failed) if failed > 0 && displaced.is_some() => {
                Err(self.rollback(&dest, displaced, OpsError::OverwriteRolledBack(failed)))
            }
            Ok(_) => {
                self.discard(displaced);
                Ok(Outcome::Done(dest))
            }
            Err(e) => Err(self.rollback(&dest, displaced, e)),
        }
    }

    /// 심볼릭 링크 만들기 (OP-12): `dest_dir`에 `src`를 가리키는 링크를 만든다. 이름이 겹치면 `policy`를 따른다.
    /// 링크 대상은 `src`의 경로 그대로(절대 경로)다. Windows에서 권한이 없으면 원인과 안내가 든 오류가 된다.
    pub fn symlink(
        &self,
        src: &VfsPath,
        dest_dir: &VfsPath,
        policy: ConflictPolicy,
    ) -> Result<Outcome> {
        let is_dir = self.vfs.stat(src)?.kind == EntryKind::Dir;
        let Some(Target {
            path: dest,
            displaced,
        }) = self.resolve_dest(src, dest_dir, policy)?
        else {
            return Ok(Outcome::Skipped);
        };
        match self.vfs.symlink(src, &dest, is_dir) {
            Ok(()) => {
                self.discard(displaced);
                Ok(Outcome::Done(dest))
            }
            Err(e) => Err(self.rollback(&dest, displaced, e.into())),
        }
    }

    /// 압축 (OP-11): `sources`(로컬 파일/폴더)를 `dest_dir`의 ZIP 하나로 묶는다. 원본은 그대로 둔다.
    /// `name`이 없으면 원본이 하나일 때 그 이름(확장자 제외), 여러 개면 `dest_dir`의 폴더 이름에 `.zip`을 붙인다.
    /// 같은 이름이 있으면 `policy`를 따른다(Rename이면 `이름 (1).zip`). 반쯤 쓴 파일은 남기지 않는다.
    pub fn compress_with(
        &self,
        sources: &[VfsPath],
        dest_dir: &VfsPath,
        name: Option<&str>,
        policy: ConflictPolicy,
        ctl: &dyn Control,
    ) -> Result<Outcome> {
        let first = sources
            .first()
            .ok_or_else(|| OpsError::InvalidName("압축할 항목이 없습니다".into()))?;
        let file_name = match name {
            Some(n) => {
                valid_name(n)?;
                n.to_string()
            }
            None => default_zip_name(sources, dest_dir, first),
        };
        // 원본이 없으면 기존 결과물을 건드리기 전에 실패한다.
        for src in sources {
            self.vfs.stat(src)?;
        }
        let Some(Target {
            path: dest,
            displaced,
        }) = self.resolve_name(dest_dir, &file_name, policy, sources)?
        else {
            return Ok(Outcome::Skipped);
        };
        let paths: Vec<std::path::PathBuf> =
            sources.iter().map(|s| s.as_path().to_path_buf()).collect();
        // 압축 결과를 원본 폴더 안에 두면 치워 둔 옛 압축 파일도 그 폴더에 있다. 새 압축 파일에 섞이지 않게 건너뛴다.
        let aside: Vec<std::path::PathBuf> = displaced
            .iter()
            .map(|d| d.aside.as_path().to_path_buf())
            .collect();
        match td_archive::compress_skipping(&paths, dest.as_path(), &aside, &mut |p| {
            ctl.on_item(&VfsPath::new(p));
            !ctl.should_stop()
        }) {
            Ok(_) => {
                self.discard(displaced);
                Ok(Outcome::Done(dest))
            }
            Err(e) => Err(self.rollback(&dest, displaced, e.into())),
        }
    }

    /// 추출 (OP-11): 로컬 아카이브 `src`를 `dest_dir` 아래의 새 폴더에 안전하게 푼다(경로 탈출, 절대 경로, 링크 거부).
    /// 폴더 이름은 `folder`, 없으면 아카이브 이름에서 확장자를 뺀 것이다. 같은 이름이 있으면 `policy`를 따른다.
    /// 중단하거나 실패하면 만들다 만 폴더를 지운다. 원본 아카이브는 그대로 둔다.
    pub fn extract_with(
        &self,
        src: &VfsPath,
        dest_dir: &VfsPath,
        folder: Option<&str>,
        policy: ConflictPolicy,
        ctl: &dyn Control,
    ) -> Result<Outcome> {
        let src_name = src
            .file_name()
            .ok_or_else(|| OpsError::InvalidName(src.to_string()))?;
        let folder_name = match folder {
            Some(n) => {
                valid_name(n)?;
                n.to_string()
            }
            None => archive_stem(&src_name),
        };
        let archive = open_archive_for_extract(src)?;
        let Some(Target {
            path: dest,
            displaced,
        }) = self.resolve_name(dest_dir, &folder_name, policy, std::slice::from_ref(src))?
        else {
            return Ok(Outcome::Skipped);
        };
        // 항목을 처리하기 직전에 불리므로, 앞서 처리한 파일은 다음 호출(또는 끝)에서 "끝났다"고 알린다.
        let dirs: std::collections::HashSet<&str> = archive
            .entries()
            .iter()
            .filter(|e| e.is_dir)
            .map(|e| e.name.as_str())
            .collect();
        let mut pending_file = false;
        let result = archive.extract_all_with(dest.as_path(), &mut |name| {
            if std::mem::take(&mut pending_file) {
                ctl.on_file_done();
            }
            ctl.on_item(&dest.join(name));
            pending_file = !dirs.contains(name);
            !ctl.should_stop()
        });
        match result {
            Ok(_) => {
                if pending_file {
                    ctl.on_file_done();
                }
                self.discard(displaced);
                Ok(Outcome::Done(dest))
            }
            Err(e) => {
                // 만들다 만 폴더를 치우고(`rollback`이 치운다) 기존 폴더가 있었다면 되돌린다.
                if displaced.is_none() {
                    let _ = std::fs::remove_dir_all(dest.as_path());
                }
                Err(self.rollback(&dest, displaced, e.into()))
            }
        }
    }

    /// 압축 파일 안의 파일 수(폴더는 세지 않는다). 진행률의 분모로 쓴다.
    pub fn count_archive_files(&self, src: &VfsPath) -> Result<usize> {
        let archive = open_archive_for_extract(src)?;
        Ok(archive.entries().iter().filter(|e| !e.is_dir).count())
    }

    /// 복제 (OP-08): 같은 폴더에 접미사를 붙여 복사한다. 만들어진 경로를 돌려준다.
    pub fn duplicate(&self, src: &VfsPath) -> Result<VfsPath> {
        self.duplicate_with(src, &NoControl)
    }

    pub fn duplicate_with(&self, src: &VfsPath, ctl: &dyn Control) -> Result<VfsPath> {
        let name = src
            .file_name()
            .ok_or_else(|| OpsError::InvalidName(src.to_string()))?;
        let dir = src
            .parent()
            .ok_or_else(|| OpsError::InvalidName(src.to_string()))?;
        let entry = self.vfs.stat(src)?;
        let dest = dir.join(&duplicate_name(&name, |c| self.exists(&dir.join(c))));
        self.copy_entry(&entry, &dest, ctl)?;
        Ok(dest)
    }

    /// 이동 (OP-04). 같은 볼륨이면 rename, 실패하면 복사 후 삭제.
    pub fn move_to(
        &self,
        src: &VfsPath,
        dest_dir: &VfsPath,
        policy: ConflictPolicy,
    ) -> Result<Outcome> {
        self.move_with(src, dest_dir, policy, &NoControl)
    }

    /// `move_to`와 같지만 항목마다 `ctl`로 진행을 알리고 중단 요청을 확인한다.
    pub fn move_with(
        &self,
        src: &VfsPath,
        dest_dir: &VfsPath,
        policy: ConflictPolicy,
        ctl: &dyn Control,
    ) -> Result<Outcome> {
        self.check_not_inside(src, dest_dir)?;
        if src
            .parent()
            .is_some_and(|parent| self.same_entry(&parent, dest_dir))
        {
            // 같은 폴더로의 이동은 아무 일도 하지 않는다.
            return Ok(Outcome::Skipped);
        }
        let Some(Target {
            path: dest,
            displaced,
        }) = self.resolve_dest(src, dest_dir, policy)?
        else {
            return Ok(Outcome::Skipped);
        };
        match self.vfs.rename(src, &dest) {
            Ok(()) => self.discard(displaced),
            // 볼륨이 달라 rename이 안 될 때만 복사 후 삭제로 넘어간다. 권한 오류 같은 다른 실패는 그대로 알린다.
            Err(VfsError::Io { source, .. }) if crosses_devices(&source) => {
                let entry = match self.vfs.stat(src) {
                    Ok(entry) => entry,
                    Err(e) => return Err(self.rollback(&dest, displaced, e.into())),
                };
                // 일부라도 복사하지 못했으면 원본을 지우지 않는다(지우면 복사되지 않은 파일을 잃는다).
                match self.copy_entry(&entry, &dest, ctl) {
                    Ok(0) => {}
                    Ok(failed) => {
                        return Err(self.rollback(&dest, displaced, OpsError::PartialCopy(failed)))
                    }
                    Err(e) => return Err(self.rollback(&dest, displaced, e)),
                }
                // 원본을 지운 뒤에야 옛 대상을 버린다. 원본 삭제가 실패하면(새 결과는 이미 자리를 잡았다) 옛 내용을 치워 둔 채로 남겨 잃지 않게 한다.
                self.remove_any(src)?;
                self.discard(displaced);
            }
            Err(e) => return Err(self.rollback(&dest, displaced, e.into())),
        }
        Ok(Outcome::Done(dest))
    }

    /// 같은 폴더 안에서 이름 변경 (OP-05).
    pub fn rename(&self, src: &VfsPath, new_name: &str) -> Result<VfsPath> {
        valid_name(new_name)?;
        let parent = src
            .parent()
            .ok_or_else(|| OpsError::InvalidName(src.to_string()))?;
        let dest = parent.join(new_name);
        if self.exists(&dest) {
            return Err(VfsError::AlreadyExists(dest).into());
        }
        self.vfs.rename(src, &dest)?;
        Ok(dest)
    }

    /// 자소가 분리된(NFD) 한글 이름을 조합형(NFC)으로 바꾼다(이슈 #50). 이미 조합형인 이름은 건드리지 않는다.
    /// APFS는 두 형태를 같은 이름으로 보므로 "이미 있음" 검사를 믿을 수 없다. 그래서 임시 이름으로 옮긴 뒤 조합형 이름으로 옮기고,
    /// 그 사이에 같은 조합형 이름의 다른 항목이 보이면 원래 이름으로 되돌린다(덮어쓰지 않는다).
    pub fn normalize_names(&self, paths: &[VfsPath]) -> NormalizeReport {
        let mut report = NormalizeReport::default();
        for (n, path) in paths.iter().enumerate() {
            let Some(name) = path.file_name() else {
                continue;
            };
            let nfc: String = name.nfc().collect();
            if nfc == name {
                continue;
            }
            let Some(parent) = path.parent() else {
                continue;
            };
            let dest = parent.join(&nfc);
            let tmp = parent.join(&format!(".td-nfc-{}-{n}", std::process::id()));
            if self.exists(&tmp) {
                report
                    .failed
                    .push((path.clone(), "임시 이름이 이미 있습니다".into()));
                continue;
            }
            if let Err(e) = self.vfs.rename(path, &tmp) {
                report.failed.push((path.clone(), e.to_string()));
                continue;
            }
            if self.exists(&dest) {
                match self.vfs.rename(&tmp, path) {
                    Ok(()) => report.conflicts.push(path.clone()),
                    Err(e) => report
                        .failed
                        .push((path.clone(), format!("되돌리지 못했습니다({tmp}): {e}"))),
                }
                continue;
            }
            match self.vfs.rename(&tmp, &dest) {
                Ok(()) => report.renamed.push((path.clone(), dest)),
                Err(e) => {
                    let _ = self.vfs.rename(&tmp, path);
                    report.failed.push((path.clone(), e.to_string()));
                }
            }
        }
        report
    }

    /// 폴더 바로 아래 항목(숨김 포함)의 이름을 조합형으로 고친다. 하위 폴더 안은 건드리지 않는다.
    pub fn normalize_dir(&self, dir: &VfsPath) -> Result<NormalizeReport> {
        let entries = self.vfs.list(dir, &ListOptions { show_hidden: true })?;
        let paths: Vec<VfsPath> = entries.into_iter().map(|e| e.path).collect();
        Ok(self.normalize_names(&paths))
    }

    /// 휴지통으로 이동 (OP-06).
    pub fn trash(&self, path: &VfsPath) -> Result<()> {
        self.vfs.stat(path)?;
        if !self.vfs.can_trash(path) {
            return Err(OpsError::Trash(format!(
                "{path}: 아카이브 안에서는 휴지통을 쓸 수 없습니다 (영구 삭제만 가능)"
            )));
        }
        self.trasher.trash(path.as_path())
    }

    /// 영구 삭제 (OP-07). 확인은 UI 책임이다.
    pub fn delete(&self, path: &VfsPath) -> Result<()> {
        self.remove_any(path)
    }

    /// 영구 삭제의 진행 단위 수. 휴지통을 쓸 수 있는 곳(로컬)은 파일 수, 아카이브 안은 한 번에 지우므로 1이다.
    pub fn delete_units(&self, path: &VfsPath) -> Result<usize> {
        if self.vfs.can_trash(path) {
            self.count_files(path)
        } else {
            Ok(1)
        }
    }

    /// `delete`와 같지만 파일마다 `ctl`로 진행을 알리고 중단 요청을 확인한다.
    /// 아카이브 안은 파일마다 압축 파일을 다시 쓰게 되므로 순회하지 않고 한 번에 지운다.
    pub fn delete_with(&self, path: &VfsPath, ctl: &dyn Control) -> Result<()> {
        if !self.vfs.can_trash(path) {
            ctl.on_item(path);
            self.remove_any(path)?;
            ctl.on_file_done();
            return Ok(());
        }
        let entry = self.vfs.stat(path)?;
        self.delete_entry(&entry, ctl)
    }

    fn delete_entry(&self, entry: &Entry, ctl: &dyn Control) -> Result<()> {
        if ctl.should_stop() {
            return Err(OpsError::Aborted);
        }
        ctl.on_item(&entry.path);
        if entry.kind == EntryKind::Dir {
            let opts = ListOptions { show_hidden: true };
            for child in self.vfs.list(&entry.path, &opts)? {
                self.delete_entry(&child, ctl)?;
            }
            self.vfs.remove_dir_all(&entry.path)?;
        } else {
            self.vfs.remove_file(&entry.path)?;
            ctl.on_file_done();
        }
        Ok(())
    }
}
