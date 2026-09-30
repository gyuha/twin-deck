//! Tauri command/event 정의. 실제 로직은 `service`에 있다.

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::State;
use tauri_specta::{collect_commands, collect_events, Builder, Event};
use td_config::Loaded;
use td_launch::{Launch, SystemLauncher};
use td_ops::SystemTrash;
use td_state::{LoadedState, Snapshot, Spawner};
use td_volumes::{SystemUnmounter, Volumes};

use crate::service::{
    edit, reveal, EntryDto, FileInfoDto, JobDto, JobKindDto, PreviewDto, QueueItemDto,
    SearchStartDto, SearchSummaryDto, Service, ServiceResult,
};

pub type AppService = Service<SystemTrash>;
pub type AppVolumes = Volumes<SystemUnmounter>;
pub type AppLaunch = Launch<SystemLauncher>;

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

/// Look Up / Flatten 결과가 더 도착했다.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct SearchChunk {
    pub id: u32,
    pub entries: Vec<EntryDto>,
}

/// Disk Usage의 부분(또는 최종) 결과. 크기 내림차순 전체 스냅샷이다.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct UsageUpdate {
    pub id: u32,
    pub items: Vec<EntryDto>,
    pub done: bool,
    pub total_bytes: f64,
    pub files: f64,
}

/// 검색/순회 작업이 끝났다(정상, 취소 모두). 이 id의 마지막 이벤트다.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct SearchDone {
    pub id: u32,
    pub summary: SearchSummaryDto,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct VolumeDto {
    pub name: String,
    pub mount_point: String,
}

/// 경로 변수(`${user.downloads}` 등)와 `~` 확장에 쓰는 사용자 폴더. 알 수 없으면 null.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct UserDirsDto {
    pub home: Option<String>,
    pub downloads: Option<String>,
    pub documents: Option<String>,
    pub desktop: Option<String>,
    pub pictures: Option<String>,
    pub music: Option<String>,
    pub movies: Option<String>,
}

#[tauri::command]
#[specta::specta]
pub fn list_volumes(volumes: State<'_, AppVolumes>) -> Vec<VolumeDto> {
    volumes
        .list()
        .into_iter()
        .map(|v| VolumeDto {
            name: v.name,
            mount_point: v.mount_point,
        })
        .collect()
}

#[tauri::command]
#[specta::specta]
pub fn unmount_volume(volumes: State<'_, AppVolumes>, mount_point: String) -> ServiceResult<()> {
    volumes.unmount(&mount_point).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn eject_volume(volumes: State<'_, AppVolumes>, mount_point: String) -> ServiceResult<()> {
    volumes.eject(&mount_point).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn user_dirs(app: tauri::AppHandle) -> UserDirsDto {
    use tauri::Manager;
    let p = app.path();
    let s = |r: tauri::Result<std::path::PathBuf>| r.ok().map(|p| p.to_string_lossy().into_owned());
    UserDirsDto {
        home: s(p.home_dir()),
        downloads: s(p.download_dir()),
        documents: s(p.document_dir()),
        desktop: s(p.desktop_dir()),
        pictures: s(p.picture_dir()),
        music: s(p.audio_dir()),
        movies: s(p.video_dir()),
    }
}

/// 현재 폴더 등을 즐겨찾기로 `config.toml`에 덧붙인다. 파일 감시가 재로딩한다.
#[tauri::command]
#[specta::specta]
pub fn add_favorite(
    config: State<'_, ConfigState>,
    name: String,
    path: String,
) -> ServiceResult<()> {
    let store = config
        .store
        .as_ref()
        .ok_or("설정 디렉터리를 사용할 수 없습니다")?;
    td_config::append_favorite(store.dir(), &name, &path)
}

#[tauri::command]
#[specta::specta]
pub fn file_info(svc: State<'_, AppService>, path: String) -> ServiceResult<FileInfoDto> {
    svc.file_info(&path)
}

#[tauri::command]
#[specta::specta]
pub fn preview_file(svc: State<'_, AppService>, path: String) -> ServiceResult<PreviewDto> {
    svc.preview(&path)
}

/// `pattern`과 일치하는 이름의 인덱스를 돌려준다 (Select Group).
#[tauri::command]
#[specta::specta]
pub fn glob_filter(svc: State<'_, AppService>, pattern: String, names: Vec<String>) -> Vec<u32> {
    svc.glob_filter(&pattern, &names)
}

#[tauri::command]
#[specta::specta]
pub fn reveal_path(launch: State<'_, AppLaunch>, path: String) -> ServiceResult<()> {
    reveal(&launch, &path)
}

/// 확장자와 무관하게 파일을 아카이브로 연다 (ARC-04). 아카이브 루트 경로를 돌려준다.
#[tauri::command]
#[specta::specta]
pub fn open_as_archive(svc: State<'_, AppService>, path: String) -> ServiceResult<String> {
    svc.open_as_archive(&path)
}

/// 설정의 `environment.text_editor`로 항목을 연다.
#[tauri::command]
#[specta::specta]
pub fn edit_paths(
    svc: State<'_, AppService>,
    launch: State<'_, AppLaunch>,
    config: State<'_, ConfigState>,
    paths: Vec<String>,
) -> ServiceResult<()> {
    let editor = config.current().config.environment.text_editor;
    let paths = svc.prepare_edit(&paths)?;
    edit(&launch, &editor, &paths)
}

fn config_dir(config: &ConfigState) -> ServiceResult<&std::path::Path> {
    config
        .store
        .as_ref()
        .map(|s| s.dir())
        .ok_or_else(|| "설정 디렉터리를 사용할 수 없어 상태를 저장/복원하지 못합니다".to_string())
}

/// 이 창이 마지막으로 저장한 상태(PANE-05). 없거나 읽을 수 없으면 None(+경고).
#[tauri::command]
#[specta::specta]
pub fn load_state(window: tauri::Window, config: State<'_, ConfigState>) -> LoadedState {
    match config_dir(&config) {
        Ok(dir) => td_state::load(dir, window.label()),
        Err(_) => LoadedState {
            snapshot: None,
            warning: None,
        },
    }
}

#[tauri::command]
#[specta::specta]
pub fn save_state(
    window: tauri::Window,
    config: State<'_, ConfigState>,
    snapshot: Snapshot,
) -> ServiceResult<()> {
    td_state::save(config_dir(&config)?, window.label(), &snapshot).map_err(|e| e.to_string())
}

/// 저장된 상태를 모두 지우고 앱을 종료한다 (`core.state.reset`).
#[tauri::command]
#[specta::specta]
pub fn reset_state(app: tauri::AppHandle, config: State<'_, ConfigState>) -> ServiceResult<()> {
    td_state::reset(config_dir(&config)?).map_err(|e| e.to_string())?;
    app.exit(0);
    Ok(())
}

struct TauriSpawner(tauri::AppHandle);

impl Spawner for TauriSpawner {
    fn spawn(&self, label: &str) -> Result<(), String> {
        tauri::WebviewWindowBuilder::new(
            &self.0,
            label,
            tauri::WebviewUrl::App("index.html".into()),
        )
        .title("twin-deck")
        .inner_size(1200.0, 760.0)
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
    }
}

/// 새 창을 연다 (PANE-03). 새 창의 상태는 창 레이블별로 따로 저장된다. 만든 창의 레이블을 돌려준다.
#[tauri::command]
#[specta::specta]
pub fn new_window(app: tauri::AppHandle) -> ServiceResult<String> {
    use tauri::Manager;
    let existing: Vec<String> = app.webview_windows().keys().cloned().collect();
    td_state::open_new_window(&TauriSpawner(app), &existing)
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

/// Look Up을 시작한다. 결과는 `SearchChunk` 이벤트로 온다. 질의 오류는 위치가 든 문자열이다.
#[tauri::command]
#[specta::specta]
pub fn start_lookup(
    svc: State<'_, AppService>,
    root: String,
    query: String,
) -> ServiceResult<SearchStartDto> {
    svc.start_lookup(&root, &query)
}

/// Flatten을 시작한다. 결과는 `SearchChunk` 이벤트로 온다.
#[tauri::command]
#[specta::specta]
pub fn start_flatten(svc: State<'_, AppService>, root: String) -> u32 {
    svc.start_flatten(&root)
}

/// Disk Usage를 시작한다. 결과는 `UsageUpdate` 이벤트로 온다.
#[tauri::command]
#[specta::specta]
pub fn start_disk_usage(svc: State<'_, AppService>, root: String) -> u32 {
    svc.start_disk_usage(&root, false)
}

#[tauri::command]
#[specta::specta]
pub fn cancel_search(svc: State<'_, AppService>, id: u32) {
    svc.cancel_search(id);
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
            load_state,
            save_state,
            reset_state,
            new_window,
            file_info,
            preview_file,
            glob_filter,
            reveal_path,
            edit_paths,
            open_as_archive,
            list_volumes,
            unmount_volume,
            eject_volume,
            user_dirs,
            add_favorite,
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
            unwatch_dir,
            start_lookup,
            start_flatten,
            start_disk_usage,
            cancel_search
        ])
        .events(collect_events![
            DirChanged,
            QueueChanged,
            ConfigChanged,
            SearchChunk,
            UsageUpdate,
            SearchDone
        ])
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
