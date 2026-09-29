#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod service;

use tauri_specta::Event;
use td_ops::SystemTrash;

use commands::{
    specta_builder, AppLaunch, AppService, AppVolumes, ConfigChanged, ConfigState, DirChanged,
    QueueChanged,
};
use tauri::Manager;

fn main() {
    let builder = specta_builder();
    let (service, channels) = AppService::new(SystemTrash).expect("서비스 초기화 실패");
    let (changes, queue_events) = (channels.dir_changes, channels.queue_events);

    tauri::Builder::default()
        .invoke_handler(builder.invoke_handler())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(service)
        .manage(AppLaunch::new(
            td_launch::SystemLauncher,
            td_launch::Os::current(),
        ))
        .manage(AppVolumes::new(td_volumes::SystemUnmounter))
        .setup(move |app| {
            builder.mount_events(app);
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                while let Ok(dir) = changes.recv() {
                    let _ = DirChanged {
                        path: dir.to_string_lossy().into_owned(),
                    }
                    .emit(&handle);
                }
            });
            // 설정: 앱 설정 디렉터리를 감시하고, 바뀌면 UI로 알린다.
            let config_dir = app.path().app_config_dir().ok();
            let started = config_dir
                .as_deref()
                .map(|d| td_config::ConfigStore::start(d, td_config::Platform::current()));
            let (store, config_rx, startup_warning) = match started {
                Some(Ok((s, rx))) => (Some(s), Some(rx), None),
                Some(Err(e)) => (
                    None,
                    None,
                    Some(format!("설정 디렉터리를 열지 못해 기본값을 씁니다: {e}")),
                ),
                None => (
                    None,
                    None,
                    Some("설정 디렉터리를 알 수 없어 기본값을 씁니다".to_string()),
                ),
            };
            app.manage(ConfigState {
                store,
                startup_warning,
            });
            if let Some(rx) = config_rx {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    while let Ok(loaded) = rx.recv() {
                        let _ = ConfigChanged { loaded }.emit(&handle);
                    }
                });
            }
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                // 큐 이벤트가 오면 최신 스냅샷을 UI로 보낸다.
                while queue_events.recv().is_ok() {
                    while queue_events.try_recv().is_ok() {}
                    let jobs = handle.state::<AppService>().queue_jobs();
                    let _ = QueueChanged { jobs }.emit(&handle);
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("twin-deck 실행 중 오류가 발생했습니다");
}

#[cfg(test)]
mod capability_tests {
    use std::fs;
    use std::path::Path;

    fn permissions() -> Vec<String> {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("capabilities");
        let mut out = Vec::new();
        for entry in fs::read_dir(&dir).expect("capabilities 디렉터리가 없다") {
            let path = entry.unwrap().path();
            if path.extension().is_some_and(|e| e == "json") {
                let json: serde_json::Value =
                    serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
                for p in json["permissions"].as_array().expect("permissions 배열") {
                    out.push(p.as_str().expect("문자열 권한").to_string());
                }
            }
        }
        out
    }

    /// 코어 명령(homeDir, 이벤트)은 권한이 없으면 거부되어 앱이 빈 화면이 된다.
    /// 플러그인을 추가하고 권한을 빠뜨리는 같은 실수도 막는다.
    #[test]
    fn capabilities_cover_plugins() {
        let perms = permissions();
        assert!(
            perms.iter().any(|p| p == "core:default"),
            "core:default 권한이 없다"
        );

        let manifest =
            fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml")).unwrap();
        for line in manifest.lines() {
            if let Some(rest) = line.trim().strip_prefix("tauri-plugin-") {
                let name = rest.split(['=', ' ']).next().unwrap();
                let prefix = format!("{name}:");
                assert!(
                    perms.iter().any(|p| p.starts_with(&prefix)),
                    "플러그인 tauri-plugin-{name}의 권한({prefix}…)이 capability에 없다"
                );
            }
        }
    }

    /// 새 창은 capability의 `windows` 패턴에 들어 있어야 한다. 빠지면 코어 명령이 거부되어 새 창이 빈 화면이 된다.
    #[test]
    fn capabilities_cover_new_windows() {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("capabilities");
        let mut patterns: Vec<String> = Vec::new();
        for entry in fs::read_dir(&dir).unwrap() {
            let path = entry.unwrap().path();
            if path.extension().is_some_and(|e| e == "json") {
                let json: serde_json::Value =
                    serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
                for w in json["windows"].as_array().expect("windows 배열") {
                    patterns.push(w.as_str().unwrap().to_string());
                }
            }
        }
        let covered = |label: &str| patterns.iter().any(|p| td_state::pattern_matches(p, label));
        assert!(covered("main"), "main 창이 capability에 없다: {patterns:?}");
        let mut existing = vec!["main".to_string()];
        for _ in 0..12 {
            let label = td_state::next_window_label(&existing);
            assert!(
                covered(&label),
                "새 창 레이블 {label}이 capability windows {patterns:?}에 없다"
            );
            existing.push(label);
        }
    }
}
