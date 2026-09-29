#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod service;

use tauri_specta::Event;
use td_ops::SystemTrash;

use commands::{specta_builder, AppService, DirChanged};

fn main() {
    let builder = specta_builder();
    let (service, changes) = AppService::new(SystemTrash).expect("서비스 초기화 실패");

    tauri::Builder::default()
        .invoke_handler(builder.invoke_handler())
        .manage(service)
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
}
