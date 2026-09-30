//! Flatten (FIND-05): 하위의 모든 파일을 평면 목록으로.

use td_vfs::{Entry, EntryKind, Vfs, VfsPath};

use crate::search::{walk, CancelToken, WalkReport};

/// `root` 아래의 파일을 하나씩 `on_file`로 보낸다. 폴더는 목록에 넣지 않고 그 안만 훑는다.
/// 심볼릭 링크는 따라가지 않고 링크 자체를 한 항목으로 낸다(순환 링크가 있어도 끝난다). 취소하면 즉시 멈춘다.
/// `Vfs` 기반이라 아카이브 안(`x.zip!`)에서도 같다.
pub fn flatten<V: Vfs>(
    vfs: &V,
    root: &VfsPath,
    cancel: &CancelToken,
    on_file: &mut dyn FnMut(&Entry),
) -> WalkReport {
    walk(vfs, root, cancel, &mut |entry| {
        if entry.kind != EntryKind::Dir {
            on_file(entry);
        }
    })
}
