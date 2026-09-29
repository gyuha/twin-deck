//! Select Group용 glob 패턴. 이름은 NFC로 정규화하고 대소문자를 무시한다.
//!
//! 문법: `*` 임의 길이, `?` 한 글자, `[abc]` `[a-z]` 문자 집합, `[!abc]`/`[^abc]` 부정. 나머지는 글자 그대로.
//! 닫히지 않은 `[`는 글자 그대로 취급한다. (Marta의 패턴 문법은 확인하지 못했다 `[알 수 없음]`)

use crate::normalize_name;

#[derive(Debug)]
enum Tok {
    Any,
    One,
    Lit(char),
    Class {
        negate: bool,
        items: Vec<(char, char)>,
    },
}

fn parse(pattern: &[char]) -> Vec<Tok> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < pattern.len() {
        match pattern[i] {
            '*' => {
                // 연속된 *는 하나로
                if !matches!(out.last(), Some(Tok::Any)) {
                    out.push(Tok::Any);
                }
            }
            '?' => out.push(Tok::One),
            '[' => {
                let mut j = i + 1;
                let negate = matches!(pattern.get(j), Some('!' | '^'));
                if negate {
                    j += 1;
                }
                let start = j;
                let mut items = Vec::new();
                let mut closed = false;
                while j < pattern.len() {
                    // 첫 글자는 `]`여도 집합의 일부로 본다
                    if pattern[j] == ']' && j > start {
                        closed = true;
                        break;
                    }
                    if j + 2 < pattern.len() && pattern[j + 1] == '-' && pattern[j + 2] != ']' {
                        items.push((pattern[j], pattern[j + 2]));
                        j += 3;
                    } else {
                        items.push((pattern[j], pattern[j]));
                        j += 1;
                    }
                }
                if closed {
                    out.push(Tok::Class { negate, items });
                    i = j;
                } else {
                    out.push(Tok::Lit('['));
                }
            }
            c => out.push(Tok::Lit(c)),
        }
        i += 1;
    }
    out
}

fn one(tok: &Tok, c: char) -> bool {
    match tok {
        Tok::One => true,
        Tok::Lit(l) => *l == c,
        Tok::Class { negate, items } => items.iter().any(|(a, b)| *a <= c && c <= *b) != *negate,
        Tok::Any => false,
    }
}

/// `name` 전체가 `pattern`과 일치하는가.
pub fn glob_match(pattern: &str, name: &str) -> bool {
    let pat: Vec<char> = normalize_name(pattern).to_lowercase().chars().collect();
    let text: Vec<char> = normalize_name(name).to_lowercase().chars().collect();
    let toks = parse(&pat);
    // 백트래킹은 마지막 `*` 위치만 기억하는 반복 방식이라 최악의 경우에도 O(n*m).
    let (mut t, mut p) = (0, 0);
    let mut star: Option<(usize, usize)> = None;
    while t < text.len() {
        match toks.get(p) {
            Some(Tok::Any) => {
                star = Some((p, t));
                p += 1;
            }
            Some(tok) if one(tok, text[t]) => {
                t += 1;
                p += 1;
            }
            _ => match star {
                Some((sp, st)) => {
                    p = sp + 1;
                    t = st + 1;
                    star = Some((sp, st + 1));
                }
                None => return false,
            },
        }
    }
    toks[p..].iter().all(|t| matches!(t, Tok::Any))
}
