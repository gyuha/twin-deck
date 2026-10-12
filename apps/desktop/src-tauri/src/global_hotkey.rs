//! 앱이 뒤에 있을 때 전역 단축키로 창을 불러온다(이슈 #49).

use std::str::FromStr;

use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// 설정 문자열(`Mod+Alt+O`)을 단축키로 바꾼다. `Mod`는 macOS에서 ⌘, 그 밖은 Ctrl이다. 빈 문자열이면 `None`(끔).
pub fn parse(spec: &str, mac: bool) -> Result<Option<Shortcut>, String> {
    let spec = spec.trim();
    if spec.is_empty() {
        return Ok(None);
    }
    let accelerator = spec
        .split('+')
        .map(|part| match part.trim() {
            "Mod" if mac => "Command",
            "Mod" => "Control",
            other => other,
        })
        .collect::<Vec<_>>()
        .join("+");
    Shortcut::from_str(&accelerator)
        .map(Some)
        .map_err(|e| format!("전역 단축키 `{spec}`를 해석하지 못했습니다: {e}"))
}

/// 모니터 `(x, y, 너비, 높이)` 한가운데에 창 `(너비, 높이)`를 놓을 때 창의 왼쪽 위 위치.
fn window_position(monitor: (i32, i32, u32, u32), window: (u32, u32)) -> (i32, i32) {
    let (mx, my, mw, mh) = monitor;
    (
        mx + (mw as i32 - window.0 as i32) / 2,
        my + (mh as i32 - window.1 as i32) / 2,
    )
}

/// 창을 앞으로 가져온다. 마우스 커서가 창과 다른 모니터에 있으면 그 모니터 가운데로 옮긴다.
pub fn reveal(app: &AppHandle) {
    let window = app
        .get_webview_window("main")
        .or_else(|| app.webview_windows().into_values().next());
    let Some(w) = window else { return };
    let _ = w.unminimize();
    let target = app
        .cursor_position()
        .ok()
        .and_then(|c| app.monitor_from_point(c.x, c.y).ok().flatten());
    if let (Some(target), Ok(Some(current)), Ok(size)) =
        (target, w.current_monitor(), w.outer_size())
    {
        if target.position() != current.position() {
            let (x, y) = window_position(
                (
                    target.position().x,
                    target.position().y,
                    target.size().width,
                    target.size().height,
                ),
                (size.width, size.height),
            );
            let _ = w.set_position(tauri::PhysicalPosition::new(x, y));
        }
    }
    let _ = w.show();
    let _ = w.set_focus();
}

/// 이전 등록을 모두 풀고 설정값으로 다시 등록한다. 실패(다른 앱이 선점 등)해도 앱은 계속 돈다.
pub fn apply(app: &AppHandle, env: &td_config::Environment) {
    let spec = if env.global_hotkey_enabled {
        env.global_hotkey.as_str()
    } else {
        ""
    };
    let shortcuts = app.global_shortcut();
    let _ = shortcuts.unregister_all();
    match parse(spec, cfg!(target_os = "macos")) {
        Ok(Some(shortcut)) => {
            let result = shortcuts.on_shortcut(shortcut, |app, _, event| {
                if event.state() == ShortcutState::Pressed {
                    reveal(app);
                }
            });
            if let Err(e) = result {
                eprintln!("전역 단축키 `{spec}`를 등록하지 못했습니다: {e}");
            }
        }
        Ok(None) => {}
        Err(e) => eprintln!("{e}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri_plugin_global_shortcut::{Code, Modifiers};

    #[test]
    fn global_hotkey_mod_maps_to_platform_key() {
        let mac = parse("Mod+Alt+O", true).unwrap().unwrap();
        assert_eq!(
            mac,
            Shortcut::new(Some(Modifiers::SUPER | Modifiers::ALT), Code::KeyO)
        );
        let other = parse("Mod+Alt+O", false).unwrap().unwrap();
        assert_eq!(
            other,
            Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyO)
        );
    }

    #[test]
    fn global_hotkey_empty_means_off() {
        assert_eq!(parse("", true), Ok(None));
        assert_eq!(parse("   ", false), Ok(None));
    }

    #[test]
    fn global_hotkey_invalid_is_error_not_panic() {
        assert!(parse("Mod+Alt+", true).is_err());
        assert!(parse("Mod+Alt", false).is_err());
        assert!(parse("Mod+Nope+O", true).is_err());
    }

    #[test]
    fn window_position_centers_on_monitor() {
        assert_eq!(window_position((0, 0, 1920, 1080), (1000, 600)), (460, 240));
        // 왼쪽에 있는 보조 모니터(음수 좌표)
        assert_eq!(
            window_position((-1920, 0, 1920, 1080), (1000, 600)),
            (-1460, 240)
        );
    }
}
