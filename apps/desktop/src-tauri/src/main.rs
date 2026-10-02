#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod service;

use tauri_specta::Event;
use td_ops::SystemTrash;

use commands::{
    specta_builder, AppLaunch, AppService, AppVolumes, ConfigChanged, ConfigState, DirChanged,
    QueueChanged, SearchChunk, SearchDone, UsageUpdate,
};
use service::{coalesce, SearchMsg};
use std::time::Duration;
use tauri::Manager;

/// 설정의 ZIP 추가 확장자를 서비스에 반영한다 (ARC-01).
fn apply_archive_extensions(svc: &AppService, loaded: &td_config::Loaded) {
    svc.set_archive_extensions(loaded.config.file_systems.zip.additional_extensions.clone());
}

fn main() {
    let builder = specta_builder();
    let (service, channels) = AppService::new(SystemTrash).expect("서비스 초기화 실패");
    let (changes, queue_events, search_events) = (
        channels.dir_changes,
        channels.queue_events,
        channels.search_events,
    );

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
            #[cfg(target_os = "macos")]
            set_dock_icon();
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
            apply_archive_extensions(
                &app.state::<AppService>(),
                &app.state::<ConfigState>().current(),
            );
            if let Some(rx) = config_rx {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    while let Ok(loaded) = rx.recv() {
                        apply_archive_extensions(&handle.state::<AppService>(), &loaded);
                        let _ = ConfigChanged { loaded }.emit(&handle);
                    }
                });
            }
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                // 큐 이벤트가 오면 최신 스냅샷을 UI로 보낸다.
                // 파일이 많으면 이벤트가 초당 수천 개 나오므로, 웹뷰가 밀리지 않게 합쳐서 보낸다.
                coalesce(&queue_events, Duration::from_millis(100), || {
                    let jobs = handle.state::<AppService>().queue_jobs();
                    let _ = QueueChanged { jobs }.emit(&handle);
                });
            });
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                // 검색/순회 결과를 UI로 전달한다.
                while let Ok(msg) = search_events.recv() {
                    match msg {
                        SearchMsg::Chunk { id, entries } => {
                            let _ = SearchChunk { id, entries }.emit(&handle);
                        }
                        SearchMsg::Usage {
                            id,
                            items,
                            done,
                            total_bytes,
                            files,
                        } => {
                            let _ = UsageUpdate {
                                id,
                                items,
                                done,
                                total_bytes,
                                files,
                            }
                            .emit(&handle);
                        }
                        SearchMsg::Done { id, summary } => {
                            let _ = SearchDone { id, summary }.emit(&handle);
                        }
                    }
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

/// `tauri dev`는 .app 번들 없이 실행되어 macOS가 아이콘을 읽지 못하므로 Dock 아이콘을 직접 지정한다.
#[cfg(target_os = "macos")]
fn set_dock_icon() {
    use objc2::{AllocAnyThread, MainThreadMarker};
    use objc2_app_kit::{NSApplication, NSImage};
    use objc2_foundation::NSData;

    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let data = NSData::with_bytes(include_bytes!("../icons/icon.png"));
    if let Some(image) = NSImage::initWithData(NSImage::alloc(), &data) {
        unsafe { NSApplication::sharedApplication(mtm).setApplicationIconImage(Some(&image)) };
    }
}
