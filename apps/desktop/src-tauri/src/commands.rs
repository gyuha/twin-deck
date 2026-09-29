//! Tauri command/event 정의. 실제 로직은 `service`에 있다.

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::State;
use tauri_specta::{collect_commands, collect_events, Builder, Event};
use td_ops::SystemTrash;

use crate::service::{ConflictDto, EntryDto, OutcomeDto, Service, ServiceResult};

pub type AppService = Service<SystemTrash>;

/// 감시 중인 디렉터리의 내용이 바뀌었다.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct DirChanged {
    pub path: String,
}

#[tauri::command]
#[specta::specta]
pub fn list_dir(
    svc: State<'_, AppService>,
    path: String,
    show_hidden: bool,
) -> ServiceResult<Vec<EntryDto>> {
    svc.list_dir(&path, show_hidden)
}

#[tauri::command]
#[specta::specta]
pub fn mkdir(svc: State<'_, AppService>, path: String) -> ServiceResult<()> {
    svc.mkdir(&path)
}

#[tauri::command]
#[specta::specta]
pub fn touch(svc: State<'_, AppService>, path: String) -> ServiceResult<()> {
    svc.touch(&path)
}

#[tauri::command]
#[specta::specta]
pub fn detect_conflict(
    svc: State<'_, AppService>,
    src: String,
    dest_dir: String,
) -> Option<String> {
    svc.detect_conflict(&src, &dest_dir)
}

#[tauri::command]
#[specta::specta]
pub fn copy_entry(
    svc: State<'_, AppService>,
    src: String,
    dest_dir: String,
    policy: ConflictDto,
) -> ServiceResult<OutcomeDto> {
    svc.copy(&src, &dest_dir, policy)
}

#[tauri::command]
#[specta::specta]
pub fn move_entry(
    svc: State<'_, AppService>,
    src: String,
    dest_dir: String,
    policy: ConflictDto,
) -> ServiceResult<OutcomeDto> {
    svc.move_to(&src, &dest_dir, policy)
}

#[tauri::command]
#[specta::specta]
pub fn rename_entry(
    svc: State<'_, AppService>,
    path: String,
    new_name: String,
) -> ServiceResult<String> {
    svc.rename(&path, &new_name)
}

#[tauri::command]
#[specta::specta]
pub fn trash_entry(svc: State<'_, AppService>, path: String) -> ServiceResult<()> {
    svc.trash(&path)
}

#[tauri::command]
#[specta::specta]
pub fn delete_entry(svc: State<'_, AppService>, path: String) -> ServiceResult<()> {
    svc.delete_permanent(&path)
}

#[tauri::command]
#[specta::specta]
pub fn watch_dir(svc: State<'_, AppService>, path: String) -> ServiceResult<()> {
    svc.watch(&path)
}

#[tauri::command]
#[specta::specta]
pub fn unwatch_dir(svc: State<'_, AppService>, path: String) -> ServiceResult<()> {
    svc.unwatch(&path)
}

pub fn specta_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new()
        .commands(collect_commands![
            list_dir,
            mkdir,
            touch,
            detect_conflict,
            copy_entry,
            move_entry,
            rename_entry,
            trash_entry,
            delete_entry,
            watch_dir,
            unwatch_dir
        ])
        .events(collect_events![DirChanged])
}

#[cfg(test)]
mod tests {
    use super::*;
    use specta_typescript::Typescript;

    /// 커밋된 생성 파일이 Rust 정의와 어긋나면(타입 드리프트) 실패한다.
    /// 갱신: `UPDATE_BINDINGS=1 cargo test -p twin-deck-desktop bindings_are_up_to_date`
    #[test]
    fn bindings_are_up_to_date() {
        let generated = specta_builder()
            .export_str(Typescript::default())
            .expect("타입 생성 실패");
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../packages/ts-client/src/generated/bindings.ts"
        );
        if std::env::var_os("UPDATE_BINDINGS").is_some() {
            std::fs::create_dir_all(std::path::Path::new(path).parent().unwrap()).unwrap();
            std::fs::write(path, &generated).unwrap();
        }
        let committed =
            std::fs::read_to_string(path).expect("bindings.ts가 없다: UPDATE_BINDINGS=1로 생성");
        assert_eq!(committed, generated, "bindings.ts가 최신이 아니다");
    }
}
