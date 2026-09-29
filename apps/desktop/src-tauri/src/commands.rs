//! Tauri command/event 정의. 실제 로직은 `service`에 있다.

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::State;
use tauri_specta::{collect_commands, collect_events, Builder, Event};
use td_config::Loaded;
use td_ops::SystemTrash;

use crate::service::{EntryDto, JobDto, JobKindDto, QueueItemDto, Service, ServiceResult};

pub type AppService = Service<SystemTrash>;

/// 감시 중인 디렉터리의 내용이 바뀌었다.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct DirChanged {
    pub path: String,
}

/// 작업 큐의 상태가 바뀔 때마다 전체 스냅샷을 보낸다.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct QueueChanged {
    pub jobs: Vec<JobDto>,
}

/// 설정이 바뀌었다(파일 감시). 문법 오류가 있으면 이전 유효 설정과 경고가 온다.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct ConfigChanged {
    pub loaded: Loaded,
}

/// 앱이 쓰는 설정 저장소. 설정 디렉터리를 열지 못하면 내장 기본값만 쓴다.
pub struct ConfigState {
    pub store: Option<td_config::ConfigStore>,
    pub startup_warning: Option<String>,
}

impl ConfigState {
    pub fn current(&self) -> Loaded {
        match &self.store {
            Some(s) => s.current(),
            None => {
                let mut l = td_config::load_from_strs(None, None, td_config::Platform::current());
                if let Some(w) = &self.startup_warning {
                    l.warnings.push(td_config::Warning {
                        file: "config.toml".into(),
                        message: w.clone(),
                        line: None,
                    });
                }
                l
            }
        }
    }
}

#[tauri::command]
#[specta::specta]
pub fn get_config(state: State<'_, ConfigState>) -> Loaded {
    state.current()
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

/// 복사/이동/휴지통/삭제를 작업 큐에 넣는다. 작업 id를 돌려준다.
#[tauri::command]
#[specta::specta]
pub fn enqueue_job(svc: State<'_, AppService>, kind: JobKindDto, items: Vec<QueueItemDto>) -> u32 {
    svc.enqueue(kind, items)
}

#[tauri::command]
#[specta::specta]
pub fn queue_jobs(svc: State<'_, AppService>) -> Vec<JobDto> {
    svc.queue_jobs()
}

#[tauri::command]
#[specta::specta]
pub fn queue_pause(svc: State<'_, AppService>, id: u32) {
    svc.queue_pause(id);
}

#[tauri::command]
#[specta::specta]
pub fn queue_resume(svc: State<'_, AppService>, id: u32) {
    svc.queue_resume(id);
}

#[tauri::command]
#[specta::specta]
pub fn queue_abort(svc: State<'_, AppService>, id: u32) {
    svc.queue_abort(id);
}

#[tauri::command]
#[specta::specta]
pub fn queue_clear_finished(svc: State<'_, AppService>) {
    svc.queue_clear_finished();
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
            get_config,
            list_dir,
            mkdir,
            touch,
            detect_conflict,
            enqueue_job,
            queue_jobs,
            queue_pause,
            queue_resume,
            queue_abort,
            queue_clear_finished,
            rename_entry,
            watch_dir,
            unwatch_dir
        ])
        .events(collect_events![DirChanged, QueueChanged, ConfigChanged])
}

#[cfg(test)]
mod tests {
    use super::*;
    use specta_typescript::Typescript;

    /// 커밋된 생성 파일이 Rust 정의와 어긋나면(타입 드리프트) 실패한다.
    /// 갱신: `UPDATE_BINDINGS=1 cargo test -p twin-deck-desktop bindings_are_up_to_date`
    #[test]
    fn default_config_fixture_is_up_to_date() {
        let loaded = td_config::load_from_strs(None, None, td_config::Platform::Linux);
        assert!(loaded.warnings.is_empty());
        let json = serde_json::to_string_pretty(&loaded).unwrap() + "\n";
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../packages/ts-client/src/generated/default-config.json"
        );
        if std::env::var_os("UPDATE_BINDINGS").is_some() {
            std::fs::write(path, &json).unwrap();
        }
        let committed = std::fs::read_to_string(path)
            .expect("default-config.json이 없다: UPDATE_BINDINGS=1로 생성");
        assert_eq!(committed, json, "default-config.json이 최신이 아니다");
    }

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
