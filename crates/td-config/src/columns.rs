//! 컬럼 명세 `[<|>]이름[:너비]` (docs/06 §4.2).

/// 정렬 방향 표시. `<`는 오름차순, `>`는 내림차순으로 해석한다 `[낮음]`(문서에 방향 의미가 없다).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SortMarker {
    Asc,
    Desc,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ColumnSpec {
    pub name: String,
    pub sort: Option<SortMarker>,
    pub width: Option<u32>,
}

pub const COLUMN_NAMES: [&str; 8] = [
    "name",
    "size",
    "created",
    "modified",
    "added",
    "extension",
    "permissions",
    "permissions_octal",
];

/// 명세 하나를 해석한다. 오류는 사용자에게 보여 줄 문장이다.
pub fn parse_column(spec: &str) -> Result<ColumnSpec, String> {
    let (sort, rest) = match spec.as_bytes().first() {
        Some(b'<') => (Some(SortMarker::Asc), &spec[1..]),
        Some(b'>') => (Some(SortMarker::Desc), &spec[1..]),
        _ => (None, spec),
    };
    let (name, width) = match rest.split_once(':') {
        Some((n, w)) => {
            let width: u32 = w
                .parse()
                .map_err(|_| format!("컬럼 너비가 숫자가 아닙니다: '{w}'"))?;
            if width == 0 {
                return Err("컬럼 너비는 1 이상이어야 합니다".into());
            }
            (n, Some(width))
        }
        None => (rest, None),
    };
    if !COLUMN_NAMES.contains(&name) {
        return Err(format!("알 수 없는 컬럼 이름: '{name}'"));
    }
    Ok(ColumnSpec {
        name: name.to_string(),
        sort,
        width,
    })
}

/// 설정의 컬럼 목록을 검증한다: 잘못된 항목은 (원문, 이유)로 돌려주고 빼며, `name` 컬럼은 항상 앞에 둔다.
pub fn normalize_columns(specs: &[String]) -> (Vec<String>, Vec<(String, String)>) {
    let mut ok = Vec::new();
    let mut bad = Vec::new();
    for s in specs {
        match parse_column(s) {
            Ok(_) => ok.push(s.clone()),
            Err(e) => bad.push((s.clone(), e)),
        }
    }
    if !ok
        .iter()
        .any(|s| parse_column(s).is_ok_and(|c| c.name == "name"))
    {
        ok.insert(0, "name".to_string());
    }
    (ok, bad)
}
