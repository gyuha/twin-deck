//! 아카이브(ZIP 계열 읽기/쓰기, tar 계열 읽기 전용)를 폴더처럼 다루는 계층.
//! 경로 표기는 [ADR-0012](../../docs/adr/0012-archive-path-notation.md)를 따른다.

mod archive;
mod error;
mod kind;
mod path;
mod writer;

pub use archive::{Archive, EntryInfo, ExtractReport};
pub use error::{ArchiveError, Result};
pub use kind::{kind_for_name, Kind};
pub use path::{join_archive_path, split_archive_path, ArchivePath};
pub use writer::{edit_in, Source, ZipEdit};
