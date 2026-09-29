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

/// 폴더 먼저, 그다음 이름순.
pub fn sort_entries(entries: &mut [Entry]) {
    entries.sort_by(|a, b| {
        let a_dir = a.kind == EntryKind::Dir;
        let b_dir = b.kind == EntryKind::Dir;
        b_dir
            .cmp(&a_dir)
            .then_with(|| compare_names(&a.name, &b.name))
    });
}
