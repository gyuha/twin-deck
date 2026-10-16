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
use td_terminal::{TermEvent, Terminals};
use td_vfs::{sort_entries, Entry, EntryKind, ListOptions, Vfs, VfsPath};
use td_watch::DirWatcher;

use crate::epub::EpubInfoDto;

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
    /// 심볼릭 링크이고 그 대상(링크를 끝까지 따라간 곳)이 폴더이면 true. 링크가 아니거나 대상이 파일·없음이면 false.
    /// 종류(`kind`)는 그대로 링크라서, 이 값은 "폴더처럼 들어갈 수 있는가"만 알려 준다.
    pub link_is_dir: bool,
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
            link_is_dir: e.kind == EntryKind::Symlink
                && (e.link_is_dir || std::fs::metadata(e.path.as_path()).is_ok_and(|m| m.is_dir())),
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

/// 이 크기를 넘는 압축 파일은 목록을 읽지 않는다(tar 계열은 목록을 만들려면 전체를 훑어야 한다).
const ARCHIVE_PREVIEW_MAX_BYTES: u64 = 512 * 1024 * 1024;
/// 미리보기 트리의 최대 줄 수. 넘으면 앞쪽만 보이고 `truncated`가 켜진다.
const ARCHIVE_PREVIEW_MAX_LINES: usize = 2000;

/// 압축 파일(이름으로 형식을 알 수 있는 것)의 미리보기: 안의 항목을 폴더 미리보기와 같은 가지 트리 텍스트로 보여 준다.
/// 압축 파일이 아니면 None(일반 미리보기로 간다). 이름은 압축인데 열 수 없거나 너무 크면 "기타"(종류와 크기)다.
const DIR_PREVIEW_MAX_DEPTH: usize = 3;
const DIR_PREVIEW_MAX_LINES: usize = 200;

/// 폴더 미리보기: 하위 항목을 `├── └── │` 가지가 있는 ASCII 트리로 만든다(폴더 먼저, 이름순).
/// 깊이·줄 수 상한을 넘으면 `truncated`. 읽을 수 없는 폴더는 `None`(기존 미리보기로 넘긴다).
fn dir_preview(path: &str) -> Option<td_vfs::Preview> {
    fn walk(
        dir: &std::path::Path,
        prefix: &str,
        depth: usize,
        lines: &mut Vec<String>,
        truncated: &mut bool,
    ) {
        let Ok(rd) = std::fs::read_dir(dir) else {
            return;
        };
        let mut items: Vec<(bool, String)> = rd
            .flatten()
            .map(|e| {
                let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
                (is_dir, e.file_name().to_string_lossy().into_owned())
            })
            .collect();
        items.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
        let n = items.len();
        for (i, (is_dir, name)) in items.into_iter().enumerate() {
            if lines.len() >= DIR_PREVIEW_MAX_LINES {
                *truncated = true;
                return;
            }
            let last = i + 1 == n;
            lines.push(format!(
                "{prefix}{}{name}{}",
                if last { "└── " } else { "├── " },
                if is_dir { "/" } else { "" }
            ));
            if is_dir {
                if depth + 1 >= DIR_PREVIEW_MAX_DEPTH {
                    if std::fs::read_dir(dir.join(&name))
                        .map(|mut r| r.next().is_some())
                        .unwrap_or(false)
                    {
                        *truncated = true;
                    }
                } else {
                    let next = format!("{prefix}{}", if last { "    " } else { "│   " });
                    walk(&dir.join(&name), &next, depth + 1, lines, truncated);
                }
            }
        }
    }
    let p = std::path::Path::new(path);
    if !p.is_dir() {
        return None;
    }
    let mut lines = Vec::new();
    let mut truncated = false;
    walk(p, "", 0, &mut lines, &mut truncated);
    let mut text = if lines.is_empty() {
        "(빈 폴더)".to_string()
    } else {
        lines.join("\n")
    };
    text.push('\n');
    Some(td_vfs::Preview {
        kind: td_vfs::PreviewKind::Text,
        text: Some(text),
        truncated,
        size: 0,
        data_url: None,
    })
}

fn archive_preview(path: &str, extra_zip_exts: &[String]) -> Option<td_vfs::Preview> {
    let name = std::path::Path::new(path).file_name()?.to_string_lossy();
    td_archive::kind_for_name(&name, extra_zip_exts)?;
    let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    let other = td_vfs::Preview {
        kind: td_vfs::PreviewKind::Other,
        text: None,
        truncated: false,
        size,
        data_url: None,
    };
    if size > ARCHIVE_PREVIEW_MAX_BYTES {
        return Some(other);
    }
    let Ok(archive) = td_archive::Archive::open(std::path::Path::new(path), extra_zip_exts) else {
        return Some(other);
    };
    let paths: Vec<(&str, bool)> = archive
        .entries()
        .iter()
        .map(|e| (e.name.as_str(), e.is_dir))
        .collect();
    let (lines, truncated) = archive_tree_lines(&paths, ARCHIVE_PREVIEW_MAX_LINES);
    let mut text = if lines.is_empty() {
        "(빈 압축 파일)".to_string()
    } else {
        lines.join("\n")
    };
    text.push('\n');
    Some(td_vfs::Preview {
        kind: td_vfs::PreviewKind::Text,
        text: Some(text),
        truncated,
        size,
        data_url: None,
    })
}

/// 압축 미리보기 트리의 최대 깊이. 이보다 깊은 경로는 이 깊이에서 `…` 하나로 줄인다(깊은 중첩 트리를 만들면 해제할 때 재귀가 스택을 넘긴다).
const ARCHIVE_TREE_MAX_DEPTH: usize = 32;

/// 압축 안의 경로 목록을 폴더 미리보기와 같은 `├── └── │` 가지 트리 줄로 만든다(폴더 먼저, 이름순).
/// 압축에 폴더 항목이 따로 없어도 경로에서 폴더를 만든다. 줄 수가 `max_lines`를 넘으면 거기서 멈추고 `true`를 돌려준다.
fn archive_tree_lines(paths: &[(&str, bool)], max_lines: usize) -> (Vec<String>, bool) {
    use std::collections::{BTreeMap, BTreeSet};
    #[derive(Default)]
    struct Node {
        dirs: BTreeMap<String, Node>,
        files: BTreeSet<String>,
    }
    fn walk(node: &Node, prefix: &str, max: usize, lines: &mut Vec<String>, truncated: &mut bool) {
        let n = node.dirs.len() + node.files.len();
        let folders = node.dirs.iter().map(|(name, child)| (name, Some(child)));
        let files = node.files.iter().map(|name| (name, None));
        for (i, (name, child)) in folders.chain(files).enumerate() {
            if lines.len() >= max {
                *truncated = true;
                return;
            }
            let last = i + 1 == n;
            lines.push(format!(
                "{prefix}{}{name}{}",
                if last { "└── " } else { "├── " },
                if child.is_some() { "/" } else { "" }
            ));
            if let Some(child) = child {
                let next = format!("{prefix}{}", if last { "    " } else { "│   " });
                walk(child, &next, max, lines, truncated);
                if *truncated {
                    return;
                }
            }
        }
    }
    let mut root = Node::default();
    for (full, is_dir) in paths {
        let parts: Vec<&str> = full
            .trim_matches('/')
            .split('/')
            .filter(|p| !p.is_empty())
            .collect();
        let too_deep = parts.len() > ARCHIVE_TREE_MAX_DEPTH;
        let kept = if too_deep {
            &parts[..ARCHIVE_TREE_MAX_DEPTH - 1]
        } else {
            &parts[..]
        };
        let Some((last, dirs)) = (if too_deep {
            Some((&"…", kept))
        } else {
            kept.split_last()
        }) else {
            continue;
        };
        let mut node = &mut root;
        for part in dirs {
            node = node.dirs.entry((*part).to_string()).or_default();
        }
        if *is_dir && !too_deep {
            node.dirs.entry((*last).to_string()).or_default();
        } else {
            node.files.insert((*last).to_string());
        }
    }
    let mut lines = Vec::new();
    let mut truncated = false;
    walk(&root, "", max_lines, &mut lines, &mut truncated);
    (lines, truncated)
}

/// cbz(이미지를 ZIP으로 묶은 만화 파일)의 미리보기: 안의 첫 이미지. 이미지가 없거나 ZIP이 아니면 "기타"(종류와 크기)다.
fn cbz_preview(path: &str, limit: u64) -> td_vfs::Preview {
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

/// `write_text_file`이 쓰기 전에 확인할 파일 상태(편집을 시작할 때 본 값). 시각은 epoch 밀리초.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ExpectedFileDto {
    pub size: f64,
    pub modified_ms: Option<f64>,
}

/// `write_text_file`의 결과. `saved`가 false이면 파일이 기대와 달라 쓰지 않은 것이고, 크기·시각은 지금 파일의 값이다.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct WriteTextResultDto {
    pub saved: bool,
    pub size: f64,
    pub modified_ms: Option<f64>,
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
            link_is_dir: false,
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

/// 이름을 조합형으로 고친 결과의 개수. 실패한 것이 있으면 첫 이유를 함께 담는다.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, Type)]
pub struct NormalizeResultDto {
    /// 고친 항목 수.
    pub renamed: u32,
    /// 같은 조합형 이름의 다른 항목이 있어 건드리지 않은 수.
    pub conflicts: u32,
    /// 이름을 바꾸지 못한 수.
    pub failed: u32,
    /// 바꾸지 못한 첫 항목의 이유.
    pub first_error: Option<String>,
}

impl From<td_ops::NormalizeReport> for NormalizeResultDto {
    fn from(r: td_ops::NormalizeReport) -> Self {
        Self {
            renamed: r.renamed.len() as u32,
            conflicts: r.conflicts.len() as u32,
            failed: r.failed.len() as u32,
            first_error: r.failed.first().map(|(_, e)| e.clone()),
        }
    }
}

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
    /// 내장 터미널의 출력과 종료.
    pub terminal_events: Receiver<TermEvent>,
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

/// 클립보드로 복사할 이미지의 최대 크기. 이보다 크면 메모리를 아끼려고 복사하지 않는다.
const COPY_IMAGE_MAX_BYTES: u64 = 256 * 1024 * 1024;

/// 운영체제 클립보드에 이미지 하나를 넣는 곳. 테스트는 실제 클립보드 대신 가짜를 주입한다.
pub trait ImageClipboard: Send + Sync {
    fn set_image(&self, image: clipboard_rs::RustImageData) -> ServiceResult<()>;
}

/// `clipboard-rs`로 운영체제 클립보드에 이미지를 쓰는 구현.
pub struct SystemImageClipboard;

impl ImageClipboard for SystemImageClipboard {
    fn set_image(&self, image: clipboard_rs::RustImageData) -> ServiceResult<()> {
        use clipboard_rs::Clipboard;
        let ctx = clipboard_rs::ClipboardContext::new().map_err(|e| e.to_string())?;
        ctx.set_image(image).map_err(|e| e.to_string())
    }
}

/// 파일 맨 앞 4바이트가 `%PDF`인가. 열지 못하거나 짧으면 아니다.
fn starts_with_pdf_header(path: &str) -> bool {
    use std::io::Read;
    let mut head = [0u8; 4];
    std::fs::File::open(path)
        .and_then(|mut f| f.read_exact(&mut head))
        .is_ok()
        && &head == b"%PDF"
}

/// 접속할 사람에게 알려 줄 주소. `0.0.0.0`(모든 주소 수신)은 접속 주소로 쓸 수 없으므로 이 컴퓨터가 네트워크로 나갈 때 쓰는
/// 주소(LAN 주소)로 바꿔 보인다. 알아내지 못하면(오프라인 등) 받은 그대로 둔다.
fn reachable_address(addr: std::net::SocketAddr) -> String {
    if addr.ip().is_unspecified() {
        if let Some(ip) = primary_lan_ip(addr.is_ipv6()) {
            return std::net::SocketAddr::new(ip, addr.port()).to_string();
        }
    }
    addr.to_string()
}

/// 라우팅 표로 정해지는 대표 LAN 주소. UDP 소켓을 연결만 하고 패킷은 보내지 않는다.
fn primary_lan_ip(v6: bool) -> Option<std::net::IpAddr> {
    let (bind, probe) = if v6 {
        ("[::]:0", "[2001:4860:4860::8888]:80")
    } else {
        ("0.0.0.0:0", "8.8.8.8:80")
    };
    let socket = std::net::UdpSocket::bind(bind).ok()?;
    socket.connect(probe).ok()?;
    let ip = socket.local_addr().ok()?.ip();
    (!ip.is_unspecified()).then_some(ip)
}

/// 원격 서버 항목으로 세션을 열어 레지스트리에 넣고, 패널이 이동할 루트 경로(`sftp://<id>/..`)를 돌려준다(ADR-0019).
/// 이미 열려 있으면 다시 접속하지 않고 같은 연결을 쓴다. 블로킹이라 호출하는 쪽이 UI 스레드를 피해야 한다.
pub fn connect_remote<S: td_remote::SecretStore>(
    registry: &td_archive::RemoteRegistry,
    target: &td_remote::RemoteTarget,
    password: Option<String>,
    remember: bool,
    secrets: &S,
    opener: td_remote::SessionOpener<'_>,
) -> Result<String, td_remote::RemoteError> {
    let id = target.id();
    let proto = match target.protocol {
        td_remote::Protocol::Sftp => td_vfs::RemoteProto::Sftp,
        td_remote::Protocol::Ftp => td_vfs::RemoteProto::Ftp,
    };
    if let Some(session) = registry.get(&id) {
        let root = match target.base_dir.trim() {
            "" => session.home()?,
            dir => dir.to_string(),
        };
        return Ok(td_vfs::remote_url(proto, &id, &root));
    }
    let (session, root) = td_remote::open_session(target, password, remember, secrets, opener)?;
    registry.insert(&id, session);
    Ok(td_vfs::remote_url(proto, &id, &root))
}

/// 내장 서버(Twin Deck Remote)의 비밀번호를 담는 키체인 계정 이름.
pub const REMOTE_SERVER_SECRET_KEY: &str = "twindeck-remote-server";

/// 내장 서버의 호스트키 파일 이름. 앱 데이터 폴더(`state.json` 옆)에 둔다.
pub const REMOTE_SERVER_HOST_KEY_FILE: &str = "remote_server_host_key";

/// 내장 서버 상태. 비밀번호 값은 어디에도 담지 않고, 설정됐는지(`has_password`)만 알린다.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RemoteServerStatus {
    pub running: bool,
    /// 수신 중인 주소(`host:port`). 꺼져 있으면 비어 있다.
    pub addresses: Vec<String>,
    /// 호스트키 지문. 꺼져 있으면 None.
    pub fingerprint: Option<String>,
    pub has_password: bool,
    /// 마지막 켜기 실패의 사람이 읽을 사유. 켜는 데 성공하거나 끄면 지운다.
    pub last_error: Option<String>,
}

#[derive(Default)]
struct RemoteServerState {
    handle: Option<td_remote::server::ServerHandle>,
    last_error: Option<String>,
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
    /// 폴더 용량을 계산 중인 경로별 취소 표시(`dir_size`).
    dir_sizes: Mutex<HashMap<String, CancelToken>>,
    next_search: AtomicU32,
    search_tx: Sender<SearchMsg>,
    file_clipboard: Box<dyn FileClipboard>,
    image_clipboard: Box<dyn ImageClipboard>,
    /// 이미지·PDF·사운드 미리보기의 파일 크기 한도. 설정(`preview.*_max_mb`)을 따라 바뀐다.
    preview_limits: Mutex<td_vfs::PreviewLimits>,
    /// (시험) 디스크 PDF를 읽지 않고 파일 주소로 열게 한다(`preview.pdf_direct`).
    pdf_direct: std::sync::atomic::AtomicBool,
    /// 시스템 아이콘 캐시: (소스 키, 한 변 픽셀) → 데이터 주소(얻지 못했으면 None). 경로 키가 쌓이지 않게 `ICON_CACHE_MAX`를 넘으면 비운다.
    icons: Mutex<HashMap<(String, u32), Option<String>>>,
    /// 내장 터미널의 pty 세션들.
    terminals: Terminals,
    /// 원격 셸 세션들(번호는 `terminals`와 같은 번호 공간). 출력·종료는 같은 `terminal_events`로 흐른다.
    remote_shells: Arc<Mutex<HashMap<u32, Arc<Mutex<td_remote::ShellSession>>>>>,
    /// SFTP 연결 id → 접속 정보. 원격 셸을 열 때 쓴다. 비밀번호가 들어 있어 메모리에만 두고 디스크·로그에 쓰지 않는다.
    remote_logins: Mutex<HashMap<String, td_remote::SftpConfig>>,
    /// 내장 SSH/SFTP 서버(Twin Deck Remote).
    remote_server: Mutex<RemoteServerState>,
}

/// 시스템 아이콘 캐시의 최대 항목 수.
const ICON_CACHE_MAX: usize = 512;

/// 시스템 아이콘을 얻을 곳(소유 값). 프런트의 `lib/systemIcons.ts`가 같은 규칙으로 요청 키를 만든다 — 한쪽을 바꾸면 다른 쪽도 맞춘다.
#[derive(Debug, Clone, PartialEq, Eq)]
enum IconSource {
    Folder,
    Extension(String),
    Path(PathBuf),
}

impl IconSource {
    fn key(&self) -> String {
        match self {
            IconSource::Folder => "dir".into(),
            IconSource::Extension(e) => format!("ext:{e}"),
            IconSource::Path(p) => format!("path:{}", p.display()),
        }
    }
}

/// 디스크 위 파일 중 자기 아이콘을 가진 확장자(Windows). 프런트의 `lib/systemIcons.ts`와 같은 목록이다.
const OWN_ICON_EXTS: [&str; 5] = ["exe", "lnk", "ico", "scr", "cur"];

/// 항목의 시스템 아이콘 소스. 폴더는 일반 폴더 아이콘이고(macOS의 디스크 위 `.app` 번들은 자기 아이콘), 파일은 이름의 확장자(소문자)로 종류 아이콘을 얻는다
/// (Windows는 디스크 위 `exe`·`lnk`·`ico` 같은 자기 아이콘이 있는 파일만 경로로 얻는다).
/// 압축 안 항목(`x.zip!/a.txt`)은 실제 파일이 아니므로 늘 확장자다. 점으로 시작하는 이름(`.bashrc`)은 확장자가 없다.
fn icon_source(path: &str, is_dir: bool, in_archive: bool) -> IconSource {
    icon_source_with(
        path,
        is_dir,
        in_archive,
        cfg!(target_os = "macos"),
        cfg!(windows),
    )
}

/// `icon_source`의 규칙. `mac_apps`는 `.app` 폴더를 자기 아이콘으로, `own_icons`는 `OWN_ICON_EXTS` 파일을 자기 아이콘으로 얻을지다(OS별로 켠다).
fn icon_source_with(
    path: &str,
    is_dir: bool,
    in_archive: bool,
    mac_apps: bool,
    own_icons: bool,
) -> IconSource {
    let name = path.rsplit(['/', '\\']).next().unwrap_or(path);
    if is_dir {
        let app = name.to_ascii_lowercase().ends_with(".app");
        if mac_apps && app && !in_archive && Path::new(path).is_dir() {
            return IconSource::Path(PathBuf::from(path));
        }
        return IconSource::Folder;
    }
    match name.rfind('.') {
        Some(i) if i > 0 => {
            let ext = td_icons::normalize_ext(&name[i + 1..]);
            if own_icons
                && !in_archive
                && OWN_ICON_EXTS.contains(&ext.as_str())
                && Path::new(path).is_file()
            {
                return IconSource::Path(PathBuf::from(path));
            }
            IconSource::Extension(ext)
        }
        _ => IconSource::Extension(String::new()),
    }
}

/// 설정의 MB 한도를 바이트로. 0은 제한 없음이다.
fn mb_limit(mb: u32) -> u64 {
    if mb == 0 {
        u64::MAX
    } else {
        u64::from(mb) * 1024 * 1024
    }
}

impl<T: Trasher + Clone + Send + 'static> Service<T> {
    pub fn new(trasher: T) -> ServiceResult<(Self, Channels)> {
        let (watcher, dir_changes) = DirWatcher::new().map_err(|e| e.to_string())?;
        let fs = CompositeFs::default();
        let (search_tx, search_events) = std::sync::mpsc::channel();
        let (queue, queue_events) = Queue::new(Ops::new(fs.clone(), trasher.clone()));
        let (terminals, terminal_events) = Terminals::new();
        Ok((
            Self {
                ops: Ops::new(fs.clone(), trasher),
                fs,
                edits: Mutex::new(Vec::new()),
                queue,
                watcher: Mutex::new(watcher),
                searches: Arc::default(),
                dir_sizes: Mutex::new(HashMap::new()),
                next_search: AtomicU32::new(0),
                search_tx,
                file_clipboard: Box::new(SystemFileClipboard),
                image_clipboard: Box::new(SystemImageClipboard),
                preview_limits: Mutex::new(td_vfs::PreviewLimits::default()),
                pdf_direct: std::sync::atomic::AtomicBool::new(false),
                icons: Mutex::new(HashMap::new()),
                terminals,
                remote_shells: Arc::default(),
                remote_logins: Mutex::new(HashMap::new()),
                remote_server: Mutex::new(RemoteServerState::default()),
            },
            Channels {
                dir_changes,
                queue_events,
                search_events,
                terminal_events,
            },
        ))
    }

    /// 열린 원격(SFTP·FTP) 세션 레지스트리. 연결하면 세션을 넣고 끊으면 뺀다(ADR-0019).
    pub fn remote_registry(&self) -> td_archive::RemoteRegistry {
        self.fs.remote_registry()
    }

    fn remote_server_status_of<S: td_remote::SecretStore>(
        state: &RemoteServerState,
        secrets: &S,
    ) -> RemoteServerStatus {
        let has_password = secrets
            .get(REMOTE_SERVER_SECRET_KEY)
            .ok()
            .flatten()
            .is_some_and(|p| !p.is_empty());
        RemoteServerStatus {
            running: state.handle.is_some(),
            addresses: state
                .handle
                .iter()
                .map(|h| reachable_address(h.local_addr))
                .collect(),
            fingerprint: state.handle.as_ref().map(|h| h.fingerprint.clone()),
            has_password,
            last_error: state.last_error.clone(),
        }
    }

    /// 내장 서버를 켠다. 이미 켜져 있으면 설정을 바꿔 다시 켠다. `root`나 비밀번호가 비었으면 거부한다.
    /// 실패하면 그 사유를 `last_error`에 남기고 오류로 돌려준다. 블로킹이라 UI 스레드를 피해야 한다.
    pub fn remote_server_start<S: td_remote::SecretStore>(
        &self,
        cfg: &td_config::RemoteServerConfig,
        host_key_path: &Path,
        secrets: &S,
    ) -> ServiceResult<RemoteServerStatus> {
        let mut state = self.remote_server.lock().unwrap();
        let result = (|| {
            let root = cfg.root.trim();
            if root.is_empty() {
                return Err("공유할 루트 폴더가 비어 있어 서버를 켤 수 없습니다".to_string());
            }
            let password = secrets
                .get(REMOTE_SERVER_SECRET_KEY)
                .map_err(|e| format!("비밀번호를 읽지 못했습니다: {e}"))?
                .unwrap_or_default();
            if password.is_empty() {
                return Err("비밀번호가 설정되지 않아 서버를 켤 수 없습니다".to_string());
            }
            // 같은 포트를 다시 열 수 있게 먼저 닫는다.
            if let Some(old) = state.handle.take() {
                old.stop();
            }
            td_remote::server::start(td_remote::server::ServerConfig {
                bind: cfg.bind.clone(),
                port: cfg.port,
                root: PathBuf::from(root),
                allow_write: cfg.allow_write,
                allow_shell: cfg.allow_shell,
                user: cfg.user.clone(),
                password,
                host_key_path: host_key_path.to_path_buf(),
            })
            .map_err(|e| format!("서버를 켜지 못했습니다: {e}"))
        })();
        match result {
            Ok(handle) => {
                state.handle = Some(handle);
                state.last_error = None;
                Ok(Self::remote_server_status_of(&state, secrets))
            }
            Err(e) => {
                state.last_error = Some(e.clone());
                Err(e)
            }
        }
    }

    /// 내장 서버를 끈다. 꺼져 있어도 성공이다.
    pub fn remote_server_stop<S: td_remote::SecretStore>(&self, secrets: &S) -> RemoteServerStatus {
        let mut state = self.remote_server.lock().unwrap();
        if let Some(h) = state.handle.take() {
            h.stop();
        }
        state.last_error = None;
        Self::remote_server_status_of(&state, secrets)
    }

    pub fn remote_server_status<S: td_remote::SecretStore>(
        &self,
        secrets: &S,
    ) -> RemoteServerStatus {
        Self::remote_server_status_of(&self.remote_server.lock().unwrap(), secrets)
    }

    /// 내장 서버의 비밀번호를 키체인에 저장한다. 빈 문자열이면 지운다. 켜져 있는 서버는 다음에 켤 때부터 새 값을 쓴다.
    pub fn set_remote_server_password<S: td_remote::SecretStore>(
        &self,
        password: &str,
        secrets: &S,
    ) -> ServiceResult<RemoteServerStatus> {
        if password.is_empty() {
            secrets.delete(REMOTE_SERVER_SECRET_KEY)
        } else {
            secrets.set(REMOTE_SERVER_SECRET_KEY, password)
        }
        .map_err(|e| format!("비밀번호를 저장하지 못했습니다: {e}"))?;
        Ok(self.remote_server_status(secrets))
    }

    /// `cwd` 폴더에서 `shell`(설정 `environment.terminal`)로 고른 셸을 pty로 연다. 돌려주는 값은 세션 번호다.
    pub fn terminal_open(
        &self,
        shell: &str,
        cwd: &str,
        cols: u32,
        rows: u32,
    ) -> ServiceResult<u32> {
        let (cols, rows) = (
            cols.min(u16::MAX as u32) as u16,
            rows.min(u16::MAX as u32) as u16,
        );
        self.terminals
            .open(shell, Path::new(cwd), cols, rows)
            .map_err(|e| e.to_string())
    }

    /// 테스트용: 셸 대신 지정한 프로그램을 연다.
    #[cfg(test)]
    pub fn terminal_open_command(
        &self,
        program: &str,
        args: &[&str],
        cwd: &str,
    ) -> ServiceResult<u32> {
        self.terminals
            .open_command(program, args, Path::new(cwd), 80, 24)
            .map_err(|e| e.to_string())
    }

    /// 세션에 입력(키 입력을 UTF-8 글로 바꾼 것)을 쓴다.
    pub fn terminal_write(&self, id: u32, data: &str) -> ServiceResult<()> {
        if let Some(shell) = self.remote_shell(id) {
            return shell
                .lock()
                .unwrap()
                .write(data.as_bytes())
                .map_err(|e| e.to_string());
        }
        self.terminals
            .write(id, data.as_bytes())
            .map_err(|e| e.to_string())
    }

    pub fn terminal_resize(&self, id: u32, cols: u32, rows: u32) -> ServiceResult<()> {
        let (cols, rows) = (
            cols.min(u16::MAX as u32) as u16,
            rows.min(u16::MAX as u32) as u16,
        );
        if let Some(shell) = self.remote_shell(id) {
            return shell
                .lock()
                .unwrap()
                .resize(cols, rows)
                .map_err(|e| e.to_string());
        }
        self.terminals
            .resize(id, cols, rows)
            .map_err(|e| e.to_string())
    }

    pub fn terminal_close(&self, id: u32) -> ServiceResult<()> {
        if let Some(shell) = self.remote_shells.lock().unwrap().remove(&id) {
            // 끝나면 읽기 스레드가 `Exit`을 낸다.
            shell.lock().unwrap().close();
            return Ok(());
        }
        self.terminals.close(id).map_err(|e| e.to_string())
    }

    fn remote_shell(&self, id: u32) -> Option<Arc<Mutex<td_remote::ShellSession>>> {
        self.remote_shells.lock().unwrap().get(&id).cloned()
    }

    /// `connect_remote`로 연결하되, 성공한 SFTP 연결의 접속 정보를 메모리에 기억한다(원격 셸용).
    pub fn connect_remote<S: td_remote::SecretStore>(
        &self,
        target: &td_remote::RemoteTarget,
        password: Option<String>,
        remember: bool,
        secrets: &S,
        shell_host_key: td_remote::HostKeyPolicy,
        opener: td_remote::SessionOpener<'_>,
    ) -> Result<String, td_remote::RemoteError> {
        let logins = &self.remote_logins;
        let recording = |t: &td_remote::RemoteTarget, user: &str, pw: &str| {
            let session = opener(t, user, pw)?;
            if t.protocol == td_remote::Protocol::Sftp {
                logins.lock().unwrap().insert(
                    t.id(),
                    td_remote::SftpConfig {
                        host: t.host.clone(),
                        port: t.port,
                        user: user.into(),
                        password: pw.into(),
                        host_key: shell_host_key.clone(),
                    },
                );
            }
            Ok(session)
        };
        connect_remote(
            &self.fs.remote_registry(),
            target,
            password,
            remember,
            secrets,
            &recording,
        )
    }

    /// 연결을 끊는다: 세션을 레지스트리에서 빼고 기억한 접속 정보도 지운다. 이미 열린 원격 셸은 그대로 둔다.
    pub fn disconnect_remote(&self, id: &str) {
        self.fs.remote_registry().remove(id);
        self.remote_logins.lock().unwrap().remove(id);
    }

    /// 연결 `connection_id`(SFTP)의 서버에 PTY 셸을 열고 세션 번호를 돌려준다. 입출력·종료는 로컬 터미널과 같은 번호·이벤트다.
    /// 일반 SSH 서버도 되므로 SFTP 연결이면 모두 허용한다. 접속은 블로킹이다.
    pub fn remote_terminal_open(
        &self,
        connection_id: &str,
        cols: u32,
        rows: u32,
    ) -> ServiceResult<u32> {
        let login = self
            .remote_logins
            .lock()
            .unwrap()
            .get(connection_id)
            .cloned();
        let Some(login) = login else {
            return Err(if self.fs.remote_registry().contains(connection_id) {
                "원격 셸은 SFTP 연결에서만 열 수 있습니다".to_string()
            } else {
                format!("원격 연결 '{connection_id}'이(가) 열려 있지 않습니다")
            });
        };
        let (cols, rows) = (
            cols.min(u16::MAX as u32) as u16,
            rows.min(u16::MAX as u32) as u16,
        );
        let mut session = td_remote::ShellSession::open(login, cols, rows)
            .map_err(|e| format!("원격 셸을 열지 못했습니다: {e}"))?;
        let events = std::mem::replace(&mut session.events, std::sync::mpsc::channel().1);
        let id = self.terminals.alloc_id();
        self.remote_shells
            .lock()
            .unwrap()
            .insert(id, Arc::new(Mutex::new(session)));
        let tx = self.terminals.sender();
        let shells = Arc::clone(&self.remote_shells);
        std::thread::spawn(move || {
            let code = loop {
                match events.recv() {
                    Ok(td_remote::ShellEvent::Output(data)) => {
                        if tx.send(TermEvent::Output { id, data }).is_err() {
                            return;
                        }
                    }
                    Ok(td_remote::ShellEvent::Exit(code)) => break code,
                    Err(_) => break None,
                }
            };
            shells.lock().unwrap().remove(&id);
            let _ = tx.send(TermEvent::Exit { id, code });
        });
        Ok(id)
    }

    /// 파일 클립보드 구현을 바꾼다(테스트용).
    #[cfg(test)]
    pub fn with_file_clipboard(mut self, clipboard: Box<dyn FileClipboard>) -> Self {
        self.file_clipboard = clipboard;
        self
    }

    /// 이미지 클립보드 구현을 바꾼다(테스트용).
    #[cfg(test)]
    pub fn with_image_clipboard(mut self, clipboard: Box<dyn ImageClipboard>) -> Self {
        self.image_clipboard = clipboard;
        self
    }

    /// 경로의 이미지를 운영체제 클립보드에 이미지로 쓴다(미리보기의 복사 버튼·Mod+C).
    pub fn copy_image_to_clipboard(&self, path: &str) -> ServiceResult<()> {
        use clipboard_rs::common::RustImage;
        let p = vp(path);
        let name = p.file_name().unwrap_or_default();
        if name.to_lowercase().ends_with(".svg") {
            return Err(format!("SVG는 이미지로 복사할 수 없습니다: {name}"));
        }
        // 미리보기와 같은 가상 파일시스템으로 읽으므로 압축 파일 안의 이미지도 복사된다.
        let size = self.fs.stat(&p).map_err(|e| e.to_string())?.size;
        if size > COPY_IMAGE_MAX_BYTES {
            return Err(format!(
                "이미지가 너무 커서 복사할 수 없습니다 ({} MB): {name}",
                size / (1024 * 1024)
            ));
        }
        let bytes = self
            .fs
            .read_head(&p, size as usize)
            .map_err(|e| e.to_string())?;
        // 이미지로 읽히지 않으면 클립보드를 건드리지 않고 돌려보낸다.
        let image = clipboard_rs::RustImageData::from_bytes(&bytes)
            .map_err(|_| format!("이미지로 읽을 수 없는 파일입니다: {name}"))?;
        self.image_clipboard.set_image(image)
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

    /// 폴더 하나의 하위 총 용량(바이트). 숨김 파일을 포함하고, 하드 링크는 한 번만, 심볼릭 링크는 따라가지 않고,
    /// 다른 볼륨의 하위 폴더는 넘지 않는다. 계산하는 동안 `cancel_dir_size`로 취소할 수 있고 취소되면 `None`이다.
    pub fn dir_size(&self, path: &str) -> ServiceResult<Option<f64>> {
        let cancel = CancelToken::new();
        // 같은 경로의 이전 계산이 남아 있으면 멈추고 이번 것으로 바꾼다.
        if let Some(old) = self
            .dir_sizes
            .lock()
            .unwrap()
            .insert(path.to_string(), cancel.clone())
        {
            old.cancel();
        }
        let result = self.dir_size_with(path, &cancel);
        let mut running = self.dir_sizes.lock().unwrap();
        // 그 사이에 같은 경로로 새 계산이 등록됐다면 지우지 않는다.
        if running.get(path).is_some_and(|c| c.same_as(&cancel)) {
            running.remove(path);
        }
        result
    }

    /// `dir_size`의 계산 본체. 호출자가 취소 표시를 쥐고 있다.
    pub(crate) fn dir_size_with(
        &self,
        path: &str,
        cancel: &CancelToken,
    ) -> ServiceResult<Option<f64>> {
        let root = vp(path);
        let entry = self.fs.stat(&root).map_err(|e| e.to_string())?;
        if entry.kind != EntryKind::Dir {
            return Err(format!("폴더가 아닙니다: {path}"));
        }
        let (_items, report) = td_search::disk_usage(
            &self.fs,
            &root,
            &UsageOptions::default(),
            cancel,
            &mut |_| {},
        );
        Ok((!report.cancelled && !cancel.is_cancelled()).then_some(report.total_bytes as f64))
    }

    /// 경로의 폴더 용량 계산을 취소한다. 계산 중이 아니면 아무 일도 없다.
    pub fn cancel_dir_size(&self, path: &str) {
        if let Some(c) = self.dir_sizes.lock().unwrap().get(path) {
            c.cancel();
        }
    }

    /// 설정 `preview.image_max_mb`·`pdf_max_mb`·`audio_max_mb`를 반영한다. 다음 미리보기부터 적용된다.
    pub fn set_preview_limits(&self, c: &td_config::PreviewConfig) {
        let mut l = self.preview_limits.lock().unwrap();
        l.image_bytes = mb_limit(c.image_max_mb);
        l.pdf_bytes = mb_limit(c.pdf_max_mb);
        l.audio_bytes = mb_limit(c.audio_max_mb);
        self.pdf_direct
            .store(c.pdf_direct, std::sync::atomic::Ordering::Relaxed);
    }

    fn limits(&self) -> td_vfs::PreviewLimits {
        *self.preview_limits.lock().unwrap()
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

    /// 텍스트 파일을 덮어쓴다(미리보기 편집 저장). 없는 파일이나 폴더에는 쓰지 않고 새로 만들지도 않는다.
    /// `expected`가 있으면 쓰기 직전에 크기·수정 시각을 비교해 달라졌으면 쓰지 않고 `saved: false`를 돌려준다(밖에서 바뀐 파일 보호).
    /// 같은 폴더의 임시 파일에 쓴 뒤 이름을 바꾸고(원자적), 기존 파일의 권한을 유지한다. 링크는 가리키는 실제 파일에 쓴다.
    pub fn write_text_file(
        &self,
        path: &str,
        text: &str,
        expected: Option<ExpectedFileDto>,
    ) -> ServiceResult<WriteTextResultDto> {
        let real = std::fs::canonicalize(path).map_err(|e| format!("{path}: {e}"))?;
        let meta = std::fs::metadata(&real).map_err(|e| format!("{path}: {e}"))?;
        if !meta.is_file() {
            return Err(format!("{path}: 파일이 아닙니다"));
        }
        let stat = |m: &std::fs::Metadata| (m.len() as f64, ms(m.modified().ok()));
        if let Some(exp) = expected {
            let (size, modified_ms) = stat(&meta);
            if size != exp.size || modified_ms != exp.modified_ms {
                return Ok(WriteTextResultDto {
                    saved: false,
                    size,
                    modified_ms,
                });
            }
        }
        let (dir, name) = match (real.parent(), real.file_name()) {
            (Some(d), Some(n)) => (d, n.to_string_lossy().into_owned()),
            _ => return Err(format!("{path}: 쓸 위치를 알 수 없습니다")),
        };
        let tmp = dir.join(format!(".{name}.td-save-{}.tmp", std::process::id()));
        let written = std::fs::write(&tmp, text.as_bytes())
            .and_then(|()| std::fs::set_permissions(&tmp, meta.permissions()))
            .and_then(|()| std::fs::rename(&tmp, &real));
        if let Err(e) = written {
            let _ = std::fs::remove_file(&tmp);
            return Err(format!("{path}: {e}"));
        }
        let after = std::fs::metadata(&real).map_err(|e| format!("{path}: {e}"))?;
        let (size, modified_ms) = stat(&after);
        Ok(WriteTextResultDto {
            saved: true,
            size,
            modified_ms,
        })
    }

    pub fn file_info(&self, path: &str) -> ServiceResult<FileInfoDto> {
        self.fs
            .info(&vp(path))
            .map(|i| FileInfoDto::from(&i))
            .map_err(|e| e.to_string())
    }

    pub fn preview(&self, path: &str) -> ServiceResult<PreviewDto> {
        // 원격(`sftp://`·`ftp://`) 경로는 로컬 파일이 아니라 가상 파일시스템으로 읽는다. 텍스트는 앞부분만, 이미지는 한도 안에서만 내려받고,
        // PDF·오디오·동영상은 읽지 않고 `Other`로 돌려준다. 로컬 전용 분기(cbz·PDF 직접 열기·폴더·압축 파일 미리보기)보다 먼저 가른다.
        if td_vfs::is_remote(path) {
            return td_vfs::read_preview_vfs(&self.fs, &vp(path), self.limits())
                .map(PreviewDto::from)
                .map_err(|e| e.to_string());
        }
        if path.to_ascii_lowercase().ends_with(".cbz") && std::path::Path::new(path).is_file() {
            return Ok(cbz_preview(path, self.limits().image_bytes).into());
        }
        // (시험) 디스크 PDF는 읽지 않고 "PDF임"만 알린다. 프런트가 파일 주소로 직접 연다. 한도(`pdf_max_mb`)도 쓰지 않는다.
        // 단, 맨 앞이 `%PDF`가 아닌 파일은 직접 열지 않는다: 자산 프로토콜이 맨 앞 바이트로 형식을 정해서(`infer`) 이런 파일을
        // `text/html`로 내보내면 웹뷰가 PDF를 HTML 글로 그린다. 이런 파일은 `application/pdf`를 명시하는 기존 데이터 경로로 연다.
        if self.pdf_direct.load(std::sync::atomic::Ordering::Relaxed)
            && path.to_ascii_lowercase().ends_with(".pdf")
            && !self.fs.is_archive_path(&vp(path))
            && starts_with_pdf_header(path)
        {
            if let Ok(m) = std::fs::metadata(path) {
                if m.is_file() {
                    return Ok(PreviewDto {
                        kind: PreviewKindDto::Pdf,
                        text: None,
                        truncated: false,
                        size: m.len() as f64,
                        data_url: None,
                    });
                }
            }
        }
        if self.fs.is_archive_path(&vp(path)) {
            return td_vfs::read_preview_vfs(&self.fs, &vp(path), self.limits())
                .map(PreviewDto::from)
                .map_err(|e| e.to_string());
        }
        if let Some(p) = dir_preview(path) {
            return Ok(p.into());
        }
        if std::path::Path::new(path).is_file() {
            if let Some(p) = archive_preview(path, &self.fs.extra_zip_exts()) {
                return Ok(p.into());
            }
        }
        td_vfs::read_preview(&vp(path), self.limits())
            .map(PreviewDto::from)
            .map_err(|e| e.to_string())
    }

    /// 디스크 위 Office 문서를 `office_oxide`로 읽은 Markdown. 압축 파일 안의 문서는 읽지 않는다.
    pub fn office_preview(&self, path: &str) -> ServiceResult<crate::office::OfficePreviewDto> {
        if self.fs.is_archive_path(&vp(path)) {
            return Err("압축 파일 안의 문서는 미리 볼 수 없습니다".into());
        }
        crate::office::preview(Path::new(path))
    }

    /// 디스크 위 epub의 제목·저자·표지·챕터 목록. 압축 파일 안의 epub은 읽지 않는다. 표지는 이미지 한도 안일 때만 싣는다.
    pub fn epub_open(&self, path: &str) -> ServiceResult<EpubInfoDto> {
        if self.fs.is_archive_path(&vp(path)) {
            return Err("압축 파일 안의 epub은 미리 볼 수 없습니다".into());
        }
        crate::epub::open(Path::new(path), self.limits().image_bytes)
    }

    /// epub의 `index`번째 챕터 HTML(이미지·스타일은 안에 넣고 스크립트는 뺀다).
    pub fn epub_chapter(&self, path: &str, index: u32) -> ServiceResult<String> {
        if self.fs.is_archive_path(&vp(path)) {
            return Err("압축 파일 안의 epub은 미리 볼 수 없습니다".into());
        }
        crate::epub::chapter(Path::new(path), index, self.limits().image_bytes)
    }

    /// 항목의 시스템 아이콘(`data:image/png;base64,…`). 이 OS에서 얻을 수 없거나 크기가 0이면 `None`이고 오류가 아니다.
    /// 결과는 (소스, 크기)별로 캐시한다.
    pub fn system_icon(
        &self,
        path: &str,
        is_dir: bool,
        size: u32,
    ) -> ServiceResult<Option<String>> {
        if size == 0 {
            return Ok(None);
        }
        let source = icon_source(path, is_dir, self.fs.is_archive_path(&vp(path)));
        let key = (source.key(), size);
        if let Some(hit) = self.icons.lock().map_err(|e| e.to_string())?.get(&key) {
            return Ok(hit.clone());
        }
        let url = match &source {
            IconSource::Folder => td_icons::icon_png(td_icons::IconSource::Folder, size),
            IconSource::Extension(e) => {
                td_icons::icon_png(td_icons::IconSource::Extension(e), size)
            }
            IconSource::Path(p) => td_icons::icon_png(td_icons::IconSource::Path(p), size),
        }
        .and_then(|png| td_vfs::image_data_url("icon.png", &png));
        let mut cache = self.icons.lock().map_err(|e| e.to_string())?;
        if cache.len() >= ICON_CACHE_MAX {
            cache.clear();
        }
        cache.insert(key, url.clone());
        Ok(url)
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

    /// 자소가 분리된(NFD) 이름을 조합형(NFC)으로 고친다(이슈 #50).
    pub fn normalize_names(&self, paths: &[String]) -> NormalizeResultDto {
        let paths: Vec<VfsPath> = paths.iter().map(|p| vp(p)).collect();
        NormalizeResultDto::from(self.ops.normalize_names(&paths))
    }

    /// 폴더 바로 아래 항목의 이름을 조합형으로 고친다. 하위 폴더 안은 건드리지 않는다.
    pub fn normalize_dir(&self, dir: &str) -> ServiceResult<NormalizeResultDto> {
        self.ops
            .normalize_dir(&vp(dir))
            .map(NormalizeResultDto::from)
            .map_err(|e| e.to_string())
    }

    pub fn watch(&self, path: &str) -> ServiceResult<()> {
        // 원격 폴더는 파일 감시가 없다(UI가 다시 읽는다).
        if td_vfs::is_remote(path) {
            return Ok(());
        }
        self.watcher
            .lock()
            .unwrap()
            .watch(Path::new(path))
            .map_err(|e| e.to_string())
    }

    pub fn unwatch(&self, path: &str) -> ServiceResult<()> {
        if td_vfs::is_remote(path) {
            return Ok(());
        }
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

/// 설정 폴더 열기. 폴더 안에 `config.toml`이 있으면 그 파일을 선택해 보여 주고, 없으면 폴더를 보여 준다.
/// 폴더 이름이 앱 식별자(`dev.twindeck.app`)라 macOS에서는 폴더째로 열 수 없다(앱 번들로 취급).
pub fn reveal_config<L: Launcher>(launch: &Launch<L>, dir: &str) -> ServiceResult<()> {
    let file = Path::new(dir).join("config.toml");
    if file.is_file() {
        reveal(launch, &file.to_string_lossy())
    } else {
        reveal(launch, dir)
    }
}

/// 기본 프로그램으로 파일 실행. 없는 경로는 실행하지 않는다.
pub fn open_file<L: Launcher>(launch: &Launch<L>, path: &str) -> ServiceResult<()> {
    std::fs::symlink_metadata(path).map_err(|e| format!("{path}: {e}"))?;
    launch.open(path)
}

/// "변경 사항" 버튼이 여는 GitHub 릴리스 목록(이슈 #70). 주소는 여기 한 곳에서만 정하고, 임의 URL을 받는 명령은 두지 않는다.
pub const RELEASES_URL: &str = "https://github.com/gyuha/twin-deck/releases";

/// GitHub 릴리스 목록을 기본 브라우저로 연다. OS의 기본 열기 명령(macOS `open`·Windows `explorer`·Linux `xdg-open`)을 쓴다.
pub fn open_releases<L: Launcher>(launch: &Launch<L>) -> ServiceResult<()> {
    launch.open(RELEASES_URL)
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
    fn write_text_saves_exact_content_and_reports_the_new_stat() {
        let (_t, svc, _ch, root) = setup();
        let path = format!("{root}/a.txt");
        std::fs::write(&path, "before").unwrap();
        let text = "새 내용\r\n둘째 줄\r\n"; // 받은 글자를 그대로 쓴다(줄바꿈 변환은 호출한 쪽 몫)
        let r = svc.write_text_file(&path, text, None).unwrap();
        assert!(r.saved);
        assert_eq!(std::fs::read(&path).unwrap(), text.as_bytes());
        assert_eq!(r.size, text.len() as f64);
        let info = svc.file_info(&path).unwrap();
        assert_eq!((r.size, r.modified_ms), (info.size, info.modified_ms));
    }

    #[test]
    fn write_text_refuses_when_the_file_changed_and_leaves_it_alone() {
        let (_t, svc, _ch, root) = setup();
        let path = format!("{root}/a.txt");
        std::fs::write(&path, "열 때의 내용").unwrap();
        let info = svc.file_info(&path).unwrap();
        let expected = ExpectedFileDto {
            size: info.size,
            modified_ms: info.modified_ms,
        };
        // 밖에서 크기가 바뀌었다.
        std::fs::write(&path, "밖에서 바뀐 더 긴 내용").unwrap();
        let r = svc
            .write_text_file(&path, "내 편집", Some(expected.clone()))
            .unwrap();
        assert!(!r.saved, "바뀐 파일은 쓰지 않는다");
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            "밖에서 바뀐 더 긴 내용"
        );
        // 같은 크기로 바뀌고 수정 시각만 달라도 막는다.
        let info = svc.file_info(&path).unwrap();
        let stale = ExpectedFileDto {
            size: info.size,
            modified_ms: info.modified_ms.map(|m| m - 5000.0),
        };
        let r = svc.write_text_file(&path, "내 편집", Some(stale)).unwrap();
        assert!(!r.saved);
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            "밖에서 바뀐 더 긴 내용"
        );
        // 기대값이 맞으면 쓴다.
        let ok = ExpectedFileDto {
            size: info.size,
            modified_ms: info.modified_ms,
        };
        assert!(
            svc.write_text_file(&path, "내 편집", Some(ok))
                .unwrap()
                .saved
        );
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "내 편집");
    }

    #[test]
    fn write_text_without_expected_overwrites() {
        let (_t, svc, _ch, root) = setup();
        let path = format!("{root}/a.txt");
        std::fs::write(&path, "원래").unwrap();
        assert!(
            svc.write_text_file(&path, "덮어쓴 내용", None)
                .unwrap()
                .saved
        );
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "덮어쓴 내용");
    }

    #[cfg(unix)]
    #[test]
    fn write_text_keeps_the_file_permissions() {
        use std::os::unix::fs::PermissionsExt;
        let (_t, svc, _ch, root) = setup();
        let path = format!("{root}/script.sh");
        std::fs::write(&path, "#!/bin/sh\n").unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o750)).unwrap();
        svc.write_text_file(&path, "#!/bin/sh\necho hi\n", None)
            .unwrap();
        assert_eq!(
            std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o750
        );
    }

    #[test]
    fn write_text_leaves_no_temp_file_behind() {
        let (_t, svc, _ch, root) = setup();
        let path = format!("{root}/a.txt");
        std::fs::write(&path, "x").unwrap();
        svc.write_text_file(&path, "y", None).unwrap();
        let mut names: Vec<String> = std::fs::read_dir(&root)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        assert_eq!(names, ["a.txt"]);
    }

    #[test]
    fn write_text_refuses_missing_files_and_folders() {
        let (_t, svc, _ch, root) = setup();
        svc.mkdir(&format!("{root}/d")).unwrap();
        assert!(svc
            .write_text_file(&format!("{root}/nope.txt"), "x", None)
            .is_err());
        assert!(
            !std::path::Path::new(&format!("{root}/nope.txt")).exists(),
            "없는 파일을 새로 만들지 않는다"
        );
        assert!(svc
            .write_text_file(&format!("{root}/d"), "x", None)
            .is_err());
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
    fn reveal_config_selects_config_toml_or_falls_back_to_the_folder() {
        use std::cell::RefCell;
        use std::rc::Rc;
        struct Rec(Rc<RefCell<Vec<td_launch::Command>>>);
        impl Launcher for Rec {
            fn run(&self, c: &td_launch::Command) -> Result<(), String> {
                self.0.borrow_mut().push(c.clone());
                Ok(())
            }
        }
        let t = tempfile::tempdir().unwrap();
        // 설정 폴더 이름이 .app으로 끝난다(앱 식별자 dev.twindeck.app).
        let dir = t.path().join("dev.twindeck.app");
        std::fs::create_dir(&dir).unwrap();
        let dir = dir.to_string_lossy().into_owned();
        let log = Rc::new(RefCell::new(Vec::new()));
        let launch = Launch::new(Rec(log.clone()), td_launch::Os::Mac);

        // config.toml이 없으면 폴더를 보여 준다(.app 이름 폴더는 open -R).
        reveal_config(&launch, &dir).unwrap();
        // 있으면 그 파일을 선택해 보여 준다(Finder가 폴더 안을 열고 파일이 선택된다).
        std::fs::write(format!("{dir}/config.toml"), "").unwrap();
        reveal_config(&launch, &dir).unwrap();

        let log = log.borrow();
        assert_eq!(log[0].args, ["-R".to_string(), dir.clone()]);
        assert_eq!(
            log[1].args,
            ["-R".to_string(), format!("{dir}/config.toml")]
        );
    }

    #[test]
    fn open_releases_opens_exactly_the_releases_page_with_the_os_opener() {
        use std::cell::RefCell;
        use std::rc::Rc;
        struct Rec(Rc<RefCell<Vec<td_launch::Command>>>);
        impl Launcher for Rec {
            fn run(&self, c: &td_launch::Command) -> Result<(), String> {
                self.0.borrow_mut().push(c.clone());
                Ok(())
            }
        }
        for (os, program) in [
            (td_launch::Os::Mac, "open"),
            (td_launch::Os::Windows, "explorer"),
            (td_launch::Os::Linux, "xdg-open"),
        ] {
            let log = Rc::new(RefCell::new(Vec::new()));
            open_releases(&Launch::new(Rec(log.clone()), os)).unwrap();
            let log = log.borrow();
            assert_eq!(log.len(), 1);
            assert_eq!(log[0].program, program);
            assert_eq!(
                log[0].args,
                ["https://github.com/gyuha/twin-deck/releases".to_string()]
            );
        }
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
        // 폴더는 하위 항목 트리 텍스트(preview_dir_* 테스트)
        assert_eq!(svc.preview(&root).unwrap().kind, PreviewKindDto::Text);
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

    /// 이미지 클립보드 가짜: 받은 이미지의 (너비, 높이)만 기록한다. 실제 운영체제 클립보드는 건드리지 않는다.
    #[derive(Default)]
    struct MemImageClipboard(Mutex<Vec<(u32, u32)>>);
    impl ImageClipboard for Arc<MemImageClipboard> {
        fn set_image(&self, image: clipboard_rs::RustImageData) -> ServiceResult<()> {
            use clipboard_rs::common::RustImage;
            self.0.lock().unwrap().push(image.get_size());
            Ok(())
        }
    }

    fn with_mem_image_clipboard() -> (
        tempfile::TempDir,
        Service<FakeTrash>,
        Arc<MemImageClipboard>,
        String,
    ) {
        let (t, svc, _ch, root) = setup();
        let clip = Arc::new(MemImageClipboard::default());
        (
            t,
            svc.with_image_clipboard(Box::new(clip.clone())),
            clip,
            root,
        )
    }

    /// 3x2 PNG(85바이트)와 16x8 JPEG(883바이트). `sips`로 크기를 확인한 고정 파일이다.
    const PNG_3X2_B64: &str = "iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAHElEQVR4nGNgYGjQYGgIYGhgYIhq0IhqCIhqAAAoygT/AGlsywAAAABJRU5ErkJggg==";
    const JPEG_16X8_B64: &str = "/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAEKADAAQAAAABAAAACAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgACAAQAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A8Q8D+GvC3/CG6t/oWg/8eFz/AMwPWP8Ank3+1Rqfhrwt/wAIbpf+haD/AMf8X/MD1n/nlL/tV6D4H/5E3V/+vC5/9FNSap/yJul/9f8AF/6Klr9Mq4er9an+/n8fddn5H0uAwtf+wsP/ALTP/d31X88f7p//2Q==";

    fn write_b64(path: &str, b64: &str) {
        use base64::Engine;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(b64)
            .unwrap();
        std::fs::write(path, bytes).unwrap();
    }

    #[test]
    fn copy_image_png_gives_the_clipboard_the_original_size() {
        let (_t, svc, clip, root) = with_mem_image_clipboard();
        let path = format!("{root}/a.png");
        write_b64(&path, PNG_3X2_B64);
        svc.copy_image_to_clipboard(&path).unwrap();
        assert_eq!(*clip.0.lock().unwrap(), vec![(3, 2)]);
    }

    #[test]
    fn copy_image_jpeg_gives_the_clipboard_the_original_size() {
        let (_t, svc, clip, root) = with_mem_image_clipboard();
        let path = format!("{root}/한글 사진.jpg");
        write_b64(&path, JPEG_16X8_B64);
        svc.copy_image_to_clipboard(&path).unwrap();
        assert_eq!(*clip.0.lock().unwrap(), vec![(16, 8)]);
    }

    #[test]
    fn copy_image_rejects_non_images_without_touching_the_clipboard() {
        let (_t, svc, clip, root) = with_mem_image_clipboard();
        let text = format!("{root}/note.png"); // 이름만 이미지다
        std::fs::write(&text, "hello").unwrap();
        let broken = format!("{root}/broken.png");
        write_b64(&broken, PNG_3X2_B64);
        let bytes = std::fs::read(&broken).unwrap();
        std::fs::write(&broken, &bytes[..bytes.len() / 2]).unwrap(); // 잘린 PNG
        for path in [text, broken, format!("{root}/missing.png")] {
            assert!(svc.copy_image_to_clipboard(&path).is_err(), "{path}");
        }
        assert!(
            clip.0.lock().unwrap().is_empty(),
            "실패하면 클립보드를 건드리지 않는다"
        );
    }

    #[test]
    fn copy_image_svg_is_a_clear_error_not_an_empty_image() {
        let (_t, svc, clip, root) = with_mem_image_clipboard();
        let path = format!("{root}/logo.svg");
        std::fs::write(
            &path,
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>"#,
        )
        .unwrap();
        assert!(svc.copy_image_to_clipboard(&path).is_err());
        assert!(clip.0.lock().unwrap().is_empty());
    }

    #[test]
    fn copy_image_inside_an_archive_uses_the_same_read_path_as_the_preview() {
        let (_t, svc, clip, root) = with_mem_image_clipboard();
        let png = format!("{root}/inner.png");
        write_b64(&png, PNG_3X2_B64);
        let zip = format!("{root}/pack.zip");
        td_archive::compress(
            &[std::path::PathBuf::from(&png)],
            std::path::Path::new(&zip),
            &mut |_| true,
        )
        .unwrap();
        svc.copy_image_to_clipboard(&format!("{zip}!/inner.png"))
            .unwrap();
        assert_eq!(*clip.0.lock().unwrap(), vec![(3, 2)]);
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

    #[cfg(unix)]
    #[test]
    fn link_is_dir_marks_only_symlinks_that_point_to_folders() {
        let (_t, svc, _ch, root) = setup();
        let dir = format!("{root}/links");
        std::fs::create_dir_all(format!("{dir}/realdir")).unwrap();
        std::fs::write(format!("{dir}/realfile"), "x").unwrap();
        std::os::unix::fs::symlink(format!("{dir}/realdir"), format!("{dir}/to_dir")).unwrap();
        std::os::unix::fs::symlink(format!("{dir}/realfile"), format!("{dir}/to_file")).unwrap();
        std::os::unix::fs::symlink(format!("{dir}/nowhere"), format!("{dir}/broken")).unwrap();
        // 링크의 링크도 끝까지 따라가 폴더면 폴더다.
        std::os::unix::fs::symlink(format!("{dir}/to_dir"), format!("{dir}/to_link_to_dir"))
            .unwrap();
        let entries = svc.list_dir(&dir, true).unwrap();
        let flag = |name: &str| entries.iter().find(|e| e.name == name).unwrap().link_is_dir;
        assert!(flag("to_dir"), "폴더 링크");
        assert!(flag("to_link_to_dir"), "링크의 링크");
        assert!(!flag("to_file"), "파일 링크");
        assert!(!flag("broken"), "끊어진 링크");
        assert!(!flag("realdir"), "일반 폴더는 링크가 아니다");
        assert!(!flag("realfile"), "일반 파일");
        // 종류는 그대로 링크다(아이콘·정렬·파일 작업이 링크로 다루는 방식을 바꾸지 않는다).
        let kind = |name: &str| entries.iter().find(|e| e.name == name).unwrap().kind;
        assert_eq!(kind("to_dir"), KindDto::Symlink);
    }

    #[test]
    fn dir_size_sums_nested_files_including_hidden() {
        let (_t, svc, _ch, root) = setup();
        let dir = format!("{root}/proj");
        std::fs::create_dir_all(format!("{dir}/sub/deep")).unwrap();
        std::fs::write(format!("{dir}/a.txt"), vec![1u8; 100]).unwrap();
        std::fs::write(format!("{dir}/.hidden"), vec![1u8; 7]).unwrap();
        std::fs::write(format!("{dir}/sub/b.bin"), vec![1u8; 2000]).unwrap();
        std::fs::write(format!("{dir}/sub/deep/c"), vec![1u8; 30]).unwrap();
        assert_eq!(svc.dir_size(&dir).unwrap(), Some(2137.0));
    }

    #[test]
    fn dir_size_of_empty_folder_is_zero() {
        let (_t, svc, _ch, root) = setup();
        let dir = format!("{root}/empty");
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(svc.dir_size(&dir).unwrap(), Some(0.0));
    }

    #[cfg(unix)]
    #[test]
    fn dir_size_counts_hard_links_once_and_does_not_follow_symlinks() {
        let (_t, svc, _ch, root) = setup();
        let dir = format!("{root}/links");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(format!("{dir}/a"), vec![1u8; 1000]).unwrap();
        std::fs::hard_link(format!("{dir}/a"), format!("{dir}/b")).unwrap();
        // 폴더를 가리키는 심볼릭 링크: 따라가지 않고 링크 자체의 크기만 센다.
        let outside = format!("{root}/outside");
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(format!("{outside}/big"), vec![1u8; 5000]).unwrap();
        std::os::unix::fs::symlink(&outside, format!("{dir}/lnk")).unwrap();
        let link_len = std::fs::symlink_metadata(format!("{dir}/lnk"))
            .unwrap()
            .len();
        assert_eq!(svc.dir_size(&dir).unwrap(), Some(1000.0 + link_len as f64));
    }

    #[test]
    fn dir_size_returns_none_when_cancelled() {
        let (_t, svc, _ch, root) = setup();
        let dir = format!("{root}/c");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(format!("{dir}/a"), vec![1u8; 10]).unwrap();
        let cancel = CancelToken::new();
        cancel.cancel();
        assert_eq!(svc.dir_size_with(&dir, &cancel).unwrap(), None);
    }

    #[test]
    fn cancel_dir_size_stops_a_running_calculation_by_path() {
        let (_t, svc, _ch, root) = setup();
        let dir = format!("{root}/running");
        std::fs::create_dir_all(&dir).unwrap();
        // 등록된 계산이 없으면 아무 일도 없고, 등록된 토큰은 취소로 표시된다.
        svc.cancel_dir_size(&dir);
        let token = CancelToken::new();
        svc.dir_sizes
            .lock()
            .unwrap()
            .insert(dir.clone(), token.clone());
        svc.cancel_dir_size(&dir);
        assert!(token.is_cancelled());
    }

    #[test]
    fn dir_size_rejects_missing_paths_and_files() {
        let (_t, svc, _ch, root) = setup();
        assert!(svc.dir_size(&format!("{root}/nope")).is_err());
        std::fs::write(format!("{root}/f.txt"), "x").unwrap();
        assert!(svc.dir_size(&format!("{root}/f.txt")).is_err());
    }

    fn make_zip_tree(dir: &std::path::Path, dest: &str, files: &[&str]) {
        let src = dir.join("zip-src");
        for f in files {
            let p = src.join(f);
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            std::fs::write(&p, b"x").unwrap();
        }
        let status = std::process::Command::new("zip")
            .args(["-q", "-r", dest, "."])
            .current_dir(&src)
            .status()
            .expect("zip 실행 불가");
        assert!(status.success());
        std::fs::remove_dir_all(&src).unwrap();
    }

    #[test]
    fn preview_dir_lists_tree_folders_first() {
        let (_t, svc, _ch, root) = setup();
        let d = format!("{root}/proj");
        std::fs::create_dir_all(format!("{d}/docs/adr")).unwrap();
        std::fs::create_dir_all(format!("{d}/src")).unwrap();
        for f in ["z.txt", "a.txt", "docs/readme.md", "docs/adr/0001.md"] {
            std::fs::write(format!("{d}/{f}"), "x").unwrap();
        }
        let p = svc.preview(&d).unwrap();
        assert_eq!(p.kind, PreviewKindDto::Text);
        assert!(!p.truncated);
        assert_eq!(
            p.text.unwrap(),
            "├── docs/\n│   ├── adr/\n│   │   └── 0001.md\n│   └── readme.md\n├── src/\n├── a.txt\n└── z.txt\n"
        );
    }

    #[test]
    fn preview_dir_stops_at_depth_limit() {
        let (_t, svc, _ch, root) = setup();
        let d = format!("{root}/deep");
        std::fs::create_dir_all(format!("{d}/a/b/c/d")).unwrap();
        std::fs::write(format!("{d}/a/b/c/d/x.txt"), "x").unwrap();
        let p = svc.preview(&d).unwrap();
        assert!(p.truncated);
        assert_eq!(p.text.unwrap(), "└── a/\n    └── b/\n        └── c/\n");
    }

    #[test]
    fn preview_dir_truncates_long_listings() {
        let (_t, svc, _ch, root) = setup();
        let d = format!("{root}/many");
        std::fs::create_dir_all(&d).unwrap();
        for i in 0..250 {
            std::fs::write(format!("{d}/f{i:03}.txt"), "x").unwrap();
        }
        let p = svc.preview(&d).unwrap();
        assert!(p.truncated);
        assert_eq!(p.text.unwrap().lines().count(), 200);
    }

    #[test]
    fn preview_archive_lists_entries_as_branch_tree_like_folder_preview() {
        let (t, svc, _ch, root) = setup();
        let dest = format!("{root}/pack.zip");
        make_zip_tree(
            t.path(),
            &dest,
            &["a.txt", "docs/readme.md", "src/lib/mod.rs", "src/main.rs"],
        );
        let p = svc.preview(&dest).unwrap();
        assert_eq!(p.kind, PreviewKindDto::Text);
        assert!(!p.truncated);
        assert_eq!(
            p.text.unwrap(),
            "├── docs/\n│   └── readme.md\n├── src/\n│   ├── lib/\n│   │   └── mod.rs\n│   └── main.rs\n└── a.txt\n"
        );
    }

    #[test]
    fn archive_tree_lines_puts_folders_first_and_sorts_by_name() {
        let paths = [
            ("z.txt", false),
            ("b/x", false),
            ("a.txt", false),
            ("a/y", false),
        ];
        let (lines, truncated) = archive_tree_lines(&paths, 100);
        assert!(!truncated);
        assert_eq!(
            lines,
            [
                "├── a/",
                "│   └── y",
                "├── b/",
                "│   └── x",
                "├── a.txt",
                "└── z.txt"
            ]
        );
    }

    #[test]
    fn archive_tree_lines_shows_folder_entries_without_children_and_empty_archive() {
        let (lines, _) = archive_tree_lines(&[("empty", true), ("only/", true)], 100);
        assert_eq!(lines, ["├── empty/", "└── only/"]);
        let (lines, truncated) = archive_tree_lines(&[], 100);
        assert!(lines.is_empty() && !truncated);
    }

    /// 작은 스택(256KB) 스레드에서 실행한다. 재귀가 깊으면 스택 오버플로로 프로세스가 중단된다.
    fn on_small_stack<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> T {
        std::thread::Builder::new()
            .stack_size(256 * 1024)
            .spawn(f)
            .unwrap()
            .join()
            .unwrap()
    }

    #[test]
    fn archive_tree_lines_deep_path_does_not_overflow_a_small_stack() {
        let deep = format!("{}f.txt", "a/".repeat(100_000));
        let (lines, _truncated) = on_small_stack(move || {
            let (lines, truncated) = archive_tree_lines(&[(deep.as_str(), false)], 2000);
            (lines, truncated)
        });
        assert!(!lines.is_empty() && lines.len() <= 2000);
        assert!(lines[0].starts_with("└── a/"));
    }

    /// 비압축·크기 0인 항목 하나만 든 zip을 직접 쓴다(디스크에 3만 단계 폴더를 만들 수 없어서 `zip` 명령을 쓸 수 없다).
    fn write_single_entry_zip(dest: &str, name: &str) {
        let n = name.len() as u16;
        let mut z: Vec<u8> = Vec::new();
        z.extend([0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0]); // 로컬 헤더(버전 20, 저장, 시각 0)
        z.extend([0; 12]); // crc32, 압축 크기, 원본 크기 = 0
        z.extend(n.to_le_bytes());
        z.extend([0, 0]);
        z.extend(name.as_bytes());
        let cd_offset = z.len() as u32;
        z.extend([0x50, 0x4b, 0x01, 0x02, 20, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        z.extend([0; 12]); // crc32, 압축 크기, 원본 크기
        z.extend(n.to_le_bytes());
        z.extend([0; 12]); // 추가 필드, 주석, 디스크 번호, 내부·외부 속성 길이
        z.extend([0, 0, 0, 0]); // 로컬 헤더 오프셋
        z.extend(name.as_bytes());
        let cd_size = z.len() as u32 - cd_offset;
        z.extend([0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, 1, 0, 1, 0]);
        z.extend(cd_size.to_le_bytes());
        z.extend(cd_offset.to_le_bytes());
        z.extend([0, 0]);
        std::fs::write(dest, z).unwrap();
    }

    #[test]
    fn archive_tree_lines_deep_zip_preview_survives_a_small_stack() {
        let t = tempfile::tempdir().unwrap();
        let dest = t.path().join("deep.zip").to_string_lossy().into_owned();
        write_single_entry_zip(&dest, &format!("{}f", "a/".repeat(32_000)));
        let p = on_small_stack(move || archive_preview(&dest, &[]));
        let p = p.expect("zip은 미리보기 대상이다");
        assert_ne!(
            p.kind,
            td_vfs::PreviewKind::Other,
            "항목을 읽지 못해 기타로 떨어지면 안 된다"
        );
        assert!(p.text.unwrap().starts_with("└── a/"));
    }

    #[test]
    fn archive_tree_lines_stops_at_the_line_limit() {
        let paths: Vec<(String, bool)> = (0..10).map(|i| (format!("f{i}.txt"), false)).collect();
        let refs: Vec<(&str, bool)> = paths.iter().map(|(n, d)| (n.as_str(), *d)).collect();
        let (lines, truncated) = archive_tree_lines(&refs, 4);
        assert_eq!(lines.len(), 4);
        assert!(truncated);
    }

    #[test]
    fn preview_archive_truncates_long_listings() {
        let (t, svc, _ch, root) = setup();
        let dest = format!("{root}/many.zip");
        let names: Vec<String> = (0..2100).map(|i| format!("f{i:04}.txt")).collect();
        let refs: Vec<&str> = names.iter().map(String::as_str).collect();
        make_zip_tree(t.path(), &dest, &refs);
        let p = svc.preview(&dest).unwrap();
        assert_eq!(p.kind, PreviewKindDto::Text);
        assert!(p.truncated);
        assert_eq!(p.text.unwrap().lines().count(), 2000);
    }

    #[cfg(unix)]
    #[test]
    fn terminal_session_runs_in_folder_and_streams_output() {
        use std::time::{Duration, Instant};
        let (_t, svc, ch, root) = setup();
        let id = svc
            .terminal_open_command("/bin/sh", &["-c", "pwd; cat"], &root)
            .unwrap();
        svc.terminal_write(id, "ping\n").unwrap();
        let mut out = String::new();
        let end = Instant::now() + Duration::from_secs(10);
        while Instant::now() < end && !(out.contains("ping") && out.contains("root")) {
            if let Ok(td_terminal::TermEvent::Output { id: i, data }) =
                ch.terminal_events.recv_timeout(Duration::from_millis(200))
            {
                assert_eq!(i, id);
                out.push_str(&String::from_utf8_lossy(&data));
            }
        }
        assert!(out.contains("root") && out.contains("ping"), "{out:?}");
        svc.terminal_close(id).unwrap();
        assert!(svc.terminal_resize(9999, 10, 10).is_err());
    }

    #[test]
    fn preview_archive_entry_shows_text_and_image_content() {
        let (_t, svc, _ch, root) = setup();
        let zip = format!("{root}/a.zip");
        let png = vec![0x89u8, b'P', b'N', b'G', 1, 2, 3];
        let mut z = td_archive::ZipEdit::create(Path::new(&zip)).unwrap();
        z.add_file(
            "d/a.txt",
            td_archive::Source::Bytes("안녕\n".as_bytes().to_vec()),
        );
        z.add_file("d/p.png", td_archive::Source::Bytes(png.clone()));
        z.add_file("d/bin.dat", td_archive::Source::Bytes(vec![0, 1, 2]));
        z.add_file("d/m.mp4", td_archive::Source::Bytes(b"video".to_vec()));
        z.commit().unwrap();

        let t = svc.preview(&format!("{zip}!/d/a.txt")).unwrap();
        assert_eq!(
            (t.kind, t.text.as_deref(), t.truncated),
            (PreviewKindDto::Text, Some("안녕\n"), false)
        );
        let i = svc.preview(&format!("{zip}!/d/p.png")).unwrap();
        assert_eq!(i.kind, PreviewKindDto::Image);
        assert_eq!(i.data_url, td_vfs::image_data_url("p.png", &png));
        assert_eq!(
            svc.preview(&format!("{zip}!/d/bin.dat")).unwrap().kind,
            PreviewKindDto::Other
        );
        assert_eq!(
            svc.preview(&format!("{zip}!/d/m.mp4")).unwrap().kind,
            PreviewKindDto::Other
        );
        assert_eq!(
            svc.preview(&format!("{zip}!/d")).unwrap().kind,
            PreviewKindDto::Directory
        );
        assert!(svc.preview(&format!("{zip}!/d/nope.txt")).is_err());
    }

    #[test]
    fn preview_archive_corrupt_or_unreadable_is_other() {
        let (_t, svc, _ch, root) = setup();
        let dest = format!("{root}/broken.zip");
        std::fs::write(&dest, b"this is not a zip").unwrap();
        assert_eq!(svc.preview(&dest).unwrap().kind, PreviewKindDto::Other);
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
                link_is_dir: false,
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

    /// 크기만 큰 빈 파일(희소 파일)을 만든다. 한도 판정은 크기만 보므로 내용은 필요 없다.
    fn sparse(path: &str, mb: u64) {
        let f = std::fs::File::create(path).unwrap();
        f.set_len(mb * 1024 * 1024).unwrap();
    }

    fn limits_cfg(image: u32, pdf: u32, audio: u32) -> td_config::PreviewConfig {
        let mut c = td_config::load_from_strs(None, None, td_config::Platform::Linux)
            .config
            .preview;
        c.image_max_mb = image;
        c.pdf_max_mb = pdf;
        c.audio_max_mb = audio;
        c
    }

    #[test]
    fn preview_limits_default_cuts_at_10_10_20_mb() {
        let (_t, svc, _ch, root) = setup();
        let c = td_config::load_from_strs(None, None, td_config::Platform::Linux).config;
        svc.set_preview_limits(&c.preview);
        for (name, mb, shown) in [
            ("a.pdf", 10, true),
            ("b.pdf", 11, false),
            ("a.png", 10, true),
            ("b.png", 11, false),
            ("a.mp3", 20, true),
            ("b.mp3", 21, false),
        ] {
            let p = format!("{root}/{name}");
            sparse(&p, mb);
            let r = svc.preview(&p).unwrap();
            assert_eq!(r.data_url.is_some(), shown, "{name} {mb}MB");
        }
    }

    #[test]
    fn preview_limits_follow_config_up_down_and_zero_is_unlimited() {
        let (_t, svc, _ch, root) = setup();
        for (name, which) in [("x.pdf", 1), ("x.png", 0), ("x.mp3", 2)] {
            let p = format!("{root}/{name}");
            sparse(&p, 3);
            let set = |mb: u32| {
                let mut v = [10u32, 10, 20];
                v[which] = mb;
                svc.set_preview_limits(&limits_cfg(v[0], v[1], v[2]));
            };
            set(1);
            assert!(
                svc.preview(&p).unwrap().data_url.is_none(),
                "{name}: 1MB 한도에서 3MB는 안 보인다"
            );
            set(4);
            assert!(
                svc.preview(&p).unwrap().data_url.is_some(),
                "{name}: 한도를 올리면 보인다"
            );
            set(2);
            assert!(
                svc.preview(&p).unwrap().data_url.is_none(),
                "{name}: 한도를 줄이면 다시 안 보인다"
            );
            set(0);
            assert!(
                svc.preview(&p).unwrap().data_url.is_some(),
                "{name}: 0은 제한 없음"
            );
        }
    }

    #[test]
    fn system_icon_source_rules() {
        use super::IconSource::*;
        assert_eq!(
            icon_source("/a/b/doc.TXT", false, false),
            Extension("txt".into())
        );
        assert_eq!(
            icon_source("/a/x.zip!/in/pic.PNG", false, true),
            Extension("png".into())
        );
        assert_eq!(
            icon_source("C:\\a\\b.Md", false, false),
            Extension("md".into())
        );
        assert_eq!(
            icon_source("/a/.bashrc", false, false),
            Extension(String::new())
        );
        assert_eq!(
            icon_source("/a/Makefile", false, false),
            Extension(String::new())
        );
        assert_eq!(icon_source("/a/dir", true, false), Folder);
        // 디스크에 없는 .app 이름이나 압축 안 .app은 일반 폴더다.
        assert_eq!(icon_source("/no/such/Thing.app", true, false), Folder);
        assert_eq!(icon_source("/a/x.zip!/Thing.app", true, true), Folder);
    }

    #[test]
    fn system_icon_source_rules_for_each_os() {
        use super::IconSource::*;
        let t = tempfile::tempdir().unwrap();
        let exe = t.path().join("Tool.EXE");
        std::fs::write(&exe, "").unwrap();
        let txt = t.path().join("a.txt");
        std::fs::write(&txt, "").unwrap();
        let app = t.path().join("My.app");
        std::fs::create_dir(&app).unwrap();
        let (exe, txt, app) = (
            exe.to_str().unwrap(),
            txt.to_str().unwrap(),
            app.to_str().unwrap(),
        );
        // Windows: 디스크 위 exe는 자기 아이콘(경로), 일반 파일은 확장자, 없는 파일·압축 안은 확장자.
        assert_eq!(
            icon_source_with(exe, false, false, false, true),
            Path(exe.into())
        );
        assert_eq!(
            icon_source_with(txt, false, false, false, true),
            Extension("txt".into())
        );
        assert_eq!(
            icon_source_with("/no/x.exe", false, false, false, true),
            Extension("exe".into())
        );
        assert_eq!(
            icon_source_with(&format!("{exe}!/in.exe"), false, true, false, true),
            Extension("exe".into())
        );
        // macOS 규칙이 꺼진 곳에서는 .app 폴더도 일반 폴더, 자기 아이콘 규칙이 꺼진 곳에서는 exe도 확장자.
        assert_eq!(icon_source_with(app, true, false, false, true), Folder);
        assert_eq!(
            icon_source_with(exe, false, false, true, false),
            Extension("exe".into())
        );
        // macOS: 디스크 위 .app은 경로.
        assert_eq!(
            icon_source_with(app, true, false, true, false),
            Path(app.into())
        );
    }

    #[test]
    fn system_icon_size_zero_is_none_and_caches_per_source_and_size() {
        let (_t, svc, _ch, _root) = setup();
        assert_eq!(svc.system_icon("/a/b.txt", false, 0).unwrap(), None);
        assert_eq!(
            svc.icons.lock().unwrap().len(),
            0,
            "크기 0은 캐시도 만들지 않는다"
        );
        let a = svc.system_icon("/a/b.txt", false, 32).unwrap();
        let b = svc.system_icon("/other/c.TXT", false, 32).unwrap();
        assert_eq!(a, b);
        assert_eq!(
            svc.icons.lock().unwrap().len(),
            1,
            "같은 확장자·크기는 한 항목만 만든다"
        );
        svc.system_icon("/a/b.txt", false, 64).unwrap();
        assert_eq!(
            svc.icons.lock().unwrap().len(),
            2,
            "크기가 다르면 따로 캐시한다"
        );
    }

    #[test]
    fn system_icon_cache_is_cleared_when_it_grows_past_the_limit() {
        let (_t, svc, _ch, _root) = setup();
        for i in 0..(ICON_CACHE_MAX + 3) {
            svc.system_icon(&format!("/a/f.ext{i}"), false, 16).unwrap();
        }
        assert!(svc.icons.lock().unwrap().len() <= ICON_CACHE_MAX);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn system_icon_returns_png_data_urls_that_differ_by_kind() {
        let (_t, svc, _ch, root) = setup();
        let prefix = "data:image/png;base64,";
        let txt = svc.system_icon("/a/x.txt", false, 32).unwrap().unwrap();
        let png = svc.system_icon("/a/x.png", false, 32).unwrap().unwrap();
        let dir = svc.system_icon("/a/dir", true, 32).unwrap().unwrap();
        for u in [&txt, &png, &dir] {
            assert!(u.starts_with(prefix), "{u}");
        }
        assert_ne!(txt, png);
        assert_ne!(txt, dir);
        // 압축 안 경로도 확장자로 얻는다(안의 파일이 실제로 없어도).
        let zip = format!("{root}/a.zip");
        let mut z = td_archive::ZipEdit::create(Path::new(&zip)).unwrap();
        z.add_file("x.txt", td_archive::Source::Bytes(b"hi".to_vec()));
        z.commit().unwrap();
        let inner = svc
            .system_icon(&format!("{zip}!/x.txt"), false, 32)
            .unwrap()
            .unwrap();
        assert_eq!(inner, txt);
    }

    /// 최소한의 OOXML 파일을 만든다. 각 항목은 (ZIP 안 경로, 내용)이다.
    fn write_ooxml(path: &str, parts: &[(&str, &str)]) {
        let mut z = td_archive::ZipEdit::create(Path::new(path)).unwrap();
        for (n, body) in parts {
            z.add_file(n, td_archive::Source::Bytes(body.as_bytes().to_vec()));
        }
        z.commit().unwrap();
    }

    #[test]
    fn office_preview_reads_docx_xlsx_pptx_text() {
        let (_t, svc, _ch, root) = setup();
        let docx = format!("{root}/a.docx");
        write_ooxml(
            &docx,
            &[
                (
                    "[Content_Types].xml",
                    r#"<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>"#,
                ),
                (
                    "_rels/.rels",
                    r#"<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>"#,
                ),
                (
                    "word/document.xml",
                    r#"<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>안녕하세요 오피스 본문</w:t></w:r></w:p></w:body></w:document>"#,
                ),
            ],
        );
        let d = svc.office_preview(&docx).unwrap();
        assert!(
            d.markdown.contains("안녕하세요 오피스 본문"),
            "{}",
            d.markdown
        );
        assert!(!d.truncated);

        let xlsx = format!("{root}/b.xlsx");
        std::fs::copy("fixtures/office/two-sheets.xlsx", &xlsx).unwrap();
        let d = svc.office_preview(&xlsx).unwrap();
        assert!(d.markdown.contains("첫 시트 값"), "{}", d.markdown);
        assert!(d.markdown.contains("둘째 시트 값"), "{}", d.markdown);

        let pptx = format!("{root}/c.pptx");
        write_ooxml(
            &pptx,
            &[
                (
                    "[Content_Types].xml",
                    r#"<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>"#,
                ),
                (
                    "_rels/.rels",
                    r#"<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>"#,
                ),
                (
                    "ppt/presentation.xml",
                    r#"<?xml version="1.0" encoding="UTF-8"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>"#,
                ),
                (
                    "ppt/_rels/presentation.xml.rels",
                    r#"<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>"#,
                ),
                (
                    "ppt/slides/slide1.xml",
                    r#"<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>슬라이드 제목 글</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>"#,
                ),
            ],
        );
        let d = svc.office_preview(&pptx).unwrap();
        assert!(d.markdown.contains("슬라이드 제목 글"), "{}", d.markdown);
    }

    #[test]
    fn office_preview_refuses_broken_files_wrong_extensions_and_archive_paths() {
        let (_t, svc, _ch, root) = setup();
        let broken = format!("{root}/broken.docx");
        std::fs::write(&broken, "zip이 아닌 내용").unwrap();
        assert!(svc.office_preview(&broken).is_err());
        let txt = format!("{root}/a.txt");
        std::fs::write(&txt, "x").unwrap();
        assert!(svc.office_preview(&txt).is_err());
        let zip = format!("{root}/x.zip");
        let mut z = td_archive::ZipEdit::create(Path::new(&zip)).unwrap();
        z.add_file("b.docx", td_archive::Source::Bytes(b"x".to_vec()));
        z.commit().unwrap();
        let err = svc.office_preview(&format!("{zip}!/b.docx")).unwrap_err();
        assert!(err.contains("압축"), "{err}");
    }

    #[test]
    fn epub_open_and_chapter_read_disk_files_and_refuse_archive_paths() {
        let (_t, svc, _ch, root) = setup();
        let container = r#"<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="c.opf"/></rootfiles></container>"#;
        let opf = r#"<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>책</dc:title></metadata><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/></spine></package>"#;
        let epub = format!("{root}/b.epub");
        let mut z = td_archive::ZipEdit::create(Path::new(&epub)).unwrap();
        for (n, body) in [
            ("META-INF/container.xml", container),
            ("c.opf", opf),
            ("a.xhtml", "<html>본문</html>"),
        ] {
            z.add_file(n, td_archive::Source::Bytes(body.as_bytes().to_vec()));
        }
        z.commit().unwrap();
        let info = svc.epub_open(&epub).unwrap();
        assert_eq!(info.title.as_deref(), Some("책"));
        assert_eq!(info.chapters.len(), 1);
        assert_eq!(svc.epub_chapter(&epub, 0).unwrap(), "<html>본문</html>");
        // 압축 파일 안의 epub은 읽지 않는다.
        let zip = format!("{root}/x.zip");
        let mut z = td_archive::ZipEdit::create(Path::new(&zip)).unwrap();
        z.add_file("b.epub", td_archive::Source::Path(epub.clone().into()));
        z.commit().unwrap();
        assert!(svc
            .epub_open(&format!("{zip}!/b.epub"))
            .unwrap_err()
            .contains("압축"));
        assert!(svc
            .epub_chapter(&format!("{zip}!/b.epub"), 0)
            .unwrap_err()
            .contains("압축"));
    }

    #[test]
    fn preview_limits_apply_to_images_inside_archives_and_cbz() {
        let (_t, svc, _ch, root) = setup();
        let png = vec![0x89u8, b'P', b'N', b'G', 1, 2, 3];
        let zip = format!("{root}/a.zip");
        let mut z = td_archive::ZipEdit::create(Path::new(&zip)).unwrap();
        z.add_file(
            "p.png",
            td_archive::Source::Bytes(vec![7u8; 2 * 1024 * 1024]),
        );
        z.commit().unwrap();
        let cbz = format!("{root}/c.cbz");
        let mut z = td_archive::ZipEdit::create(Path::new(&cbz)).unwrap();
        z.add_file(
            "1.png",
            td_archive::Source::Bytes(vec![7u8; 2 * 1024 * 1024]),
        );
        z.commit().unwrap();
        let _ = png;
        svc.set_preview_limits(&limits_cfg(1, 10, 20));
        assert!(svc
            .preview(&format!("{zip}!/p.png"))
            .unwrap()
            .data_url
            .is_none());
        assert!(svc.preview(&cbz).unwrap().data_url.is_none());
        svc.set_preview_limits(&limits_cfg(3, 10, 20));
        assert!(svc
            .preview(&format!("{zip}!/p.png"))
            .unwrap()
            .data_url
            .is_some());
        assert!(svc.preview(&cbz).unwrap().data_url.is_some());
    }

    #[test]
    fn preview_limits_follow_config_from_a_loaded_config() {
        // 시작·설정 화면·파일 재읽기가 모두 이 변환을 거쳐 서비스에 반영된다(main.rs의 `apply_config`).
        let (_t, svc, _ch, root) = setup();
        let p = format!("{root}/y.pdf");
        sparse(&p, 12);
        let l = td_config::load_from_strs(
            Some("[preview]\npdf_max_mb = 16\n"),
            None,
            td_config::Platform::Linux,
        );
        svc.set_preview_limits(&l.config.preview);
        assert!(svc.preview(&p).unwrap().data_url.is_some());
    }

    fn direct_cfg(on: bool, pdf_mb: u32) -> td_config::PreviewConfig {
        let mut c = limits_cfg(10, pdf_mb, 20);
        c.pdf_direct = on;
        c
    }

    #[test]
    fn pdf_direct_on_skips_reading_and_ignores_the_size_limit_for_disk_pdfs() {
        let (_t, svc, _ch, root) = setup();
        let p = format!("{root}/big.pdf");
        sparse(&p, 11);
        // 직접 열기 대상은 맨 앞이 `%PDF`인 파일이다(그렇지 않으면 기존 데이터 경로로 간다).
        {
            use std::io::Write;
            let mut f = std::fs::OpenOptions::new().write(true).open(&p).unwrap();
            f.write_all(b"%PDF-1.7").unwrap();
        }
        svc.set_preview_limits(&direct_cfg(false, 10));
        let off = svc.preview(&p).unwrap();
        assert!(
            off.truncated && off.data_url.is_none(),
            "꺼짐: 11MB는 지금처럼 한도 초과"
        );
        svc.set_preview_limits(&direct_cfg(true, 10));
        let on = svc.preview(&p).unwrap();
        assert_eq!(on.kind, PreviewKindDto::Pdf);
        assert!(
            !on.truncated && on.data_url.is_none(),
            "켜짐: 읽지 않고 한도도 무시"
        );
        assert_eq!(on.size, 11.0 * 1024.0 * 1024.0);
    }

    /// 앞에 `multipart/form-data` 업로드 머리가 붙은 PDF(이슈: 자산 프로토콜이 맨 앞 바이트로 형식을 정해 `text/html`로 내보낸다).
    const UPLOAD_PDF: &[u8] = b"--alamofire.boundary.x\r\nContent-Disposition: form-data; name=\"files[]\"\r\n\r\n%PDF-1.7\r\n%%EOF\r\n--alamofire.boundary.x--\r\n";

    #[test]
    fn pdf_direct_falls_back_to_data_when_header_is_not_first() {
        let (_t, svc, _ch, root) = setup();
        let p = format!("{root}/upload.pdf");
        std::fs::write(&p, UPLOAD_PDF).unwrap();
        svc.set_preview_limits(&direct_cfg(true, 10));
        let on = svc.preview(&p).unwrap();
        assert_eq!(on.kind, PreviewKindDto::Pdf);
        assert!(
            on.data_url
                .as_deref()
                .is_some_and(|u| u.starts_with("data:application/pdf;base64,")),
            "맨 앞이 %PDF가 아니면 직접 열기 대신 데이터로 싣는다"
        );
        assert!(!on.truncated);
    }

    #[test]
    fn pdf_direct_falls_back_still_applies_the_size_limit() {
        use std::io::Write;
        let (_t, svc, _ch, root) = setup();
        let p = format!("{root}/big-upload.pdf");
        sparse(&p, 11);
        let mut f = std::fs::OpenOptions::new().write(true).open(&p).unwrap();
        f.write_all(UPLOAD_PDF).unwrap();
        svc.set_preview_limits(&direct_cfg(true, 10));
        let on = svc.preview(&p).unwrap();
        assert_eq!(on.kind, PreviewKindDto::Pdf);
        assert!(
            on.truncated && on.data_url.is_none(),
            "기존 방식이라 pdf_max_mb 한도를 넘으면 너무 큼"
        );
    }

    #[test]
    fn pdf_direct_keeps_the_current_way_for_pdfs_inside_archives_and_when_off() {
        let (_t, svc, _ch, root) = setup();
        let zip = format!("{root}/a.zip");
        let mut z = td_archive::ZipEdit::create(Path::new(&zip)).unwrap();
        z.add_file("d.pdf", td_archive::Source::Bytes(b"%PDF-1.4".to_vec()));
        z.commit().unwrap();
        svc.set_preview_limits(&direct_cfg(true, 10));
        let inner = svc.preview(&format!("{zip}!/d.pdf")).unwrap();
        // 압축 안은 파일 주소를 쓸 수 없어 직접 열기 대상이 아니다(지금 방식의 결과: PDF를 미리 볼 수 없는 종류로 둔다).
        assert!(inner.data_url.is_none());
        let small = format!("{root}/s.pdf");
        std::fs::write(&small, b"%PDF-1.4").unwrap();
        svc.set_preview_limits(&direct_cfg(false, 10));
        assert!(
            svc.preview(&small).unwrap().data_url.is_some(),
            "꺼짐이면 지금처럼 데이터로 싣는다"
        );
    }

    /// 가짜 FTP·SFTP 서버를 띄우고 그 세션을 서비스의 원격 레지스트리에 넣어, 패널이 원격 폴더를 다루는 것처럼 확인한다(ADR-0019).
    mod remote {
        use super::*;
        use std::sync::Arc;
        use td_remote::testing::{ftp::FakeFtp, sftp::FakeSftp};
        use td_remote::{FtpSession, RemoteSession, SftpSession};

        /// 서버 쪽 임시 폴더를 일반 경로로 다루게 하는 얇은 손잡이.
        struct Server {
            _keep: Box<dyn std::any::Any>,
            root: PathBuf,
            url: String,
        }

        impl Server {
            fn path(&self, rel: &str) -> PathBuf {
                self.root.join(rel)
            }
            fn url(&self, rel: &str) -> String {
                format!("{}/{rel}", self.url.trim_end_matches('/'))
            }
        }

        fn ftp(svc: &Service<FakeTrash>) -> Server {
            let s = FakeFtp::start(true);
            let session = FtpSession::connect(s.cfg("u", "p")).unwrap();
            svc.remote_registry()
                .insert("ftpbox", Arc::new(session) as Arc<dyn RemoteSession>);
            Server {
                root: s.path(""),
                url: "ftp://ftpbox/".to_string(),
                _keep: Box::new(s),
            }
        }

        fn sftp(svc: &Service<FakeTrash>) -> Server {
            let s = FakeSftp::start();
            let session = SftpSession::connect(s.cfg("u", "p")).unwrap();
            svc.remote_registry()
                .insert("sftpbox", Arc::new(session) as Arc<dyn RemoteSession>);
            Server {
                root: s.path(""),
                url: "sftp://sftpbox/".to_string(),
                _keep: Box::new(s),
            }
        }

        fn run_job(svc: &Service<FakeTrash>, kind: JobKindDto, items: Vec<QueueItemDto>) -> JobDto {
            let id = svc.enqueue(kind, items);
            wait_finished(svc, id)
        }

        fn big() -> Vec<u8> {
            (0..(300 * 1024u32))
                .map(|i| (i % 253) as u8)
                .chain(*b"\r\n\n")
                .collect()
        }

        fn lists_remote_entries_sorted(make: fn(&Service<FakeTrash>) -> Server) {
            let (_t, svc, _ch, _root) = setup();
            let s = make(&svc);
            std::fs::create_dir(s.path("zdir")).unwrap();
            std::fs::write(s.path("a.txt"), b"1").unwrap();
            std::fs::write(s.path(".hidden"), b"2").unwrap();
            let visible = svc.list_dir(&s.url(""), false).unwrap();
            let names: Vec<_> = visible.iter().map(|e| e.name.as_str()).collect();
            assert_eq!(names, ["zdir", "a.txt"]);
            assert_eq!(visible[0].kind, KindDto::Dir);
            assert!(visible[1].path.starts_with(s.url.as_str()));
            assert_eq!(svc.list_dir(&s.url(""), true).unwrap().len(), 3);
        }

        fn copies_remote_file_to_local_and_back(make: fn(&Service<FakeTrash>) -> Server) {
            let (_t, svc, _ch, root) = setup();
            let s = make(&svc);
            let data = big();
            std::fs::write(s.path("down.bin"), &data).unwrap();
            let job = run_job(
                &svc,
                JobKindDto::Copy,
                vec![item(&s.url("down.bin"), Some(&root), ConflictDto::Skip)],
            );
            assert_eq!(job.status, JobStatusDto::Done, "{:?}", job.errors);
            assert_eq!(std::fs::read(format!("{root}/down.bin")).unwrap(), data);

            std::fs::write(format!("{root}/up.bin"), &data).unwrap();
            let job = run_job(
                &svc,
                JobKindDto::Copy,
                vec![item(
                    &format!("{root}/up.bin"),
                    Some(&s.url("")),
                    ConflictDto::Skip,
                )],
            );
            assert_eq!(job.status, JobStatusDto::Done, "{:?}", job.errors);
            assert_eq!(std::fs::read(s.path("up.bin")).unwrap(), data);
        }

        fn copies_folders_recursively_both_ways(make: fn(&Service<FakeTrash>) -> Server) {
            let (_t, svc, _ch, root) = setup();
            let s = make(&svc);
            std::fs::create_dir_all(s.path("proj/sub/deep")).unwrap();
            std::fs::write(s.path("proj/a.txt"), b"a").unwrap();
            std::fs::write(s.path("proj/sub/b.txt"), b"bb").unwrap();
            std::fs::write(s.path("proj/sub/deep/한글.txt"), b"ccc").unwrap();
            let job = run_job(
                &svc,
                JobKindDto::Copy,
                vec![item(&s.url("proj"), Some(&root), ConflictDto::Skip)],
            );
            assert_eq!(job.status, JobStatusDto::Done, "{:?}", job.errors);
            assert_eq!(
                std::fs::read(format!("{root}/proj/sub/deep/한글.txt")).unwrap(),
                b"ccc"
            );
            assert_eq!(
                std::fs::read(format!("{root}/proj/sub/b.txt")).unwrap(),
                b"bb"
            );

            std::fs::create_dir_all(format!("{root}/local/x")).unwrap();
            std::fs::write(format!("{root}/local/x/f.txt"), b"up").unwrap();
            let job = run_job(
                &svc,
                JobKindDto::Copy,
                vec![item(
                    &format!("{root}/local"),
                    Some(&s.url("")),
                    ConflictDto::Skip,
                )],
            );
            assert_eq!(job.status, JobStatusDto::Done, "{:?}", job.errors);
            assert_eq!(std::fs::read(s.path("local/x/f.txt")).unwrap(), b"up");
        }

        fn creates_renames_and_moves_inside_remote(make: fn(&Service<FakeTrash>) -> Server) {
            let (_t, svc, _ch, _root) = setup();
            let s = make(&svc);
            svc.mkdir(&s.url("a/b")).unwrap();
            assert!(s.path("a/b").is_dir());
            svc.touch(&s.url("a/new.txt")).unwrap();
            assert!(s.path("a/new.txt").is_file());
            let renamed = svc.rename(&s.url("a/new.txt"), "renamed.txt").unwrap();
            assert_eq!(renamed, s.url("a/renamed.txt"));
            assert!(s.path("a/renamed.txt").is_file() && !s.path("a/new.txt").exists());
            let job = run_job(
                &svc,
                JobKindDto::Move,
                vec![item(
                    &s.url("a/renamed.txt"),
                    Some(&s.url("a/b")),
                    ConflictDto::Skip,
                )],
            );
            assert_eq!(job.status, JobStatusDto::Done, "{:?}", job.errors);
            assert!(s.path("a/b/renamed.txt").is_file() && !s.path("a/renamed.txt").exists());
        }

        fn moves_between_remote_and_local_by_copy_then_delete(
            make: fn(&Service<FakeTrash>) -> Server,
        ) {
            let (_t, svc, _ch, root) = setup();
            let s = make(&svc);
            std::fs::write(s.path("m.txt"), b"move me").unwrap();
            let job = run_job(
                &svc,
                JobKindDto::Move,
                vec![item(&s.url("m.txt"), Some(&root), ConflictDto::Skip)],
            );
            assert_eq!(job.status, JobStatusDto::Done, "{:?}", job.errors);
            assert_eq!(std::fs::read(format!("{root}/m.txt")).unwrap(), b"move me");
            assert!(!s.path("m.txt").exists(), "원본이 지워져야 한다");
            let job = run_job(
                &svc,
                JobKindDto::Move,
                vec![item(
                    &format!("{root}/m.txt"),
                    Some(&s.url("")),
                    ConflictDto::Skip,
                )],
            );
            assert_eq!(job.status, JobStatusDto::Done, "{:?}", job.errors);
            assert_eq!(std::fs::read(s.path("m.txt")).unwrap(), b"move me");
            assert!(!std::path::Path::new(&format!("{root}/m.txt")).exists());
        }

        fn deletes_permanently_and_refuses_trash(make: fn(&Service<FakeTrash>) -> Server) {
            let (_t, svc, _ch, _root) = setup();
            let s = make(&svc);
            std::fs::create_dir_all(s.path("d/e")).unwrap();
            std::fs::write(s.path("d/e/f.txt"), b"x").unwrap();
            std::fs::write(s.path("g.txt"), b"y").unwrap();
            let job = run_job(
                &svc,
                JobKindDto::Trash,
                vec![item(&s.url("g.txt"), None, ConflictDto::Skip)],
            );
            assert_eq!(job.status, JobStatusDto::Failed, "원격에는 휴지통이 없다");
            assert!(s.path("g.txt").exists());
            let job = run_job(
                &svc,
                JobKindDto::Delete,
                vec![
                    item(&s.url("d"), None, ConflictDto::Skip),
                    item(&s.url("g.txt"), None, ConflictDto::Skip),
                ],
            );
            assert_eq!(job.status, JobStatusDto::Done, "{:?}", job.errors);
            assert!(!s.path("d").exists() && !s.path("g.txt").exists());
        }

        fn detects_conflicts_and_applies_policy(make: fn(&Service<FakeTrash>) -> Server) {
            let (_t, svc, _ch, root) = setup();
            let s = make(&svc);
            std::fs::write(s.path("same.txt"), b"remote").unwrap();
            std::fs::write(format!("{root}/same.txt"), b"local").unwrap();
            assert_eq!(
                svc.detect_conflict(&format!("{root}/same.txt"), &s.url("")),
                Some(s.url("same.txt"))
            );
            let job = run_job(
                &svc,
                JobKindDto::Copy,
                vec![item(
                    &format!("{root}/same.txt"),
                    Some(&s.url("")),
                    ConflictDto::Skip,
                )],
            );
            assert_eq!(job.status, JobStatusDto::Done);
            assert_eq!(
                std::fs::read(s.path("same.txt")).unwrap(),
                b"remote",
                "건너뛰면 그대로"
            );
            let job = run_job(
                &svc,
                JobKindDto::Copy,
                vec![item(
                    &format!("{root}/same.txt"),
                    Some(&s.url("")),
                    ConflictDto::Overwrite,
                )],
            );
            assert_eq!(job.status, JobStatusDto::Done, "{:?}", job.errors);
            assert_eq!(
                std::fs::read(s.path("same.txt")).unwrap(),
                b"local",
                "덮어쓰기"
            );
            assert!(
                std::fs::read_dir(s.path("")).unwrap().all(|e| !e
                    .unwrap()
                    .file_name()
                    .to_string_lossy()
                    .contains("td-replaced")),
                "치워 둔 임시 파일이 남지 않는다"
            );
        }

        fn aborts_a_queued_transfer_and_leaves_the_queue_usable(
            make: fn(&Service<FakeTrash>) -> Server,
        ) {
            let (_t, svc, _ch, root) = setup();
            let s = make(&svc);
            std::fs::write(s.path("x.bin"), big()).unwrap();
            let id = svc.enqueue(
                JobKindDto::Copy,
                vec![item(&s.url("x.bin"), Some(&root), ConflictDto::Skip)],
            );
            svc.queue_abort(id);
            let job = wait_finished(&svc, id);
            assert!(
                matches!(job.status, JobStatusDto::Aborted | JobStatusDto::Done),
                "{:?}",
                job.status
            );
            // 중단 뒤에도 같은 연결로 다음 작업이 된다.
            let job = run_job(
                &svc,
                JobKindDto::Copy,
                vec![item(
                    &s.url("x.bin"),
                    Some(&format!("{root}/again")),
                    ConflictDto::Skip,
                )],
            );
            assert!(matches!(
                job.status,
                JobStatusDto::Done | JobStatusDto::Failed
            ));
            assert_eq!(svc.list_dir(&s.url(""), true).unwrap().len(), 1);
        }

        /// 원격 경로의 미리보기: 텍스트(앞부분)와 이미지(한도 안)만 보이고, 나머지 형식은 읽지 않고 `Other`로 돌려준다.
        fn previews_remote_text_and_image_and_refuses_others(
            make: fn(&Service<FakeTrash>) -> Server,
        ) {
            let (_t, svc, _ch, _root) = setup();
            let s = make(&svc);
            // 작은 이미지는 한도 안이고, 1MB 한도를 두고 한도보다 큰 이미지는 데이터 없이 잘림으로 표시한다.
            svc.set_preview_limits(&limits_cfg(1, 10, 20));
            std::fs::write(s.path("note.txt"), "원격 본문").unwrap();
            std::fs::write(s.path("small.png"), vec![0x89u8; 64]).unwrap();
            std::fs::write(s.path("big.png"), vec![0u8; 1024 * 1024 + 1]).unwrap();
            std::fs::write(s.path("doc.pdf"), b"%PDF-1.4").unwrap();
            std::fs::write(s.path("clip.mp4"), b"x").unwrap();
            std::fs::write(s.path("song.mp3"), b"x").unwrap();
            std::fs::create_dir(s.path("dir")).unwrap();

            let t = svc.preview(&s.url("note.txt")).unwrap();
            assert_eq!(t.kind, PreviewKindDto::Text);
            assert_eq!(t.text.as_deref(), Some("원격 본문"));
            assert!(!t.truncated);

            let i = svc.preview(&s.url("small.png")).unwrap();
            assert_eq!(i.kind, PreviewKindDto::Image);
            assert!(i
                .data_url
                .as_deref()
                .is_some_and(|d| d.starts_with("data:image/png;base64,")));
            assert!(!i.truncated);

            let b = svc.preview(&s.url("big.png")).unwrap();
            assert_eq!(b.kind, PreviewKindDto::Image);
            assert!(
                b.truncated && b.data_url.is_none(),
                "한도를 넘은 이미지는 내려받지 않는다"
            );

            for name in ["doc.pdf", "clip.mp4", "song.mp3"] {
                assert_eq!(
                    svc.preview(&s.url(name)).unwrap().kind,
                    PreviewKindDto::Other,
                    "{name}"
                );
            }
            assert_eq!(
                svc.preview(&s.url("dir")).unwrap().kind,
                PreviewKindDto::Directory
            );
            assert!(svc.preview(&s.url("nope.txt")).is_err());
        }

        macro_rules! per_protocol {
            ($($module:ident => $make:ident),*) => {$(
                mod $module {
                    use super::*;
                    #[test] fn 원격_목록은_폴더_먼저_이름순이고_숨김을_거른다() { lists_remote_entries_sorted($make) }
                    #[test] fn 원격과_로컬_사이_파일_복사는_바이트가_같다() { copies_remote_file_to_local_and_back($make) }
                    #[test] fn 폴더를_양방향으로_재귀_복사한다() { copies_folders_recursively_both_ways($make) }
                    #[test] fn 원격_안에서_폴더_파일_만들기_이름_바꾸기_이동() { creates_renames_and_moves_inside_remote($make) }
                    #[test] fn 원격과_로컬_사이_이동은_복사_뒤_원본_삭제다() { moves_between_remote_and_local_by_copy_then_delete($make) }
                    #[test] fn 원격은_영구_삭제만_되고_휴지통은_거부한다() { deletes_permanently_and_refuses_trash($make) }
                    #[test] fn 충돌을_감지하고_정책을_적용한다() { detects_conflicts_and_applies_policy($make) }
                    #[test] fn 큐_작업을_중단해도_연결은_계속_쓸_수_있다() { aborts_a_queued_transfer_and_leaves_the_queue_usable($make) }
                    #[test] fn 원격_미리보기는_텍스트와_이미지를_보여_주고_나머지는_거절한다() { previews_remote_text_and_image_and_refuses_others($make) }
                }
            )*};
        }

        per_protocol!(ftp_session => ftp, sftp_session => sftp);

        mod connect {
            use super::*;
            use std::cell::{Cell, RefCell};
            use std::collections::HashMap;
            use td_remote::{connect_session, Protocol, RemoteError, RemoteTarget, SecretStore};

            #[derive(Default)]
            struct Mem(RefCell<HashMap<String, String>>);
            impl SecretStore for Mem {
                fn get(&self, k: &str) -> td_remote::Result<Option<String>> {
                    Ok(self.0.borrow().get(k).cloned())
                }
                fn set(&self, k: &str, p: &str) -> td_remote::Result<()> {
                    self.0.borrow_mut().insert(k.into(), p.into());
                    Ok(())
                }
                fn delete(&self, k: &str) -> td_remote::Result<()> {
                    self.0.borrow_mut().remove(k);
                    Ok(())
                }
            }

            fn target(protocol: Protocol, port: u16, base: &str) -> RemoteTarget {
                RemoteTarget {
                    protocol,
                    host: "127.0.0.1".into(),
                    port,
                    user: "u".into(),
                    base_dir: base.into(),
                }
            }

            /// 가짜 서버 하나를 띄우고 (대상, 서버 폴더, 서버 손잡이)를 돌려준다.
            fn start(
                protocol: Protocol,
                base: &str,
            ) -> (RemoteTarget, PathBuf, Box<dyn std::any::Any>) {
                match protocol {
                    Protocol::Ftp => {
                        let s = FakeFtp::start(true);
                        (target(protocol, s.port, base), s.path(""), Box::new(s))
                    }
                    Protocol::Sftp => {
                        let s = FakeSftp::start();
                        (target(protocol, s.port, base), s.path(""), Box::new(s))
                    }
                }
            }

            /// 가짜 서버가 생성한 공개 키만 테스트 전용 임시 저장소에 승인한다.
            fn verified_opener(
                server: &dyn std::any::Any,
            ) -> impl Fn(&RemoteTarget, &str, &str) -> td_remote::Result<Arc<dyn RemoteSession>>
            {
                let policy = server
                    .downcast_ref::<FakeSftp>()
                    .map(|s| s.cfg("u", "p").host_key)
                    .unwrap_or_default();
                move |t, u, pw| td_remote::connect_session_verified(t, u, pw, policy.clone())
            }

            fn each(f: impl Fn(Protocol)) {
                f(Protocol::Ftp);
                f(Protocol::Sftp);
            }

            #[test]
            fn 연결하면_루트_경로를_돌려주고_그_경로를_읽을_수_있다() {
                each(|p| {
                    let (_t, svc, _ch, _root) = setup();
                    let (t, dir, _srv) = start(p, "");
                    let connect_session = verified_opener(_srv.as_ref());
                    std::fs::write(dir.join("hello.txt"), b"hi").unwrap();
                    let url = connect_remote(
                        &svc.remote_registry(),
                        &t,
                        Some("p".into()),
                        false,
                        &Mem::default(),
                        &connect_session,
                    )
                    .unwrap();
                    assert!(
                        url.starts_with(&format!("{}://u@127.0.0.1:{}/", p.name(), t.port)),
                        "{url}"
                    );
                    let names: Vec<_> = svc
                        .list_dir(&url, false)
                        .unwrap()
                        .into_iter()
                        .map(|e| e.name)
                        .collect();
                    assert_eq!(names, ["hello.txt"]);
                });
            }

            #[test]
            fn 시작_폴더가_있으면_그_폴더가_루트다() {
                each(|p| {
                    let (_t, svc, _ch, _root) = setup();
                    let (t, dir, _srv) = start(p, "/sub");
                    let connect_session = verified_opener(_srv.as_ref());
                    std::fs::create_dir(dir.join("sub")).unwrap();
                    let url = connect_remote(
                        &svc.remote_registry(),
                        &t,
                        Some("p".into()),
                        false,
                        &Mem::default(),
                        &connect_session,
                    )
                    .unwrap();
                    assert!(url.ends_with("/sub"), "{url}");
                });
            }

            #[test]
            fn 이미_열린_연결은_다시_접속하지_않고_재사용한다() {
                each(|p| {
                    let (_t, svc, _ch, _root) = setup();
                    let (t, _dir, _srv) = start(p, "");
                    let connect_session = verified_opener(_srv.as_ref());
                    let calls = Cell::new(0);
                    let opener = |t: &RemoteTarget, u: &str, pw: &str| {
                        calls.set(calls.get() + 1);
                        connect_session(t, u, pw)
                    };
                    let reg = svc.remote_registry();
                    let a =
                        connect_remote(&reg, &t, Some("p".into()), false, &Mem::default(), &opener)
                            .unwrap();
                    let b =
                        connect_remote(&reg, &t, None, false, &Mem::default(), &opener).unwrap();
                    assert_eq!(a, b);
                    assert_eq!(calls.get(), 1);
                });
            }

            #[test]
            fn 비밀번호가_없거나_틀리면_인증_오류이고_저장된_값은_남는다() {
                each(|p| {
                    let (_t, svc, _ch, _root) = setup();
                    let (t, _dir, _srv) = start(p, "");
                    let connect_session = verified_opener(_srv.as_ref());
                    let reg = svc.remote_registry();
                    let store = Mem::default();
                    let err = connect_remote(&reg, &t, None, false, &store, &connect_session)
                        .unwrap_err();
                    assert_eq!(err, RemoteError::Auth);
                    store.set(&td_remote::secret_key(&t), "p").unwrap();
                    let err = connect_remote(
                        &reg,
                        &t,
                        Some("틀림".into()),
                        true,
                        &store,
                        &connect_session,
                    )
                    .unwrap_err();
                    assert_eq!(err, RemoteError::Auth);
                    assert_eq!(
                        store.get(&td_remote::secret_key(&t)).unwrap().as_deref(),
                        Some("p")
                    );
                    assert!(!reg.contains(&t.id()));
                    // 저장된 비밀번호로는 열린다.
                    connect_remote(&reg, &t, None, false, &store, &connect_session).unwrap();
                    assert!(reg.contains(&t.id()));
                });
            }

            #[test]
            fn 기억을_고르면_성공한_비밀번호를_키체인에_저장한다() {
                each(|p| {
                    let (_t, svc, _ch, _root) = setup();
                    let (t, _dir, _srv) = start(p, "");
                    let connect_session = verified_opener(_srv.as_ref());
                    let store = Mem::default();
                    connect_remote(
                        &svc.remote_registry(),
                        &t,
                        Some("p".into()),
                        true,
                        &store,
                        &connect_session,
                    )
                    .unwrap();
                    assert_eq!(
                        store.get(&td_remote::secret_key(&t)).unwrap().as_deref(),
                        Some("p")
                    );
                });
            }

            #[test]
            fn 닫힌_포트는_연결_불가_오류다() {
                each(|p| {
                    let (_t, svc, _ch, _root) = setup();
                    let port = {
                        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
                        l.local_addr().unwrap().port()
                    };
                    let t = target(p, port, "");
                    let err = connect_remote(
                        &svc.remote_registry(),
                        &t,
                        Some("p".into()),
                        false,
                        &Mem::default(),
                        &connect_session,
                    )
                    .unwrap_err();
                    assert_eq!(err, RemoteError::Unreachable);
                });
            }

            #[test]
            fn 끊으면_세션이_닫혀_그_경로를_더_읽을_수_없다() {
                each(|p| {
                    let (_t, svc, _ch, _root) = setup();
                    let (t, _dir, _srv) = start(p, "");
                    let connect_session = verified_opener(_srv.as_ref());
                    let reg = svc.remote_registry();
                    let url = connect_remote(
                        &reg,
                        &t,
                        Some("p".into()),
                        false,
                        &Mem::default(),
                        &connect_session,
                    )
                    .unwrap();
                    assert!(svc.list_dir(&url, false).is_ok());
                    assert!(reg.remove(&t.id()));
                    let err = svc.list_dir(&url, false).unwrap_err();
                    assert!(err.contains("원격 연결이 열려 있지 않습니다"), "{err}");
                });
            }
        }

        #[cfg(unix)]
        #[test]
        fn 순환_심볼릭_링크가_있는_원격_폴더도_복사가_끝나고_나머지_파일은_복사된다() {
            let (_t, svc, _ch, root) = setup();
            let s = sftp(&svc);
            std::fs::create_dir_all(s.path("proj/sub")).unwrap();
            std::fs::write(s.path("proj/a.txt"), b"a").unwrap();
            std::fs::write(s.path("proj/sub/b.txt"), b"b").unwrap();
            std::os::unix::fs::symlink(s.path("proj"), s.path("proj/sub/loop")).unwrap(); // 자기 조상을 가리키는 링크
            std::os::unix::fs::symlink(s.path("proj/a.txt"), s.path("proj/alias.txt")).unwrap();
            let job = run_job(
                &svc,
                JobKindDto::Copy,
                vec![item(&s.url("proj"), Some(&root), ConflictDto::Skip)],
            );
            // 폴더 링크는 따라가지 않아 건너뛰고(오류로 알림) 나머지는 복사한다.
            assert_eq!(std::fs::read(format!("{root}/proj/a.txt")).unwrap(), b"a");
            assert_eq!(
                std::fs::read(format!("{root}/proj/sub/b.txt")).unwrap(),
                b"b"
            );
            assert_eq!(
                std::fs::read(format!("{root}/proj/alias.txt")).unwrap(),
                b"a",
                "파일 링크는 내용이 복사된다"
            );
            assert!(!std::path::Path::new(&format!("{root}/proj/sub/loop")).exists());
            assert!(
                job.errors.iter().any(|e| e.path.ends_with("loop")),
                "{:?}",
                job.errors
            );
        }

        #[test]
        fn 연결이_없는_원격_경로는_오류다() {
            let (_t, svc, _ch, _root) = setup();
            let err = svc.list_dir("sftp://nobody/", false).unwrap_err();
            assert!(err.contains("원격 연결이 열려 있지 않습니다"), "{err}");
        }

        #[test]
        fn 원격_경로는_감시하지_않고_성공으로_본다() {
            let (_t, svc, _ch, _root) = setup();
            assert!(svc.watch("sftp://x/a").is_ok());
            assert!(svc.unwatch("ftp://x/a").is_ok());
        }
    }

    #[test]
    fn reachable_address_replaces_unspecified_with_a_lan_address_and_keeps_others() {
        assert_eq!(
            reachable_address("127.0.0.1:2222".parse().unwrap()),
            "127.0.0.1:2222"
        );
        assert_eq!(
            reachable_address("192.168.0.7:2222".parse().unwrap()),
            "192.168.0.7:2222"
        );
        let shown = reachable_address("0.0.0.0:2222".parse().unwrap());
        let addr: std::net::SocketAddr = shown.parse().unwrap();
        assert_eq!(addr.port(), 2222);
        // 네트워크가 있으면 LAN 주소로, 없으면 0.0.0.0 그대로다. 어느 쪽이든 접속에 못 쓰는 "미지정" 주소를 새로 만들지는 않는다.
        assert!(!addr.ip().is_unspecified() || shown == "0.0.0.0:2222");
    }

    mod remote_server {
        use super::*;
        use std::cell::RefCell;
        use td_remote::{RemoteError, RemoteSession, SecretStore, SftpConfig, SftpSession};

        /// 키체인 대신 메모리에 담는 비밀번호 저장소.
        #[derive(Default)]
        struct Mem(RefCell<HashMap<String, String>>);
        impl SecretStore for Mem {
            fn get(&self, k: &str) -> td_remote::Result<Option<String>> {
                Ok(self.0.borrow().get(k).cloned())
            }
            fn set(&self, k: &str, p: &str) -> td_remote::Result<()> {
                self.0.borrow_mut().insert(k.into(), p.into());
                Ok(())
            }
            fn delete(&self, k: &str) -> td_remote::Result<()> {
                self.0.borrow_mut().remove(k);
                Ok(())
            }
        }

        fn cfg(root: &str) -> td_config::RemoteServerConfig {
            td_config::RemoteServerConfig {
                enabled: true,
                bind: "127.0.0.1".into(),
                port: 0,
                root: root.into(),
                allow_write: false,
                allow_shell: false,
                user: "me".into(),
            }
        }

        /// 서버의 호스트 키를 사용자가 승인한 것처럼 정책을 만든다: 처음 접속은 키를 보여 주며 거부되고, 그 키를 승인 키로 쓴다.
        pub(super) fn trusting(port: u16, dir: &Path) -> td_remote::HostKeyPolicy {
            let policy = td_remote::HostKeyPolicy {
                directory: Some(dir.to_path_buf()),
                approved_key: None,
            };
            let probe = SftpSession::connect(SftpConfig {
                host: "127.0.0.1".into(),
                port,
                user: "me".into(),
                password: String::new(),
                host_key: policy.clone(),
            });
            match probe.err() {
                Some(RemoteError::HostKey(c)) => td_remote::HostKeyPolicy {
                    approved_key: Some(c.public_key),
                    ..policy
                },
                // 이미 저장된 키면 검증을 통과해 비밀번호 단계(Auth)까지 간다: 승인 없이도 접속된다.
                Some(RemoteError::Auth) | None => policy,
                other => panic!("호스트 키 확인 단계에서 거부되거나 통과해야 한다: {other:?}"),
            }
        }

        /// 이미 신뢰 저장소에 저장된 키로만 접속한다(서버가 꺼진 뒤의 접속 확인용).
        fn connect_saved(port: u16, password: &str, dir: &Path) -> td_remote::Result<SftpSession> {
            SftpSession::connect(SftpConfig {
                host: "127.0.0.1".into(),
                port,
                user: "me".into(),
                password: password.into(),
                host_key: td_remote::HostKeyPolicy {
                    directory: Some(dir.to_path_buf()),
                    approved_key: None,
                },
            })
        }

        fn connect(port: u16, password: &str, dir: &Path) -> td_remote::Result<SftpSession> {
            SftpSession::connect(SftpConfig {
                host: "127.0.0.1".into(),
                port,
                user: "me".into(),
                password: password.into(),
                host_key: trusting(port, dir),
            })
        }

        fn port_of(status: &RemoteServerStatus) -> u16 {
            status.addresses[0]
                .rsplit(':')
                .next()
                .unwrap()
                .parse()
                .unwrap()
        }

        #[test]
        fn remote_server_서비스에서_켜면_접속되고_끄면_닫힌다() {
            let (t, svc, _ch, root) = setup();
            let key = t.path().join(REMOTE_SERVER_HOST_KEY_FILE);
            let secrets = Mem::default();
            std::fs::write(format!("{root}/hello.txt"), "안녕").unwrap();
            svc.set_remote_server_password("pw", &secrets).unwrap();

            let on = svc
                .remote_server_start(&cfg(&root), &key, &secrets)
                .unwrap();
            assert!(on.running && on.has_password && on.last_error.is_none());
            assert!(on.fingerprint.as_deref().is_some_and(|f| !f.is_empty()));
            let port = port_of(&on);
            let trust = t.path().join("trust");
            let sess = connect(port, "pw", &trust).unwrap();
            let names: Vec<_> = sess
                .list("/")
                .unwrap()
                .into_iter()
                .map(|e| e.name)
                .collect();
            assert!(names.contains(&"hello.txt".to_string()), "{names:?}");
            assert_eq!(connect(port, "틀림", &trust).err(), Some(RemoteError::Auth));
            drop(sess);

            let off = svc.remote_server_stop(&secrets);
            assert!(!off.running && off.addresses.is_empty() && off.fingerprint.is_none());
            let deadline = Instant::now() + Duration::from_secs(5);
            while connect_saved(port, "pw", &trust).is_ok() && Instant::now() < deadline {
                std::thread::sleep(Duration::from_millis(50));
            }
            assert!(
                connect_saved(port, "pw", &trust).is_err(),
                "끈 뒤에도 접속된다"
            );
        }

        #[test]
        fn remote_server_비밀번호_없이_켜면_거부한다() {
            let (t, svc, _ch, root) = setup();
            let key = t.path().join(REMOTE_SERVER_HOST_KEY_FILE);
            let secrets = Mem::default();
            let err = svc
                .remote_server_start(&cfg(&root), &key, &secrets)
                .unwrap_err();
            assert!(err.contains("비밀번호"), "{err}");
            let st = svc.remote_server_status(&secrets);
            assert!(!st.running);
            assert_eq!(st.last_error.as_deref(), Some(err.as_str()));
            // 빈 비밀번호 저장은 지우기라 여전히 거부된다.
            svc.set_remote_server_password("", &secrets).unwrap();
            assert!(svc
                .remote_server_start(&cfg(&root), &key, &secrets)
                .is_err());
        }

        #[test]
        fn remote_server_루트가_비어_있으면_거부한다() {
            let (t, svc, _ch, _root) = setup();
            let key = t.path().join(REMOTE_SERVER_HOST_KEY_FILE);
            let secrets = Mem::default();
            svc.set_remote_server_password("pw", &secrets).unwrap();
            let err = svc
                .remote_server_start(&cfg("  "), &key, &secrets)
                .unwrap_err();
            assert!(err.contains("루트"), "{err}");
            assert!(!svc.remote_server_status(&secrets).running);
        }

        #[test]
        fn remote_server_상태는_비밀번호_값을_담지_않고_성공하면_오류를_지운다() {
            let (t, svc, _ch, root) = setup();
            let key = t.path().join(REMOTE_SERVER_HOST_KEY_FILE);
            let secrets = Mem::default();
            let st = svc.remote_server_status(&secrets);
            assert_eq!(
                st,
                RemoteServerStatus {
                    running: false,
                    addresses: vec![],
                    fingerprint: None,
                    has_password: false,
                    last_error: None,
                }
            );
            assert!(svc
                .remote_server_start(&cfg(&root), &key, &secrets)
                .is_err());
            let st = svc.set_remote_server_password("zq9-값", &secrets).unwrap();
            assert!(st.has_password && st.last_error.is_some());
            assert!(!format!("{st:?}").contains("zq9"));
            let st = svc
                .remote_server_start(&cfg(&root), &key, &secrets)
                .unwrap();
            assert!(st.running && st.last_error.is_none());
            svc.remote_server_stop(&secrets);
        }
    }

    mod remote_terminal {
        use super::*;
        use std::cell::RefCell;
        use td_remote::{Protocol, RemoteTarget, SecretStore};

        #[derive(Default)]
        struct Mem(RefCell<HashMap<String, String>>);
        impl SecretStore for Mem {
            fn get(&self, k: &str) -> td_remote::Result<Option<String>> {
                Ok(self.0.borrow().get(k).cloned())
            }
            fn set(&self, k: &str, p: &str) -> td_remote::Result<()> {
                self.0.borrow_mut().insert(k.into(), p.into());
                Ok(())
            }
            fn delete(&self, k: &str) -> td_remote::Result<()> {
                self.0.borrow_mut().remove(k);
                Ok(())
            }
        }

        /// 내장 서버를 띄우고 (임시 폴더 둘, 클라이언트 서비스, 그 채널, 서버 서비스, 접속 대상)을 돌려준다.
        /// 앞의 임시 폴더와 서버 서비스는 시험이 끝날 때까지 살려 두려고 돌려준다.
        #[allow(clippy::type_complexity)]
        fn start_server(
            allow_shell: bool,
        ) -> (
            (tempfile::TempDir, tempfile::TempDir),
            Service<FakeTrash>,
            Channels,
            Service<FakeTrash>,
            RemoteTarget,
        ) {
            let (t, server_svc, _ch, root) = setup();
            let (t2, client, ch, _root2) = setup();
            let key = t.path().join(REMOTE_SERVER_HOST_KEY_FILE);
            let secrets = Mem::default();
            server_svc
                .set_remote_server_password("pw", &secrets)
                .unwrap();
            let cfg = td_config::RemoteServerConfig {
                enabled: true,
                bind: "127.0.0.1".into(),
                port: 0,
                root,
                allow_write: false,
                allow_shell,
                user: "me".into(),
            };
            let st = server_svc
                .remote_server_start(&cfg, &key, &secrets)
                .unwrap();
            let port: u16 = st.addresses[0].rsplit(':').next().unwrap().parse().unwrap();
            let target = RemoteTarget {
                protocol: Protocol::Sftp,
                host: "127.0.0.1".into(),
                port,
                user: "me".into(),
                base_dir: String::new(),
            };
            ((t, t2), client, ch, server_svc, target)
        }

        fn connect(svc: &Service<FakeTrash>, t: &RemoteTarget) -> String {
            // 신뢰 저장소는 이어지는 원격 셸 접속에서도 쓰이므로 시험이 끝날 때까지 남긴다.
            let dir = tempfile::tempdir().unwrap().keep();
            let approved = super::remote_server::trusting(t.port, &dir);
            let shell_policy = td_remote::HostKeyPolicy {
                approved_key: None,
                ..approved.clone()
            };
            let url = svc
                .connect_remote(
                    t,
                    Some("pw".into()),
                    false,
                    &Mem::default(),
                    shell_policy,
                    &|t, user, password| {
                        td_remote::connect_session_verified(t, user, password, approved.clone())
                    },
                )
                .unwrap();
            // `sftp://<id>/...`에서 연결 id만 뽑는다.
            url.trim_start_matches("sftp://")
                .split('/')
                .next()
                .unwrap()
                .to_string()
        }

        #[test]
        fn remote_terminal_셸이_허용된_서버에서_입출력과_종료가_흐른다() {
            let (_t, svc, ch, _server, target) = start_server(true);
            let id = connect(&svc, &target);
            let term = svc.remote_terminal_open(&id, 80, 24).unwrap();
            svc.terminal_write(term, "echo TD_$((40+2))_MARK\n")
                .unwrap();
            svc.terminal_resize(term, 100, 30).unwrap();
            let mut out = Vec::new();
            let deadline = Instant::now() + Duration::from_secs(10);
            while Instant::now() < deadline {
                if let Ok(TermEvent::Output { id: i, data }) =
                    ch.terminal_events.recv_timeout(Duration::from_millis(200))
                {
                    assert_eq!(i, term);
                    out.extend(data);
                    if String::from_utf8_lossy(&out).contains("TD_42_MARK\r\n") {
                        break;
                    }
                }
            }
            let text = String::from_utf8_lossy(&out);
            assert!(text.contains("TD_42_MARK"), "{text}");
            svc.terminal_close(term).unwrap();
            let deadline = Instant::now() + Duration::from_secs(10);
            let mut exited = false;
            while Instant::now() < deadline && !exited {
                if let Ok(TermEvent::Exit { id: i, .. }) =
                    ch.terminal_events.recv_timeout(Duration::from_millis(200))
                {
                    assert_eq!(i, term);
                    exited = true;
                }
            }
            assert!(exited, "닫은 뒤 종료 이벤트가 없다");
            assert!(svc.terminal_write(term, "x").is_err());
        }

        #[test]
        fn remote_terminal_셸을_허용하지_않는_서버면_오류다() {
            let (_t, svc, _ch, _server, target) = start_server(false);
            let id = connect(&svc, &target);
            let err = svc.remote_terminal_open(&id, 80, 24).unwrap_err();
            assert!(err.contains("셸"), "{err}");
        }

        #[test]
        fn remote_terminal_없는_연결과_ftp_연결은_오류다() {
            let (_t, svc, _ch, _root) = setup();
            let err = svc.remote_terminal_open("nobody@x:1", 80, 24).unwrap_err();
            assert!(err.contains("열려 있지 않습니다"), "{err}");
            let ftp = td_remote::testing::ftp::FakeFtp::start(true);
            let session = td_remote::FtpSession::connect(ftp.cfg("u", "p")).unwrap();
            svc.remote_registry()
                .insert("ftpbox", std::sync::Arc::new(session));
            let err = svc.remote_terminal_open("ftpbox", 80, 24).unwrap_err();
            assert!(err.contains("SFTP"), "{err}");
        }

        #[test]
        fn remote_terminal_연결을_끊으면_접속_정보도_지운다() {
            let (_t, svc, _ch, _server, target) = start_server(true);
            let id = connect(&svc, &target);
            svc.disconnect_remote(&id);
            assert!(svc.remote_terminal_open(&id, 80, 24).is_err());
        }
    }
}
