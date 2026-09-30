//! 조건 평가. 텍스트 비교는 NFC 정규화 후 대소문자를 무시한다.

use std::time::SystemTime;

use td_vfs::{glob_match, normalize_name, Entry, EntryKind, Vfs};

use crate::kinds;
use crate::query::{Cond, Field, Op, TextOp, TextTest};
use crate::search::SearchOptions;

fn fold(s: &str) -> String {
    normalize_name(s).to_lowercase()
}

pub fn text_matches(test: &TextTest, value: &str) -> bool {
    if test.op == TextOp::Like {
        return glob_match(&test.arg, value);
    }
    let (v, a) = (fold(value), fold(&test.arg));
    match test.op {
        TextOp::Is => v == a,
        TextOp::IsNot => v != a,
        TextOp::Contains => v.contains(&a),
        TextOp::StartsWith => v.starts_with(&a),
        TextOp::EndsWith => v.ends_with(&a),
        TextOp::Like => unreachable!(),
    }
}

fn cmp_num(op: Op, left: u64, right: u64) -> bool {
    match op {
        Op::Is => left == right,
        Op::IsNot => left != right,
        Op::Lt => left < right,
        Op::Le => left <= right,
        Op::Gt => left > right,
        Op::Ge => left >= right,
        _ => false,
    }
}

fn time_matches(op: Op, t: SystemTime, lo: SystemTime, hi: SystemTime) -> bool {
    match op {
        Op::Is => lo <= t && t < hi,
        Op::IsNot => !(lo <= t && t < hi),
        Op::Lt => t < lo,
        Op::Le => t < hi,
        Op::Gt => t >= hi,
        Op::Ge => t >= lo,
        _ => false,
    }
}

/// Content 조건: 텍스트 파일(NUL 없음)이고 크기 상한 이하일 때만 본문을 비교한다.
fn content_matches<V: Vfs>(vfs: &V, entry: &Entry, test: &TextTest, opts: &SearchOptions) -> bool {
    if entry.kind != EntryKind::File || entry.size > opts.max_content_bytes as u64 {
        return false;
    }
    let Ok(bytes) = vfs.read_head(&entry.path, opts.max_content_bytes) else {
        return false;
    };
    if bytes.contains(&0) {
        return false;
    }
    text_matches(test, &String::from_utf8_lossy(&bytes))
}

/// 조건 하나를 평가한다. `Unsupported`는 항상 거짓이다.
fn matches_one<V: Vfs>(vfs: &V, entry: &Entry, cond: &Cond, opts: &SearchOptions) -> bool {
    match cond {
        Cond::Name(t) => text_matches(t, &entry.name),
        Cond::Content(t) => content_matches(vfs, entry, t, opts),
        Cond::Size { op, bytes } => {
            entry.kind == EntryKind::File && cmp_num(*op, entry.size, *bytes)
        }
        Cond::Time { field, op, lo, hi } => {
            let t = match field {
                Field::Modified => entry.modified,
                Field::Created => entry.created,
            };
            t.is_some_and(|t| time_matches(*op, t, *lo, *hi))
        }
        Cond::Kind { kind, negate } => {
            kinds::matches(*kind, entry, &opts.extra_zip_exts) != *negate
        }
        Cond::Unsupported { .. } => false,
    }
}

/// 모든 조건(AND)을 만족하는가. 값싼 조건을 먼저 보고 본문 검사는 마지막에 한다.
pub fn matches_all<V: Vfs>(vfs: &V, entry: &Entry, conds: &[Cond], opts: &SearchOptions) -> bool {
    let cheap = conds.iter().filter(|c| !matches!(c, Cond::Content(_)));
    let costly = conds.iter().filter(|c| matches!(c, Cond::Content(_)));
    cheap
        .chain(costly)
        .all(|c| matches_one(vfs, entry, c, opts))
}
