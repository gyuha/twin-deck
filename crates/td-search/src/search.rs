//! 라이브 순회: `Vfs`를 재귀로 훑으며 결과를 콜백/채널로 흘려 보내고, 언제든 취소할 수 있다.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver};
use std::sync::Arc;
use std::thread::{self, JoinHandle};

use td_vfs::{Entry, EntryKind, ListOptions, Vfs, VfsPath};

use crate::eval::matches_all;
use crate::query::Query;

/// 여러 곳에서 공유하는 취소 표시.
#[derive(Debug, Clone, Default)]
pub struct CancelToken(Arc<AtomicBool>);

impl CancelToken {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn cancel(&self) {
        self.0.store(true, Ordering::SeqCst);
    }

    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }

    /// 같은 취소 표시를 가리키는가(복제한 토큰끼리는 true).
    pub fn same_as(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.0, &other.0)
    }
}

#[derive(Debug, Clone)]
pub struct SearchOptions {
    /// Content 조건이 읽을 최대 크기. 이보다 큰 파일은 본문 조건에서 제외된다.
    pub max_content_bytes: usize,
    /// 설정의 `file_systems.zip.additional_extensions`.
    pub extra_zip_exts: Vec<String>,
}

impl Default for SearchOptions {
    fn default() -> Self {
        Self {
            max_content_bytes: 1024 * 1024,
            extra_zip_exts: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct WalkReport {
    /// 살펴본 항목 수(루트 제외).
    pub visited: u64,
    /// 읽지 못해 건너뛴 폴더 수.
    pub unreadable: u64,
    pub cancelled: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SearchReport {
    pub visited: u64,
    pub matched: u64,
    pub unreadable: u64,
    pub cancelled: bool,
    /// 지원하지 않는 변수 등에 대한 경고.
    pub warnings: Vec<String>,
}

/// `root` 아래를 깊이 우선으로 훑는다. 숨김 파일도 포함하고(.gitignore도 무시하지 않는다),
/// 심볼릭 링크는 따라가지 않고 링크 자체를 한 항목으로 본다. 취소되면 즉시 멈추고 이후 콜백은 없다.
pub fn walk<V: Vfs>(
    vfs: &V,
    root: &VfsPath,
    cancel: &CancelToken,
    visit: &mut dyn FnMut(&Entry),
) -> WalkReport {
    let mut report = WalkReport::default();
    let mut stack = vec![root.clone()];
    let opts = ListOptions { show_hidden: true };
    while let Some(dir) = stack.pop() {
        if cancel.is_cancelled() {
            report.cancelled = true;
            return report;
        }
        let Ok(entries) = vfs.list(&dir, &opts) else {
            report.unreadable += 1;
            continue;
        };
        let mut subdirs = Vec::new();
        for entry in entries {
            if cancel.is_cancelled() {
                report.cancelled = true;
                return report;
            }
            report.visited += 1;
            visit(&entry);
            if entry.kind == EntryKind::Dir {
                subdirs.push(entry.path);
            }
        }
        stack.extend(subdirs);
    }
    report
}

/// 질의에 맞는 항목을 찾아 `on_match`로 흘려 보낸다. 지원하지 않는 조건이 있으면 순회하지 않고 경고만 돌려준다.
pub fn search<V: Vfs>(
    vfs: &V,
    root: &VfsPath,
    query: &Query,
    opts: &SearchOptions,
    cancel: &CancelToken,
    on_match: &mut dyn FnMut(&Entry),
) -> SearchReport {
    let mut report = SearchReport {
        warnings: query.warnings(),
        ..SearchReport::default()
    };
    if !query.is_supported() {
        return report;
    }
    let mut matched = 0;
    let walked = walk(vfs, root, cancel, &mut |entry| {
        if matches_all(vfs, entry, &query.conds, opts) {
            matched += 1;
            on_match(entry);
        }
    });
    report.visited = walked.visited;
    report.unreadable = walked.unreadable;
    report.cancelled = walked.cancelled;
    report.matched = matched;
    report
}

#[derive(Debug)]
pub enum SearchEvent {
    Match(Entry),
    /// 마지막 이벤트. 이후에는 아무것도 오지 않는다.
    Done(SearchReport),
}

/// 별도 스레드에서 도는 검색. 결과는 채널로 스트리밍된다.
pub struct SearchHandle {
    pub events: Receiver<SearchEvent>,
    cancel: CancelToken,
    worker: Option<JoinHandle<()>>,
}

impl SearchHandle {
    pub fn cancel(&self) {
        self.cancel.cancel();
    }

    /// 스레드가 끝나기를 기다린다.
    pub fn join(mut self) {
        if let Some(w) = self.worker.take() {
            let _ = w.join();
        }
    }
}

impl Drop for SearchHandle {
    /// 버리면 취소하고 스레드가 끝나기를 기다린다(새 질의나 탭 닫기 때 즉시 멈춘다).
    fn drop(&mut self) {
        self.cancel.cancel();
        if let Some(w) = self.worker.take() {
            let _ = w.join();
        }
    }
}

pub fn spawn<V: Vfs + Send + 'static>(
    vfs: V,
    root: VfsPath,
    query: Query,
    opts: SearchOptions,
) -> SearchHandle {
    let (tx, rx) = mpsc::channel();
    let cancel = CancelToken::new();
    let worker_cancel = cancel.clone();
    let worker = thread::spawn(move || {
        let report = search(&vfs, &root, &query, &opts, &worker_cancel, &mut |entry| {
            let _ = tx.send(SearchEvent::Match(entry.clone()));
        });
        let _ = tx.send(SearchEvent::Done(report));
    });
    SearchHandle {
        events: rx,
        cancel,
        worker: Some(worker),
    }
}
