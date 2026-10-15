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

/// 내장 터미널이 출력을 냈다. `data`는 pty가 낸 바이트의 base64(UTF-8 글자 중간에서 잘릴 수 있어 글이 아니라 바이트로 보낸다).
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct TerminalOutput {
    pub id: u32,
    pub data: String,
}

/// 내장 터미널의 셸이 끝났다.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct TerminalExit {
    pub id: u32,
    pub code: Option<u32>,
}

/// `td` 명령의 설치 상태.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum CliStateDto {
    Absent,
    Installed,
    /// 다른 프로그램의 `td`가 있다(macOS).
    Foreign,
    Unsupported,
}

/// 설치 상태와, 링크(macOS) 또는 `td.cmd`(Windows)의 위치.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct CliStatusDto {
    pub state: CliStateDto,
    pub link: String,
}

/// 설치·제거를 한 결과.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum CliOutcomeDto {
    Installed,
    AlreadyInstalled,
    Removed,
    NotInstalled,
}

impl From<td_cli::Status> for CliStatusDto {
    fn from(s: td_cli::Status) -> Self {
        let state = match s.state {
            td_cli::State::Absent => CliStateDto::Absent,
            td_cli::State::Installed => CliStateDto::Installed,
            td_cli::State::Foreign => CliStateDto::Foreign,
            td_cli::State::Unsupported => CliStateDto::Unsupported,
        };
        Self {
            state,
            link: s.link,
        }
    }
}

impl From<td_cli::Outcome> for CliOutcomeDto {
    fn from(o: td_cli::Outcome) -> Self {
        match o {
            td_cli::Outcome::Installed => CliOutcomeDto::Installed,
            td_cli::Outcome::AlreadyInstalled => CliOutcomeDto::AlreadyInstalled,
            td_cli::Outcome::Removed => CliOutcomeDto::Removed,
            td_cli::Outcome::NotInstalled => CliOutcomeDto::NotInstalled,
        }
    }
}

/// 이 앱의 실제 실행 파일(링크를 푼 경로).
fn app_exe() -> ServiceResult<std::path::PathBuf> {
    std::env::current_exe()
        .and_then(std::fs::canonicalize)
        .map_err(|e| format!("앱 실행 파일 위치를 알 수 없습니다: {e}"))
}

/// `td` 명령의 설치 상태를 돌려준다.
#[tauri::command]
#[specta::specta]
pub async fn cli_status() -> ServiceResult<CliStatusDto> {
    let exe = app_exe()?;
    Ok(td_cli::status(&exe).into())
}

/// `td` 명령을 설치한다. macOS에서는 관리자 암호 창이 뜰 수 있어 UI 스레드를 막지 않게 따로 돌린다.
#[tauri::command]
#[specta::specta]
pub async fn cli_install() -> ServiceResult<CliOutcomeDto> {
    let exe = app_exe()?;
    tauri::async_runtime::spawn_blocking(move || td_cli::install(&exe).map(Into::into))
        .await
        .map_err(|e| e.to_string())?
}

/// `td` 명령을 제거한다(우리가 만든 것만).
#[tauri::command]
#[specta::specta]
pub async fn cli_uninstall() -> ServiceResult<CliOutcomeDto> {
    let exe = app_exe()?;
    tauri::async_runtime::spawn_blocking(move || td_cli::uninstall(&exe).map(Into::into))
        .await
        .map_err(|e| e.to_string())?
}

/// `td` 명령으로 넘어온, 패널에 열 한 곳. 파일을 주면 `folder`는 그 파일이 든 폴더이고 `focus`가 파일 이름이다.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct OpenTargetDto {
    pub folder: String,
    pub focus: Option<String>,
}

/// `td` 명령이 앱에 넘긴 요청: 왼쪽·오른쪽 패널에 새 탭으로 열 곳과, 해석에 실패했을 때의 오류 문구.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, Type)]
pub struct OpenPathsDto {
    pub left: Option<OpenTargetDto>,
    pub right: Option<OpenTargetDto>,
    pub error: Option<String>,
}

impl OpenPathsDto {
    pub fn from_result(r: Result<crate::cli::OpenRequest, crate::cli::CliError>) -> Self {
        let dto = |t: crate::cli::OpenTarget| OpenTargetDto {
            folder: t.folder,
            focus: t.focus,
        };
        match r {
            Ok(req) => Self {
                left: req.left.map(dto),
                right: req.right.map(dto),
                error: None,
            },
            Err(e) => Self {
                left: None,
                right: None,
                error: Some(e.message()),
            },
        }
    }
}

/// 실행 중인 앱에 `td` 명령이 경로를 넘겼다(단일 인스턴스).
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct OpenPaths {
    pub request: OpenPathsDto,
}

/// 앱이 시작될 때 받은 `td` 인수. 화면이 처음 한 번 가져가면 비운다.
#[derive(Default)]
pub struct LaunchPaths(pub std::sync::Mutex<Option<OpenPathsDto>>);

/// 설정이 바뀌었다(파일 감시). 문법 오류가 있으면 이전 유효 설정과 경고가 온다.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct ConfigChanged {
    pub loaded: Loaded,
}

/// 앱이 쓰는 설정 저장소. 설정 디렉터리를 열지 못하면 내장 기본값만 쓴다.
/// 설정 파일 폴더는 저장 경로를 바꾸면 실행 중에 바뀌고, 창 상태(`state.json`)는 늘 로컬 폴더(`local_dir`)에 둔다.
pub struct ConfigState {
    pub local_dir: Option<std::path::PathBuf>,
    pub store: std::sync::Mutex<Option<td_config::ConfigStore>>,
    /// 지정 저장 경로를 쓰지 못해 로컬 폴더로 돌아갔다는 경고. 경로를 다시 정하면 지운다.
    pub location_warning: std::sync::Mutex<Option<td_config::Warning>>,
    pub startup_warning: Option<String>,
}

/// 설정 화면이 보여 주는 저장 경로.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ConfigLocationDto {
    /// 지금 설정 파일을 읽고 쓰는 폴더.
    pub dir: String,
    /// 기본 위치(로컬 앱 설정 폴더).
    pub default_dir: String,
    /// 사용자가 저장 경로를 지정했는가.
    pub custom: bool,
}

impl ConfigState {
    /// 로컬 앱 설정 폴더를 받아 지정 저장 경로를 따라 설정 저장소를 연다. 바뀐 설정을 받는 수신기도 돌려준다.
    pub fn open(
        local_dir: Option<std::path::PathBuf>,
    ) -> (Self, Option<std::sync::mpsc::Receiver<Loaded>>) {
        let Some(local) = local_dir else {
            return (
                Self::without_store(None, "설정 디렉터리를 알 수 없어 기본값을 씁니다".into()),
                None,
            );
        };
        let resolved = td_config::resolve_config_dir(&local);
        match td_config::ConfigStore::start(&resolved.dir, td_config::Platform::current()) {
            Ok((store, rx)) => (
                Self {
                    local_dir: Some(local),
                    store: std::sync::Mutex::new(Some(store)),
                    location_warning: std::sync::Mutex::new(resolved.warning),
                    startup_warning: None,
                },
                Some(rx),
            ),
            Err(e) => (
                Self::without_store(
                    Some(local),
                    format!("설정 디렉터리를 열지 못해 기본값을 씁니다: {e}"),
                ),
                None,
            ),
        }
    }

    fn without_store(local_dir: Option<std::path::PathBuf>, warning: String) -> Self {
        Self {
            local_dir,
            store: std::sync::Mutex::new(None),
            location_warning: std::sync::Mutex::new(None),
            startup_warning: Some(warning),
        }
    }

    pub fn current(&self) -> Loaded {
        let mut l = match &*self.store.lock().unwrap() {
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
        };
        if let Some(w) = &*self.location_warning.lock().unwrap() {
            l.warnings.push(w.clone());
        }
        l
    }

    /// 설정 저장소로 일을 하고 최신 설정(저장 경로 경고 포함)을 돌려준다.
    fn update(
        &self,
        f: impl FnOnce(&std::path::Path) -> Result<(), String>,
    ) -> ServiceResult<Loaded> {
        {
            let guard = self.store.lock().unwrap();
            let store = guard.as_ref().ok_or("설정 디렉터리를 사용할 수 없습니다")?;
            f(store.dir())?;
            store.refresh();
        }
        Ok(self.current())
    }

    /// 지금 설정 파일을 읽고 쓰는 폴더.
    pub fn config_dir(&self) -> ServiceResult<std::path::PathBuf> {
        self.store
            .lock()
            .unwrap()
            .as_ref()
            .map(|s| s.dir().to_path_buf())
            .ok_or_else(|| "설정 디렉터리를 사용할 수 없습니다".to_string())
    }

    pub fn location(&self) -> ServiceResult<ConfigLocationDto> {
        let local = self
            .local_dir
            .as_ref()
            .ok_or("설정 디렉터리를 사용할 수 없습니다")?;
        let dir = self.config_dir()?;
        Ok(ConfigLocationDto {
            dir: dir.to_string_lossy().into_owned(),
            default_dir: local.to_string_lossy().into_owned(),
            custom: td_config::read_config_location(local).is_some(),
        })
    }

    /// 지금 설정 파일을 zip 파일 `dest`로 내보낸다.
    pub fn export_zip(&self, dest: &std::path::Path) -> ServiceResult<()> {
        td_config::export_config_zip(&self.config_dir()?, dest)
    }

    /// zip 파일 `src`의 설정을 가져와 지금 설정 파일을 바꾸고(기존은 `.bak`) 새 설정을 돌려준다.
    pub fn import_zip(&self, src: &std::path::Path) -> ServiceResult<Loaded> {
        self.update(|dir| td_config::import_config_zip(src, dir))
    }

    /// 저장 경로를 바꾸고(None이면 기본 위치) 새 폴더로 설정 저장소를 다시 연다. 새 설정과 그 저장소의 변경 수신기를 돌려준다.
    /// 이전 저장소는 버려지며 그 감시 스레드도 끝난다.
    pub fn switch_location(
        &self,
        target: Option<&std::path::Path>,
        conflict: td_config::LocationConflict,
    ) -> ServiceResult<(Loaded, std::sync::mpsc::Receiver<Loaded>)> {
        let local = self
            .local_dir
            .as_ref()
            .ok_or("설정 디렉터리를 사용할 수 없습니다")?;
        let current = self.config_dir().unwrap_or_else(|_| local.clone());
        let dir = td_config::change_config_location(local, &current, target, conflict)?;
        let (store, rx) = td_config::ConfigStore::start(&dir, td_config::Platform::current())
            .map_err(|e| format!("새 설정 폴더를 열지 못했습니다: {e}"))?;
        *self.store.lock().unwrap() = Some(store);
        *self.location_warning.lock().unwrap() = None;
        Ok((self.current(), rx))
    }
}

/// 설정 저장소가 보내는 변경을 서비스·전역 단축키·화면에 반영한다. 저장소가 버려지면 끝난다.
pub fn forward_config_changes(handle: tauri::AppHandle, rx: std::sync::mpsc::Receiver<Loaded>) {
    use tauri::Manager;
    std::thread::spawn(move || {
        while let Ok(loaded) = rx.recv() {
            // 다른 경고(저장 경로)를 합치려고 저장소 값 대신 ConfigState의 최신 값을 보낸다.
            let loaded = handle
                .try_state::<ConfigState>()
                .map(|c| c.current())
                .unwrap_or(loaded);
            crate::apply_config(&handle.state::<AppService>(), &loaded);
            crate::global_hotkey::apply(&handle, &loaded.config.environment);
            let _ = ConfigChanged { loaded }.emit(&handle);
        }
    });
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
    config.update(|dir| td_config::remove_favorite(dir, &path))
}

/// 현재 폴더 등을 즐겨찾기로 `config.toml`에 덧붙이고, 새로 병합된 설정을 바로 돌려준다(변경 이벤트를 기다리지 않는다).
#[tauri::command]
#[specta::specta]
pub fn add_favorite(
    config: State<'_, ConfigState>,
    name: String,
    path: String,
) -> ServiceResult<Loaded> {
    config.update(|dir| td_config::append_favorite(dir, &name, &path))
}

/// 설정 화면: 사용자 `config.toml`의 키 하나를 쓰고, 새로 병합된 설정을 바로 돌려준다(변경 이벤트를 기다리지 않는다).
#[tauri::command]
#[specta::specta]
pub fn set_config_value(
    svc: State<'_, AppService>,
    config: State<'_, ConfigState>,
    key: String,
    value: td_config::ConfigValue,
) -> ServiceResult<Loaded> {
    let loaded = config.update(|dir| td_config::set_user_value(dir, &key, value))?;
    crate::apply_config(&svc, &loaded);
    Ok(loaded)
}

/// 설정 화면: 사용자 `config.toml`에서 키 하나를 지워 내장 기본값으로 되돌린다.
#[tauri::command]
#[specta::specta]
pub fn reset_config_value(
    svc: State<'_, AppService>,
    config: State<'_, ConfigState>,
    key: String,
) -> ServiceResult<Loaded> {
    let loaded = config.update(|dir| td_config::reset_user_value(dir, &key))?;
    crate::apply_config(&svc, &loaded);
    Ok(loaded)
}

/// 설정 화면: 설정 폴더를 파일 관리자로 연다.
#[tauri::command]
#[specta::specta]
pub fn reveal_config_dir(
    launch: State<'_, AppLaunch>,
    config: State<'_, ConfigState>,
) -> ServiceResult<()> {
    let dir = config.config_dir()?.to_string_lossy().into_owned();
    reveal_config(&launch, &dir)
}

/// 설정 화면: 지금 설정 파일 저장 경로와 기본 위치.
#[tauri::command]
#[specta::specta]
pub fn get_config_location(config: State<'_, ConfigState>) -> ServiceResult<ConfigLocationDto> {
    config.location()
}

/// 폴더 선택 창을 띄워 고른 폴더의 경로를 돌려준다. 취소하면 None.
#[tauri::command]
#[specta::specta]
pub async fn pick_folder(app: tauri::AppHandle) -> ServiceResult<Option<String>> {
    use tauri_plugin_dialog::DialogExt;
    let picked =
        tauri::async_runtime::spawn_blocking(move || app.dialog().file().blocking_pick_folder())
            .await
            .map_err(|e| e.to_string())?;
    picked
        .map(|p| p.into_path().map(|p| p.to_string_lossy().into_owned()))
        .transpose()
        .map_err(|e| e.to_string())
}

/// 저장 위치 선택 창을 띄워 고른 파일 경로를 돌려준다. 취소하면 None.
#[tauri::command]
#[specta::specta]
pub async fn pick_save_file(
    app: tauri::AppHandle,
    default_name: String,
    extensions: Vec<String>,
) -> ServiceResult<Option<String>> {
    use tauri_plugin_dialog::DialogExt;
    let picked = tauri::async_runtime::spawn_blocking(move || {
        let exts: Vec<&str> = extensions.iter().map(String::as_str).collect();
        let mut dialog = app.dialog().file().set_file_name(default_name);
        if !exts.is_empty() {
            dialog = dialog.add_filter(exts.join(", "), &exts);
        }
        dialog.blocking_save_file()
    })
    .await
    .map_err(|e| e.to_string())?;
    picked
        .map(|p| p.into_path().map(|p| p.to_string_lossy().into_owned()))
        .transpose()
        .map_err(|e| e.to_string())
}

/// 파일 선택 창을 띄워 고른 파일 경로를 돌려준다. 취소하면 None.
#[tauri::command]
#[specta::specta]
pub async fn pick_file(
    app: tauri::AppHandle,
    extensions: Vec<String>,
) -> ServiceResult<Option<String>> {
    use tauri_plugin_dialog::DialogExt;
    let picked = tauri::async_runtime::spawn_blocking(move || {
        let exts: Vec<&str> = extensions.iter().map(String::as_str).collect();
        let mut dialog = app.dialog().file();
        if !exts.is_empty() {
            dialog = dialog.add_filter(exts.join(", "), &exts);
        }
        dialog.blocking_pick_file()
    })
    .await
    .map_err(|e| e.to_string())?;
    picked
        .map(|p| p.into_path().map(|p| p.to_string_lossy().into_owned()))
        .transpose()
        .map_err(|e| e.to_string())
}

/// 설정 화면: 지금 설정 파일(`config.toml`·`keybindings.toml`)을 zip 파일로 내보낸다.
#[tauri::command]
#[specta::specta]
pub fn export_config(config: State<'_, ConfigState>, dest: String) -> ServiceResult<()> {
    config.export_zip(std::path::Path::new(&dest))
}

/// 설정 화면: 내보낸 zip 파일에서 설정을 가져와 지금 설정 파일을 바꾸고(기존은 `.bak`) 새 설정을 바로 돌려준다.
#[tauri::command]
#[specta::specta]
pub fn import_config(
    app: tauri::AppHandle,
    svc: State<'_, AppService>,
    config: State<'_, ConfigState>,
    src: String,
) -> ServiceResult<Loaded> {
    let loaded = config.import_zip(std::path::Path::new(&src))?;
    crate::apply_config(&svc, &loaded);
    crate::global_hotkey::apply(&app, &loaded.config.environment);
    Ok(loaded)
}

/// 설정 화면: 그 폴더에 이미 설정 파일(`config.toml`·`keybindings.toml`)이 있는가. 있으면 저장 경로를 바꾸기 전에 어떻게 할지 묻는다.
#[tauri::command]
#[specta::specta]
pub fn config_location_has_files(dir: String) -> bool {
    td_config::has_config_files(std::path::Path::new(&dir))
}

/// 설정 화면: 설정 파일 저장 경로를 바꾼다(`dir`이 None이면 기본 위치로). 새 폴더의 설정을 바로 적용해 돌려주고 다른 창에도 알린다.
#[tauri::command]
#[specta::specta]
pub fn set_config_location(
    app: tauri::AppHandle,
    svc: State<'_, AppService>,
    config: State<'_, ConfigState>,
    dir: Option<String>,
    conflict: td_config::LocationConflict,
) -> ServiceResult<Loaded> {
    let (loaded, rx) =
        config.switch_location(dir.as_deref().map(std::path::Path::new), conflict)?;
    forward_config_changes(app.clone(), rx);
    crate::apply_config(&svc, &loaded);
    crate::global_hotkey::apply(&app, &loaded.config.environment);
    let _ = ConfigChanged {
        loaded: loaded.clone(),
    }
    .emit(&app);
    Ok(loaded)
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

/// 항목의 시스템 파일 아이콘(데이터 주소). 이 OS가 못 주면 null이다. 아이콘을 그리므로 메인 스레드가 아닌 곳에서 돌린다.
#[tauri::command(async)]
#[specta::specta]
pub fn system_icon(
    svc: State<'_, AppService>,
    path: String,
    is_dir: bool,
    size: u32,
) -> ServiceResult<Option<String>> {
    svc.system_icon(&path, is_dir, size)
}

/// epub의 제목·저자·표지·챕터 목록. 파일을 열어 읽으므로 메인 스레드가 아닌 곳에서 돌린다.
#[tauri::command(async)]
#[specta::specta]
pub fn epub_open(
    svc: State<'_, AppService>,
    path: String,
) -> ServiceResult<crate::epub::EpubInfoDto> {
    svc.epub_open(&path)
}

/// epub의 한 챕터 HTML.
#[tauri::command(async)]
#[specta::specta]
pub fn epub_chapter(svc: State<'_, AppService>, path: String, index: u32) -> ServiceResult<String> {
    svc.epub_chapter(&path, index)
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

/// 창 상태(`state.json`)를 두는 로컬 앱 설정 폴더. 설정 저장 경로를 바꿔도 여기에 둔다.
fn state_dir(config: &ConfigState) -> ServiceResult<&std::path::Path> {
    config
        .local_dir
        .as_deref()
        .ok_or_else(|| "설정 디렉터리를 사용할 수 없어 상태를 저장/복원하지 못합니다".to_string())
}

/// 이 창이 마지막으로 저장한 상태(PANE-05). 없거나 읽을 수 없으면 None(+경고).
#[tauri::command]
#[specta::specta]
pub fn load_state(window: tauri::Window, config: State<'_, ConfigState>) -> LoadedState {
    match state_dir(&config) {
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
    td_state::save(state_dir(&config)?, window.label(), &snapshot).map_err(|e| e.to_string())
}

/// 저장된 상태를 모두 지우고 앱을 종료한다 (`core.state.reset`).
#[tauri::command]
#[specta::specta]
pub fn reset_state(app: tauri::AppHandle, config: State<'_, ConfigState>) -> ServiceResult<()> {
    td_state::reset(state_dir(&config)?).map_err(|e| e.to_string())?;
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

/// 자소가 분리된(NFD) 한글 이름을 조합형(NFC)으로 고친다(이슈 #50).
#[tauri::command]
#[specta::specta]
pub fn normalize_names(
    svc: State<'_, AppService>,
    paths: Vec<String>,
) -> crate::service::NormalizeResultDto {
    svc.normalize_names(&paths)
}

/// 폴더 바로 아래 항목의 이름을 조합형으로 고친다. 하위 폴더 안은 건드리지 않는다.
#[tauri::command]
#[specta::specta]
pub fn normalize_dir(
    svc: State<'_, AppService>,
    dir: String,
) -> ServiceResult<crate::service::NormalizeResultDto> {
    svc.normalize_dir(&dir)
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
pub fn terminal_open(
    svc: State<'_, AppService>,
    config: State<'_, ConfigState>,
    cwd: String,
    cols: u32,
    rows: u32,
) -> ServiceResult<u32> {
    let shell = config.current().config.environment.terminal;
    svc.terminal_open(&shell, &cwd, cols, rows)
}

#[tauri::command]
#[specta::specta]
pub fn terminal_write(svc: State<'_, AppService>, id: u32, data: String) -> ServiceResult<()> {
    svc.terminal_write(id, &data)
}

#[tauri::command]
#[specta::specta]
pub fn terminal_resize(
    svc: State<'_, AppService>,
    id: u32,
    cols: u32,
    rows: u32,
) -> ServiceResult<()> {
    svc.terminal_resize(id, cols, rows)
}

#[tauri::command]
#[specta::specta]
pub fn terminal_close(svc: State<'_, AppService>, id: u32) -> ServiceResult<()> {
    svc.terminal_close(id)
}

/// 시작 인수로 받은 `td` 요청을 한 번 돌려준다(없으면 null). 가져가면 비워서 두 번 적용되지 않는다.
#[tauri::command]
#[specta::specta]
pub fn take_launch_paths(state: State<'_, LaunchPaths>) -> Option<OpenPathsDto> {
    state.0.lock().unwrap().take()
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
            epub_open,
            system_icon,
            epub_chapter,
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
            get_config_location,
            pick_folder,
            pick_save_file,
            pick_file,
            export_config,
            import_config,
            config_location_has_files,
            set_config_location,
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
            normalize_names,
            normalize_dir,
            take_launch_paths,
            cli_status,
            cli_install,
            cli_uninstall,
            terminal_open,
            terminal_write,
            terminal_resize,
            terminal_close,
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
            SearchDone,
            TerminalOutput,
            TerminalExit,
            OpenPaths
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

#[cfg(test)]
mod config_location_tests {
    use super::*;
    use std::fs;
    use td_config::LocationConflict;

    fn theme(l: &Loaded) -> String {
        l.config.behavior.theme.clone()
    }

    #[test]
    fn config_location_switch_to_empty_dir_copies_and_reloads() {
        let local = tempfile::tempdir().unwrap();
        let cloud = tempfile::tempdir().unwrap();
        fs::write(
            local.path().join("config.toml"),
            "[behavior]\ntheme = \"dark\"\n",
        )
        .unwrap();
        let (state, _rx) = ConfigState::open(Some(local.path().to_path_buf()));
        assert_eq!(theme(&state.current()), "dark");
        let (loaded, _rx2) = state
            .switch_location(Some(cloud.path()), LocationConflict::UseExisting)
            .unwrap();
        assert_eq!(theme(&loaded), "dark");
        assert_eq!(state.config_dir().unwrap(), cloud.path());
        assert!(cloud.path().join("config.toml").is_file());
        let loc = state.location().unwrap();
        assert!(loc.custom);
        assert_eq!(loc.dir, cloud.path().to_string_lossy());
        assert_eq!(loc.default_dir, local.path().to_string_lossy());
        // 이후 설정 화면에서 바꾼 값은 새 폴더에 써진다.
        let after = state
            .update(|dir| {
                td_config::set_user_value(
                    dir,
                    "behavior.theme",
                    td_config::ConfigValue::Str("light".into()),
                )
            })
            .unwrap();
        assert_eq!(theme(&after), "light");
        assert!(fs::read_to_string(cloud.path().join("config.toml"))
            .unwrap()
            .contains("light"));
        assert!(fs::read_to_string(local.path().join("config.toml"))
            .unwrap()
            .contains("dark"));
    }

    #[test]
    fn config_location_use_existing_loads_target_settings() {
        let local = tempfile::tempdir().unwrap();
        let cloud = tempfile::tempdir().unwrap();
        fs::write(
            local.path().join("config.toml"),
            "[behavior]\ntheme = \"dark\"\n",
        )
        .unwrap();
        fs::write(
            cloud.path().join("config.toml"),
            "[behavior]\ntheme = \"light\"\n",
        )
        .unwrap();
        let (state, _rx) = ConfigState::open(Some(local.path().to_path_buf()));
        let (loaded, _rx2) = state
            .switch_location(Some(cloud.path()), LocationConflict::UseExisting)
            .unwrap();
        assert_eq!(theme(&loaded), "light");
        assert!(!cloud.path().join("config.toml.bak").exists());
    }

    #[test]
    fn config_location_overwrite_keeps_backup() {
        let local = tempfile::tempdir().unwrap();
        let cloud = tempfile::tempdir().unwrap();
        fs::write(
            local.path().join("config.toml"),
            "[behavior]\ntheme = \"dark\"\n",
        )
        .unwrap();
        fs::write(
            cloud.path().join("config.toml"),
            "[behavior]\ntheme = \"light\"\n",
        )
        .unwrap();
        let (state, _rx) = ConfigState::open(Some(local.path().to_path_buf()));
        let (loaded, _rx2) = state
            .switch_location(Some(cloud.path()), LocationConflict::Overwrite)
            .unwrap();
        assert_eq!(theme(&loaded), "dark");
        assert!(fs::read_to_string(cloud.path().join("config.toml.bak"))
            .unwrap()
            .contains("light"));
    }

    #[test]
    fn config_location_state_stays_in_local_dir() {
        let local = tempfile::tempdir().unwrap();
        let cloud = tempfile::tempdir().unwrap();
        let (state, _rx) = ConfigState::open(Some(local.path().to_path_buf()));
        state
            .switch_location(Some(cloud.path()), LocationConflict::UseExisting)
            .unwrap();
        assert_eq!(state_dir(&state).unwrap(), local.path());
    }

    #[test]
    fn config_location_missing_dir_warns_and_uses_local() {
        let local = tempfile::tempdir().unwrap();
        let gone = local.path().join("사라진 폴더");
        fs::write(
            local.path().join(td_config::LOCATION_FILE),
            format!("dir = {:?}\n", gone.to_string_lossy()),
        )
        .unwrap();
        let (state, _rx) = ConfigState::open(Some(local.path().to_path_buf()));
        assert_eq!(state.config_dir().unwrap(), local.path());
        assert!(state
            .current()
            .warnings
            .iter()
            .any(|w| w.message.contains("사라진 폴더")));
        // 기본 위치로 되돌리면 경고가 사라진다.
        let (loaded, _rx2) = state
            .switch_location(None, LocationConflict::UseExisting)
            .unwrap();
        assert!(loaded.warnings.is_empty(), "{:?}", loaded.warnings);
        assert!(!local.path().join(td_config::LOCATION_FILE).exists());
    }

    #[test]
    fn config_export_import_round_trip_applies_settings() {
        let a = tempfile::tempdir().unwrap();
        let b = tempfile::tempdir().unwrap();
        fs::write(
            a.path().join("config.toml"),
            "[behavior]\ntheme = \"dark\"\n",
        )
        .unwrap();
        let (src_state, _rx) = ConfigState::open(Some(a.path().to_path_buf()));
        let zip = a.path().join("twin-deck-settings.zip");
        src_state.export_zip(&zip).unwrap();

        fs::write(
            b.path().join("config.toml"),
            "[behavior]\ntheme = \"light\"\n",
        )
        .unwrap();
        let (state, _rx2) = ConfigState::open(Some(b.path().to_path_buf()));
        assert_eq!(theme(&state.current()), "light");
        let loaded = state.import_zip(&zip).unwrap();
        assert_eq!(theme(&loaded), "dark");
        assert_eq!(theme(&state.current()), "dark");
        assert!(fs::read_to_string(b.path().join("config.toml.bak"))
            .unwrap()
            .contains("light"));
    }

    #[test]
    fn config_import_follows_config_location() {
        let local = tempfile::tempdir().unwrap();
        let cloud = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        fs::write(
            other.path().join("config.toml"),
            "[behavior]\ntheme = \"dark\"\n",
        )
        .unwrap();
        let zip = other.path().join("s.zip");
        td_config::export_config_zip(other.path(), &zip).unwrap();
        let (state, _rx) = ConfigState::open(Some(local.path().to_path_buf()));
        state
            .switch_location(Some(cloud.path()), LocationConflict::UseExisting)
            .unwrap();
        state.import_zip(&zip).unwrap();
        assert!(cloud.path().join("config.toml").is_file());
        assert!(!local.path().join("config.toml").exists());
    }

    #[test]
    fn config_import_rejects_broken_zip_and_keeps_settings() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join("config.toml"),
            "[behavior]\ntheme = \"dark\"\n",
        )
        .unwrap();
        let bad = dir.path().join("bad.zip");
        fs::write(&bad, "not a zip").unwrap();
        let (state, _rx) = ConfigState::open(Some(dir.path().to_path_buf()));
        assert!(state.import_zip(&bad).is_err());
        assert_eq!(theme(&state.current()), "dark");
    }
}
