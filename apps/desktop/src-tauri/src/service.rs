//! Tauri에 의존하지 않는 명령 구현. commands.rs가 이 계층에 위임한다.

use std::path::{Path, PathBuf};
use std::sync::mpsc::Receiver;
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};
use specta::Type;
use td_archive::CompositeFs;
use td_launch::{Launch, Launcher};
use td_ops::{ConflictPolicy, Ops, Trasher};
use td_queue::{Item, JobInfo, JobKind, JobSpec, JobStatus, Queue, QueueEvent};
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
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum PreviewKindDto {
    Text,
    Image,
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

impl From<td_vfs::Preview> for PreviewDto {
    fn from(p: td_vfs::Preview) -> Self {
        PreviewDto {
            kind: match p.kind {
                td_vfs::PreviewKind::Text => PreviewKindDto::Text,
                td_vfs::PreviewKind::Image => PreviewKindDto::Image,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct JobDto {
    pub id: u32,
    pub kind: JobKindDto,
    pub status: JobStatusDto,
    pub total: u32,
    pub completed: u32,
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
        }
    }
}

impl From<&JobInfo> for JobDto {
    fn from(j: &JobInfo) -> Self {
        JobDto {
            id: j.id as u32,
            kind: match j.kind {
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

pub type ServiceResult<T> = Result<T, String>;

fn vp(p: &str) -> VfsPath {
    VfsPath::new(PathBuf::from(p))
}

/// 서비스가 밖으로 내보내는 수신기들.
pub struct Channels {
    /// 변경된 디렉터리 경로.
    pub dir_changes: Receiver<PathBuf>,
    pub queue_events: Receiver<QueueEvent>,
}

/// 파일 작업과 감시, 작업 큐를 묶은 서비스. 앱 상태로 보관한다.
pub struct Service<T: Trasher> {
    /// 즉시 실행하는 짧은 작업(폴더/파일 만들기, 이름 변경, 충돌 확인).
    ops: Ops<CompositeFs, T>,
    queue: Queue,
    watcher: Mutex<DirWatcher>,
}

impl<T: Trasher + Clone + Send + 'static> Service<T> {
    pub fn new(trasher: T) -> ServiceResult<(Self, Channels)> {
        let (watcher, dir_changes) = DirWatcher::new().map_err(|e| e.to_string())?;
        let (queue, queue_events) = Queue::new(Ops::new(CompositeFs::default(), trasher.clone()));
        Ok((
            Self {
                ops: Ops::new(CompositeFs::default(), trasher),
                queue,
                watcher: Mutex::new(watcher),
            },
            Channels {
                dir_changes,
                queue_events,
            },
        ))
    }

    /// 복사/이동/휴지통/삭제를 큐에 넣는다. 작업 id를 돌려준다.
    pub fn enqueue(&self, kind: JobKindDto, items: Vec<QueueItemDto>) -> u32 {
        let items = items
            .into_iter()
            .map(|i| Item {
                src: vp(&i.src),
                dest_dir: i.dest_dir.as_deref().map(vp),
                policy: i.policy.into(),
            })
            .collect();
        self.queue.enqueue(JobSpec {
            kind: kind.into(),
            items,
        }) as u32
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
        let mut entries = CompositeFs::default()
            .list(&vp(path), &ListOptions { show_hidden })
            .map_err(|e| e.to_string())?;
        sort_entries(&mut entries);
        Ok(entries.iter().map(EntryDto::from).collect())
    }

    pub fn file_info(&self, path: &str) -> ServiceResult<FileInfoDto> {
        CompositeFs::default()
            .info(&vp(path))
            .map(|i| FileInfoDto::from(&i))
            .map_err(|e| e.to_string())
    }

    pub fn preview(&self, path: &str) -> ServiceResult<PreviewDto> {
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

/// 설정한 편집기로 열기 (OP-09). 없는 경로가 하나라도 있으면 실행하지 않는다.
pub fn edit<L: Launcher>(launch: &Launch<L>, editor: &str, paths: &[String]) -> ServiceResult<()> {
    for p in paths {
        std::fs::symlink_metadata(p).map_err(|e| format!("{p}: {e}"))?;
    }
    launch.edit(editor, paths)
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
        assert_eq!(svc.detect_conflict(&a, &root), Some(a.clone()));
        let renamed = svc.rename(&a, "b.txt").unwrap();
        assert!(renamed.ends_with("root/b.txt"));
        assert!(svc.rename(&renamed, "x/y").is_err());
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
