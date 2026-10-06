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

/// `Mod+Ctrl+Alt+Shift+` 순서의 수식키 뒤에 F1~F12가 오는 조합키 이름인가 (예: `Ctrl+F5`, `Mod+Shift+F2`).
/// 수식키가 없는 `F1`~`F12`는 기본값에 이미 있어서 여기서 다루지 않는다.
fn is_fkey_combo(key: &str) -> bool {
    let mut parts: Vec<&str> = key.split('+').collect();
    let Some(f) = parts.pop() else { return false };
    let is_f = f
        .strip_prefix('F')
        .and_then(|n| n.parse::<u8>().ok())
        .is_some_and(|n| (1..=12).contains(&n) && f == format!("F{n}"));
    if !is_f || parts.is_empty() {
        return false;
    }
    let order = ["Mod", "Ctrl", "Alt", "Shift"];
    let mut last = None;
    parts.iter().all(|m| {
        let Some(i) = order.iter().position(|o| o == m) else {
            return false;
        };
        let ok = last.is_none_or(|l| i > l);
        last = Some(i);
        ok
    })
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
            let fits = match path {
                "fkeys" | "fkey_apps" => uv.is_str(),
                "fkey_bar" => uv.is_bool(),
                _ => false,
            };
            if fits && is_fkey_combo(key) {
                out.insert(key.clone(), uv.clone());
                continue;
            }
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
                let want_strings =
                    d.first().is_some_and(Value::is_str) || here == "layout.action_bar";
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
