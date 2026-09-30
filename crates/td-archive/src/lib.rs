//! 아카이브(ZIP 계열 읽기/쓰기, tar 계열 읽기 전용)를 폴더처럼 다루는 계층.
//! 경로 표기는 [ADR-0012](../../docs/adr/0012-archive-path-notation.md)를 따른다.

mod archive;
mod composite;
mod compress;
mod edit_session;
mod error;
mod kind;
mod path;
mod writer;

pub use archive::{Archive, EntryInfo, ExtractReport};
pub use composite::CompositeFs;
pub use compress::{compress, CompressReport};
pub use edit_session::{start_edit, EditSession};
pub use error::{ArchiveError, Result};
pub use kind::{kind_for_name, sniff_kind, Kind, ZIP_EXTS};
pub use path::{join_archive_path, split_archive_path, split_archive_path_with, ArchivePath};
pub use writer::{edit_in, edit_in_with, Source, ZipEdit};
