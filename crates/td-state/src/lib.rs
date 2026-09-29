//! 재시작 상태 복원(PANE-05)과 다중 창(PANE-03)의 코어 로직.
//! 파일 입출력과 창 레이블 규칙만 다루고 UI/Tauri에는 의존하지 않는다.

mod snapshot;
mod windows;

pub use snapshot::{
    load, reset, save, LoadedState, PaneSnap, Snapshot, SortSnap, TabSnap, ViewSnap, VERSION,
};
pub use windows::{next_window_label, open_new_window, pattern_matches, Spawner};
