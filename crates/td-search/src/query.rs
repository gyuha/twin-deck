//! 질의 문자열 → 조건 트리. 문법과 가정은 ADR-0013.

use std::fmt;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::kinds::{kind_from_name, KindName, SimpleKind};

/// 질의 문법 오류. `pos`는 입력 문자열의 바이트 위치다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseError {
    pub pos: usize,
    pub message: String,
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} (위치 {})", self.message, self.pos)
    }
}

impl std::error::Error for ParseError {}

/// 정규화된 연산자. 별칭은 모두 여기로 모인다.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Op {
    Is,
    IsNot,
    Contains,
    Like,
    StartsWith,
    EndsWith,
    Lt,
    Le,
    Gt,
    Ge,
}

/// 연산자 토큰(기호 또는 별칭 단어)을 정규화한다. 단어는 대소문자를 구분하지 않는다.
pub fn parse_op(token: &str) -> Option<Op> {
    Some(match token.to_lowercase().as_str() {
        "=" | "==" | "is" | "equals" => Op::Is,
        "!=" | "isnot" => Op::IsNot,
        "contains" | "has" => Op::Contains,
        "like" | "~=" => Op::Like,
        "startswith" => Op::StartsWith,
        "endswith" => Op::EndsWith,
        "<" => Op::Lt,
        "<=" => Op::Le,
        ">" => Op::Gt,
        ">=" => Op::Ge,
        _ => return None,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TextOp {
    Is,
    IsNot,
    Contains,
    Like,
    StartsWith,
    EndsWith,
}

/// 텍스트 조건. `arg`는 입력 그대로(비교할 때 정규화/소문자화한다).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TextTest {
    pub op: TextOp,
    pub arg: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Field {
    Modified,
    Created,
}

/// AND로 묶이는 조건 하나.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Cond {
    Name(TextTest),
    Content(TextTest),
    /// 바이트 단위 비교.
    Size {
        op: Op,
        bytes: u64,
    },
    /// 시각 비교. 인수가 `[lo, hi)` 구간을 나타낸다(날짜만 쓰면 하루, 시각을 쓰면 1초).
    Time {
        field: Field,
        op: Op,
        lo: SystemTime,
        hi: SystemTime,
    },
    Kind {
        kind: SimpleKind,
        negate: bool,
    },
    /// 이 백엔드가 지원하지 않는 변수/종류. 결과는 항상 비고 경고가 나간다.
    Unsupported {
        what: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Query {
    pub conds: Vec<Cond>,
}

impl Query {
    /// 지원하지 않는 조건 때문에 나가는 경고 문구들.
    pub fn warnings(&self) -> Vec<String> {
        self.conds
            .iter()
            .filter_map(|c| match c {
                Cond::Unsupported { what } => Some(format!(
                    "{what}: 이 백엔드(라이브 순회)에서 지원하지 않습니다"
                )),
                _ => None,
            })
            .collect()
    }

    pub fn is_supported(&self) -> bool {
        !self
            .conds
            .iter()
            .any(|c| matches!(c, Cond::Unsupported { .. }))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum TokKind {
    Word,
    Quoted,
    Op,
}

#[derive(Debug, Clone)]
struct Tok {
    kind: TokKind,
    text: String,
    start: usize,
    end: usize,
}

fn tokenize(input: &str) -> Result<Vec<Tok>, ParseError> {
    let mut out = Vec::new();
    let mut it = input.char_indices().peekable();
    while let Some(&(i, c)) = it.peek() {
        if c.is_whitespace() {
            it.next();
        } else if c == '"' || c == '\'' {
            it.next();
            let mut text = String::new();
            let mut closed_at = None;
            while let Some((j, d)) = it.next() {
                if d == '\\' {
                    if let Some(&(_, e)) = it.peek() {
                        if e == c || e == '\\' {
                            text.push(e);
                            it.next();
                            continue;
                        }
                    }
                    text.push(d);
                } else if d == c {
                    closed_at = Some(j + d.len_utf8());
                    break;
                } else {
                    text.push(d);
                }
            }
            let Some(end) = closed_at else {
                return Err(ParseError {
                    pos: i,
                    message: "따옴표가 닫히지 않았습니다".into(),
                });
            };
            out.push(Tok {
                kind: TokKind::Quoted,
                text,
                start: i,
                end,
            });
        } else if "=!<>~".contains(c) {
            let mut end = i;
            while let Some(&(j, d)) = it.peek() {
                if "=!<>~".contains(d) {
                    end = j + d.len_utf8();
                    it.next();
                } else {
                    break;
                }
            }
            out.push(Tok {
                kind: TokKind::Op,
                text: input[i..end].to_string(),
                start: i,
                end,
            });
        } else {
            let mut end = i;
            while let Some(&(j, d)) = it.peek() {
                if d.is_whitespace() || d == '"' || d == '\'' || "=!<>~".contains(d) {
                    break;
                }
                end = j + d.len_utf8();
                it.next();
            }
            out.push(Tok {
                kind: TokKind::Word,
                text: input[i..end].to_string(),
                start: i,
                end,
            });
        }
    }
    Ok(out)
}

fn is_and(t: &Tok) -> bool {
    t.kind == TokKind::Word && (t.text.eq_ignore_ascii_case("and") || t.text == "&&")
}

/// 질의를 파싱한다. `now`는 `7d` 같은 상대 시각의 기준이다.
pub fn parse(input: &str, now: SystemTime) -> Result<Query, ParseError> {
    let toks = tokenize(input)?;
    if toks.is_empty() {
        return Err(ParseError {
            pos: 0,
            message: "질의가 비었습니다".into(),
        });
    }
    let mut conds = Vec::new();
    let mut term: Vec<&Tok> = Vec::new();
    let mut last_and_end = 0;
    for t in &toks {
        if is_and(t) {
            conds.push(parse_term(input, &term, t.start, now)?);
            term.clear();
            last_and_end = t.end;
        } else {
            term.push(t);
        }
    }
    conds.push(parse_term(
        input,
        &term,
        input.len().max(last_and_end),
        now,
    )?);
    Ok(Query { conds })
}

/// `term_end`: 조건이 비었을 때 오류를 가리킬 위치.
fn parse_term(
    input: &str,
    term: &[&Tok],
    term_end: usize,
    now: SystemTime,
) -> Result<Cond, ParseError> {
    let Some(first) = term.first() else {
        return Err(ParseError {
            pos: term_end,
            message: "AND 앞뒤에는 조건이 있어야 합니다".into(),
        });
    };
    // 변수 연산자 인수
    if term.len() >= 2 && first.kind == TokKind::Word {
        let second = term[1];
        let op = match second.kind {
            TokKind::Op | TokKind::Word => parse_op(&second.text),
            TokKind::Quoted => None,
        };
        if let Some(op) = op {
            let args = &term[2..];
            let Some(arg_first) = args.first() else {
                return Err(ParseError {
                    pos: second.end,
                    message: format!("`{}` 뒤에 인수가 없습니다", second.text),
                });
            };
            let arg_last = args.last().unwrap();
            let arg = if args.len() == 1 {
                arg_first.text.clone()
            } else {
                input[arg_first.start..arg_last.end].to_string()
            };
            return compound(&first.text, op, &arg, arg_first.start, now);
        }
    }
    // 종류 이름만 쓴 간단 조건
    let start = first.start;
    let end = term.last().unwrap().end;
    let raw = &input[start..end];
    if term.iter().all(|t| t.kind == TokKind::Word) {
        match kind_from_name(raw) {
            Some(KindName::Supported(kind)) => {
                return Ok(Cond::Kind {
                    kind,
                    negate: false,
                })
            }
            Some(KindName::Unsupported(what)) => return Ok(Cond::Unsupported { what }),
            None => {}
        }
    }
    // 이름만 입력: 이름에 부분 일치
    let text = if term.len() == 1 && first.kind == TokKind::Quoted {
        first.text.clone()
    } else {
        raw.to_string()
    };
    Ok(Cond::Name(TextTest {
        op: TextOp::Contains,
        arg: text,
    }))
}

fn text_op(op: Op, var: &str, pos: usize) -> Result<TextOp, ParseError> {
    Ok(match op {
        Op::Is => TextOp::Is,
        Op::IsNot => TextOp::IsNot,
        Op::Contains => TextOp::Contains,
        Op::Like => TextOp::Like,
        Op::StartsWith => TextOp::StartsWith,
        Op::EndsWith => TextOp::EndsWith,
        _ => {
            return Err(ParseError {
                pos,
                message: format!("{var}에는 크기 비교 연산자(<, >)를 쓸 수 없습니다"),
            })
        }
    })
}

fn compound(
    var: &str,
    op: Op,
    arg: &str,
    arg_pos: usize,
    now: SystemTime,
) -> Result<Cond, ParseError> {
    match var.to_lowercase().as_str() {
        "name" | "이름" => Ok(Cond::Name(TextTest {
            op: text_op(op, "Name", arg_pos)?,
            arg: arg.to_string(),
        })),
        "content" | "내용" => Ok(Cond::Content(TextTest {
            op: text_op(op, "Content", arg_pos)?,
            arg: arg.to_string(),
        })),
        "size" | "크기" => {
            if !matches!(op, Op::Is | Op::IsNot | Op::Lt | Op::Le | Op::Gt | Op::Ge) {
                return Err(ParseError {
                    pos: arg_pos,
                    message: "Size에는 =, !=, <, <=, >, >=만 쓸 수 있습니다".into(),
                });
            }
            let bytes = parse_size(arg).ok_or_else(|| ParseError {
                pos: arg_pos,
                message: format!("크기를 읽을 수 없습니다: {arg} (예: 500, 10KB, 1.5MB)"),
            })?;
            Ok(Cond::Size { op, bytes })
        }
        "modified" | "수정일" => time_cond(Field::Modified, op, arg, arg_pos, now),
        "created" | "생성일" => time_cond(Field::Created, op, arg, arg_pos, now),
        "kind" | "종류" => {
            if !matches!(op, Op::Is | Op::IsNot) {
                return Err(ParseError {
                    pos: arg_pos,
                    message: "Kind에는 is, isNot(=, !=)만 쓸 수 있습니다".into(),
                });
            }
            match kind_from_name(arg) {
                Some(KindName::Supported(kind)) => Ok(Cond::Kind {
                    kind,
                    negate: op == Op::IsNot,
                }),
                Some(KindName::Unsupported(what)) => Ok(Cond::Unsupported { what }),
                None => Err(ParseError {
                    pos: arg_pos,
                    message: format!("알 수 없는 종류입니다: {arg}"),
                }),
            }
        }
        // UTI, Author, Title, Album, Genre 등: 오류가 아니라 미지원 경고로 처리한다.
        _ => Ok(Cond::Unsupported {
            what: var.to_string(),
        }),
    }
}

/// `500`, `10KB`, `1.5 MB`, `2g`. 단위는 1024 배수, 대소문자 무시.
fn parse_size(arg: &str) -> Option<u64> {
    let s = arg.trim().to_lowercase();
    let split = s
        .find(|c: char| !(c.is_ascii_digit() || c == '.'))
        .unwrap_or(s.len());
    let (num, unit) = s.split_at(split);
    let n: f64 = num.parse().ok()?;
    let mult: f64 = match unit.trim() {
        "" | "b" => 1.0,
        "k" | "kb" | "kib" => 1024.0,
        "m" | "mb" | "mib" => 1024.0 * 1024.0,
        "g" | "gb" | "gib" => 1024.0 * 1024.0 * 1024.0,
        "t" | "tb" | "tib" => 1024.0_f64.powi(4),
        _ => return None,
    };
    (n >= 0.0 && n.is_finite()).then_some((n * mult) as u64)
}

fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn at_secs(secs: i64) -> SystemTime {
    if secs >= 0 {
        UNIX_EPOCH + Duration::from_secs(secs as u64)
    } else {
        UNIX_EPOCH - Duration::from_secs(secs.unsigned_abs())
    }
}

/// 시각 인수를 `[lo, hi)`로 바꾼다(UTC 기준).
/// 형식: `YYYY-MM-DD`(하루), `YYYY-MM-DD HH:MM[:SS]`(그 시각), `today`, `yesterday`, `N d|h|w`(지금부터 N 전).
fn parse_time_arg(arg: &str, now: SystemTime) -> Option<(SystemTime, SystemTime)> {
    let s = arg.trim().to_lowercase();
    let now_secs = now.duration_since(UNIX_EPOCH).ok()?.as_secs() as i64;
    let day = |d: i64| (at_secs(d * 86_400), at_secs((d + 1) * 86_400));
    match s.as_str() {
        "today" => return Some(day(now_secs.div_euclid(86_400))),
        "yesterday" => return Some(day(now_secs.div_euclid(86_400) - 1)),
        _ => {}
    }
    // 상대: 7d, 12h, 2w
    if let Some(unit) = s.chars().last().filter(|c| matches!(c, 'd' | 'h' | 'w')) {
        if let Ok(n) = s[..s.len() - 1].trim().parse::<i64>() {
            let per = match unit {
                'h' => 3600,
                'd' => 86_400,
                _ => 604_800,
            };
            let lo = at_secs(now_secs - n * per);
            return Some((lo, lo + Duration::from_secs(1)));
        }
    }
    let (date, time) = match s.split_once([' ', 't']) {
        Some((d, t)) => (d, Some(t)),
        None => (s.as_str(), None),
    };
    let mut parts = date.split('-');
    let (y, m, d): (i64, i64, i64) = (
        parts.next()?.parse().ok()?,
        parts.next()?.parse().ok()?,
        parts.next()?.parse().ok()?,
    );
    if parts.next().is_some() || !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    let days = days_from_civil(y, m, d);
    match time {
        None => Some(day(days)),
        Some(t) => {
            let mut tp = t.split(':');
            let (h, mi): (i64, i64) = (tp.next()?.parse().ok()?, tp.next()?.parse().ok()?);
            let sec: i64 = tp.next().map(|x| x.parse().ok()).unwrap_or(Some(0))?;
            if tp.next().is_some() || h > 23 || mi > 59 || sec > 59 {
                return None;
            }
            let lo = at_secs(days * 86_400 + h * 3600 + mi * 60 + sec);
            Some((lo, lo + Duration::from_secs(1)))
        }
    }
}

fn time_cond(
    field: Field,
    op: Op,
    arg: &str,
    arg_pos: usize,
    now: SystemTime,
) -> Result<Cond, ParseError> {
    if !matches!(op, Op::Is | Op::IsNot | Op::Lt | Op::Le | Op::Gt | Op::Ge) {
        return Err(ParseError {
            pos: arg_pos,
            message: "날짜에는 =, !=, <, <=, >, >=만 쓸 수 있습니다".into(),
        });
    }
    let (lo, hi) = parse_time_arg(arg, now).ok_or_else(|| ParseError {
        pos: arg_pos,
        message: format!(
            "날짜를 읽을 수 없습니다: {arg} (예: 2026-09-01, 2026-09-01 10:30, today, 7d)"
        ),
    })?;
    Ok(Cond::Time { field, op, lo, hi })
}
