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

use crate::quicklook::QuickLookDto;
use crate::service::{
    edit, open_file, reveal, reveal_config, ConflictDto, EntryDto, ExpectedFileDto, FileInfoDto,
    FindSpecDto, JobDto, JobKindDto, PreviewDto, QueueItemDto, SearchStartDto, SearchSummaryDto,
    Service, ServiceResult, WriteTextResultDto,
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

/// 경로가 놓인 파일시스템의 남은 용량과 전체 용량(바이트).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct DiskSpaceDto {
    pub free: f64,
    pub total: f64,
}

/// 경로가 놓인 파일시스템의 용량(드라이브 바의 "남음" 표시).
#[tauri::command]
#[specta::specta]
pub fn disk_space(path: String) -> ServiceResult<DiskSpaceDto> {
    let s = td_volumes::disk_space(&path)?;
    Ok(DiskSpaceDto {
        free: s.free as f64,
        total: s.total as f64,
    })
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

/// 즐겨찾기에서 경로(변수 확장 전 원문)가 같은 항목을 `config.toml`에서 지우고 새 설정을 바로 돌려준다. 폴더 자체는 지우지 않는다.
#[tauri::command]
#[specta::specta]
pub fn remove_favorite(config: State<'_, ConfigState>, path: String) -> ServiceResult<Loaded> {
    let store = config
        .store
        .as_ref()
        .ok_or("설정 디렉터리를 사용할 수 없습니다")?;
    td_config::remove_favorite(store.dir(), &path)?;
    Ok(store.refresh())
}

/// 현재 폴더 등을 즐겨찾기로 `config.toml`에 덧붙이고, 새로 병합된 설정을 바로 돌려준다(변경 이벤트를 기다리지 않는다).
#[tauri::command]
#[specta::specta]
pub fn add_favorite(
    config: State<'_, ConfigState>,
    name: String,
    path: String,
) -> ServiceResult<Loaded> {
    let store = config
        .store
        .as_ref()
        .ok_or("설정 디렉터리를 사용할 수 없습니다")?;
    td_config::append_favorite(store.dir(), &name, &path)?;
    Ok(store.refresh())
}

/// 설정 화면: 사용자 `config.toml`의 키 하나를 쓰고, 새로 병합된 설정을 바로 돌려준다(변경 이벤트를 기다리지 않는다).
#[tauri::command]
#[specta::specta]
pub fn set_config_value(
    config: State<'_, ConfigState>,
    key: String,
    value: td_config::ConfigValue,
) -> ServiceResult<Loaded> {
    let store = config
        .store
        .as_ref()
        .ok_or("설정 디렉터리를 사용할 수 없습니다")?;
    td_config::set_user_value(store.dir(), &key, value)?;
    Ok(store.refresh())
}

/// 설정 화면: 사용자 `config.toml`에서 키 하나를 지워 내장 기본값으로 되돌린다.
#[tauri::command]
#[specta::specta]
pub fn reset_config_value(config: State<'_, ConfigState>, key: String) -> ServiceResult<Loaded> {
    let store = config
        .store
        .as_ref()
        .ok_or("설정 디렉터리를 사용할 수 없습니다")?;
    td_config::reset_user_value(store.dir(), &key)?;
    Ok(store.refresh())
}

/// 설정 화면: 설정 폴더를 파일 관리자로 연다.
#[tauri::command]
#[specta::specta]
pub fn reveal_config_dir(
    launch: State<'_, AppLaunch>,
    config: State<'_, ConfigState>,
) -> ServiceResult<()> {
    let dir = config_dir(&config)?.to_string_lossy().into_owned();
    reveal_config(&launch, &dir)
}

#[tauri::command]
#[specta::specta]
pub fn file_info(svc: State<'_, AppService>, path: String) -> ServiceResult<FileInfoDto> {
    svc.file_info(&path)
}

/// 텍스트 파일을 덮어쓴다(미리보기 편집 저장). `expected`가 있으면 쓰기 직전에 파일 상태를 비교한다.
#[tauri::command]
#[specta::specta]
pub fn write_text_file(
    svc: State<'_, AppService>,
    path: String,
    text: String,
    expected: Option<ExpectedFileDto>,
) -> ServiceResult<WriteTextResultDto> {
    svc.write_text_file(&path, &text, expected)
}

#[tauri::command]
#[specta::specta]
pub fn preview_file(svc: State<'_, AppService>, path: String) -> ServiceResult<PreviewDto> {
    svc.preview(&path)
}

/// macOS Quick Look으로 Office 문서의 HTML 미리보기를 만든다. 최대 10초 걸릴 수 있어 메인 스레드가 아닌 곳에서 돌린다.
/// `seq`는 요청 순번(클수록 최근)이다. 명령이 보낸 순서와 다르게 들어와도 최근 요청이 이긴다.
#[tauri::command(async)]
#[specta::specta]
pub fn quicklook_preview(
    svc: State<'_, AppService>,
    path: String,
    seq: f64,
) -> ServiceResult<QuickLookDto> {
    svc.quicklook_preview(&path, seq)
}

/// 웹뷰 기준 CSS 픽셀 사각형(미리보기 자리).
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type)]
pub struct PreviewRectDto {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

fn physical(window: &tauri::WebviewWindow, r: PreviewRectDto) -> crate::preview_handler::PxRect {
    let css = crate::preview_handler::CssRect {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
    };
    crate::preview_handler::physical_rect(css, window.scale_factor().unwrap_or(1.0))
}

/// Windows 미리보기 처리기로 `path`를 앱 창 위 `rect` 자리에 띄운다 (ADR-0015). 이 형식의 처리기가 없거나 Windows가 아니면 false.
/// 처리기가 문서를 그릴 때까지 기다리므로 메인 스레드가 아닌 곳에서 돌린다.
#[tauri::command(async)]
#[specta::specta]
pub fn preview_handler_show(
    window: tauri::WebviewWindow,
    handlers: State<'_, crate::preview_handler::PreviewHandlers>,
    path: String,
    rect: PreviewRectDto,
) -> ServiceResult<crate::preview_handler::ShowOutcome> {
    #[cfg(windows)]
    let parent = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
    #[cfg(not(windows))]
    let parent = 0isize;
    let focus_target = window.clone();
    let on_click = std::sync::Arc::new(move || {
        let _ = focus_target.set_focus();
    });
    handlers.show(
        window.label(),
        parent,
        &path,
        physical(&window, rect),
        on_click,
    )
}

/// 인터넷에서 받아 Office가 미리보기를 막는 파일의 차단 표시(Zone.Identifier)를 지운다. 탐색기 파일 속성의 "차단 해제"와 같고 파일 내용은 건드리지 않는다.
/// 사용자가 버튼을 눌렀을 때만 부른다. Windows가 아니면 아무것도 하지 않는다.
#[tauri::command]
#[specta::specta]
pub fn unblock_file(path: String) -> ServiceResult<()> {
    #[cfg(windows)]
    {
        crate::preview_host::unblock(&path)
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Ok(())
    }
}

/// 처리기 창의 자리(웹 화면의 미리보기 영역)가 바뀌었다.
#[tauri::command]
#[specta::specta]
pub fn preview_handler_set_rect(
    window: tauri::WebviewWindow,
    handlers: State<'_, crate::preview_handler::PreviewHandlers>,
    rect: PreviewRectDto,
) {
    handlers.set_rect(window.label(), physical(&window, rect));
}

/// 대화상자·메뉴 같은 것이 위에 뜨는 동안 처리기 창을 숨기고(false), 닫히면 다시 보인다(true). 문서는 다시 읽지 않는다.
#[tauri::command]
#[specta::specta]
pub fn preview_handler_set_visible(
    window: tauri::WebviewWindow,
    handlers: State<'_, crate::preview_handler::PreviewHandlers>,
    visible: bool,
) {
    handlers.set_visible(window.label(), visible);
}

/// 처리기 창을 내린다(다른 항목으로 넘어가거나 미리보기를 닫을 때).
#[tauri::command]
#[specta::specta]
pub fn preview_handler_close(
    window: tauri::WebviewWindow,
    handlers: State<'_, crate::preview_handler::PreviewHandlers>,
) {
    handlers.close(window.label());
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

/// 파일을 운영체제 기본 프로그램으로 실행한다 (Enter/더블클릭).
#[tauri::command]
#[specta::specta]
pub fn open_path(launch: State<'_, AppLaunch>, path: String) -> ServiceResult<()> {
    open_file(&launch, &path)
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

/// F키에 지정한 애플리케이션으로 항목(들)을 연다. 앱은 경로를 인수로 받는다.
#[tauri::command]
#[specta::specta]
pub fn launch_app(
    launch: State<'_, AppLaunch>,
    app: String,
    paths: Vec<String>,
) -> ServiceResult<()> {
    crate::service::launch_app(&launch, &app, &paths)
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
        .title("Twin Deck")
        .inner_size(1200.0, 760.0)
        .visible(false) // 위치 복원 뒤 화면이 그려지면 on_page_load가 보여 준다
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

/// 파일을 창 밖(Finder, 탐색기, 다른 앱)으로 끌어 간다: 운영체제의 드래그를 시작한다. 놓는 쪽에서 복사된다.
/// 마우스 단추를 누르고 있는 동안 불러야 한다. macOS와 Windows에서만 지원한다.
#[tauri::command]
#[specta::specta]
pub fn start_native_drag(window: tauri::WebviewWindow, paths: Vec<String>) -> ServiceResult<()> {
    #[cfg(any(target_os = "macos", windows))]
    {
        let files: Vec<std::path::PathBuf> = paths
            .into_iter()
            .map(std::path::PathBuf::from)
            .filter(|p| p.exists())
            .collect();
        if files.is_empty() {
            return Err("끌어 갈 파일이 없습니다".to_string());
        }
        let icon = drag::Image::Raw(include_bytes!("../icons/32x32.png").to_vec());
        drag::start_drag(
            &window,
            drag::DragItem::Files(files),
            icon,
            |_, _| {},
            drag::Options::default(),
        )
        .map_err(|e| e.to_string())
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        let _ = (window, paths);
        Err("이 운영체제에서는 파일을 다른 앱으로 끌어 갈 수 없습니다".to_string())
    }
}

/// 파일 경로 목록을 운영체제 파일 클립보드에 쓴다. 빈 목록이면 클립보드를 비운다.
#[tauri::command]
#[specta::specta]
pub fn set_clipboard_files(svc: State<'_, AppService>, paths: Vec<String>) -> ServiceResult<()> {
    svc.set_clipboard_files(&paths)
}

/// 운영체제 파일 클립보드에 든 파일 경로(지금 있는 것만).
#[tauri::command]
#[specta::specta]
pub fn get_clipboard_files(svc: State<'_, AppService>) -> ServiceResult<Vec<String>> {
    svc.clipboard_files()
}

/// 복사/이동/휴지통/삭제를 작업 큐에 넣는다. 작업 id를 돌려준다.
#[tauri::command]
#[specta::specta]
pub fn enqueue_job(svc: State<'_, AppService>, kind: JobKindDto, items: Vec<QueueItemDto>) -> u32 {
    svc.enqueue(kind, items)
}

/// 압축을 큐에 넣는다 (OP-11). 작업 id를 돌려준다.
#[tauri::command]
#[specta::specta]
pub fn enqueue_compress(
    svc: State<'_, AppService>,
    sources: Vec<String>,
    dest_dir: String,
    name: Option<String>,
) -> ServiceResult<u32> {
    svc.enqueue_compress(sources, &dest_dir, name)
}

/// 추출을 큐에 넣는다 (OP-11). 작업 id를 돌려준다.
#[tauri::command]
#[specta::specta]
pub fn enqueue_extract(
    svc: State<'_, AppService>,
    src: String,
    dest_dir: String,
    folder: Option<String>,
) -> u32 {
    svc.enqueue_extract(&src, &dest_dir, folder)
}

/// 심볼릭 링크를 만든다 (OP-12). 만든 링크의 경로, 건너뛰었으면 null.
#[tauri::command]
#[specta::specta]
pub fn create_symlink(
    svc: State<'_, AppService>,
    src: String,
    dest_dir: String,
    policy: ConflictDto,
) -> ServiceResult<Option<String>> {
    svc.symlink(&src, &dest_dir, policy)
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

/// 파일 찾기를 시작한다. 결과는 `SearchChunk` 이벤트로 온다. 정규식 오류 등 조건 오류는 문자열이다.
#[tauri::command]
#[specta::specta]
pub fn start_find(svc: State<'_, AppService>, spec: FindSpecDto) -> ServiceResult<SearchStartDto> {
    svc.start_find(spec)
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

/// 폴더 하나의 하위 총 용량(바이트). 오래 걸릴 수 있어 메인 스레드가 아닌 곳에서 돌린다. 취소되면 `None`.
#[tauri::command(async)]
#[specta::specta]
pub fn dir_size(svc: State<'_, AppService>, path: String) -> ServiceResult<Option<f64>> {
    svc.dir_size(&path)
}

#[tauri::command]
#[specta::specta]
pub fn cancel_dir_size(svc: State<'_, AppService>, path: String) {
    svc.cancel_dir_size(&path);
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

/// 새 버전 정보. 업데이트 확인 창에 보인다.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct UpdateInfoDto {
    pub version: String,
    /// 릴리스 노트(없으면 null).
    pub notes: Option<String>,
    /// 릴리스 날짜(RFC 3339, 없으면 null).
    pub date: Option<String>,
}

/// GitHub 릴리스의 `latest.json`을 읽어 새 버전이 있으면 알려 준다. 없으면 null.
/// 이 OS용 항목이 없는 버전은 새 버전으로 치지 않는다(updater가 "항목 없음"으로 돌려준다).
#[tauri::command]
#[specta::specta]
pub async fn check_update(app: tauri::AppHandle) -> ServiceResult<Option<UpdateInfoDto>> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|e| e.to_string())?;
    let found = updater.check().await.map_err(|e| e.to_string())?;
    Ok(found.map(|u| UpdateInfoDto {
        version: u.version,
        notes: u.body,
        date: u.date.map(|d| d.to_string()),
    }))
}

/// 새 버전을 내려받아 설치하고 앱을 다시 시작한다(성공하면 돌아오지 않는다). 서명이 맞지 않으면 설치하지 않고 오류를 돌려준다.
#[tauri::command]
#[specta::specta]
pub async fn install_update(app: tauri::AppHandle) -> ServiceResult<()> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|e| e.to_string())?;
    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
        return Err("설치할 새 버전이 없습니다".into());
    };
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    app.restart()
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
            quicklook_preview,
            preview_handler_show,
            preview_handler_set_rect,
            preview_handler_set_visible,
            preview_handler_close,
            unblock_file,
            write_text_file,
            glob_filter,
            reveal_path,
            open_path,
            edit_paths,
            launch_app,
            open_as_archive,
            list_volumes,
            disk_space,
            unmount_volume,
            eject_volume,
            user_dirs,
            add_favorite,
            remove_favorite,
            set_config_value,
            reset_config_value,
            reveal_config_dir,
            check_update,
            install_update,
            list_dir,
            mkdir,
            touch,
            detect_conflict,
            start_native_drag,
            set_clipboard_files,
            get_clipboard_files,
            enqueue_job,
            enqueue_compress,
            enqueue_extract,
            create_symlink,
            queue_jobs,
            queue_pause,
            queue_resume,
            queue_abort,
            queue_clear_finished,
            rename_entry,
            watch_dir,
            unwatch_dir,
            start_lookup,
            start_find,
            start_flatten,
            start_disk_usage,
            cancel_search,
            dir_size,
            cancel_dir_size
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
