//! 미리보기 별도 창(이슈 #160). 설정 `preview.separate_window`를 켜면 미리보기를 앱 안 패널 대신 "preview" 창에 그린다.
//!
//! - 키보드 포커스는 메인 창에 남는다. 메인 창이 보낸 대상(경로)을 미리보기 창이 받아 스스로 읽어 그린다.
//! - "항상 위"는 Twin Deck 창들 위에만이다. macOS는 floating 레벨 + `hidesOnDeactivate`(다른 앱으로 가면 숨음),
//!   Windows는 처음 연 메인 창을 소유자(owner)로 둔다. macOS에서 `parent()`는 자식 창이 부모와 같이 움직여 쓰지 않는다.
//! - 미리보기 창은 메인 창 전용 흐름(상태 저장·복원, 새 창 번호, Dock 재열기)에 끼지 않는다.

use serde::{Deserialize, Serialize};
use specta::Type;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State, WebviewWindow};
use tauri_specta::Event;

use crate::service::ServiceResult;

/// 미리보기 창의 레이블. capability `windows`에도 들어 있어야 한다.
pub const PREVIEW_LABEL: &str = "preview";
/// 미리보기 창이 여는 주소. 화면은 해시 `#preview`(또는 창 레이블)로 미리보기 전용 화면을 그린다.
pub const PREVIEW_URL: &str = "index.html#preview";

/// 미리보기 창에 보일 대상. 미리보기 데이터(이미지 data URL 등)는 크므로 보내지 않고, 미리보기 창이 경로로 직접 읽는다.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct PreviewTargetDto {
    pub path: String,
    /// 화면에 보일 이름.
    pub name: String,
    /// 폴더 미리보기(하위 항목 트리)인지.
    pub is_dir: bool,
    /// 시트가 여러 개인 파일(xlsx 등)에서 보일 시트 번호(0부터). 없으면 첫 시트다.
    pub sheet: Option<u32>,
}

/// 미리보기 창에 보일 대상이 바뀌었다. 미리보기 창에만 보낸다.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct PreviewWindowTarget {
    pub target: PreviewTargetDto,
}

/// 사용자가 미리보기 창을 닫았다(닫기 버튼·Esc) 또는 소유자 창이 닫히거나 숨어 미리보기 창도 숨겼다.
/// 소유자 메인 창에만 보낸다. 메인 창은 미리보기 상태를 비운다.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct PreviewWindowClosed {
    /// 받는 창(소유자)의 레이블.
    pub owner: String,
}

/// 메인 창(미리보기 창이 아닌 창)인가.
pub fn is_main_window(label: &str) -> bool {
    label != PREVIEW_LABEL
}

/// 미리보기 창의 상태. 창 자체와 따로 두어 창을 만들기 전·로드 전에도 무엇을 보일지 안다.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct PreviewWindowState {
    /// 마지막으로 보이기를 요청한 메인 창. 닫힘 알림과 포커스를 이 창으로 돌려준다.
    owner: Option<String>,
    /// 지금 보일 대상. 새로 만든 창은 로드 뒤 이 값을 가져간다.
    target: Option<PreviewTargetDto>,
    /// 보여야 하는가. 창이 로드되기 전에 숨기라고 하면 로드 뒤에도 보이지 않는다.
    visible: bool,
}

impl PreviewWindowState {
    /// `caller` 창이 `target`을 보이라고 했다. 미리보기 창 자신이 부르면 소유자는 바꾸지 않는다.
    pub fn show(&mut self, caller: &str, target: PreviewTargetDto) {
        if is_main_window(caller) {
            self.owner = Some(caller.to_string());
        }
        self.target = Some(target);
        self.visible = true;
    }

    /// 메인 창이 미리보기를 끝냈다. 메인 창이 시작한 것이므로 알리지 않는다.
    pub fn hide(&mut self) {
        self.target = None;
        self.visible = false;
    }

    /// 미리보기 창이 닫혔다. 숨기고, 닫혔다고 알릴 소유자를 돌려준다(없으면 None).
    pub fn close(&mut self) -> Option<String> {
        self.hide();
        self.owner.take()
    }

    /// 메인 창 `label`이 닫히거나 숨었다. 그 창이 소유자이고 미리보기가 보이는 중이면 닫고 소유자를 돌려준다.
    pub fn owner_gone(&mut self, label: &str) -> Option<String> {
        if self.visible && self.owner.as_deref() == Some(label) {
            self.close()
        } else {
            None
        }
    }

    pub fn owner(&self) -> Option<&str> {
        self.owner.as_deref()
    }

    pub fn target(&self) -> Option<&PreviewTargetDto> {
        self.target.as_ref()
    }

    pub fn visible(&self) -> bool {
        self.visible
    }
}

/// 앱이 들고 있는 미리보기 창 상태.
#[derive(Default)]
pub struct PreviewWindow(pub Mutex<PreviewWindowState>);

fn state(app: &AppHandle) -> std::sync::MutexGuard<'_, PreviewWindowState> {
    app.state::<PreviewWindow>()
        .inner()
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

/// 미리보기 창을 만든다(숨긴 채). 화면이 처음 그려지면 `on_page_load`가 포커스를 뺏지 않고 보인다.
fn create(app: &AppHandle, owner: Option<&WebviewWindow>) -> Result<WebviewWindow, String> {
    let builder = tauri::WebviewWindowBuilder::new(
        app,
        PREVIEW_LABEL,
        tauri::WebviewUrl::App(PREVIEW_URL.into()),
    )
    // 제목은 Rust가 번역할 수 없어 메인 창과 같은 이름을 쓴다. 화면 언어에 맞춘 제목은 화면이 정할 수 있다.
    .title("Twin Deck")
    .inner_size(720.0, 560.0)
    .min_inner_size(320.0, 240.0)
    .visible(false)
    .focused(false)
    // macOS: floating 레벨. Windows에서 켜면 다른 앱 위에도 떠서 소유자 창 방식을 쓴다.
    .always_on_top(cfg!(target_os = "macos"));
    // Windows: 소유자 창 위에만 뜨고 소유자와 함께 최소화된다. macOS의 parent는 자식 창이라 쓰지 않는다.
    let builder = match owner {
        Some(owner) if cfg!(windows) => builder.parent(owner).map_err(|e| e.to_string())?,
        _ => builder,
    };
    let window = builder.build().map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    {
        // 다른 앱으로 전환하면 숨고, Twin Deck으로 돌아오면 다시 보인다.
        let w = window.clone();
        let _ = window.run_on_main_thread(move || {
            if let Ok(ptr) = w.ns_window() {
                let ns = unsafe { &*(ptr as *const objc2_app_kit::NSWindow) };
                ns.setHidesOnDeactivate(true);
            }
        });
    }
    Ok(window)
}

/// 포커스를 뺏지 않고 보인다.
pub fn show_without_focus(app: &AppHandle, window: &WebviewWindow) {
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        order_front(window);
    }
    #[cfg(not(target_os = "macos"))]
    show_then_refocus_owner(app, window);
}

/// tao의 macOS `show()`는 `makeKeyAndOrderFront`라 key 창이 되므로 `orderFront`를 직접 부른다.
#[cfg(target_os = "macos")]
fn order_front(window: &WebviewWindow) {
    let w = window.clone();
    let _ = window.run_on_main_thread(move || {
        if let Ok(ptr) = w.ns_window() {
            let ns = unsafe { &*(ptr as *const objc2_app_kit::NSWindow) };
            ns.orderFront(None);
        }
    });
}

/// macOS 밖: 처음 한 번은 `focused(false)`로 활성화 없이 보이지만, 그 뒤의 `show()`는 창을 활성화하므로
/// 포커스를 소유자에게 돌려준다(잠깐 깜빡일 수 있다). macOS에서도 컴파일되게 두어 타입 검사를 받는다.
#[cfg_attr(target_os = "macos", allow(dead_code))]
fn show_then_refocus_owner(app: &AppHandle, window: &WebviewWindow) {
    if window.is_visible().unwrap_or(false) {
        return;
    }
    let _ = window.show();
    let owner = state(app).owner().map(str::to_string);
    if let Some(owner) = owner.and_then(|l| app.get_webview_window(&l)) {
        let _ = owner.set_focus();
    }
}

/// 미리보기 창이 처음 그려졌다. 보여야 할 때만 포커스를 뺏지 않고 보인다.
pub fn on_page_load(app: &AppHandle, window: &WebviewWindow) {
    if state(app).visible() {
        show_without_focus(app, window);
    }
}

/// 미리보기 창을 숨기고 소유자에게 닫혔다고 알린다. `refocus`면 포커스를 소유자 창으로 돌려준다.
fn close_and_notify(app: &AppHandle, owner: Option<String>, refocus: bool) {
    if let Some(w) = app.get_webview_window(PREVIEW_LABEL) {
        let _ = w.hide();
    }
    let Some(owner) = owner else { return };
    let _ = PreviewWindowClosed {
        owner: owner.clone(),
    }
    .emit_to(app, owner.as_str());
    if refocus {
        if let Some(w) = app.get_webview_window(&owner) {
            let _ = w.set_focus();
        }
    }
}

/// 사용자가 미리보기 창을 닫았다(닫기 버튼, 미리보기 창의 Esc).
pub fn close(app: &AppHandle) {
    let owner = state(app).close();
    close_and_notify(app, owner, true);
}

/// 메인 창 `label`이 닫히려 하거나 숨는다. 그 창이 소유자면 미리보기 창도 숨기고 알린다.
pub fn owner_gone(app: &AppHandle, label: &str) {
    let owner = state(app).owner_gone(label);
    if owner.is_some() {
        close_and_notify(app, owner, false);
    }
}

/// 메인 창 `label`이 없어졌다. 남은 메인 창이 없으면 미리보기 창도 없애 앱이 끝날 수 있게 한다.
pub fn main_window_destroyed(app: &AppHandle, label: &str) {
    owner_gone(app, label);
    let others = app
        .webview_windows()
        .into_keys()
        .any(|l| is_main_window(&l) && l != label);
    if !others {
        if let Some(w) = app.get_webview_window(PREVIEW_LABEL) {
            let _ = w.destroy();
        }
    }
}

/// 미리보기 창에 `target`을 보인다. 창이 없으면 만들고, 포커스는 부른 메인 창에 남긴다. 부른 창을 소유자로 기억한다.
#[tauri::command]
#[specta::specta]
pub async fn preview_window_show(
    app: AppHandle,
    window: WebviewWindow,
    target: PreviewTargetDto,
) -> ServiceResult<()> {
    state(&app).show(window.label(), target.clone());
    match app.get_webview_window(PREVIEW_LABEL) {
        Some(preview) => {
            PreviewWindowTarget { target }
                .emit_to(&app, PREVIEW_LABEL)
                .map_err(|e| e.to_string())?;
            show_without_focus(&app, &preview);
        }
        // 새 창은 로드 뒤 `preview_window_target`으로 대상을 가져가고, `on_page_load`가 보인다.
        None => {
            let owner = is_main_window(window.label()).then_some(&window);
            create(&app, owner)?;
        }
    }
    Ok(())
}

/// 미리보기 창을 숨긴다(메인 창이 미리보기를 끝냈을 때). 소유자에게 알리지 않는다.
#[tauri::command]
#[specta::specta]
pub fn preview_window_hide(app: AppHandle) {
    state(&app).hide();
    if let Some(w) = app.get_webview_window(PREVIEW_LABEL) {
        let _ = w.hide();
    }
}

/// 미리보기 창 안에서 닫기를 요청했다(Esc 등). 창을 숨기고, 소유자 메인 창에 `PreviewWindowClosed`를 보내고 포커스를 돌려준다.
#[tauri::command]
#[specta::specta]
pub fn preview_window_close(app: AppHandle) {
    close(&app);
}

/// 지금 미리보기 창에 보일 대상. 미리보기 창이 처음 그려질 때(이벤트를 놓쳤을 수 있다) 가져간다. 없으면 null.
#[tauri::command]
#[specta::specta]
pub fn preview_window_target(state: State<'_, PreviewWindow>) -> Option<PreviewTargetDto> {
    state
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .target()
        .cloned()
}

/// 메인 창을 찾는다(`main`이 먼저, 없으면 아무 메인 창). 미리보기 창은 고르지 않는다.
pub fn any_main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main").or_else(|| {
        app.webview_windows()
            .into_iter()
            .find(|(l, _)| is_main_window(l))
            .map(|(_, w)| w)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t(path: &str) -> PreviewTargetDto {
        PreviewTargetDto {
            path: path.into(),
            name: path.rsplit('/').next().unwrap().into(),
            is_dir: false,
            sheet: None,
        }
    }

    #[test]
    fn 미리보기_창은_메인_창이_아니다() {
        assert!(!is_main_window(PREVIEW_LABEL));
        assert!(is_main_window("main"));
        assert!(is_main_window("win-2"));
    }

    #[test]
    fn 새_창_번호는_미리보기_창과_겹치지_않는다() {
        let existing = vec!["main".to_string(), PREVIEW_LABEL.to_string()];
        let label = td_state::next_window_label(&existing);
        assert_eq!(label, "win-2");
        assert!(is_main_window(&label));
    }

    #[test]
    fn 미리보기_창이_capability_windows에_있다() {
        // 빠지면 미리보기 창에서 코어 명령(이벤트 수신, 미리보기 읽기)이 거부되어 빈 화면이 된다.
        let path =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("capabilities/default.json");
        let json: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        let windows = json["windows"].as_array().unwrap();
        assert!(
            windows
                .iter()
                .any(|w| td_state::pattern_matches(w.as_str().unwrap(), PREVIEW_LABEL)),
            "{windows:?}"
        );
    }

    #[test]
    fn 미리보기_주소는_해시로_미리보기_화면을_가리킨다() {
        assert!(PREVIEW_URL.ends_with("#preview"), "{PREVIEW_URL}");
    }

    #[test]
    fn 보이기는_부른_메인_창을_소유자로_기억한다() {
        let mut s = PreviewWindowState::default();
        s.show("main", t("/a.txt"));
        assert_eq!(s.owner(), Some("main"));
        assert_eq!(s.target(), Some(&t("/a.txt")));
        assert!(s.visible());
        // 다른 창이 보이면 소유자가 바뀐다.
        s.show("win-2", t("/b.txt"));
        assert_eq!(s.owner(), Some("win-2"));
        assert_eq!(s.target(), Some(&t("/b.txt")));
    }

    #[test]
    fn 미리보기_창_자신이_보이기를_불러도_소유자는_바뀌지_않는다() {
        let mut s = PreviewWindowState::default();
        s.show("main", t("/a.txt"));
        s.show(PREVIEW_LABEL, t("/b.txt"));
        assert_eq!(s.owner(), Some("main"));
        assert_eq!(s.target(), Some(&t("/b.txt")));
    }

    #[test]
    fn 숨기기는_대상을_비우고_소유자에게_알리지_않는다() {
        let mut s = PreviewWindowState::default();
        s.show("main", t("/a.txt"));
        s.hide();
        assert!(!s.visible());
        assert_eq!(s.target(), None);
        // 다음에 닫혀도 알릴 소유자는 남아 있다(숨긴 뒤 닫기 버튼은 없지만 상태는 일관되게).
        assert_eq!(s.owner(), Some("main"));
    }

    #[test]
    fn 닫기는_숨기고_알릴_소유자를_한_번만_돌려준다() {
        let mut s = PreviewWindowState::default();
        s.show("win-2", t("/a.txt"));
        assert_eq!(s.close(), Some("win-2".to_string()));
        assert!(!s.visible());
        assert_eq!(s.target(), None);
        assert_eq!(s.close(), None);
    }

    #[test]
    fn 소유자_창이_사라지면_보이는_미리보기를_닫는다() {
        let mut s = PreviewWindowState::default();
        s.show("main", t("/a.txt"));
        assert_eq!(s.owner_gone("win-2"), None, "소유자가 아닌 창");
        assert!(s.visible());
        assert_eq!(s.owner_gone("main"), Some("main".to_string()));
        assert!(!s.visible());
        assert_eq!(s.owner_gone("main"), None, "이미 닫혔다");
    }

    #[test]
    fn 숨긴_미리보기는_소유자가_사라져도_다시_알리지_않는다() {
        let mut s = PreviewWindowState::default();
        s.show("main", t("/a.txt"));
        s.hide();
        assert_eq!(s.owner_gone("main"), None);
    }

    #[test]
    fn 미리보기_대상은_snake_case로_직렬화된다() {
        let json = serde_json::to_value(PreviewTargetDto {
            path: "/a.xlsx".into(),
            name: "a.xlsx".into(),
            is_dir: false,
            sheet: Some(2),
        })
        .unwrap();
        assert_eq!(
            json,
            serde_json::json!({ "path": "/a.xlsx", "name": "a.xlsx", "is_dir": false, "sheet": 2 })
        );
    }
}
