//! Look Up(질의 파서 + 라이브 순회 검색), Flatten, Disk Usage (docs/08 §5~7).
//!
//! 질의 문법과 그 가정은 [ADR-0013](../../docs/adr/0013-lookup-query-syntax.md)에 있다.

mod eval;
mod flatten;
mod kinds;
mod query;
mod search;
mod usage;

pub use flatten::flatten;
pub use kinds::{KindName, SimpleKind};
pub use query::{parse, Cond, Field, Op, ParseError, Query, TextOp, TextTest};
pub use search::{
    search, spawn, walk, CancelToken, SearchEvent, SearchHandle, SearchOptions, SearchReport,
    WalkReport,
};
pub use usage::{crosses_volume, disk_usage, UsageItem, UsageOptions, UsageReport};
