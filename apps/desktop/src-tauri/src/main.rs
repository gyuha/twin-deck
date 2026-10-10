#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cli;
mod commands;
mod epub;
mod preview_handler;
#[cfg(windows)]
mod preview_host;
mod quicklook;
mod service;

use tauri_specta::Event;
use td_ops::SystemTrash;

use commands::{
    specta_builder, AppLaunch, AppService, AppVolumes, ConfigChanged, ConfigState, DirChanged,
    LaunchPaths, OpenPaths, OpenPathsDto, QueueChanged, SearchChunk, SearchDone, TerminalExit,
    TerminalOutput, UsageUpdate,
};
use service::{coalesce, SearchMsg};
use std::time::Duration;
use tauri::Manager;

/// 설정 중 서비스가 들고 있는 값(ZIP 추가 확장자 ARC-01, 미리보기 한도)을 서비스에 반영한다.
pub fn apply_config(svc: &AppService, loaded: &td_config::Loaded) {
    svc.set_archive_extensions(loaded.config.file_systems.zip.additional_extensions.clone());
    svc.set_preview_limits(&loaded.config.preview);
}

/// 터미널에서 `td`로 불린 요청을 해석해 화면에 알리고 창을 앞으로 가져온다(이미 떠 있던 앱이 받는다).
fn handle_second_instance(app: &tauri::AppHandle, argv: Vec<String>, cwd: String) {
    let request = OpenPathsDto::from_result(cli::launch_request(
        argv.get(1..).unwrap_or(&[]),
        std::path::Path::new(&cwd),
    ));
    let _ = OpenPaths { request }.emit(app);
    let window = app
        .get_webview_window("main")
        .or_else(|| app.webview_windows().into_values().next());
    if let Some(w) = window {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn main() {
    // 설치 파일이 `--td-install-cli`/`--td-uninstall-cli`로 앱을 한 번 실행하면 화면 없이 `td` 명령만 설치·제거하고 끝난다.
    if let Some(flag) = cli::manage_flag(&std::env::args().skip(1).collect::<Vec<_>>()) {
        std::process::exit(cli::run_manage(flag));
    }
    // `td`라는 이름으로 불렸으면 인수를 검사하고 터미널에서 떨어져 나온다(앱 시작보다 먼저).
    #[cfg(unix)]
    cli::detach_if_td();
    let builder = specta_builder();
    let (service, channels) = AppService::new(SystemTrash).expect("서비스 초기화 실패");
    let (changes, queue_events, search_events, terminal_events) = (
        channels.dir_changes,
        channels.queue_events,
        channels.search_events,
        channels.terminal_events,
    );

    // 시작 인수(`td 폴더`)를 한 번 해석해 두고, 화면이 상태를 복원한 뒤 가져가 연다.
    let launch = {
        let args: Vec<String> = std::env::args().skip(1).collect();
        let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("/"));
        match cli::launch_request(&args, &cwd) {
            Ok(req) if req == cli::OpenRequest::default() => None,
            other => Some(OpenPathsDto::from_result(other)),
        }
    };
    let mut app = tauri::Builder::default();
    // 이미 떠 있으면 그 앱으로 경로를 넘기고 끝난다. 개발·시험으로 여러 개를 띄워야 하면 TWIN_DECK_MULTI=1.
    if std::env::var_os("TWIN_DECK_MULTI").is_none() {
        app = app.plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            handle_second_instance(app, argv, cwd)
        }));
    }
    app
        // 창은 숨긴 채 만들어지고(tauri.conf.json), 저장된 위치로 복원된 뒤 화면이 처음 그려졌을 때 보인다.
        // 기본 위치에 보였다가 옮겨지는 깜빡임을 막는다.
        .on_page_load(|webview, payload| {
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                let _ = webview.window().show();
            }
        })
        .invoke_handler(builder.invoke_handler())
        .plugin(tauri_plugin_clipboard_manager::init())
        // 창 위치·크기·최대화를 창 레이블별로 저장하고 다음 실행 때 복원한다.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::MAXIMIZED
                        | tauri_plugin_window_state::StateFlags::FULLSCREEN,
                )
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(service)
        .manage(LaunchPaths(std::sync::Mutex::new(launch)))
        .manage(preview_handler::PreviewHandlers::default())
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
            apply_config(
                &app.state::<AppService>(),
                &app.state::<ConfigState>().current(),
            );
            if let Some(rx) = config_rx {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    while let Ok(loaded) = rx.recv() {
                        apply_config(&handle.state::<AppService>(), &loaded);
                        let _ = ConfigChanged { loaded }.emit(&handle);
                    }
                });
            }
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                // 내장 터미널의 출력과 종료를 UI로 전달한다. 출력은 바이트라 base64로 보낸다.
                use base64::Engine;
                while let Ok(ev) = terminal_events.recv() {
                    match ev {
                        td_terminal::TermEvent::Output { id, data } => {
                            let data = base64::engine::general_purpose::STANDARD.encode(data);
                            let _ = TerminalOutput { id, data }.emit(&handle);
                        }
                        td_terminal::TermEvent::Exit { id, code } => {
                            let _ = TerminalExit { id, code }.emit(&handle);
                        }
                    }
                }
            });
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

        // 화면이 부르는 명령이 없어 권한 파일 자체가 없는 플러그인(single-instance는 `permissions` 디렉터리가 없다).
        const NO_PERMISSIONS: [&str; 1] = ["single-instance"];
        let manifest =
            fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml")).unwrap();
        for line in manifest.lines() {
            if let Some(rest) = line.trim().strip_prefix("tauri-plugin-") {
                let name = rest.split(['=', ' ']).next().unwrap();
                if NO_PERMISSIONS.contains(&name) {
                    continue;
                }
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
