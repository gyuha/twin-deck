//! 파일 찾기: Double Commander "파일 찾기" 기본 탭의 조건을 구조화된 명세로 받아 하위 폴더까지 훑는다.
//! Look Up의 질의 문자열과 달리 깊이 제한, 제외 마스크, 정규식, 파일 안 텍스트 찾기를 직접 다룬다. 읽기 전용이다.

use std::collections::HashSet;
use std::path::PathBuf;

use regex::{Regex, RegexBuilder};
use td_vfs::{glob_match, normalize_name, Entry, EntryKind, ListOptions, Vfs, VfsPath};

use crate::search::{CancelToken, SearchReport};

/// 내용을 보지 않는 파일 크기 상한.
const MAX_TEXT_BYTES: u64 = 16 * 1024 * 1024;
/// 앞부분에 NUL이 있으면 바이너리로 본다.
const BINARY_PROBE: usize = 8 * 1024;

/// 파일 안 텍스트 찾기 조건.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TextSpec {
    pub pattern: String,
    pub case_sensitive: bool,
    pub regex: bool,
    /// 텍스트를 포함하지 **않는** 텍스트 파일을 찾는다.
    pub invert: bool,
}

/// 파일 찾기 명세.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct FindSpec {
    /// 시작 디렉터리들.
    pub roots: Vec<VfsPath>,
    /// 있으면 `roots` 대신 이 경로들만 대상이다(폴더는 재귀, 파일은 그 자체).
    pub only_items: Option<Vec<VfsPath>>,
    pub follow_symlinks: bool,
    /// `;`로 나눈 마스크. 이 이름의 폴더는 들어가지도 결과에 넣지도 않는다.
    pub exclude_dirs: String,
    /// None이면 무제한, Some(0)이면 시작 폴더 바로 아래 항목만, Some(n)이면 n단계 아래 폴더까지.
    pub max_depth: Option<u32>,
    /// `;`로 나눈 파일 마스크. 비면 모든 이름이 일치한다.
    pub mask: String,
    /// 와일드카드가 없는 토큰을 이름에 **포함**되면 일치로 본다(꺼져 있으면 이름이 정확히 같아야 한다).
    pub substring: bool,
    /// 마스크 전체를 정규식으로 해석한다.
    pub regex: bool,
    /// `;`로 나눈 마스크. 이 이름의 항목은 결과에서 뺀다.
    pub exclude_files: String,
    pub text: Option<TextSpec>,
}

fn fold(s: &str) -> String {
    normalize_name(s).to_lowercase()
}

fn tokens(mask: &str) -> Vec<String> {
    mask.split(';')
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .map(str::to_string)
        .collect()
}

fn has_wildcard(token: &str) -> bool {
    token.contains(['*', '?', '['])
}

/// 이름 마스크. 찾기 마스크가 비어 있으면 모두 일치하고(`Any`), 제외 마스크가 비어 있으면 아무것도 일치하지 않는다(`Never`).
enum NameMask {
    Any,
    Never,
    Regex(Regex),
    Tokens {
        tokens: Vec<String>,
        substring: bool,
    },
}

impl NameMask {
    fn glob(mask: &str, substring: bool, when_empty: NameMask) -> Self {
        let tokens = tokens(mask);
        if tokens.is_empty() {
            when_empty
        } else {
            NameMask::Tokens { tokens, substring }
        }
    }

    fn matches(&self, name: &str) -> bool {
        match self {
            NameMask::Any => true,
            NameMask::Never => false,
            NameMask::Regex(re) => re.is_match(&normalize_name(name)),
            NameMask::Tokens { tokens, substring } => tokens.iter().any(|t| {
                if has_wildcard(t) {
                    glob_match(t, name)
                } else if *substring {
                    fold(name).contains(&fold(t))
                } else {
                    fold(name) == fold(t)
                }
            }),
        }
    }
}

/// 내용 비교기.
struct TextMatcher {
    plain: Option<(String, bool)>,
    regex: Option<Regex>,
    invert: bool,
}

impl TextMatcher {
    fn new(spec: &TextSpec) -> Result<Self, String> {
        if spec.pattern.is_empty() {
            return Err("찾을 텍스트가 비었습니다".into());
        }
        if spec.regex {
            let re = RegexBuilder::new(&spec.pattern)
                .case_insensitive(!spec.case_sensitive)
                .build()
                .map_err(|e| format!("텍스트 정규식 오류: {e}"))?;
            Ok(Self {
                plain: None,
                regex: Some(re),
                invert: spec.invert,
            })
        } else {
            let needle = if spec.case_sensitive {
                spec.pattern.clone()
            } else {
                spec.pattern.to_lowercase()
            };
            Ok(Self {
                plain: Some((needle, spec.case_sensitive)),
                regex: None,
                invert: spec.invert,
            })
        }
    }

    fn contains(&self, text: &str) -> bool {
        if let Some(re) = &self.regex {
            return re.is_match(text);
        }
        let (needle, case_sensitive) = self.plain.as_ref().expect("plain 또는 regex 중 하나");
        if *case_sensitive {
            text.contains(needle.as_str())
        } else {
            text.to_lowercase().contains(needle.as_str())
        }
    }
}

/// 컴파일된 파일 찾기. 정규식 오류는 `new`에서 바로 거부된다.
pub struct Finder {
    spec: FindSpec,
    name: NameMask,
    exclude_dirs: NameMask,
    exclude_files: NameMask,
    text: Option<TextMatcher>,
}

impl Finder {
    pub fn new(spec: FindSpec) -> Result<Self, String> {
        let name = if spec.regex && !spec.mask.trim().is_empty() {
            let re = RegexBuilder::new(spec.mask.trim())
                .case_insensitive(true)
                .build()
                .map_err(|e| format!("파일 마스크 정규식 오류: {e}"))?;
            NameMask::Regex(re)
        } else {
            NameMask::glob(&spec.mask, spec.substring, NameMask::Any)
        };
        let text = spec.text.as_ref().map(TextMatcher::new).transpose()?;
        // 제외 마스크는 항상 glob이고 와일드카드 없는 토큰은 이름이 정확히 같아야 한다(`node_modules`가 `my_node_modules`까지 지우지 않게).
        Ok(Self {
            exclude_dirs: NameMask::glob(&spec.exclude_dirs, false, NameMask::Never),
            exclude_files: NameMask::glob(&spec.exclude_files, false, NameMask::Never),
            name,
            text,
            spec,
        })
    }

    /// 순회하며 일치한 항목을 `on_match`로 보낸다. 취소되면 즉시 멈춘다.
    pub fn run<V: Vfs>(
        &self,
        vfs: &V,
        cancel: &CancelToken,
        on_match: &mut dyn FnMut(&Entry),
    ) -> SearchReport {
        let mut run = Run {
            finder: self,
            vfs,
            cancel,
            on_match,
            report: SearchReport::default(),
            skipped: 0,
            seen: HashSet::new(),
        };
        run.walk();
        let mut report = run.report;
        if run.skipped > 0 {
            report.warnings.push(format!(
                "{}개 파일은 바이너리이거나 16MB를 넘어 내용을 보지 않았습니다",
                run.skipped
            ));
        }
        report
    }
}

struct Run<'a, V: Vfs> {
    finder: &'a Finder,
    vfs: &'a V,
    cancel: &'a CancelToken,
    on_match: &'a mut dyn FnMut(&Entry),
    report: SearchReport,
    /// 내용을 보지 않고 건너뛴 파일 수.
    skipped: u64,
    /// 이미 훑은 폴더의 실제 경로. 심볼릭 링크 순환과 중복 방문을 막는다.
    seen: HashSet<PathBuf>,
}

impl<V: Vfs> Run<'_, V> {
    fn walk(&mut self) {
        let mut stack: Vec<(VfsPath, u32)> = Vec::new();
        let starts: Vec<VfsPath> = self
            .finder
            .spec
            .only_items
            .clone()
            .unwrap_or_else(|| self.finder.spec.roots.clone());
        let only = self.finder.spec.only_items.is_some();
        // 앞에서부터 처리되도록 거꾸로 쌓는다.
        for start in starts.into_iter().rev() {
            if only {
                // 선택 항목은 폴더면 그 안을, 파일이면 그 파일 자체를 대상으로 한다.
                match self.vfs.stat(&start) {
                    Ok(e) if e.kind == EntryKind::Dir => stack.push((start, 0)),
                    Ok(e) => {
                        self.report.visited += 1;
                        self.consider(&e);
                    }
                    Err(_) => self.report.unreadable += 1,
                }
            } else {
                stack.push((start, 0));
            }
        }
        while let Some((dir, depth)) = stack.pop() {
            if self.cancel.is_cancelled() {
                self.report.cancelled = true;
                return;
            }
            if self.finder.spec.follow_symlinks {
                let real = std::fs::canonicalize(dir.as_path())
                    .unwrap_or_else(|_| dir.as_path().to_path_buf());
                if !self.seen.insert(real) {
                    continue;
                }
            }
            let Ok(entries) = self.vfs.list(&dir, &ListOptions { show_hidden: true }) else {
                self.report.unreadable += 1;
                continue;
            };
            let mut subdirs = Vec::new();
            for entry in entries {
                if self.cancel.is_cancelled() {
                    self.report.cancelled = true;
                    return;
                }
                self.report.visited += 1;
                let is_dir = self.is_dir(&entry);
                if is_dir && self.finder.exclude_dirs.matches(&entry.name) {
                    continue;
                }
                self.consider(&entry);
                if is_dir && self.finder.spec.max_depth.is_none_or(|m| depth < m) {
                    subdirs.push((entry.path.clone(), depth + 1));
                }
            }
            stack.extend(subdirs.into_iter().rev());
        }
    }

    /// 폴더인가. 심볼릭 링크는 따라가기를 켰을 때만, 그리고 대상이 폴더일 때만 폴더로 본다.
    fn is_dir(&self, entry: &Entry) -> bool {
        match entry.kind {
            EntryKind::Dir => true,
            EntryKind::Symlink if self.finder.spec.follow_symlinks => {
                std::fs::metadata(entry.path.as_path()).is_ok_and(|m| m.is_dir())
            }
            _ => false,
        }
    }

    /// 항목이 결과인지 판단해 보낸다.
    fn consider(&mut self, entry: &Entry) {
        let f = self.finder;
        if !f.name.matches(&entry.name) || f.exclude_files.matches(&entry.name) {
            return;
        }
        if let Some(text) = &f.text {
            if !self.text_ok(entry, text) {
                return;
            }
        }
        self.report.matched += 1;
        (self.on_match)(entry);
    }

    /// 텍스트 조건: 텍스트 파일이어야 하고, 내용에 든 것(또는 `invert`면 안 든 것)만 통과한다.
    fn text_ok(&mut self, entry: &Entry, text: &TextMatcher) -> bool {
        let meta = if entry.kind == EntryKind::Symlink {
            std::fs::metadata(entry.path.as_path()).ok()
        } else {
            None
        };
        let (is_file, size) = match &meta {
            Some(m) => (m.is_file(), m.len()),
            None => (entry.kind == EntryKind::File, entry.size),
        };
        if !is_file {
            return false;
        }
        if size > MAX_TEXT_BYTES {
            self.skipped += 1;
            return false;
        }
        let Ok(bytes) = self.vfs.read_head(&entry.path, MAX_TEXT_BYTES as usize) else {
            self.report.unreadable += 1;
            return false;
        };
        if bytes[..bytes.len().min(BINARY_PROBE)].contains(&0) {
            self.skipped += 1;
            return false;
        }
        text.contains(&String::from_utf8_lossy(&bytes)) != text.invert
    }
}
