//! Analyze Disk Usage (FIND-06): 하위 항목별 총 크기를 병렬로 계산한다.
//!
//! 규칙(docs/08 §7, 모두 twin-deck의 결정): 하드 링크는 한 번만 센다, 심볼릭 링크는 따라가지 않고
//! 링크 자체의 크기만 센다, 볼륨 경계는 옵션(`cross_volumes`, 기본 false)이 없으면 넘지 않는다.

use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use td_vfs::{Entry, EntryKind, FileId, ListOptions, Vfs, VfsPath};

use crate::search::CancelToken;

#[derive(Debug, Clone)]
pub struct UsageOptions {
    /// 다른 볼륨(장치)에 있는 하위 폴더까지 셀지. 기본은 넘지 않는다.
    pub cross_volumes: bool,
    /// 병렬 워커 수. 0이면 CPU 수(최대 8)를 쓴다.
    pub threads: usize,
    /// 진행 중 부분 결과를 알리는 간격.
    pub update_every: Duration,
}

impl Default for UsageOptions {
    fn default() -> Self {
        Self {
            cross_volumes: false,
            threads: 0,
            update_every: Duration::from_millis(50),
        }
    }
}

/// 대상 폴더의 바로 아래 항목 하나와 그 총 크기.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UsageItem {
    pub name: String,
    pub path: VfsPath,
    pub kind: EntryKind,
    /// 지금까지 센 바이트. 폴더는 하위 전부의 합(아카이브 안에서는 압축 해제 크기).
    pub bytes: u64,
    /// 지금까지 센 파일(과 링크) 수.
    pub files: u64,
    /// 이 항목의 계산이 끝났는가. 취소되면 끝나지 않은 항목은 false로 남고, 그 값은 부분 합이다.
    pub done: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct UsageReport {
    pub total_bytes: u64,
    pub total_files: u64,
    /// 읽지 못해 건너뛴 폴더 수.
    pub unreadable: u64,
    /// 하드 링크라서 두 번째부터 건너뛴 파일 수.
    pub hardlinks_skipped: u64,
    /// 볼륨 경계 때문에 건너뛴 폴더 수.
    pub volume_skipped: u64,
    pub cancelled: bool,
}

struct Slot {
    entry: Entry,
    bytes: AtomicU64,
    files: AtomicU64,
    done: AtomicBool,
}

#[derive(Default)]
struct Shared {
    seen_links: Mutex<HashSet<(u64, u64)>>,
    unreadable: AtomicU64,
    hardlinks_skipped: AtomicU64,
    volume_skipped: AtomicU64,
}

/// 하드 링크로 이미 센 파일인가. 처음 보면 기록하고 false.
fn already_counted(shared: &Shared, id: Option<FileId>) -> bool {
    let Some(id) = id.filter(|i| i.nlink > 1) else {
        return false;
    };
    !shared.seen_links.lock().unwrap().insert((id.dev, id.ino))
}

/// 볼륨 경계를 넘는 폴더인가.
pub fn crosses_volume(root_dev: Option<u64>, entry: &Entry, opts: &UsageOptions) -> bool {
    if opts.cross_volumes || entry.kind != EntryKind::Dir {
        return false;
    }
    matches!((root_dev, entry.file_id), (Some(root), Some(id)) if id.dev != root)
}

fn add_leaf(shared: &Shared, slot: &Slot, entry: &Entry) {
    if already_counted(shared, entry.file_id) {
        shared.hardlinks_skipped.fetch_add(1, Ordering::Relaxed);
        return;
    }
    slot.bytes.fetch_add(entry.size, Ordering::Relaxed);
    slot.files.fetch_add(1, Ordering::Relaxed);
}

fn count_slot<V: Vfs>(
    vfs: &V,
    slot: &Slot,
    shared: &Shared,
    root_dev: Option<u64>,
    opts: &UsageOptions,
    cancel: &CancelToken,
) {
    match slot.entry.kind {
        EntryKind::Dir => {
            let list_opts = ListOptions { show_hidden: true };
            let mut stack = vec![slot.entry.path.clone()];
            while let Some(dir) = stack.pop() {
                if cancel.is_cancelled() {
                    return;
                }
                let Ok(children) = vfs.list(&dir, &list_opts) else {
                    shared.unreadable.fetch_add(1, Ordering::Relaxed);
                    continue;
                };
                for child in children {
                    if cancel.is_cancelled() {
                        return;
                    }
                    if child.kind == EntryKind::Dir {
                        if crosses_volume(root_dev, &child, opts) {
                            shared.volume_skipped.fetch_add(1, Ordering::Relaxed);
                        } else {
                            stack.push(child.path);
                        }
                    } else {
                        add_leaf(shared, slot, &child);
                    }
                }
            }
        }
        _ => add_leaf(shared, slot, &slot.entry),
    }
    slot.done.store(true, Ordering::SeqCst);
}

fn snapshot(slots: &[Slot]) -> Vec<UsageItem> {
    let mut items: Vec<UsageItem> = slots
        .iter()
        .map(|s| UsageItem {
            name: s.entry.name.clone(),
            path: s.entry.path.clone(),
            kind: s.entry.kind,
            bytes: s.bytes.load(Ordering::Relaxed),
            files: s.files.load(Ordering::Relaxed),
            done: s.done.load(Ordering::SeqCst),
        })
        .collect();
    items.sort_by(|a, b| b.bytes.cmp(&a.bytes).then_with(|| a.name.cmp(&b.name)));
    items
}

/// `root`의 바로 아래 항목마다 총 크기를 병렬로 계산한다. 계산하는 동안 `update_every`마다, 그리고 끝날 때
/// 크기 내림차순 스냅샷을 `on_update`로 보낸다. 취소하면 멈추고 그때까지의 부분 합을 마지막 스냅샷으로 준다.
/// 마지막 스냅샷을 돌려주는 값과 함께 보고서를 반환한다.
pub fn disk_usage<V: Vfs + Sync>(
    vfs: &V,
    root: &VfsPath,
    opts: &UsageOptions,
    cancel: &CancelToken,
    on_update: &mut dyn FnMut(&[UsageItem]),
) -> (Vec<UsageItem>, UsageReport) {
    let children = vfs
        .list(root, &ListOptions { show_hidden: true })
        .unwrap_or_default();
    let root_dev = vfs.stat(root).ok().and_then(|e| e.file_id).map(|i| i.dev);
    let slots: Vec<Slot> = children
        .into_iter()
        .map(|entry| Slot {
            entry,
            bytes: AtomicU64::new(0),
            files: AtomicU64::new(0),
            done: AtomicBool::new(false),
        })
        .collect();
    let shared = Shared::default();
    let next = AtomicUsize::new(0);
    let threads = match opts.threads {
        0 => thread::available_parallelism()
            .map_or(4, |n| n.get())
            .min(8),
        n => n,
    }
    .clamp(1, slots.len().max(1));
    let finished = AtomicUsize::new(0);

    thread::scope(|scope| {
        for _ in 0..threads {
            scope.spawn(|| {
                loop {
                    let i = next.fetch_add(1, Ordering::SeqCst);
                    let Some(slot) = slots.get(i) else { break };
                    if cancel.is_cancelled() {
                        break;
                    }
                    count_slot(vfs, slot, &shared, root_dev, opts, cancel);
                }
                finished.fetch_add(1, Ordering::SeqCst);
            });
        }
        while finished.load(Ordering::SeqCst) < threads {
            thread::sleep(opts.update_every);
            on_update(&snapshot(&slots));
        }
    });

    let items = snapshot(&slots);
    on_update(&items);
    let report = UsageReport {
        total_bytes: items.iter().map(|i| i.bytes).sum(),
        total_files: items.iter().map(|i| i.files).sum(),
        unreadable: shared.unreadable.load(Ordering::Relaxed),
        hardlinks_skipped: shared.hardlinks_skipped.load(Ordering::Relaxed),
        volume_skipped: shared.volume_skipped.load(Ordering::Relaxed),
        cancelled: cancel.is_cancelled() && items.iter().any(|i| !i.done),
    };
    (items, report)
}
