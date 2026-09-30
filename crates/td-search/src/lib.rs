//! Look Up(질의 파서 + 라이브 순회 검색)과, Flatten/Disk Usage가 함께 쓰는 순회 (docs/08 §5~7).
//!
//! 질의 문법과 그 가정은 [ADR-0013](../../docs/adr/0013-lookup-query-syntax.md)에 있다.

mod eval;
mod kinds;
mod query;
mod search;

pub use kinds::{KindName, SimpleKind};
pub use query::{parse, Cond, Field, Op, ParseError, Query, TextOp, TextTest};
pub use search::{
    search, spawn, walk, CancelToken, SearchEvent, SearchHandle, SearchOptions, SearchReport,
    WalkReport,
};
