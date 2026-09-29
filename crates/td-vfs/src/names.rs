use std::cmp::Ordering;

use unicode_normalization::UnicodeNormalization;

use crate::{Entry, EntryKind};

/// macOS는 한글을 NFD로 저장하고 다른 OS는 NFC를 쓴다. 비교 전에 NFC로 맞춘다.
pub fn normalize_name(name: &str) -> String {
    name.nfc().collect()
}

fn key(name: &str) -> String {
    normalize_name(name).to_lowercase()
}

/// 정규화 후 대소문자를 무시하고 비교한다.
pub fn compare_names(a: &str, b: &str) -> Ordering {
    key(a).cmp(&key(b))
}

/// Quick Select용: 정규화 후 접두 일치(대소문자 무시).
pub fn matches_prefix(name: &str, input: &str) -> bool {
    key(name).starts_with(&key(input))
}

/// 폴더 먼저, 그다음 이름순(`compare_names`와 같은 규칙).
/// 정렬 키(정규화+소문자)를 항목마다 한 번만 만든다. 비교할 때마다 만들면 10만 항목에서 문자열 할당이
/// 수백만 번 일어나 10배 가까이 느렸다(docs/m2-benchmark.md).
pub fn sort_entries(entries: &mut [Entry]) {
    entries.sort_by_cached_key(|e| (e.kind != EntryKind::Dir, key(&e.name)));
}
