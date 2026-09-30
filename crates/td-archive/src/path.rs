use crate::kind::kind_for_name;

/// `!/`로 나눈 아카이브 안 위치.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArchivePath {
    /// 바깥 아카이브의 로컬 경로.
    pub outer: String,
    /// 바깥에서 안쪽으로 들어가는 중첩 아카이브 항목들(각각 바로 앞 아카이브 안의 경로).
    pub nested: Vec<String>,
    /// 가장 안쪽 아카이브 안의 경로. 앞뒤 `/` 없이. 루트는 빈 문자열.
    pub inner: String,
}

fn base_name(p: &str) -> &str {
    p.rsplit('/').next().unwrap_or(p)
}

/// 경계 후보 위치들: `!/`의 시작 인덱스, 그리고 문자열이 `!`로 끝나면 그 위치(루트 표기 `x.zip!`).
fn boundaries(s: &str) -> Vec<(usize, usize)> {
    let mut out: Vec<(usize, usize)> = s.match_indices("!/").map(|(i, _)| (i, i + 2)).collect();
    if s.ends_with('!') && !s.ends_with("!/") {
        out.push((s.len() - 1, s.len()));
    }
    out
}

/// 경로를 아카이브 경계로 나눈다. 아카이브 경로가 아니면 None.
/// `outer_is_file(p)`는 바깥 아카이브 후보가 **실제 파일**인지 알려 준다(ADR-0012).
pub fn split_archive_path(
    path: &str,
    extra_zip_exts: &[String],
    outer_is_file: &dyn Fn(&str) -> bool,
) -> Option<ArchivePath> {
    split_archive_path_with(path, extra_zip_exts, outer_is_file, &|_| false)
}

/// `split_archive_path`와 같지만, `forced_outer(p)`가 true인 경로는 확장자와 무관하게 바깥 아카이브로 본다("Open As", ARC-04).
pub fn split_archive_path_with(
    path: &str,
    extra_zip_exts: &[String],
    outer_is_file: &dyn Fn(&str) -> bool,
    forced_outer: &dyn Fn(&str) -> bool,
) -> Option<ArchivePath> {
    for (start, end) in boundaries(path) {
        let prefix = &path[..start];
        let by_name = kind_for_name(base_name(prefix), extra_zip_exts).is_some();
        if !(by_name || forced_outer(prefix)) || !outer_is_file(prefix) {
            continue;
        }
        let mut rest = &path[end..];
        let mut nested = Vec::new();
        'walk: loop {
            for (s, e) in boundaries(rest) {
                if kind_for_name(base_name(&rest[..s]), extra_zip_exts).is_some() {
                    nested.push(rest[..s].trim_matches('/').to_string());
                    rest = &rest[e..];
                    continue 'walk;
                }
            }
            break;
        }
        return Some(ArchivePath {
            outer: prefix.to_string(),
            nested,
            inner: rest.trim_matches('/').to_string(),
        });
    }
    None
}

/// `split_archive_path`의 반대: 표기 문자열로 되돌린다.
pub fn join_archive_path(ap: &ArchivePath) -> String {
    let mut s = format!("{}!/", ap.outer);
    for n in &ap.nested {
        s.push_str(n);
        s.push_str("!/");
    }
    s.push_str(&ap.inner);
    s
}
