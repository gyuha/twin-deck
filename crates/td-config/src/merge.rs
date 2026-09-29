use toml::{Table, Value};

use crate::load::Warning;

fn kind(v: &Value) -> &'static str {
    match v {
        Value::String(_) => "문자열",
        Value::Integer(_) | Value::Float(_) => "숫자",
        Value::Boolean(_) => "불리언",
        Value::Datetime(_) => "날짜",
        Value::Array(_) => "배열",
        Value::Table(_) => "테이블",
    }
}

/// 기본값 위에 사용자 값을 깊게 병합한다. 테이블은 재귀, 배열은 통째로 교체.
/// 알 수 없는 키와 타입이 다른 값은 경고하고 무시한다.
pub fn merge_user(
    defaults: &Table,
    user: &Table,
    path: &str,
    file: &str,
    warnings: &mut Vec<Warning>,
) -> Table {
    let mut out = defaults.clone();
    for (key, uv) in user {
        let here = if path.is_empty() {
            key.clone()
        } else {
            format!("{path}.{key}")
        };
        let Some(dv) = defaults.get(key) else {
            warnings.push(Warning::new(
                file,
                format!("알 수 없는 키를 무시합니다: {here}"),
            ));
            continue;
        };
        match (dv, uv) {
            (Value::Table(d), Value::Table(u)) => {
                out.insert(
                    key.clone(),
                    Value::Table(merge_user(d, u, &here, file, warnings)),
                );
            }
            (Value::Array(d), Value::Array(u)) => {
                // 기본 배열이 문자열 배열이면 문자열만 허용한다. 빈 기본 배열(즐겨찾기)은 나중에 항목별로 검증.
                let want_strings = d.first().is_some_and(Value::is_str);
                if want_strings && !u.iter().all(Value::is_str) {
                    warnings.push(Warning::new(
                        file,
                        format!("{here}: 문자열 배열이어야 합니다"),
                    ));
                } else {
                    out.insert(key.clone(), uv.clone());
                }
            }
            (a, b) if std::mem::discriminant(a) == std::mem::discriminant(b) => {
                out.insert(key.clone(), uv.clone());
            }
            (Value::Float(_), Value::Integer(_)) | (Value::Integer(_), Value::Float(_)) => {
                out.insert(key.clone(), uv.clone());
            }
            (a, b) => warnings.push(Warning::new(
                file,
                format!("{here}: {}이어야 하는데 {}입니다", kind(a), kind(b)),
            )),
        }
    }
    out
}
