//! Tauri에 의존하지 않는 명령 구현. commands.rs가 이 계층에 위임한다.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::mpsc::{Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use specta::Type;
use td_archive::{start_edit, CompositeFs, EditSession};
use td_launch::{Launch, Launcher};
use td_ops::{ConflictPolicy, Ops, Trasher};
use td_queue::{Item, JobInfo, JobKind, JobSpec, JobStatus, Queue, QueueEvent};
use td_search::{CancelToken, SearchOptions, UsageItem, UsageOptions};
use td_vfs::{sort_entries, Entry, EntryKind, ListOptions, Vfs, VfsPath};
use td_watch::DirWatcher;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum KindDto {
    File,
    Dir,
    Symlink,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct EntryDto {
    pub name: String,
    pub path: String,
    pub kind: KindDto,
    /// 바이트 수. JS 숫자로 전달한다.
    pub size: f64,
    /// 수정 시각(epoch 밀리초). 알 수 없으면 null.
    pub modified_ms: Option<f64>,
    /// 생성 시각(epoch 밀리초). 파일시스템이 지원하지 않으면 null.
    pub created_ms: Option<f64>,
    /// 유닉스 권한 비트. Windows에서는 null.
    pub mode: Option<u32>,
    pub hidden: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum ConflictDto {
    Overwrite,
    Skip,
    Rename,
}

impl From<ConflictDto> for ConflictPolicy {
    fn from(c: ConflictDto) -> Self {
        match c {
            ConflictDto::Overwrite => ConflictPolicy::Overwrite,
            ConflictDto::Skip => ConflictPolicy::Skip,
            ConflictDto::Rename => ConflictPolicy::Rename,
        }
    }
}

impl From<&Entry> for EntryDto {
    fn from(e: &Entry) -> Self {
        EntryDto {
            name: e.name.clone(),
            path: e.path.to_string(),
            kind: match e.kind {
                EntryKind::File => KindDto::File,
                EntryKind::Dir => KindDto::Dir,
                EntryKind::Symlink => KindDto::Symlink,
            },
            size: e.size as f64,
            modified_ms: e
                .modified
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as f64),
            created_ms: e
                .created
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as f64),
            mode: e.mode,
            hidden: e.hidden,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum JobKindDto {
    Copy,
    Move,
    Trash,
    Delete,
    Duplicate,
    Compress,
    Extract,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum PreviewKindDto {
    Text,
    Image,
    Audio,
    Video,
    Pdf,
    Directory,
    Other,
}

/// 미리보기 (VIEW-01). 텍스트는 앞부분, 이미지는 data URL.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PreviewDto {
    pub kind: PreviewKindDto,
    pub text: Option<String>,
    pub truncated: bool,
    pub size: f64,
    pub data_url: Option<String>,
}

/// cbz(이미지를 ZIP으로 묶은 만화 파일)의 미리보기: 안의 첫 이미지. 이미지가 없거나 ZIP이 아니면 "기타"(종류와 크기)다.
fn cbz_preview(path: &str) -> td_vfs::Preview {
    let limit = td_vfs::PreviewLimits::default().image_bytes;
    let other = |size| td_vfs::Preview {
        kind: td_vfs::PreviewKind::Other,
        text: None,
        truncated: false,
        size,
        data_url: None,
    };
    let file_size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    let Ok(zip) = td_archive::Archive::open_as(std::path::Path::new(path), td_archive::Kind::Zip)
    else {
        return other(file_size);
    };
    let Some(first) = zip.first_image() else {
        return other(file_size);
    };
    let image = |data_url, truncated| td_vfs::Preview {
        kind: td_vfs::PreviewKind::Image,
        text: None,
        truncated,
        size: first.size,
        data_url,
    };
    if first.size > limit {
        return image(None, true);
    }
    match zip
        .read(&first.name)
        .ok()
        .and_then(|bytes| td_vfs::image_data_url(&first.name, &bytes))
    {
        Some(url) => image(Some(url), false),
        None => other(file_size),
    }
}

impl From<td_vfs::Preview> for PreviewDto {
    fn from(p: td_vfs::Preview) -> Self {
        PreviewDto {
            kind: match p.kind {
                td_vfs::PreviewKind::Text => PreviewKindDto::Text,
                td_vfs::PreviewKind::Image => PreviewKindDto::Image,
                td_vfs::PreviewKind::Audio => PreviewKindDto::Audio,
                td_vfs::PreviewKind::Video => PreviewKindDto::Video,
                td_vfs::PreviewKind::Pdf => PreviewKindDto::Pdf,
                td_vfs::PreviewKind::Directory => PreviewKindDto::Directory,
                td_vfs::PreviewKind::Other => PreviewKindDto::Other,
            },
            text: p.text,
            truncated: p.truncated,
            size: p.size as f64,
            data_url: p.data_url,
        }
    }
}

/// 파일 정보 대화상자용 (OP-14). 시각은 epoch 밀리초, 모르면 null.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FileInfoDto {
    pub name: String,
    pub path: String,
    pub kind: KindDto,
    pub size: f64,
    pub created_ms: Option<f64>,
    pub modified_ms: Option<f64>,
    pub accessed_ms: Option<f64>,
    pub mode: Option<u32>,
    pub link_target: Option<String>,
    /// 폴더의 바로 아래 항목 수.
    pub child_count: Option<f64>,
}

fn ms(t: Option<std::time::SystemTime>) -> Option<f64> {
    t.and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as f64)
}

impl From<&td_vfs::Info> for FileInfoDto {
    fn from(i: &td_vfs::Info) -> Self {
        let e = EntryDto::from(&i.entry);
        FileInfoDto {
            name: e.name,
            path: e.path,
            kind: e.kind,
            size: e.size,
            created_ms: e.created_ms,
            modified_ms: e.modified_ms,
            accessed_ms: ms(i.accessed),
            mode: e.mode,
            link_target: i.link_target.as_ref().map(|p| p.to_string()),
            child_count: i.child_count.map(|n| n as f64),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum JobStatusDto {
    Queued,
    Running,
    Paused,
    Done,
    Failed,
    Aborted,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct QueueItemDto {
    pub src: String,
    /// 복사/이동의 대상 폴더. 휴지통/삭제에서는 null.
    pub dest_dir: Option<String>,
    pub policy: ConflictDto,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct JobErrorDto {
    pub path: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct JobDto {
    pub id: u32,
    pub kind: JobKindDto,
    pub status: JobStatusDto,
    pub total: u32,
    pub completed: u32,
    /// 복사/이동의 전체 파일 수. 집계 전이거나 해당 없는 작업이면 `None`.
    pub files_total: Option<u32>,
    pub files_done: u32,
    /// 지금 복사 중인 파일의 전체 바이트. 아직 모르거나 복사/이동이 아니면 `None`.
    pub bytes_total: Option<f64>,
    /// 지금 복사 중인 파일에서 처리한 바이트.
    pub bytes_done: f64,
    pub current: Option<String>,
    pub errors: Vec<JobErrorDto>,
}

impl From<JobKindDto> for JobKind {
    fn from(k: JobKindDto) -> Self {
        match k {
            JobKindDto::Copy => JobKind::Copy,
            JobKindDto::Move => JobKind::Move,
            JobKindDto::Trash => JobKind::Trash,
            JobKindDto::Delete => JobKind::Delete,
            JobKindDto::Duplicate => JobKind::Duplicate,
            JobKindDto::Compress => JobKind::Compress,
            JobKindDto::Extract => JobKind::Extract,
        }
    }
}

impl From<&JobInfo> for JobDto {
    fn from(j: &JobInfo) -> Self {
        JobDto {
            id: j.id as u32,
            kind: match j.kind {
                JobKind::Compress => JobKindDto::Compress,
                JobKind::Extract => JobKindDto::Extract,
                JobKind::Copy => JobKindDto::Copy,
                JobKind::Move => JobKindDto::Move,
                JobKind::Trash => JobKindDto::Trash,
                JobKind::Delete => JobKindDto::Delete,
                JobKind::Duplicate => JobKindDto::Duplicate,
            },
            status: match j.status {
                JobStatus::Queued => JobStatusDto::Queued,
                JobStatus::Running => JobStatusDto::Running,
                JobStatus::Paused => JobStatusDto::Paused,
                JobStatus::Done => JobStatusDto::Done,
                JobStatus::Failed => JobStatusDto::Failed,
                JobStatus::Aborted => JobStatusDto::Aborted,
            },
            total: j.total as u32,
            completed: j.completed as u32,
            files_total: j.files_total.map(|n| n as u32),
            files_done: j.files_done as u32,
            bytes_total: j.bytes_total.map(|n| n as f64),
            bytes_done: j.bytes_done as f64,
            current: j.current.clone(),
            errors: j
                .errors
                .iter()
                .map(|(path, message)| JobErrorDto {
                    path: path.clone(),
                    message: message.clone(),
                })
                .collect(),
        }
    }
}

/// 검색/순회 작업을 시작했을 때의 응답. 지원하지 않는 변수 경고는 시작 즉시 알 수 있다.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SearchStartDto {
    pub id: u32,
    pub warnings: Vec<String>,
}

/// 파일 찾기의 "파일에서 텍스트 찾기" 조건.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TextSpecDto {
    pub pattern: String,
    pub case_sensitive: bool,
    pub regex: bool,
    /// 텍스트를 포함하지 않는 파일을 찾는다.
    pub invert: bool,
}

/// 파일 찾기 다이얼로그(기본 탭)의 조건. 필드의 뜻은 `td_search::FindSpec`과 같다.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FindSpecDto {
    pub roots: Vec<String>,
    pub only_items: Option<Vec<String>>,
    pub follow_symlinks: bool,
    pub exclude_dirs: String,
    pub max_depth: Option<u32>,
    pub mask: String,
    pub substring: bool,
    pub regex: bool,
    pub exclude_files: String,
    pub text: Option<TextSpecDto>,
}

/// 작업이 끝났을 때(정상, 취소 모두)의 요약.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SearchSummaryDto {
    pub visited: f64,
    pub matched: f64,
    pub unreadable: f64,
    pub cancelled: bool,
    pub warnings: Vec<String>,
}

/// 서비스 밖(Tauri 이벤트)으로 나가는 작업 결과.
#[derive(Debug, Clone, PartialEq)]
pub enum SearchMsg {
    /// Look Up / Flatten 결과 묶음.
    Chunk { id: u32, entries: Vec<EntryDto> },
    /// Disk Usage 스냅샷(크기 내림차순). `done`이면 최종 결과다.
    Usage {
        id: u32,
        items: Vec<EntryDto>,
        done: bool,
        total_bytes: f64,
        files: f64,
    },
    /// 마지막 메시지. 이후 이 id의 메시지는 오지 않는다.
    Done { id: u32, summary: SearchSummaryDto },
}

impl From<&UsageItem> for EntryDto {
    /// 크기 칸에 항목의 총 크기를 담는다.
    fn from(i: &UsageItem) -> Self {
        EntryDto {
            name: i.name.clone(),
            path: i.path.to_string(),
            kind: match i.kind {
                EntryKind::File => KindDto::File,
                EntryKind::Dir => KindDto::Dir,
                EntryKind::Symlink => KindDto::Symlink,
            },
            size: i.bytes as f64,
            modified_ms: None,
            created_ms: None,
            mode: None,
            hidden: i.name.starts_with('.'),
        }
    }
}

/// 결과를 200개 또는 50ms 단위로 묶어 보낸다.
struct Batcher {
    id: u32,
    tx: Sender<SearchMsg>,
    buf: Vec<EntryDto>,
    last: Instant,
}

impl Batcher {
    fn new(id: u32, tx: Sender<SearchMsg>) -> Self {
        Self {
            id,
            tx,
            buf: Vec::new(),
            last: Instant::now(),
        }
    }

    fn push(&mut self, e: &Entry) {
        self.buf.push(EntryDto::from(e));
        if self.buf.len() >= 200 || self.last.elapsed() >= Duration::from_millis(50) {
            self.flush();
        }
    }

    fn flush(&mut self) {
        if !self.buf.is_empty() {
            let entries = std::mem::take(&mut self.buf);
            let _ = self.tx.send(SearchMsg::Chunk {
                id: self.id,
                entries,
            });
        }
        self.last = Instant::now();
    }
}

pub type ServiceResult<T> = Result<T, String>;

fn vp(p: &str) -> VfsPath {
    VfsPath::new(PathBuf::from(p))
}

/// `rx`로 이벤트가 몰려 와도 `interval`마다 한 번만 `on_batch`를 부른다. 이벤트가 오면 `interval`만큼 모은 뒤
/// 그 사이 쌓인 것을 비우고 부르므로, 마지막 이벤트 뒤에는 반드시 한 번 더 불린다. 보내는 쪽이 닫히면 끝난다.
pub fn coalesce<T>(rx: &Receiver<T>, interval: Duration, mut on_batch: impl FnMut()) {
    while rx.recv().is_ok() {
        std::thread::sleep(interval);
        while rx.try_recv().is_ok() {}
        on_batch();
    }
}

/// 서비스가 밖으로 내보내는 수신기들.
pub struct Channels {
    /// 변경된 디렉터리 경로.
    pub dir_changes: Receiver<PathBuf>,
    pub queue_events: Receiver<QueueEvent>,
    /// Look Up / Flatten / Disk Usage 작업이 흘려 보내는 결과.
    pub search_events: Receiver<SearchMsg>,
}

/// 파일 작업과 감시, 작업 큐를 묶은 서비스. 앱 상태로 보관한다.
/// 운영체제의 파일 클립보드. Finder/탐색기와 파일 목록을 주고받는다. 테스트에서는 메모리 구현으로 바꾼다.
pub trait FileClipboard: Send + Sync {
    /// 경로 목록을 파일로 클립보드에 쓴다. 빈 목록이면 클립보드를 비운다.
    fn set_files(&self, paths: &[String]) -> ServiceResult<()>;
    /// 클립보드에 든 파일 경로. 파일이 없으면 빈 목록이다.
    fn get_files(&self) -> ServiceResult<Vec<String>>;
}

/// `clipboard-rs`로 운영체제 클립보드를 쓰는 구현.
pub struct SystemFileClipboard;

impl FileClipboard for SystemFileClipboard {
    fn set_files(&self, paths: &[String]) -> ServiceResult<()> {
        use clipboard_rs::Clipboard;
        let ctx = clipboard_rs::ClipboardContext::new().map_err(|e| e.to_string())?;
        if paths.is_empty() {
            return ctx.clear().map_err(|e| e.to_string());
        }
        ctx.set_files(paths.to_vec()).map_err(|e| e.to_string())
    }

    fn get_files(&self) -> ServiceResult<Vec<String>> {
        use clipboard_rs::Clipboard;
        let ctx = clipboard_rs::ClipboardContext::new().map_err(|e| e.to_string())?;
        // 파일이 아닌 내용이 들어 있으면 오류로 오므로 "파일 없음"으로 본다.
        Ok(ctx.get_files().unwrap_or_default())
    }
}

pub struct Service<T: Trasher> {
    /// 즉시 실행하는 짧은 작업(폴더/파일 만들기, 이름 변경, 충돌 확인).
    ops: Ops<CompositeFs, T>,
    /// 로컬과 아카이브를 함께 다루는 VFS. 큐의 `Ops`와 확장자 설정을 공유한다.
    fs: CompositeFs,
    /// 아카이브 안 파일을 편집 중인 세션들. 세션이 살아 있는 동안 임시 파일의 변경을 아카이브에 되쓴다.
    edits: Mutex<Vec<EditSession>>,
    queue: Queue,
    watcher: Mutex<DirWatcher>,
    /// 실행 중인 검색/순회 작업의 취소 표시.
    searches: Arc<Mutex<HashMap<u32, CancelToken>>>,
    next_search: AtomicU32,
    search_tx: Sender<SearchMsg>,
    file_clipboard: Box<dyn FileClipboard>,
}

impl<T: Trasher + Clone + Send + 'static> Service<T> {
    pub fn new(trasher: T) -> ServiceResult<(Self, Channels)> {
        let (watcher, dir_changes) = DirWatcher::new().map_err(|e| e.to_string())?;
        let fs = CompositeFs::default();
        let (search_tx, search_events) = std::sync::mpsc::channel();
        let (queue, queue_events) = Queue::new(Ops::new(fs.clone(), trasher.clone()));
        Ok((
            Self {
                ops: Ops::new(fs.clone(), trasher),
                fs,
                edits: Mutex::new(Vec::new()),
                queue,
                watcher: Mutex::new(watcher),
                searches: Arc::default(),
                next_search: AtomicU32::new(0),
                search_tx,
                file_clipboard: Box::new(SystemFileClipboard),
            },
            Channels {
                dir_changes,
                queue_events,
                search_events,
            },
        ))
    }

    /// 파일 클립보드 구현을 바꾼다(테스트용).
    #[cfg(test)]
    pub fn with_file_clipboard(mut self, clipboard: Box<dyn FileClipboard>) -> Self {
        self.file_clipboard = clipboard;
        self
    }

    /// 경로 목록을 운영체제 파일 클립보드에 쓴다 (Mod+C/X). 빈 목록이면 비운다.
    pub fn set_clipboard_files(&self, paths: &[String]) -> ServiceResult<()> {
        self.file_clipboard.set_files(paths)
    }

    /// 운영체제 파일 클립보드의 파일 경로 (Mod+V). 지금 없는 경로는 뺀다.
    pub fn clipboard_files(&self) -> ServiceResult<Vec<String>> {
        let mut paths = self.file_clipboard.get_files()?;
        paths.retain(|p| self.fs.stat(&vp(p)).is_ok());
        Ok(paths)
    }

    /// 별도 스레드에서 `work`를 돌리고, 끝나면 `Done`을 보낸다. 작업 id를 돌려준다.
    fn spawn_job(
        &self,
        work: impl FnOnce(u32, &CancelToken, &Sender<SearchMsg>) -> SearchSummaryDto + Send + 'static,
    ) -> u32 {
        let id = self.next_search.fetch_add(1, Ordering::SeqCst) + 1;
        let cancel = CancelToken::new();
        self.searches.lock().unwrap().insert(id, cancel.clone());
        let (tx, searches) = (self.search_tx.clone(), self.searches.clone());
        std::thread::spawn(move || {
            let summary = work(id, &cancel, &tx);
            searches.lock().unwrap().remove(&id);
            let _ = tx.send(SearchMsg::Done { id, summary });
        });
        id
    }

    /// Look Up (FIND-01~04): `root` 아래에서 질의에 맞는 항목을 찾아 `Chunk`로 흘려 보낸다.
    /// 질의가 문법에 어긋나면 위치가 든 오류를, 지원하지 않는 변수는 경고를 돌려준다.
    pub fn start_lookup(&self, root: &str, query: &str) -> ServiceResult<SearchStartDto> {
        let parsed = td_search::parse(query, SystemTime::now()).map_err(|e| e.to_string())?;
        let warnings = parsed.warnings();
        let (fs, root) = (self.fs.clone(), vp(root));
        let opts = SearchOptions {
            extra_zip_exts: self.fs.extra_zip_exts(),
            ..SearchOptions::default()
        };
        let id = self.spawn_job(move |id, cancel, tx| {
            let mut batch = Batcher::new(id, tx.clone());
            let report =
                td_search::search(&fs, &root, &parsed, &opts, cancel, &mut |e| batch.push(e));
            batch.flush();
            SearchSummaryDto {
                visited: report.visited as f64,
                matched: report.matched as f64,
                unreadable: report.unreadable as f64,
                cancelled: report.cancelled,
                warnings: report.warnings,
            }
        });
        Ok(SearchStartDto { id, warnings })
    }

    /// 파일 찾기: 구조화된 조건으로 하위 폴더까지 찾아 `Chunk`로 흘려 보낸다.
    /// 잘못된 정규식 같은 조건 오류는 시작 즉시 오류 문자열로 거부한다.
    pub fn start_find(&self, spec: FindSpecDto) -> ServiceResult<SearchStartDto> {
        let paths = |v: Vec<String>| v.iter().map(|p| vp(p)).collect::<Vec<_>>();
        let finder = td_search::Finder::new(td_search::FindSpec {
            roots: paths(spec.roots),
            only_items: spec.only_items.map(paths),
            follow_symlinks: spec.follow_symlinks,
            exclude_dirs: spec.exclude_dirs,
            max_depth: spec.max_depth,
            mask: spec.mask,
            substring: spec.substring,
            regex: spec.regex,
            exclude_files: spec.exclude_files,
            text: spec.text.map(|t| td_search::TextSpec {
                pattern: t.pattern,
                case_sensitive: t.case_sensitive,
                regex: t.regex,
                invert: t.invert,
            }),
        })?;
        let fs = self.fs.clone();
        let id = self.spawn_job(move |id, cancel, tx| {
            let mut batch = Batcher::new(id, tx.clone());
            let report = finder.run(&fs, cancel, &mut |e| batch.push(e));
            batch.flush();
            SearchSummaryDto {
                visited: report.visited as f64,
                matched: report.matched as f64,
                unreadable: report.unreadable as f64,
                cancelled: report.cancelled,
                warnings: report.warnings,
            }
        });
        Ok(SearchStartDto {
            id,
            warnings: Vec::new(),
        })
    }

    /// Flatten (FIND-05): `root` 아래의 모든 파일을 평면 목록으로 흘려 보낸다.
    pub fn start_flatten(&self, root: &str) -> u32 {
        let (fs, root) = (self.fs.clone(), vp(root));
        self.spawn_job(move |id, cancel, tx| {
            let mut batch = Batcher::new(id, tx.clone());
            let mut matched = 0;
            let report = td_search::flatten(&fs, &root, cancel, &mut |e| {
                matched += 1;
                batch.push(e);
            });
            batch.flush();
            SearchSummaryDto {
                visited: report.visited as f64,
                matched: matched as f64,
                unreadable: report.unreadable as f64,
                cancelled: report.cancelled,
                warnings: Vec::new(),
            }
        })
    }

    /// Analyze Disk Usage (FIND-06): `root`의 하위 항목별 총 크기를 계산해 크기 내림차순 스냅샷으로 흘려 보낸다.
    pub fn start_disk_usage(&self, root: &str, cross_volumes: bool) -> u32 {
        let (fs, root) = (self.fs.clone(), vp(root));
        self.spawn_job(move |id, cancel, tx| {
            let usage = |items: &[UsageItem], done: bool| SearchMsg::Usage {
                id,
                items: items.iter().map(EntryDto::from).collect(),
                done,
                total_bytes: items.iter().map(|i| i.bytes).sum::<u64>() as f64,
                files: items.iter().map(|i| i.files).sum::<u64>() as f64,
            };
            let opts = UsageOptions {
                cross_volumes,
                ..UsageOptions::default()
            };
            let (items, report) = td_search::disk_usage(&fs, &root, &opts, cancel, &mut |snap| {
                let _ = tx.send(usage(snap, false));
            });
            let _ = tx.send(usage(&items, true));
            SearchSummaryDto {
                visited: report.total_files as f64,
                matched: items.len() as f64,
                unreadable: report.unreadable as f64,
                cancelled: report.cancelled,
                warnings: Vec::new(),
            }
        })
    }

    /// 실행 중인 검색/순회 작업을 취소한다. 이미 끝났으면 아무 일도 없다.
    pub fn cancel_search(&self, id: u32) {
        if let Some(c) = self.searches.lock().unwrap().get(&id) {
            c.cancel();
        }
    }

    /// 설정 `file_systems.zip.additional_extensions`를 반영한다.
    pub fn set_archive_extensions(&self, exts: Vec<String>) {
        self.fs.set_extra_zip_exts(exts);
    }

    /// 확장자와 무관하게 파일을 아카이브로 연다 (ARC-04). 아카이브 루트 경로(`파일!`)를 돌려준다.
    pub fn open_as_archive(&self, path: &str) -> ServiceResult<String> {
        self.fs
            .open_as_archive(&vp(path))
            .map(|p| p.to_string())
            .map_err(|e| e.to_string())
    }

    /// 편집기에 넘길 경로를 정한다. 아카이브 안 파일은 임시로 추출하고, 임시 파일이 바뀌면 아카이브에 되쓴다 (ARC-03).
    pub fn prepare_edit(&self, paths: &[String]) -> ServiceResult<Vec<String>> {
        let mut out = Vec::with_capacity(paths.len());
        for p in paths {
            let vp = vp(p);
            if !self.fs.is_archive_path(&vp) {
                out.push(p.clone());
                continue;
            }
            let session =
                start_edit(&self.fs, &vp, Duration::from_millis(300)).map_err(|e| e.to_string())?;
            out.push(session.temp_path().to_string_lossy().into_owned());
            let mut edits = self.edits.lock().unwrap();
            // 임시 파일이 이미 없어진 세션은 정리한다.
            edits.retain(|s| s.temp_path().exists());
            edits.push(session);
        }
        Ok(out)
    }

    /// 복사/이동/휴지통/삭제를 큐에 넣는다. 작업 id를 돌려준다.
    pub fn enqueue(&self, kind: JobKindDto, items: Vec<QueueItemDto>) -> u32 {
        let items = items
            .into_iter()
            .map(|i| Item::new(vp(&i.src), i.dest_dir.as_deref().map(vp), i.policy.into()))
            .collect();
        self.queue.enqueue(JobSpec {
            kind: kind.into(),
            items,
        }) as u32
    }

    /// 압축 (OP-11): `sources`를 `dest_dir`의 ZIP 하나로 묶는 작업을 큐에 넣는다. 이름이 겹치면 번호를 붙인다.
    pub fn enqueue_compress(
        &self,
        sources: Vec<String>,
        dest_dir: &str,
        name: Option<String>,
    ) -> ServiceResult<u32> {
        let mut it = sources.iter().map(|s| vp(s));
        let first = it.next().ok_or("압축할 항목이 없습니다")?;
        let mut item = Item::new(first, Some(vp(dest_dir)), ConflictPolicy::Rename);
        item.extra = it.collect();
        item.name = name;
        Ok(self.queue.enqueue(JobSpec {
            kind: JobKind::Compress,
            items: vec![item],
        }) as u32)
    }

    /// 추출 (OP-11): 아카이브 `src`를 `dest_dir` 아래 새 폴더로 푸는 작업을 큐에 넣는다. 이름이 겹치면 번호를 붙인다.
    pub fn enqueue_extract(&self, src: &str, dest_dir: &str, folder: Option<String>) -> u32 {
        let mut item = Item::new(vp(src), Some(vp(dest_dir)), ConflictPolicy::Rename);
        item.name = folder;
        self.queue.enqueue(JobSpec {
            kind: JobKind::Extract,
            items: vec![item],
        }) as u32
    }

    /// 심볼릭 링크 만들기 (OP-12). 만든 링크의 경로를 돌려주고, 건너뛰었으면 None.
    pub fn symlink(
        &self,
        src: &str,
        dest_dir: &str,
        policy: ConflictDto,
    ) -> ServiceResult<Option<String>> {
        match self
            .ops
            .symlink(&vp(src), &vp(dest_dir), policy.into())
            .map_err(|e| e.to_string())?
        {
            td_ops::Outcome::Done(p) => Ok(Some(p.to_string())),
            td_ops::Outcome::Skipped => Ok(None),
        }
    }

    pub fn queue_jobs(&self) -> Vec<JobDto> {
        self.queue.jobs().iter().map(JobDto::from).collect()
    }

    pub fn queue_pause(&self, id: u32) {
        self.queue.pause(id.into());
    }

    pub fn queue_resume(&self, id: u32) {
        self.queue.resume(id.into());
    }

    pub fn queue_abort(&self, id: u32) {
        self.queue.abort(id.into());
    }

    pub fn queue_clear_finished(&self) {
        self.queue.clear_finished();
    }

    /// 폴더 먼저, 이름순으로 정렬해서 돌려준다.
    pub fn list_dir(&self, path: &str, show_hidden: bool) -> ServiceResult<Vec<EntryDto>> {
        let mut entries = self
            .fs
            .list(&vp(path), &ListOptions { show_hidden })
            .map_err(|e| e.to_string())?;
        sort_entries(&mut entries);
        Ok(entries.iter().map(EntryDto::from).collect())
    }

    pub fn file_info(&self, path: &str) -> ServiceResult<FileInfoDto> {
        self.fs
            .info(&vp(path))
            .map(|i| FileInfoDto::from(&i))
            .map_err(|e| e.to_string())
    }

    pub fn preview(&self, path: &str) -> ServiceResult<PreviewDto> {
        if path.to_ascii_lowercase().ends_with(".cbz") && std::path::Path::new(path).is_file() {
            return Ok(cbz_preview(path).into());
        }
        td_vfs::read_preview(&vp(path), td_vfs::PreviewLimits::default())
            .map(PreviewDto::from)
            .map_err(|e| e.to_string())
    }

    /// `pattern`과 일치하는 이름의 인덱스 (Select Group).
    pub fn glob_filter(&self, pattern: &str, names: &[String]) -> Vec<u32> {
        names
            .iter()
            .enumerate()
            .filter(|(_, n)| td_vfs::glob_match(pattern, n))
            .map(|(i, _)| i as u32)
            .collect()
    }

    pub fn mkdir(&self, path: &str) -> ServiceResult<()> {
        self.ops.mkdir(&vp(path)).map_err(|e| e.to_string())
    }

    pub fn touch(&self, path: &str) -> ServiceResult<()> {
        self.ops.touch(&vp(path)).map_err(|e| e.to_string())
    }

    pub fn detect_conflict(&self, src: &str, dest_dir: &str) -> Option<String> {
        self.ops
            .detect_conflict(&vp(src), &vp(dest_dir))
            .map(|p| p.to_string())
    }

    pub fn rename(&self, path: &str, new_name: &str) -> ServiceResult<String> {
        self.ops
            .rename(&vp(path), new_name)
            .map(|p| p.to_string())
            .map_err(|e| e.to_string())
    }

    pub fn watch(&self, path: &str) -> ServiceResult<()> {
        self.watcher
            .lock()
            .unwrap()
            .watch(Path::new(path))
            .map_err(|e| e.to_string())
    }

    pub fn unwatch(&self, path: &str) -> ServiceResult<()> {
        self.watcher
            .lock()
            .unwrap()
            .unwatch(Path::new(path))
            .map_err(|e| e.to_string())
    }
}

/// 파일 관리자에서 보기 (OP-16). 없는 경로는 실행하지 않는다.
pub fn reveal<L: Launcher>(launch: &Launch<L>, path: &str) -> ServiceResult<()> {
    let meta = std::fs::symlink_metadata(path).map_err(|e| format!("{path}: {e}"))?;
    launch.reveal(path, meta.is_dir())
}

/// 기본 프로그램으로 파일 실행. 없는 경로는 실행하지 않는다.
pub fn open_file<L: Launcher>(launch: &Launch<L>, path: &str) -> ServiceResult<()> {
    std::fs::symlink_metadata(path).map_err(|e| format!("{path}: {e}"))?;
    launch.open(path)
}

/// 설정한 편집기로 열기 (OP-09). 없는 경로가 하나라도 있으면 실행하지 않는다.
pub fn edit<L: Launcher>(launch: &Launch<L>, editor: &str, paths: &[String]) -> ServiceResult<()> {
    for p in paths {
        std::fs::symlink_metadata(p).map_err(|e| format!("{p}: {e}"))?;
    }
    launch.edit(editor, paths)
}

/// F키에 지정한 애플리케이션으로 항목 열기. 없는 경로가 하나라도 있으면 실행하지 않는다.
pub fn launch_app<L: Launcher>(
    launch: &Launch<L>,
    app: &str,
    paths: &[String],
) -> ServiceResult<()> {
    for p in paths {
        std::fs::symlink_metadata(p).map_err(|e| format!("{p}: {e}"))?;
    }
    launch.launch_app(app, paths)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[derive(Clone)]
    struct FakeTrash(PathBuf);
    impl Trasher for FakeTrash {
        fn trash(&self, path: &Path) -> td_ops::Result<()> {
            std::fs::rename(path, self.0.join(path.file_name().unwrap())).unwrap();
            Ok(())
        }
    }

    fn setup() -> (tempfile::TempDir, Service<FakeTrash>, Channels, String) {
        let tmp = tempfile::tempdir().unwrap();
        let bin = tmp.path().join("bin");
        std::fs::create_dir(&bin).unwrap();
        let root = tmp.path().join("root");
        std::fs::create_dir(&root).unwrap();
        let (svc, channels) = Service::new(FakeTrash(bin)).unwrap();
        let root = root.to_string_lossy().into_owned();
        (tmp, svc, channels, root)
    }

    fn wait_finished(svc: &Service<FakeTrash>, id: u32) -> JobDto {
        let end = Instant::now() + Duration::from_secs(5);
        loop {
            let job = svc.queue_jobs().into_iter().find(|j| j.id == id).unwrap();
            if !matches!(
                job.status,
                JobStatusDto::Queued | JobStatusDto::Running | JobStatusDto::Paused
            ) {
                return job;
            }
            assert!(Instant::now() < end, "작업이 끝나지 않았다");
            std::thread::sleep(Duration::from_millis(10));
        }
    }

    fn item(src: &str, dest: Option<&str>, policy: ConflictDto) -> QueueItemDto {
        QueueItemDto {
            src: src.to_string(),
            dest_dir: dest.map(str::to_string),
            policy,
        }
    }

    #[test]
    fn list_dir_sorts_dirs_first_and_filters_hidden() {
        let (_t, svc, _ch, root) = setup();
        svc.mkdir(&format!("{root}/zdir")).unwrap();
        svc.touch(&format!("{root}/a.txt")).unwrap();
        svc.touch(&format!("{root}/.hidden")).unwrap();
        let visible = svc.list_dir(&root, false).unwrap();
        let names: Vec<_> = visible.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, ["zdir", "a.txt"]);
        assert_eq!(visible[0].kind, KindDto::Dir);
        let all = svc.list_dir(&root, true).unwrap();
        assert_eq!(all.len(), 3);
        assert!(all.iter().any(|e| e.hidden && e.name == ".hidden"));
    }

    #[test]
    fn short_ops_report_errors_as_strings() {
        let (_t, svc, _ch, root) = setup();
        let a = format!("{root}/a.txt");
        svc.touch(&a).unwrap();
        assert!(svc.touch(&a).is_err());
        svc.mkdir(&format!("{root}/dest")).unwrap();
        assert_eq!(
            svc.detect_conflict(&a, &root).map(|p| p.replace('\\', "/")),
            Some(a.replace('\\', "/"))
        );
        let renamed = svc.rename(&a, "b.txt").unwrap();
        assert!(renamed.replace('\\', "/").ends_with("root/b.txt"));
        assert!(svc.rename(&renamed, "x/y").is_err());
    }

    #[test]
    fn queue_copies_folder_tree_and_reports_file_progress() {
        let (_t, svc, _ch, root) = setup();
        let dest = format!("{root}/dest");
        svc.mkdir(&dest).unwrap();
        let src = format!("{root}/[이력서]/하위");
        std::fs::create_dir_all(&src).unwrap();
        std::fs::write(format!("{root}/[이력서]/a.pdf"), "a").unwrap();
        std::fs::write(format!("{src}/b.pdf"), "b").unwrap();
        std::fs::write(format!("{src}/.DS_Store"), "x").unwrap();
        let id = svc.enqueue(
            JobKindDto::Copy,
            vec![item(
                &format!("{root}/[이력서]"),
                Some(&dest),
                ConflictDto::Skip,
            )],
        );
        let job = wait_finished(&svc, id);
        assert_eq!(job.status, JobStatusDto::Done);
        assert_eq!((job.files_total, job.files_done), (Some(3), 3));
        assert!(Path::new(&format!("{dest}/[이력서]/하위/b.pdf")).exists());
    }

    #[test]
    fn job_bytes_of_single_file_copy_reach_file_size() {
        let (_t, svc, _ch, root) = setup();
        let dest = format!("{root}/dest");
        svc.mkdir(&dest).unwrap();
        std::fs::write(format!("{root}/big.bin"), vec![1u8; 2 * 1024 * 1024]).unwrap();
        let id = svc.enqueue(
            JobKindDto::Copy,
            vec![item(
                &format!("{root}/big.bin"),
                Some(&dest),
                ConflictDto::Skip,
            )],
        );
        let job = wait_finished(&svc, id);
        assert_eq!(
            (job.bytes_total, job.bytes_done),
            (Some(2097152.0), 2097152.0)
        );
    }

    #[test]
    fn coalesce_batches_a_burst_and_flushes_after_the_last_event() {
        let (tx, rx) = std::sync::mpsc::channel();
        let ended = std::sync::Arc::new(Mutex::new(None::<Instant>));
        let e2 = ended.clone();
        let sender = std::thread::spawn(move || {
            for i in 0..300 {
                tx.send(i).unwrap();
                std::thread::sleep(Duration::from_millis(1));
            }
            *e2.lock().unwrap() = Some(Instant::now());
        });
        let mut batches = 0;
        let mut last_batch = None;
        coalesce(&rx, Duration::from_millis(50), || {
            batches += 1;
            last_batch = Some(Instant::now());
        });
        sender.join().unwrap();
        assert!((1..30).contains(&batches), "알림이 {batches}번 나갔다");
        assert!(last_batch.unwrap() >= ended.lock().unwrap().unwrap());
    }

    #[test]
    fn queue_runs_copy_move_trash_delete_jobs() {
        let (_t, svc, ch, root) = setup();
        let dest = format!("{root}/dest");
        svc.mkdir(&dest).unwrap();
        for n in ["a", "b", "c", "d"] {
            svc.touch(&format!("{root}/{n}")).unwrap();
        }
        let copy = svc.enqueue(
            JobKindDto::Copy,
            vec![item(&format!("{root}/a"), Some(&dest), ConflictDto::Skip)],
        );
        assert_eq!(wait_finished(&svc, copy).status, JobStatusDto::Done);
        assert!(Path::new(&format!("{dest}/a")).exists());
        assert!(Path::new(&format!("{root}/a")).exists());

        let mv = svc.enqueue(
            JobKindDto::Move,
            vec![item(&format!("{root}/b"), Some(&dest), ConflictDto::Skip)],
        );
        assert_eq!(wait_finished(&svc, mv).status, JobStatusDto::Done);
        assert!(!Path::new(&format!("{root}/b")).exists());

        let trash = svc.enqueue(
            JobKindDto::Trash,
            vec![item(&format!("{root}/c"), None, ConflictDto::Skip)],
        );
        assert_eq!(wait_finished(&svc, trash).status, JobStatusDto::Done);
        let del = svc.enqueue(
            JobKindDto::Delete,
            vec![item(&format!("{root}/d"), None, ConflictDto::Skip)],
        );
        assert_eq!(wait_finished(&svc, del).status, JobStatusDto::Done);
        assert!(!Path::new(&format!("{root}/d")).exists());

        // 이벤트가 흘러나온다.
        assert!(ch.queue_events.try_iter().count() > 0);

        // 실패 작업은 오류 요약을 가지고, 끝난 작업은 지울 수 있다.
        let bad = svc.enqueue(
            JobKindDto::Delete,
            vec![item(&format!("{root}/nope"), None, ConflictDto::Skip)],
        );
        let job = wait_finished(&svc, bad);
        assert_eq!(job.status, JobStatusDto::Failed);
        assert_eq!(job.errors.len(), 1);
        svc.queue_clear_finished();
        assert!(svc.queue_jobs().is_empty());
    }

    #[test]
    fn archive_paths_work_through_service_and_queue() {
        let (_t, svc, _ch, root) = setup();
        let zip = format!("{root}/box.zip");
        let mut z = td_archive::ZipEdit::create(Path::new(&zip)).unwrap();
        z.add_file("seed.txt", td_archive::Source::Bytes(b"seed".to_vec()));
        z.commit().unwrap();
        let inside = format!("{zip}!");

        // 목록/정보/충돌 확인/짧은 작업이 `x.zip!/…` 경로를 받는다.
        let listed = svc.list_dir(&inside, false).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].path, format!("{zip}!/seed.txt"));
        svc.mkdir(&format!("{inside}/docs")).unwrap();
        svc.touch(&format!("{inside}/docs/a.txt")).unwrap();
        let renamed = svc
            .rename(&format!("{inside}/docs/a.txt"), "b.txt")
            .unwrap();
        assert_eq!(renamed, format!("{zip}!/docs/b.txt"));
        assert_eq!(
            svc.file_info(&format!("{inside}/docs"))
                .unwrap()
                .child_count,
            Some(1.0)
        );
        std::fs::write(format!("{root}/seed.txt"), "local").unwrap();
        assert_eq!(
            svc.detect_conflict(&format!("{root}/seed.txt"), &inside),
            Some(format!("{zip}!/seed.txt"))
        );

        // 큐: 로컬 → zip 복사, zip → 로컬 복사, zip 안 삭제, zip 안 휴지통은 실패
        std::fs::write(format!("{root}/new.txt"), "n").unwrap();
        let up = svc.enqueue(
            JobKindDto::Copy,
            vec![item(
                &format!("{root}/new.txt"),
                Some(&format!("{inside}/docs")),
                ConflictDto::Skip,
            )],
        );
        assert_eq!(wait_finished(&svc, up).status, JobStatusDto::Done);
        let names = |dir: &str| -> Vec<String> {
            svc.list_dir(dir, true)
                .unwrap()
                .into_iter()
                .map(|e| e.name)
                .collect()
        };
        assert_eq!(names(&format!("{inside}/docs")), ["b.txt", "new.txt"]);

        let out = format!("{root}/out");
        svc.mkdir(&out).unwrap();
        let down = svc.enqueue(
            JobKindDto::Copy,
            vec![item(
                &format!("{inside}/docs"),
                Some(&out),
                ConflictDto::Skip,
            )],
        );
        assert_eq!(wait_finished(&svc, down).status, JobStatusDto::Done);
        assert_eq!(
            std::fs::read_to_string(format!("{out}/docs/new.txt")).unwrap(),
            "n"
        );

        let trash = svc.enqueue(
            JobKindDto::Trash,
            vec![item(
                &format!("{inside}/docs/new.txt"),
                None,
                ConflictDto::Skip,
            )],
        );
        assert_eq!(wait_finished(&svc, trash).status, JobStatusDto::Failed);
        assert!(names(&format!("{inside}/docs")).contains(&"new.txt".to_string()));

        let del = svc.enqueue(
            JobKindDto::Delete,
            vec![item(
                &format!("{inside}/docs/new.txt"),
                None,
                ConflictDto::Skip,
            )],
        );
        assert_eq!(wait_finished(&svc, del).status, JobStatusDto::Done);
        assert_eq!(names(&format!("{inside}/docs")), ["b.txt"]);
    }

    #[test]
    fn additional_zip_extensions_apply_to_the_service() {
        let (_t, svc, _ch, root) = setup();
        let docx = format!("{root}/memo.docx");
        let mut z = td_archive::ZipEdit::create(Path::new(&docx)).unwrap();
        z.add_file("word/a.xml", td_archive::Source::Bytes(b"<a/>".to_vec()));
        z.commit().unwrap();
        // 기본 설정에서는 docx가 아카이브가 아니라 일반 파일이다.
        assert!(svc.list_dir(&format!("{docx}!"), false).is_err());
        svc.set_archive_extensions(vec!["docx".into()]);
        let listed = svc.list_dir(&format!("{docx}!"), false).unwrap();
        assert_eq!(listed[0].name, "word");
        svc.set_archive_extensions(vec![]);
        assert!(svc.list_dir(&format!("{docx}!"), false).is_err());
    }

    #[test]
    fn open_as_archive_makes_any_zip_file_navigable() {
        let (_t, svc, _ch, root) = setup();
        let bin = format!("{root}/data.bin");
        let mut z = td_archive::ZipEdit::create(Path::new(&bin)).unwrap();
        z.add_file("a.txt", td_archive::Source::Bytes(b"a".to_vec()));
        z.commit().unwrap();
        assert!(svc.list_dir(&format!("{bin}!"), false).is_err());
        assert_eq!(svc.open_as_archive(&bin).unwrap(), format!("{bin}!"));
        assert_eq!(
            svc.list_dir(&format!("{bin}!"), false).unwrap()[0].name,
            "a.txt"
        );
        let text = format!("{root}/t.txt");
        std::fs::write(&text, "not an archive").unwrap();
        assert!(svc.open_as_archive(&text).is_err());
    }

    #[test]
    fn editing_an_archive_file_writes_back_through_the_launcher() {
        use std::sync::{Arc, Mutex as StdMutex};
        struct Editor(Arc<StdMutex<Vec<String>>>);
        impl Launcher for Editor {
            fn run(&self, c: &td_launch::Command) -> Result<(), String> {
                // 편집기 fake: 받은 임시 파일을 저장한다.
                for a in &c.args {
                    std::fs::write(a, "edited").map_err(|e| e.to_string())?;
                    self.0.lock().unwrap().push(a.clone());
                }
                Ok(())
            }
        }
        let (_t, svc, _ch, root) = setup();
        let zip = format!("{root}/p.zip");
        let mut z = td_archive::ZipEdit::create(Path::new(&zip)).unwrap();
        z.add_file("d/a.txt", td_archive::Source::Bytes(b"orig".to_vec()));
        z.commit().unwrap();
        let log = Arc::new(StdMutex::new(Vec::new()));
        let launch = Launch::new(Editor(log.clone()), td_launch::Os::Linux);

        let archive_file = format!("{zip}!/d/a.txt");
        let local = format!("{root}/plain.txt");
        std::fs::write(&local, "plain").unwrap();
        let mapped = svc
            .prepare_edit(&[archive_file.clone(), local.clone()])
            .unwrap();
        assert_ne!(
            mapped[0], archive_file,
            "아카이브 안 파일은 임시 경로로 바뀐다"
        );
        assert_eq!(mapped[1], local, "로컬 파일은 그대로다");
        edit(&launch, "code", &mapped).unwrap();
        assert_eq!(log.lock().unwrap().len(), 2);

        let end = Instant::now() + Duration::from_secs(10);
        loop {
            let out = std::process::Command::new("unzip")
                .args(["-p", &zip, "d/a.txt"])
                .output()
                .unwrap();
            if out.stdout == b"edited" {
                break;
            }
            assert!(
                Instant::now() < end,
                "편집 결과가 아카이브에 반영되지 않았다"
            );
            std::thread::sleep(Duration::from_millis(50));
        }
        // 폴더나 아카이브 루트는 편집기로 열 수 없다.
        assert!(svc.prepare_edit(&[format!("{zip}!/d")]).is_err());
        assert!(svc.prepare_edit(&[format!("{zip}!")]).is_err());
    }

    /// 작업 `id`의 메시지를 `Done`까지 모은다.
    fn collect_search(ch: &Channels, id: u32) -> (Vec<EntryDto>, Vec<SearchMsg>, SearchSummaryDto) {
        let mut entries = Vec::new();
        let mut usage = Vec::new();
        let end = Instant::now() + Duration::from_secs(10);
        loop {
            let left = end.saturating_duration_since(Instant::now());
            match ch
                .search_events
                .recv_timeout(left)
                .expect("검색이 끝나지 않았다")
            {
                SearchMsg::Chunk { id: i, entries: e } if i == id => entries.extend(e),
                m @ SearchMsg::Usage { id: i, .. } if i == id => usage.push(m),
                SearchMsg::Done { id: i, summary } if i == id => return (entries, usage, summary),
                _ => {}
            }
        }
    }

    #[test]
    fn start_find_streams_matches() {
        let (_t, svc, ch, root) = setup();
        for (rel, body) in [
            ("a/one.txt", "hello one"),
            ("a/deep/two.txt", "bye"),
            ("b/three.md", "hello three"),
            ("top.txt", "HELLO top"),
        ] {
            let p = format!("{root}/{rel}");
            std::fs::create_dir_all(Path::new(&p).parent().unwrap()).unwrap();
            std::fs::write(&p, body).unwrap();
        }
        let spec = |f: &dyn Fn(&mut FindSpecDto)| {
            let mut s = FindSpecDto {
                roots: vec![root.clone()],
                only_items: None,
                follow_symlinks: false,
                exclude_dirs: String::new(),
                max_depth: None,
                mask: String::new(),
                substring: true,
                regex: false,
                exclude_files: String::new(),
                text: None,
            };
            f(&mut s);
            s
        };
        let names = |s: FindSpecDto| {
            let start = svc.start_find(s).unwrap();
            let (entries, _, summary) = collect_search(&ch, start.id);
            let mut n: Vec<_> = entries.iter().map(|e| e.name.clone()).collect();
            n.sort();
            (n, summary)
        };
        // 하위 폴더까지 마스크에 맞는 파일
        let (n, summary) = names(spec(&|s| s.mask = "*.txt".into()));
        assert_eq!(n, ["one.txt", "top.txt", "two.txt"]);
        assert_eq!((summary.matched, summary.cancelled), (3.0, false));
        // 깊이: 현재 폴더만
        assert_eq!(
            names(spec(&|s| {
                s.mask = "*.txt".into();
                s.max_depth = Some(0);
            }))
            .0,
            ["top.txt"]
        );
        // 파일 안 텍스트(대소문자 무시)
        let (n, _) = names(spec(&|s| {
            s.text = Some(TextSpecDto {
                pattern: "hello".into(),
                case_sensitive: false,
                regex: false,
                invert: false,
            });
        }));
        assert_eq!(n, ["one.txt", "three.md", "top.txt"]);
        // 선택 항목만
        let only = vec![format!("{root}/b")];
        assert_eq!(
            names(spec(&|s| s.only_items = Some(only.clone()))).0,
            ["three.md"]
        );
        // 잘못된 정규식은 시작 즉시 거부
        let err = svc
            .start_find(spec(&|s| {
                s.mask = "(".into();
                s.regex = true;
            }))
            .unwrap_err();
        assert!(err.contains("정규식"), "{err}");
    }

    #[test]
    fn lookup_flatten_and_usage_stream_through_the_service() {
        let (_t, svc, ch, root) = setup();
        for (rel, size) in [
            ("a/one.txt", 10usize),
            ("a/deep/two.txt", 20),
            ("b/three.md", 30),
            ("top.txt", 5),
        ] {
            let p = format!("{root}/{rel}");
            std::fs::create_dir_all(Path::new(&p).parent().unwrap()).unwrap();
            std::fs::write(&p, vec![b'x'; size]).unwrap();
        }

        // Look Up
        let start = svc.start_lookup(&root, "Name endsWith .txt").unwrap();
        assert!(start.warnings.is_empty());
        let (entries, _, summary) = collect_search(&ch, start.id);
        let mut names: Vec<_> = entries.iter().map(|e| e.name.as_str()).collect();
        names.sort();
        assert_eq!(names, ["one.txt", "top.txt", "two.txt"]);
        assert_eq!((summary.matched, summary.cancelled), (3.0, false));
        // 지원하지 않는 변수는 시작 즉시 경고가 오고 결과는 비어 있다
        let start = svc.start_lookup(&root, "UTI is public.image").unwrap();
        assert_eq!(start.warnings.len(), 1);
        let (entries, _, summary) = collect_search(&ch, start.id);
        assert!(entries.is_empty() && summary.warnings == start.warnings);
        // 문법 오류는 위치가 든 문자열
        let err = svc.start_lookup(&root, "Name contains").unwrap_err();
        assert!(err.contains("위치 13"), "{err}");

        // Flatten: 파일만
        let id = svc.start_flatten(&root);
        let (entries, _, summary) = collect_search(&ch, id);
        assert_eq!(entries.len(), 4);
        assert!(entries.iter().all(|e| e.kind != KindDto::Dir));
        assert_eq!(summary.matched, 4.0);

        // Disk Usage: 크기 내림차순, 마지막 스냅샷이 done
        let id = svc.start_disk_usage(&root, false);
        let (_, usage, summary) = collect_search(&ch, id);
        let SearchMsg::Usage {
            items,
            done,
            total_bytes,
            files,
            ..
        } = usage.last().unwrap()
        else {
            panic!("Usage가 아님")
        };
        assert!(*done && !summary.cancelled);
        let got: Vec<(&str, f64)> = items.iter().map(|e| (e.name.as_str(), e.size)).collect();
        assert_eq!(got, [("a", 30.0), ("b", 30.0), ("top.txt", 5.0)]);
        assert_eq!((*total_bytes, *files), (65.0, 4.0));

        // 아카이브 안: 같은 명령이 `x.zip!`에서도 동작한다
        let zip = format!("{root}/pack.zip");
        let mut z = td_archive::ZipEdit::create(Path::new(&zip)).unwrap();
        z.add_file("docs/note.txt", td_archive::Source::Bytes(vec![b'n'; 40]));
        z.add_file("readme.txt", td_archive::Source::Bytes(vec![b'r'; 7]));
        z.commit().unwrap();
        let start = svc.start_lookup(&format!("{zip}!"), "note").unwrap();
        let (entries, _, _) = collect_search(&ch, start.id);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].path, format!("{zip}!/docs/note.txt"));
        let id = svc.start_disk_usage(&format!("{zip}!"), false);
        let (_, usage, _) = collect_search(&ch, id);
        let SearchMsg::Usage { items, .. } = usage.last().unwrap() else {
            panic!()
        };
        assert_eq!(items[0].size, 40.0);
    }

    #[test]
    fn cancel_search_stops_a_running_job() {
        let (_t, svc, ch, root) = setup();
        for d in 0..30 {
            for f in 0..30 {
                let p = format!("{root}/d{d}/f{f}.txt");
                std::fs::create_dir_all(Path::new(&p).parent().unwrap()).unwrap();
                std::fs::write(p, "x").unwrap();
            }
        }
        let id = svc.start_flatten(&root);
        svc.cancel_search(id);
        let (entries, _, summary) = collect_search(&ch, id);
        assert!(summary.cancelled, "취소 요청 뒤에 끝나야 한다");
        assert!(entries.len() < 900, "{}", entries.len());
        // 끝난 작업을 취소해도 아무 일 없다
        svc.cancel_search(id);
        svc.cancel_search(9999);
    }

    #[test]
    fn compress_extract_and_symlink_through_the_service() {
        let (_t, svc, _ch, root) = setup();
        std::fs::create_dir_all(format!("{root}/docs/sub")).unwrap();
        std::fs::write(format!("{root}/docs/sub/a.txt"), "aaa").unwrap();
        std::fs::write(format!("{root}/note.txt"), "note").unwrap();
        let dest = format!("{root}/out");
        svc.mkdir(&dest).unwrap();

        // 압축: 큐 작업, 시스템 unzip으로 무결성 확인, 원본 유지
        let id = svc
            .enqueue_compress(
                vec![format!("{root}/docs"), format!("{root}/note.txt")],
                &dest,
                None,
            )
            .unwrap();
        let job = wait_finished(&svc, id);
        assert_eq!(
            (job.kind, job.status),
            (JobKindDto::Compress, JobStatusDto::Done)
        );
        let zip = format!("{dest}/out.zip"); // 여러 항목은 압축 위치의 폴더 이름
        let unzip = std::process::Command::new("unzip")
            .args(["-tq", &zip])
            .output()
            .unwrap();
        assert!(
            unzip.status.success(),
            "{}",
            String::from_utf8_lossy(&unzip.stdout)
        );
        assert!(Path::new(&format!("{root}/docs/sub/a.txt")).exists());
        // 두 번째는 번호
        let id = svc
            .enqueue_compress(vec![format!("{root}/note.txt")], &dest, None)
            .unwrap();
        wait_finished(&svc, id);
        let id = svc
            .enqueue_compress(vec![format!("{root}/note.txt")], &dest, None)
            .unwrap();
        wait_finished(&svc, id);
        assert!(Path::new(&format!("{dest}/note.zip")).exists());
        assert!(Path::new(&format!("{dest}/note (1).zip")).exists());
        assert_eq!(
            svc.enqueue_compress(vec![], &dest, None),
            Err("압축할 항목이 없습니다".to_string())
        );

        // 추출: 아카이브 옆이 아니라 지정한 폴더 아래 새 폴더
        let target = format!("{root}/unpacked");
        svc.mkdir(&target).unwrap();
        let id = svc.enqueue_extract(&zip, &target, None);
        let job = wait_finished(&svc, id);
        assert_eq!(
            (job.kind, job.status),
            (JobKindDto::Extract, JobStatusDto::Done)
        );
        assert_eq!(
            std::fs::read_to_string(format!("{target}/out/docs/sub/a.txt")).unwrap(),
            "aaa"
        );
        assert_eq!(
            std::fs::read_to_string(format!("{target}/out/note.txt")).unwrap(),
            "note"
        );

        // 링크
        #[cfg(unix)]
        {
            let made = svc
                .symlink(&format!("{root}/note.txt"), &target, ConflictDto::Rename)
                .unwrap();
            assert_eq!(made, Some(format!("{target}/note.txt")));
            assert_eq!(
                std::fs::read_link(format!("{target}/note.txt")).unwrap(),
                Path::new(&format!("{root}/note.txt"))
            );
            assert_eq!(
                svc.symlink(&format!("{root}/note.txt"), &target, ConflictDto::Skip)
                    .unwrap(),
                None
            );
            assert!(svc
                .symlink(&format!("{root}/missing"), &target, ConflictDto::Rename)
                .is_err());
        }
    }

    #[test]
    fn file_info_and_glob_filter() {
        let (_t, svc, _ch, root) = setup();
        svc.touch(&format!("{root}/a.txt")).unwrap();
        std::fs::write(format!("{root}/a.txt"), "hello").unwrap();
        svc.mkdir(&format!("{root}/d")).unwrap();
        svc.touch(&format!("{root}/d/x")).unwrap();
        let f = svc.file_info(&format!("{root}/a.txt")).unwrap();
        assert_eq!(
            (f.name.as_str(), f.kind, f.size),
            ("a.txt", KindDto::File, 5.0)
        );
        assert!(f.modified_ms.is_some() && f.accessed_ms.is_some());
        let d = svc.file_info(&format!("{root}/d")).unwrap();
        assert_eq!((d.kind, d.child_count), (KindDto::Dir, Some(1.0)));
        assert!(svc.file_info(&format!("{root}/nope")).is_err());

        let names: Vec<String> = ["a.txt", "b.md", "C.TXT", "d"].map(String::from).to_vec();
        assert_eq!(svc.glob_filter("*.txt", &names), [0, 2]);
        assert_eq!(svc.glob_filter("nothing*", &names), Vec::<u32>::new());
    }

    #[test]
    fn reveal_and_edit_check_paths_before_launching() {
        use std::cell::RefCell;
        use std::rc::Rc;
        struct Rec(Rc<RefCell<Vec<td_launch::Command>>>);
        impl Launcher for Rec {
            fn run(&self, c: &td_launch::Command) -> Result<(), String> {
                self.0.borrow_mut().push(c.clone());
                Ok(())
            }
        }
        let (_t, svc, _ch, root) = setup();
        svc.touch(&format!("{root}/a.txt")).unwrap();
        svc.mkdir(&format!("{root}/d")).unwrap();
        let log = Rc::new(RefCell::new(Vec::new()));
        let launch = Launch::new(Rec(log.clone()), td_launch::Os::Linux);

        reveal(&launch, &format!("{root}/a.txt")).unwrap();
        reveal(&launch, &format!("{root}/d")).unwrap();
        assert!(reveal(&launch, &format!("{root}/missing")).is_err());
        edit(&launch, "code", &[format!("{root}/a.txt")]).unwrap();
        assert!(edit(
            &launch,
            "code",
            &[format!("{root}/a.txt"), format!("{root}/missing")]
        )
        .is_err());
        assert!(edit(&launch, "", &[format!("{root}/a.txt")]).is_err());

        let log = log.borrow();
        assert_eq!(
            log.len(),
            3,
            "존재하지 않는 경로/빈 편집기는 실행기까지 가지 않는다"
        );
        assert_eq!(log[0].program, "xdg-open");
        assert_eq!(log[0].args, [root.clone()]); // 파일이면 부모 폴더
        assert_eq!(log[1].args, [format!("{root}/d")]);
        assert_eq!((log[2].program.as_str(), log[2].args.len()), ("code", 1));
    }

    #[test]
    fn preview_dto_maps_kinds() {
        let (_t, svc, _ch, root) = setup();
        std::fs::write(format!("{root}/a.txt"), "hello").unwrap();
        std::fs::write(format!("{root}/p.png"), [1u8, 2, 3]).unwrap();
        std::fs::write(format!("{root}/b.bin"), [0u8, 1]).unwrap();
        let t = svc.preview(&format!("{root}/a.txt")).unwrap();
        assert_eq!(
            (t.kind, t.text.as_deref(), t.truncated, t.size),
            (PreviewKindDto::Text, Some("hello"), false, 5.0)
        );
        let i = svc.preview(&format!("{root}/p.png")).unwrap();
        assert_eq!(i.kind, PreviewKindDto::Image);
        assert!(i.data_url.unwrap().starts_with("data:image/png;base64,"));
        assert_eq!(
            svc.preview(&format!("{root}/b.bin")).unwrap().kind,
            PreviewKindDto::Other
        );
        assert_eq!(svc.preview(&root).unwrap().kind, PreviewKindDto::Directory);
        assert!(svc.preview(&format!("{root}/nope")).is_err());
    }

    /// 메모리에만 있는 파일 클립보드(테스트에서 운영체제 클립보드를 건드리지 않는다).
    #[derive(Default)]
    struct MemClipboard(Mutex<Vec<String>>);
    impl FileClipboard for Arc<MemClipboard> {
        fn set_files(&self, paths: &[String]) -> ServiceResult<()> {
            *self.0.lock().unwrap() = paths.to_vec();
            Ok(())
        }
        fn get_files(&self) -> ServiceResult<Vec<String>> {
            Ok(self.0.lock().unwrap().clone())
        }
    }

    fn with_mem_clipboard() -> (tempfile::TempDir, Service<FakeTrash>, String) {
        let (t, svc, _ch, root) = setup();
        (
            t,
            svc.with_file_clipboard(Box::new(Arc::new(MemClipboard::default()))),
            root,
        )
    }

    #[test]
    fn clipboard_files_round_trip_keeps_order_and_korean_names() {
        let (_t, svc, root) = with_mem_clipboard();
        let names = ["b.txt", "한글 파일.txt", "a.txt"];
        let paths: Vec<String> = names.iter().map(|n| format!("{root}/{n}")).collect();
        for p in &paths {
            std::fs::write(p, "x").unwrap();
        }
        svc.set_clipboard_files(&paths).unwrap();
        assert_eq!(
            svc.clipboard_files().unwrap(),
            paths,
            "순서와 한글 이름이 그대로여야 한다"
        );
    }

    #[test]
    fn clipboard_files_drops_paths_that_no_longer_exist() {
        let (_t, svc, root) = with_mem_clipboard();
        let (keep, gone) = (format!("{root}/keep.txt"), format!("{root}/gone.txt"));
        std::fs::write(&keep, "x").unwrap();
        std::fs::write(&gone, "x").unwrap();
        svc.set_clipboard_files(&[gone.clone(), keep.clone()])
            .unwrap();
        std::fs::remove_file(&gone).unwrap();
        assert_eq!(svc.clipboard_files().unwrap(), vec![keep]);
    }

    #[test]
    fn clipboard_files_empty_list_clears() {
        let (_t, svc, root) = with_mem_clipboard();
        let p = format!("{root}/a.txt");
        std::fs::write(&p, "x").unwrap();
        svc.set_clipboard_files(&[p]).unwrap();
        svc.set_clipboard_files(&[]).unwrap();
        assert!(svc.clipboard_files().unwrap().is_empty());
    }

    /// `files`(이름, 내용)를 담은 ZIP을 `dest`에 만든다. `zip` 도구가 없으면 테스트가 실패한다.
    fn make_cbz(dir: &std::path::Path, dest: &str, files: &[(&str, Vec<u8>)]) {
        let src = dir.join("cbz-src");
        std::fs::create_dir_all(&src).unwrap();
        for (name, body) in files {
            std::fs::write(src.join(name), body).unwrap();
        }
        let names: Vec<&str> = files.iter().map(|(n, _)| *n).collect();
        let status = std::process::Command::new("zip")
            .arg("-q")
            .arg(dest)
            .args(&names)
            .current_dir(&src)
            .status()
            .expect("zip 실행 불가");
        assert!(status.success());
        std::fs::remove_dir_all(&src).unwrap();
    }

    #[test]
    fn preview_cbz_shows_first_image() {
        let (t, svc, _ch, root) = setup();
        let page1 = vec![0xFFu8, 0xD8, 0xFF, 1, 2, 3];
        let dest = format!("{root}/book.cbz");
        make_cbz(
            t.path(),
            &dest,
            &[
                ("010.jpg", vec![9, 9]),
                ("002.jpg", page1.clone()),
                ("notes.txt", b"hi".to_vec()),
            ],
        );
        let p = svc.preview(&dest).unwrap();
        assert_eq!(p.kind, PreviewKindDto::Image);
        assert!(!p.truncated);
        // 첫 쪽(002)의 내용이어야 한다: 010.jpg나 txt가 아니라 002.jpg의 바이트를 data URL로 만든 것과 같다.
        assert_eq!(p.data_url, td_vfs::image_data_url("002.jpg", &page1));
        assert!(p.data_url.unwrap().starts_with("data:image/jpeg;base64,"));

        // 확장자 대소문자는 무시한다.
        let upper = format!("{root}/BOOK.CBZ");
        std::fs::rename(&dest, &upper).unwrap();
        assert_eq!(svc.preview(&upper).unwrap().kind, PreviewKindDto::Image);
    }

    #[test]
    fn preview_cbz_without_image_or_not_a_zip_is_other() {
        let (t, svc, _ch, root) = setup();
        let none = format!("{root}/text.cbz");
        make_cbz(t.path(), &none, &[("a.txt", b"hi".to_vec())]);
        let p = svc.preview(&none).unwrap();
        assert_eq!((p.kind, p.data_url), (PreviewKindDto::Other, None));
        assert!(p.size > 0.0);

        let broken = format!("{root}/broken.cbz");
        std::fs::write(&broken, "이건 ZIP이 아니다").unwrap();
        let p = svc.preview(&broken).unwrap();
        assert_eq!((p.kind, p.data_url), (PreviewKindDto::Other, None));
    }

    #[test]
    fn preview_cbz_too_large_image_is_truncated_without_data() {
        let (t, svc, _ch, root) = setup();
        let dest = format!("{root}/big.cbz");
        let big = vec![0u8; 10 * 1024 * 1024 + 1];
        make_cbz(t.path(), &dest, &[("001.png", big)]);
        let p = svc.preview(&dest).unwrap();
        assert_eq!(p.kind, PreviewKindDto::Image);
        assert!(p.truncated);
        assert_eq!(p.data_url, None);
        assert_eq!(p.size, (10 * 1024 * 1024 + 1) as f64);
    }

    #[test]
    fn preview_dto_maps_video_without_data() {
        let (_t, svc, _ch, root) = setup();
        std::fs::write(format!("{root}/v.mp4"), [1u8, 2, 3, 4]).unwrap();
        let v = svc.preview(&format!("{root}/v.mp4")).unwrap();
        assert_eq!(
            (v.kind, v.data_url.is_none(), v.size),
            (PreviewKindDto::Video, true, 4.0)
        );
    }

    #[test]
    fn preview_dto_maps_audio() {
        let (_t, svc, _ch, root) = setup();
        std::fs::write(format!("{root}/s.mp3"), [1u8, 2, 3]).unwrap();
        let a = svc.preview(&format!("{root}/s.mp3")).unwrap();
        assert_eq!(a.kind, PreviewKindDto::Audio);
        assert!(!a.truncated);
        assert!(a.data_url.unwrap().starts_with("data:audio/mpeg;base64,"));
    }

    /// 디스크 없이 메모리에서 10만 항목 DTO를 만들어 IPC로 나가는 JSON의 크기와 직렬화 시간을 잰다.
    /// 값은 `cargo test -p twin-deck-desktop --release large_dir_100k_dto_json -- --nocapture`로 볼 수 있다.
    /// 시간은 검사하지 않고(측정과 판정은 docs/m2-benchmark.md) 결과의 정확성만 확인한다.
    #[test]
    fn large_dir_100k_dto_json() {
        const N: usize = 100_000;
        let entries: Vec<EntryDto> = (0..N)
            .map(|i| EntryDto {
                name: format!("item-{i:06}"),
                path: format!("/tmp/big/item-{i:06}"),
                kind: if i % 100 == 0 {
                    KindDto::Dir
                } else {
                    KindDto::File
                },
                size: (i * 37) as f64,
                modified_ms: Some(1_780_000_000_000.0 + i as f64),
                created_ms: Some(1_780_000_000_000.0),
                mode: Some(0o644),
                hidden: false,
            })
            .collect();
        let t = std::time::Instant::now();
        let json = serde_json::to_string(&entries).unwrap();
        let ser_ms = t.elapsed().as_secs_f64() * 1000.0;
        let t = std::time::Instant::now();
        let back: Vec<EntryDto> = serde_json::from_str(&json).unwrap();
        let de_ms = t.elapsed().as_secs_f64() * 1000.0;
        eprintln!(
            "large_dir_100k_dto_json: entries={N} json_bytes={} serialize={ser_ms:.0}ms deserialize={de_ms:.0}ms",
            json.len()
        );
        assert_eq!(back.len(), N);
        assert_eq!(back[12_345], entries[12_345]);
    }

    #[test]
    fn watch_forwards_directory_changes() {
        let (_t, svc, ch, root) = setup();
        svc.watch(&root).unwrap();
        std::thread::sleep(Duration::from_millis(400));
        while ch.dir_changes.try_recv().is_ok() {}
        svc.touch(&format!("{root}/x")).unwrap();
        let got = ch.dir_changes.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(got, PathBuf::from(&root));
        svc.unwatch(&root).unwrap();
    }
}
