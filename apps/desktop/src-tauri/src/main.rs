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
