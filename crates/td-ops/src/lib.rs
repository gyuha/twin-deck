//! 파일 작업(복사, 이동, 이름 변경, 삭제 등)과 이름 충돌 처리.

mod error;
mod ops;
mod trasher;

pub use error::{OpsError, Result};
pub use ops::{ConflictPolicy, Control, NoControl, Ops, Outcome};
pub use trasher::{SystemTrash, Trasher};
