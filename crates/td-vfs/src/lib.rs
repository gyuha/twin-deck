//! 로컬 파일시스템과 (이후) 아카이브를 같은 인터페이스로 다루는 VFS 계층.

mod entry;
mod error;
mod glob;
mod info;
mod local;
mod names;
mod path;
mod preview;

pub use entry::{Entry, EntryKind, FileId, ListOptions};
pub use error::{Result, VfsError};
pub use glob::glob_match;
pub use info::Info;
pub use local::LocalFs;
pub use names::{compare_names, matches_prefix, normalize_name, sort_entries};
pub use path::VfsPath;
pub use preview::{read_preview, Preview, PreviewKind, PreviewLimits};

/// 파일시스템 추상화. `LocalFs`가 기본 구현이고, 아카이브는 td-archive의 `CompositeFs`가 라우팅한다.
pub trait Vfs {
    fn list(&self, dir: &VfsPath, opts: &ListOptions) -> Result<Vec<Entry>>;
    fn stat(&self, path: &VfsPath) -> Result<Entry>;
    /// 중첩 경로를 포함해 폴더를 만든다.
    fn mkdir(&self, path: &VfsPath) -> Result<()>;
    /// 0바이트 파일을 만든다. 이미 있으면 오류.
    fn create_file(&self, path: &VfsPath) -> Result<()>;
    fn rename(&self, from: &VfsPath, to: &VfsPath) -> Result<()>;
    fn remove_file(&self, path: &VfsPath) -> Result<()>;
    fn remove_dir_all(&self, path: &VfsPath) -> Result<()>;
    /// 파일 하나를 복사하고 복사한 바이트 수를 돌려준다.
    fn copy_file(&self, from: &VfsPath, to: &VfsPath) -> Result<u64>;
    /// 파일 정보 대화상자용 상세 정보.
    fn info(&self, path: &VfsPath) -> Result<Info>;
    /// 심볼릭 링크가 가리키는 대상을 읽는다.
    fn read_link(&self, path: &VfsPath) -> Result<VfsPath>;
    /// `link` 위치에 `target`을 가리키는 심볼릭 링크를 만든다. `target_is_dir`은 Windows에서만 쓰인다.
    fn symlink(&self, target: &VfsPath, link: &VfsPath, target_is_dir: bool) -> Result<()>;
    /// 파일의 앞부분을 최대 `max`바이트 읽는다(Look Up의 Content 조건 등). 파일이 더 짧으면 전부.
    fn read_head(&self, path: &VfsPath, max: usize) -> Result<Vec<u8>>;
    /// 휴지통으로 보낼 수 있는 위치인가. 아카이브 안은 영구 삭제만 된다.
    fn can_trash(&self, _path: &VfsPath) -> bool {
        true
    }
}
