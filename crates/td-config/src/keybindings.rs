use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use specta::Type;
use toml::{Table, Value};

use crate::load::{Platform, Warning};

/// 사용자 키바인딩 한 줄. `action`이 None이면 기본 바인딩 해제(`"F5" = "none"`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct BindingSpec {
    pub key: String,
    pub action: Option<String>,
    /// 액션 인수. 값은 문자열로 전달한다.
    pub args: BTreeMap<String, String>,
    /// 스코프를 강제로 지정할 때만 값이 있다.
    pub scope: Option<String>,
}

const OS_SECTIONS: [&str; 3] = ["macos", "windows", "linux"];

fn scalar(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => Some(s.clone()),
        Value::Integer(i) => Some(i.to_string()),
        Value::Float(f) => Some(f.to_string()),
        Value::Boolean(b) => Some(b.to_string()),
        _ => None,
    }
}

fn parse_entry(
    key: &str,
    v: &Value,
    file: &str,
    warnings: &mut Vec<Warning>,
) -> Option<BindingSpec> {
    match v {
        Value::String(s) if s == "none" => Some(BindingSpec {
            key: key.to_string(),
            action: None,
            args: BTreeMap::new(),
            scope: None,
        }),
        Value::String(s) => Some(BindingSpec {
            key: key.to_string(),
            action: Some(s.clone()),
            args: BTreeMap::new(),
            scope: None,
        }),
        Value::Table(t) => {
            let Some(id) = t.get("id").and_then(Value::as_str) else {
                warnings.push(Warning::new(
                    file,
                    format!("{key}: 인라인 테이블에는 문자열 id가 필요합니다"),
                ));
                return None;
            };
            let mut args = BTreeMap::new();
            let mut scope = None;
            for (k, val) in t {
                match k.as_str() {
                    "id" => {}
                    "scope" => scope = val.as_str().map(str::to_string),
                    _ => match scalar(val) {
                        Some(s) => {
                            args.insert(k.clone(), s);
                        }
                        None => warnings.push(Warning::new(
                            file,
                            format!("{key}: 인수 {k}는 문자열/숫자/불리언이어야 합니다"),
                        )),
                    },
                }
            }
            Some(BindingSpec {
                key: key.to_string(),
                action: Some(id.to_string()),
                args,
                scope,
            })
        }
        _ => {
            warnings.push(Warning::new(
                file,
                format!("{key}: 문자열 또는 인라인 테이블이어야 합니다"),
            ));
            None
        }
    }
}

/// `[keybindings]`를 읽는다. 공통 항목 뒤에 현재 OS 섹션을 붙인다(나중 정의가 이긴다).
pub fn parse(
    root: &Table,
    platform: Platform,
    file: &str,
    warnings: &mut Vec<Warning>,
) -> Vec<BindingSpec> {
    let mut out = Vec::new();
    let Some(section) = root.get("keybindings") else {
        for k in root.keys() {
            warnings.push(Warning::new(
                file,
                format!("알 수 없는 키를 무시합니다: {k}"),
            ));
        }
        return out;
    };
    for k in root.keys().filter(|k| *k != "keybindings") {
        warnings.push(Warning::new(
            file,
            format!("알 수 없는 키를 무시합니다: {k}"),
        ));
    }
    let Some(table) = section.as_table() else {
        warnings.push(Warning::new(file, "keybindings는 테이블이어야 합니다"));
        return out;
    };
    for (key, v) in table {
        if OS_SECTIONS.contains(&key.as_str()) && v.is_table() {
            continue;
        }
        out.extend(parse_entry(key, v, file, warnings));
    }
    if let Some(os) = table.get(platform.section_name()).and_then(Value::as_table) {
        for (key, v) in os {
            out.extend(parse_entry(key, v, file, warnings));
        }
    }
    out
}
