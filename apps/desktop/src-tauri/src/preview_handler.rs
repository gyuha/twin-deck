//! Windows 미리보기 처리기(탐색기 미리보기 창이 쓰는 `IPreviewHandler`)로 Office 문서를 앱 창 위에 겹쳐 보여 준다 (ADR-0015).
//! 이 파일의 앞부분은 어느 OS에서나 컴파일되는 순수 함수(처리기 찾기, 좌표 변환)이고, 실제 창·COM은 `host`(Windows 전용)에 있다.

/// 미리보기 처리기 등록에 쓰는 인터페이스 ID(`IPreviewHandler`). `shellex` 아래 이 이름의 키가 처리기 CLSID를 가리킨다.
pub const PREVIEW_HANDLER_IID: &str = "{8895b1c6-b41f-4c1c-a562-0d564250836f}";

/// `{xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}` 모양인가.
fn is_clsid(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() != 38 || b[0] != b'{' || b[37] != b'}' {
        return false;
    }
    b[1..37].iter().enumerate().all(|(i, c)| match i {
        8 | 13 | 18 | 23 => *c == b'-',
        _ => c.is_ascii_hexdigit(),
    })
}

/// 확장자(`docx` 또는 `.docx`)에 등록된 미리보기 처리기의 CLSID를 찾는다. 없으면 None.
/// `lookup`은 `HKEY_CLASSES_ROOT` 아래 키 경로(`.docx\shellex\{…}`)의 기본값을 돌려준다.
/// 찾는 순서: 확장자 키 → 확장자가 가리키는 ProgID 키 → `SystemFileAssociations`.
pub fn find_handler_clsid(ext: &str, lookup: &dyn Fn(&str) -> Option<String>) -> Option<String> {
    let ext = ext.trim().trim_start_matches('.').to_ascii_lowercase();
    // 키 경로를 벗어나는 값(`..\x`)이나 빈 확장자는 찾지 않는다.
    if ext.is_empty() || ext.contains(['/', '\\', ':']) {
        return None;
    }
    let ext_key = format!(".{ext}");
    let handler_at = |key: &str| {
        lookup(&format!("{key}\\shellex\\{PREVIEW_HANDLER_IID}"))
            .filter(|v| is_clsid(v.trim()))
            .map(|v| v.trim().to_string())
    };
    if let Some(c) = handler_at(&ext_key) {
        return Some(c);
    }
    if let Some(prog_id) = lookup(&ext_key).filter(|p| !p.trim().is_empty()) {
        if let Some(c) = handler_at(prog_id.trim()) {
            return Some(c);
        }
    }
    handler_at(&format!("SystemFileAssociations\\{ext_key}"))
}

/// `Zone.Identifier`(인터넷 출처 표시, Mark of the Web) 내용에서 `ZoneId` 값을 읽는다. 없거나 숫자가 아니면 None.
/// 0 내 컴퓨터, 1 인트라넷, 2 신뢰, 3 인터넷, 4 제한됨.
pub fn parse_zone_id(text: &str) -> Option<u32> {
    text.lines().find_map(|line| {
        let (key, value) = line.split_once('=')?;
        key.trim()
            .eq_ignore_ascii_case("ZoneId")
            .then(|| value.trim().parse().ok())
            .flatten()
    })
}

/// 이 영역이면 Office 처리기가 미리보기를 막는다(인터넷·제한됨).
pub fn zone_blocks_preview(zone_id: u32) -> bool {
    zone_id >= 3
}

/// 처리기를 시도한 결과. 프런트가 이것으로 다음 동작(안내·폴백)을 정한다.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum ShowOutcome {
    /// 처리기가 문서를 그렸다.
    Shown,
    /// 이 형식의 처리기가 없거나 Windows가 아니다.
    Unavailable,
    /// 인터넷에서 받은 파일이라 Office가 미리보기를 막는다(차단 해제하면 보인다).
    Blocked,
}

/// 처리기가 실패했을 때 오류 뒤에 붙일 진단 꼬리표: 어느 처리기를 어떤 영역으로 띄우다 실패했는지.
/// 로그를 따로 받지 않아도 사용자가 화면의 오류 문구만 전해 주면 원인을 좁힐 수 있게 한다.
pub fn failure_context(clsid: &str, rect: PxRect) -> String {
    format!(
        "처리기 {clsid}, 영역 {}×{} 위치 ({}, {})",
        rect.width, rect.height, rect.x, rect.y
    )
}

/// CSS 픽셀 사각형(웹뷰 기준). 화면 배율을 곱하기 전의 값이다.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CssRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// 물리 픽셀 사각형(창 클라이언트 영역 기준).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PxRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

/// 웹 좌표(CSS px)를 화면 배율에 맞춰 물리 픽셀로 바꾼다. 크기는 음수가 되지 않고, 배율이 이상하면 1로 본다.
pub fn physical_rect(css: CssRect, scale: f64) -> PxRect {
    let scale = if scale.is_finite() && scale > 0.0 {
        scale
    } else {
        1.0
    };
    let px = |v: f64| (v * scale).round() as i32;
    PxRect {
        x: px(css.x),
        y: px(css.y),
        width: px(css.width.max(0.0)),
        height: px(css.height.max(0.0)),
    }
}

/// 창별 미리보기 호스트. Windows가 아니면 아무것도 하지 않는다(처리기가 없는 것으로 본다).
#[derive(Default)]
pub struct PreviewHandlers {
    #[cfg(windows)]
    hosts: std::sync::Mutex<std::collections::HashMap<String, crate::preview_host::Host>>,
}

impl PreviewHandlers {
    /// `path`를 `parent`(앱 창 핸들) 위 `rect` 자리에 띄운다. 이 형식의 처리기가 등록돼 있지 않으면 Ok(false).
    /// `on_click`은 사용자가 문서를 눌러 키보드 포커스가 처리기로 넘어갔을 때 불린다.
    #[cfg(windows)]
    pub fn show(
        &self,
        label: &str,
        parent: isize,
        path: &str,
        rect: PxRect,
        on_click: std::sync::Arc<dyn Fn() + Send + Sync>,
    ) -> Result<ShowOutcome, String> {
        let Some(clsid) = crate::preview_host::handler_for(path) else {
            return Ok(ShowOutcome::Unavailable);
        };
        // 인터넷에서 받은 파일은 Office 처리기가 미리보기를 막는다(그리지 못하고 0x80004005). 그리기 전에 알아내 이유를 알려 준다.
        if crate::preview_host::is_blocked(path) {
            return Ok(ShowOutcome::Blocked);
        }
        let mut hosts = self
            .hosts
            .lock()
            .map_err(|_| "미리보기 호스트가 잠겨 있습니다".to_string())?;
        if !hosts.contains_key(label) {
            hosts.insert(label.to_string(), crate::preview_host::Host::new()?);
        }
        hosts[label]
            .show(parent, &clsid, path, rect, on_click)
            .map(|()| ShowOutcome::Shown)
    }

    #[cfg(not(windows))]
    pub fn show(
        &self,
        _label: &str,
        _parent: isize,
        _path: &str,
        _rect: PxRect,
        _on_click: std::sync::Arc<dyn Fn() + Send + Sync>,
    ) -> Result<ShowOutcome, String> {
        Ok(ShowOutcome::Unavailable)
    }

    pub fn set_rect(&self, label: &str, rect: PxRect) {
        #[cfg(windows)]
        if let Some(h) = self.hosts.lock().ok().as_ref().and_then(|g| g.get(label)) {
            h.set_rect(rect);
        }
        #[cfg(not(windows))]
        let _ = (label, rect);
    }

    pub fn set_visible(&self, label: &str, visible: bool) {
        #[cfg(windows)]
        if let Some(h) = self.hosts.lock().ok().as_ref().and_then(|g| g.get(label)) {
            h.set_visible(visible);
        }
        #[cfg(not(windows))]
        let _ = (label, visible);
    }

    pub fn close(&self, label: &str) {
        #[cfg(windows)]
        if let Some(h) = self.hosts.lock().ok().as_ref().and_then(|g| g.get(label)) {
            h.close();
        }
        #[cfg(not(windows))]
        let _ = label;
    }
}

#[cfg(test)]
#[allow(non_snake_case)] // 시험 이름에 한글과 ProgID·CLSID 같은 약어를 그대로 쓴다
mod tests {
    use super::*;
    use std::collections::HashMap;

    const WORD: &str = "{84F66100-FF7C-4fb4-B0C0-02CD7FB668FE}";
    const IID: &str = PREVIEW_HANDLER_IID;

    fn reg(entries: &[(&str, &str)]) -> HashMap<String, String> {
        entries
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    #[test]
    fn 확장자_키의_처리기를_찾는다() {
        let r = reg(&[(&format!(r".docx\shellex\{IID}"), WORD)]);
        let lookup = |k: &str| r.get(k).cloned();
        assert_eq!(find_handler_clsid("docx", &lookup).as_deref(), Some(WORD));
        assert_eq!(
            find_handler_clsid(".docx", &lookup).as_deref(),
            Some(WORD),
            "점이 있어도 같다"
        );
        assert_eq!(
            find_handler_clsid(".DOCX", &lookup).as_deref(),
            Some(WORD),
            "대소문자를 가리지 않는다"
        );
    }

    #[test]
    fn 확장자에_없으면_ProgID_키의_처리기를_찾는다() {
        let r = reg(&[
            (".xlsx", "Excel.Sheet.12"),
            (
                &format!(r"Excel.Sheet.12\shellex\{IID}"),
                "{00020827-0000-0000-C000-000000000046}",
            ),
        ]);
        let lookup = |k: &str| r.get(k).cloned();
        assert_eq!(
            find_handler_clsid("xlsx", &lookup).as_deref(),
            Some("{00020827-0000-0000-C000-000000000046}")
        );
    }

    #[test]
    fn SystemFileAssociations도_본다() {
        let r = reg(&[(
            &format!(r"SystemFileAssociations\.pptx\shellex\{IID}"),
            "{65235197-874B-4A07-BDC5-E65EA825B718}",
        )]);
        let lookup = |k: &str| r.get(k).cloned();
        assert_eq!(
            find_handler_clsid("pptx", &lookup).as_deref(),
            Some("{65235197-874B-4A07-BDC5-E65EA825B718}")
        );
    }

    #[test]
    fn 등록이_없거나_CLSID가_아니면_None이다() {
        let empty = |_: &str| None;
        assert_eq!(find_handler_clsid("docx", &empty), None);
        let bad = reg(&[(&format!(r".docx\shellex\{IID}"), "not-a-guid")]);
        assert_eq!(find_handler_clsid("docx", &|k| bad.get(k).cloned()), None);
        assert_eq!(find_handler_clsid("", &empty), None);
        assert_eq!(
            find_handler_clsid(r"..\x", &empty),
            None,
            "키 경로를 벗어나는 확장자는 찾지 않는다"
        );
    }

    #[test]
    fn Zone_Identifier에서_ZoneId를_읽는다() {
        assert_eq!(
            parse_zone_id(
                "[ZoneTransfer]
ZoneId=3
HostUrl=https://example.com/a.xlsx
"
            ),
            Some(3)
        );
        assert_eq!(
            parse_zone_id(
                "[ZoneTransfer]
ZoneId=4"
            ),
            Some(4)
        );
        assert_eq!(
            parse_zone_id(
                "[ZoneTransfer]
zoneid = 3 
"
            ),
            Some(3),
            "대소문자와 공백은 가리지 않는다"
        );
        assert_eq!(
            parse_zone_id(
                "[ZoneTransfer]
ZoneId=0"
            ),
            Some(0)
        );
        assert_eq!(
            parse_zone_id(
                "[ZoneTransfer]
HostUrl=x"
            ),
            None
        );
        assert_eq!(parse_zone_id("ZoneId=abc"), None);
        assert_eq!(parse_zone_id(""), None);
    }

    #[test]
    fn 인터넷과_제한됨_영역만_미리보기를_막는다() {
        assert!(!zone_blocks_preview(0));
        assert!(!zone_blocks_preview(1));
        assert!(!zone_blocks_preview(2));
        assert!(zone_blocks_preview(3));
        assert!(zone_blocks_preview(4));
    }

    #[test]
    fn 실패_꼬리표에_처리기와_영역이_들어간다() {
        let tag = failure_context(
            WORD,
            PxRect {
                x: 12,
                y: 34,
                width: 600,
                height: 400,
            },
        );
        assert!(tag.contains(WORD), "{tag}");
        assert!(
            tag.contains("600") && tag.contains("400"),
            "크기가 없다: {tag}"
        );
        assert!(
            tag.contains("12") && tag.contains("34"),
            "위치가 없다: {tag}"
        );
        let empty = failure_context(
            WORD,
            PxRect {
                x: 0,
                y: 0,
                width: 0,
                height: 0,
            },
        );
        assert!(empty.contains("0×0"), "빈 영역이 눈에 띄어야 한다: {empty}");
    }

    #[test]
    fn 좌표를_화면_배율에_맞춰_물리_픽셀로_바꾼다() {
        let css = CssRect {
            x: 100.0,
            y: 50.0,
            width: 400.0,
            height: 300.0,
        };
        assert_eq!(
            physical_rect(css, 1.0),
            PxRect {
                x: 100,
                y: 50,
                width: 400,
                height: 300
            }
        );
        assert_eq!(
            physical_rect(css, 1.25),
            PxRect {
                x: 125,
                y: 63,
                width: 500,
                height: 375
            }
        ); // 62.5는 반올림
        assert_eq!(
            physical_rect(css, 1.5),
            PxRect {
                x: 150,
                y: 75,
                width: 600,
                height: 450
            }
        );
    }

    #[test]
    fn 크기는_음수가_되지_않고_이상한_배율은_1로_본다() {
        let css = CssRect {
            x: 10.0,
            y: 10.0,
            width: -5.0,
            height: 0.4,
        };
        let r = physical_rect(css, 2.0);
        assert_eq!((r.width, r.height), (0, 1), "음수는 0, 0.8px은 반올림해 1");
        let ok = CssRect {
            x: 1.0,
            y: 2.0,
            width: 30.0,
            height: 40.0,
        };
        assert_eq!(
            physical_rect(ok, 0.0),
            PxRect {
                x: 1,
                y: 2,
                width: 30,
                height: 40
            }
        );
        assert_eq!(
            physical_rect(ok, f64::NAN),
            PxRect {
                x: 1,
                y: 2,
                width: 30,
                height: 40
            }
        );
    }
}
