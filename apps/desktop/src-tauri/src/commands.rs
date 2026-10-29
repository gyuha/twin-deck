//! Tauri command/event 정의. 실제 로직은 `service`에 있다.

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{Manager, State};
use tauri_specta::{collect_commands, collect_events, Builder, Event};
use td_config::Loaded;
use td_launch::{Launch, SystemLauncher};
use td_ops::SystemTrash;
use td_state::{LoadedState, Snapshot, Spawner};
use td_volumes::{SystemUnmounter, Volumes};

use crate::service::{
    edit, open_file, open_releases, reveal, reveal_config, ConflictDto, EntryDto, ExpectedFileDto,
    FileInfoDto, FindSpecDto, JobDto, JobKindDto, PreviewDto, QueueItemDto, RemoteServerStatus,
    SearchStartDto, SearchSummaryDto, Service, ServiceResult, SyncChoiceDto, SyncComparisonDto,
    SyncOptionsDto, WriteTextResultDto,
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
        match td_config::ConfigStore::start_with_local(
            &resolved.dir,
            &local,
            td_config::Platform::current(),
        ) {
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

    /// 즐겨찾기를 추가한다. PC 종속 정보라 설정 폴더(동기화 폴더일 수 있다)가 아니라 로컬 폴더의 `favorites.toml`에 쓴다(이슈 #106).
    pub fn add_favorite(&self, name: &str, path: &str) -> ServiceResult<Loaded> {
        self.update_favorites(|dir, local| td_config::append_favorite_in(dir, local, name, path))
    }

    /// 즐겨찾기에서 경로(변수 확장 전 원문)가 같은 항목을 지운다. 로컬 `favorites.toml`을 고친다.
    pub fn remove_favorite(&self, path: &str) -> ServiceResult<Loaded> {
        self.update_favorites(|dir, local| td_config::remove_favorite_in(dir, local, path))
    }

    fn update_favorites(
        &self,
        f: impl FnOnce(&std::path::Path, &std::path::Path) -> Result<(), String>,
    ) -> ServiceResult<Loaded> {
        let local = self
            .local_dir
            .clone()
            .ok_or("설정 디렉터리를 사용할 수 없습니다")?;
        self.update(|dir| f(dir, &local))
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
        let (store, rx) =
            td_config::ConfigStore::start_with_local(&dir, local, td_config::Platform::current())
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

/// 즐겨찾기에서 경로(변수 확장 전 원문)가 같은 항목을 로컬 `favorites.toml`에서 지우고 새 설정을 바로 돌려준다. 폴더 자체는 지우지 않는다.
#[tauri::command]
#[specta::specta]
pub fn remove_favorite(config: State<'_, ConfigState>, path: String) -> ServiceResult<Loaded> {
    config.remove_favorite(&path)
}

/// 현재 폴더 등을 즐겨찾기로 로컬 `favorites.toml`에 덧붙이고, 새로 병합된 설정을 바로 돌려준다(변경 이벤트를 기다리지 않는다).
#[tauri::command]
#[specta::specta]
pub fn add_favorite(
    config: State<'_, ConfigState>,
    name: String,
    path: String,
) -> ServiceResult<Loaded> {
    config.add_favorite(&name, &path)
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

/// 저장된 SMB 서버 목록(`[[smb.servers]]`) 전체를 바꾸고, 새로 병합된 설정을 바로 돌려준다.
/// 목록은 설정(`Loaded`)의 `smb.servers`로 읽는다. host나 share가 빈 항목이 있으면 쓰지 않고 거부한다.
#[tauri::command]
#[specta::specta]
pub fn set_smb_servers(
    config: State<'_, ConfigState>,
    servers: Vec<td_config::SmbServer>,
) -> ServiceResult<Loaded> {
    config.update(|dir| td_config::set_smb_servers(dir, &servers))
}

/// SMB 연결 실패의 종류. UI는 `auth`면 비밀번호를 다시 묻는다.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum SmbErrorKindDto {
    Auth,
    Unreachable,
    Unsupported,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct SmbFailureDto {
    pub kind: SmbErrorKindDto,
    pub message: String,
}

/// `smb_connect`의 결과: 마운트 지점, 또는 종류가 구분된 실패.
/// 설정 디렉터리 없음·없는 항목 번호 같은 그 밖의 문제는 명령 오류(문자열)로 온다.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum SmbConnectDto {
    Mounted(String),
    Failed(SmbFailureDto),
}

impl From<Result<std::path::PathBuf, td_smb::SmbError>> for SmbConnectDto {
    fn from(r: Result<std::path::PathBuf, td_smb::SmbError>) -> Self {
        match r {
            Ok(path) => Self::Mounted(path.to_string_lossy().into_owned()),
            Err(e) => {
                let kind = match e {
                    td_smb::SmbError::Auth => SmbErrorKindDto::Auth,
                    td_smb::SmbError::Unreachable => SmbErrorKindDto::Unreachable,
                    td_smb::SmbError::Unsupported => SmbErrorKindDto::Unsupported,
                    td_smb::SmbError::Other(_) => SmbErrorKindDto::Other,
                };
                Self::Failed(SmbFailureDto {
                    kind,
                    message: e.to_string(),
                })
            }
        }
    }
}

/// 설정의 `index`번째 SMB 서버 항목을 연결 대상으로 바꾼다. 빈 `user`는 게스트다.
fn smb_target(config: &ConfigState, index: u32) -> ServiceResult<td_smb::SmbTarget> {
    let loaded = config.current();
    let s = loaded
        .config
        .smb
        .servers
        .get(index as usize)
        .ok_or_else(|| format!("SMB 서버 항목이 없습니다: {index}"))?;
    Ok(smb_target_of(s))
}

fn smb_target_of(s: &td_config::SmbServer) -> td_smb::SmbTarget {
    td_smb::SmbTarget {
        host: s.host.clone(),
        share: s.share.clone(),
        user: Some(s.user.clone()).filter(|u| !u.is_empty()),
    }
}

/// 저장된 SMB 서버 항목마다 지금 마운트된 위치(없으면 `None`)를 순서대로 돌려준다.
fn smb_mount_points(
    servers: &[td_config::SmbServer],
    find: impl Fn(&td_smb::SmbTarget) -> Option<std::path::PathBuf>,
) -> Vec<Option<String>> {
    servers
        .iter()
        .map(|s| find(&smb_target_of(s)).map(|p| p.to_string_lossy().into_owned()))
        .collect()
}

/// 저장된 SMB 서버 항목마다 지금 마운트된 위치를 돌려준다(항목 순서와 같고, 마운트돼 있지 않으면 `null`).
/// 앱 밖(Finder 등)에서 마운트한 공유도 찾는다. UI는 이것으로 SMB 탭의 아이콘·색을 정한다(이슈 #92·#93).
#[tauri::command]
#[specta::specta]
pub fn smb_mounts(config: State<'_, ConfigState>) -> Vec<Option<String>> {
    smb_mount_points(&config.current().config.smb.servers, td_smb::find_mounted)
}

/// 설정의 `index`번째 SMB 서버에 연결(OS 마운트)한다. 이미 마운트돼 있으면 그 경로를 돌려준다.
/// `password`가 없으면 키체인 값을 쓴다. 성공했고 `remember`면 받은 비밀번호를 키체인에 저장한다.
/// 마운트는 블로킹이라 UI 스레드를 막지 않게 따로 돌린다.
#[tauri::command]
#[specta::specta]
pub async fn smb_connect(
    config: State<'_, ConfigState>,
    index: u32,
    password: Option<String>,
    remember: bool,
) -> ServiceResult<SmbConnectDto> {
    let target = smb_target(&config, index)?;
    let result = tauri::async_runtime::spawn_blocking(move || {
        td_smb::connect(
            &target,
            password,
            remember,
            &td_smb::SystemMounter,
            &td_smb::KeyringStore,
            td_smb::find_mounted,
        )
    })
    .await
    .map_err(|e| e.to_string())?;
    Ok(result.into())
}

/// 설정의 `index`번째 SMB 서버에 저장된 비밀번호를 키체인에서 지운다. 저장된 값이 없어도 성공이다.
#[tauri::command]
#[specta::specta]
pub fn smb_forget_password(config: State<'_, ConfigState>, index: u32) -> ServiceResult<()> {
    use td_smb::SecretStore;
    let target = smb_target(&config, index)?;
    td_smb::KeyringStore
        .delete(&td_smb::secret_key(&target))
        .map_err(|e| e.to_string())
}

/// 저장된 원격(SFTP·FTP) 서버 목록(`[[remote.servers]]`) 전체를 바꾸고, 새로 병합된 설정을 바로 돌려준다.
/// 목록은 설정(`Loaded`)의 `remote.servers`로 읽는다. protocol이 sftp·ftp가 아니거나 host가 빈 항목이 있으면 쓰지 않고 거부한다.
/// 비밀번호는 목록에 없다(OS 키체인).
#[tauri::command]
#[specta::specta]
pub fn set_remote_servers(
    config: State<'_, ConfigState>,
    servers: Vec<td_config::RemoteServer>,
) -> ServiceResult<Loaded> {
    config.update(|dir| td_config::set_remote_servers(dir, &servers))
}

/// 원격 연결 실패의 종류. UI는 `auth`면 비밀번호를 다시 묻는다.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum RemoteErrorKindDto {
    Auth,
    Unreachable,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct RemoteFailureDto {
    pub kind: RemoteErrorKindDto,
    pub message: String,
}

/// `remote_connect`의 결과: 패널이 이동할 원격 루트 경로(`sftp://<id>/..`), 또는 종류가 구분된 실패.
/// 설정 디렉터리 없음·없는 항목 번호 같은 그 밖의 문제는 명령 오류(문자열)로 온다.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum RemoteConnectDto {
    Connected(String),
    HostKey(HostKeyDto),
    Failed(RemoteFailureDto),
}

/// 비밀번호를 보내기 전에 사용자가 대조해야 하는 호스트 키.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct HostKeyDto {
    pub host: String,
    pub port: u16,
    pub algorithm: String,
    pub fingerprint: String,
    pub public_key: String,
    pub previous_fingerprint: Option<String>,
}

impl From<Result<String, td_remote::RemoteError>> for RemoteConnectDto {
    fn from(r: Result<String, td_remote::RemoteError>) -> Self {
        match r {
            Ok(root) => Self::Connected(root),
            Err(td_remote::RemoteError::HostKey(k)) => Self::HostKey(HostKeyDto {
                host: k.host,
                port: k.port,
                algorithm: k.algorithm,
                fingerprint: k.fingerprint,
                public_key: k.public_key,
                previous_fingerprint: k.previous_fingerprint,
            }),
            Err(e) => {
                let kind = match e {
                    td_remote::RemoteError::Auth => RemoteErrorKindDto::Auth,
                    td_remote::RemoteError::Unreachable => RemoteErrorKindDto::Unreachable,
                    _ => RemoteErrorKindDto::Other,
                };
                Self::Failed(RemoteFailureDto {
                    kind,
                    message: e.to_string(),
                })
            }
        }
    }
}

/// 설정의 `index`번째 원격 서버 항목을 연결 대상으로 바꾼다.
fn remote_target(config: &ConfigState, index: u32) -> ServiceResult<td_remote::RemoteTarget> {
    let loaded = config.current();
    let s = loaded
        .config
        .remote
        .servers
        .get(index as usize)
        .ok_or_else(|| format!("원격 서버 항목이 없습니다: {index}"))?;
    Ok(td_remote::RemoteTarget {
        protocol: if s.protocol == "ftp" {
            td_remote::Protocol::Ftp
        } else {
            td_remote::Protocol::Sftp
        },
        host: s.host.clone(),
        port: s.port,
        user: s.user.clone(),
        base_dir: s.base_dir.clone(),
    })
}

/// 통합 시험이 같은 검증·저장·인증 경로를 쓰도록 한 접속 도우미(레지스트리만 쓰고 원격 셸용 접속 정보는 기억하지 않는다).
#[cfg(test)]
fn connect_remote_verified<S: td_remote::SecretStore>(
    registry: &td_archive::RemoteRegistry,
    target: &td_remote::RemoteTarget,
    password: Option<String>,
    remember: bool,
    secrets: &S,
    directory: Option<std::path::PathBuf>,
    approved_host_key: Option<String>,
) -> Result<String, td_remote::RemoteError> {
    crate::service::connect_remote(
        registry,
        target,
        password,
        remember,
        secrets,
        &|target, user, password| {
            td_remote::connect_session_verified(
                target,
                user,
                password,
                td_remote::HostKeyPolicy {
                    directory: directory.clone(),
                    approved_key: approved_host_key.clone(),
                },
            )
        },
    )
}

/// 설정의 `index`번째 원격 서버에 연결한다. 이미 연결돼 있으면 같은 연결의 루트 경로를 돌려준다.
/// `password`가 없으면 키체인 값을 쓴다. 성공했고 `remember`면 받은 비밀번호를 키체인에 저장한다.
/// 접속은 블로킹이라 UI 스레드를 막지 않게 따로 돌린다.
#[tauri::command]
#[specta::specta]
pub async fn remote_connect(
    app: tauri::AppHandle,
    config: State<'_, ConfigState>,
    index: u32,
    password: Option<String>,
    remember: bool,
    approved_host_key: Option<String>,
) -> ServiceResult<RemoteConnectDto> {
    let target = remote_target(&config, index)?;
    // 범용 설정 내보내기·사용자 지정 동기화 경로에 신뢰 저장소를 포함하지 않는다.
    let directory = config.local_dir.as_ref().map(|p| p.join("sftp-host-keys"));
    let result = tauri::async_runtime::spawn_blocking(move || {
        // 원격 셸이 나중에 같은 서버에 다시 접속할 때는 이미 저장된 신뢰 키로만 검증한다(승인 키는 한 번의 접속에만 쓴다).
        let shell_policy = td_remote::HostKeyPolicy {
            directory: directory.clone(),
            approved_key: None,
        };
        app.state::<AppService>().connect_remote(
            &target,
            password,
            remember,
            &td_remote::KeyringStore,
            shell_policy,
            &|target, user, password| {
                td_remote::connect_session_verified(
                    target,
                    user,
                    password,
                    td_remote::HostKeyPolicy {
                        directory: directory.clone(),
                        approved_key: approved_host_key.clone(),
                    },
                )
            },
        )
    })
    .await
    .map_err(|e| e.to_string())?;
    Ok(result.into())
}

/// 설정의 `index`번째 원격 서버 연결을 끊는다(세션을 닫는다). 연결돼 있지 않아도 성공이다.
#[tauri::command]
#[specta::specta]
pub fn remote_disconnect(
    svc: State<'_, AppService>,
    config: State<'_, ConfigState>,
    index: u32,
) -> ServiceResult<()> {
    let target = remote_target(&config, index)?;
    svc.disconnect_remote(&target.id());
    Ok(())
}

/// 지금 연결돼 있는 원격 서버 항목의 번호들(설정 목록 기준).
#[tauri::command]
#[specta::specta]
pub fn remote_connections(svc: State<'_, AppService>, config: State<'_, ConfigState>) -> Vec<u32> {
    let registry = svc.remote_registry();
    (0..config.current().config.remote.servers.len() as u32)
        .filter(|i| remote_target(&config, *i).is_ok_and(|t| registry.contains(&t.id())))
        .collect()
}

/// 설정의 `index`번째 원격 서버에 저장된 비밀번호를 키체인에서 지운다. 저장된 값이 없어도 성공이다.
#[tauri::command]
#[specta::specta]
pub fn remote_forget_password(config: State<'_, ConfigState>, index: u32) -> ServiceResult<()> {
    use td_remote::SecretStore;
    let target = remote_target(&config, index)?;
    td_remote::KeyringStore
        .delete(&td_remote::secret_key(&target))
        .map_err(|e| e.to_string())
}

/// 내장 서버의 호스트키 파일 경로(앱 데이터 폴더, `state.json` 옆).
pub fn remote_server_host_key_path(config: &ConfigState) -> ServiceResult<std::path::PathBuf> {
    Ok(state_dir(config)?.join(crate::service::REMOTE_SERVER_HOST_KEY_FILE))
}

/// 내장 서버(Twin Deck Remote)를 현재 설정(`remote_server.*`)으로 켠다. `enabled` 값과 무관하게 켠다(그 키는 시작 때만 본다).
/// 비밀번호가 없거나 루트가 비었으면 사람이 읽을 사유와 함께 거부한다.
#[tauri::command]
#[specta::specta]
pub fn remote_server_start(
    svc: State<'_, AppService>,
    config: State<'_, ConfigState>,
) -> ServiceResult<RemoteServerStatus> {
    let cfg = config.current().config.remote_server;
    svc.remote_server_start(
        &cfg,
        &remote_server_host_key_path(&config)?,
        &td_remote::KeyringStore,
    )
}

/// 내장 서버를 끈다. 꺼져 있어도 성공이다.
#[tauri::command]
#[specta::specta]
pub fn remote_server_stop(svc: State<'_, AppService>) -> RemoteServerStatus {
    svc.remote_server_stop(&td_remote::KeyringStore)
}

/// 내장 서버의 상태. 비밀번호 값은 돌려주지 않고 설정 여부(`hasPassword`)만 준다.
#[tauri::command]
#[specta::specta]
pub fn remote_server_status(svc: State<'_, AppService>) -> RemoteServerStatus {
    svc.remote_server_status(&td_remote::KeyringStore)
}

/// 내장 서버의 비밀번호를 OS 키체인에 저장한다(빈 문자열이면 지운다). 설정 파일에는 쓰지 않는다.
#[tauri::command]
#[specta::specta]
pub fn set_remote_server_password(
    svc: State<'_, AppService>,
    password: String,
) -> ServiceResult<RemoteServerStatus> {
    svc.set_remote_server_password(&password, &td_remote::KeyringStore)
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

/// Office 문서를 `office_oxide`로 읽어 Markdown으로 돌려준다. 큰 문서는 시간이 걸려 메인 스레드가 아닌 곳에서 돌린다.
#[tauri::command(async)]
#[specta::specta]
pub fn office_preview(
    svc: State<'_, AppService>,
    path: String,
) -> ServiceResult<crate::office::OfficePreviewDto> {
    svc.office_preview(&path)
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

/// Markdown 링크 같은 외부 주소(`http`·`https`·`mailto`만)를 기본 브라우저·메일 앱으로 연다 (이슈 #89).
#[tauri::command]
#[specta::specta]
pub fn open_external_url(launch: State<'_, AppLaunch>, url: String) -> ServiceResult<()> {
    crate::service::open_external_url(&launch, &url)
}

/// GitHub 릴리스 목록을 기본 브라우저로 연다 (이슈 #70). 주소는 Rust 상수 하나이고 인수는 없다.
#[tauri::command]
#[specta::specta]
pub fn open_releases_page(launch: State<'_, AppLaunch>) -> ServiceResult<()> {
    open_releases(&launch)
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

/// 셸 한 줄을 실행한 결과 (`core.run_command`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ShellResultDto {
    /// 종료 코드. 시간 초과로 죽였으면 없다.
    pub exit_code: Option<i32>,
    /// 표준 출력 뒤에 표준 오류를 붙인 글(끝 20KB까지).
    pub output: String,
    pub timed_out: bool,
}

/// `cwd`(로컬 폴더)에서 셸 한 줄을 실행하고 끝나기를 기다린다. 5분이 지나면 죽인다.
#[tauri::command]
#[specta::specta]
pub async fn run_shell_command(cwd: String, command: String) -> ServiceResult<ShellResultDto> {
    tauri::async_runtime::spawn_blocking(move || {
        td_launch::run_shell(
            td_launch::Os::current(),
            &cwd,
            &command,
            std::time::Duration::from_secs(300),
        )
        .map(|r| ShellResultDto {
            exit_code: r.exit_code,
            output: r.output,
            timed_out: r.timed_out,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 앱을 실제로 끝낸다. 백그라운드 유지(`environment.background_on_close`)를 켜도 설정의 종료 버튼은 이 명령으로 끝낸다.
#[tauri::command]
#[specta::specta]
pub fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
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
        .min_inner_size(720.0, 420.0) // tauri.conf.json의 첫 창과 같은 최소 크기(이슈 #127)
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

/// 끌어 놓기 진단 기록을 stderr와 로그 폴더의 `drag.log`에 한 줄 남긴다(#137: 놓기가 가끔 안 되는 원인을 다음에 찾을 근거).
/// Finder로 띄운 앱은 stderr를 볼 수 없어 파일에도 쓴다. 기록 실패는 무시한다.
#[cfg(any(target_os = "macos", windows))]
fn drag_log(dir: Option<&std::path::Path>, line: &str) {
    use std::io::Write;
    eprintln!("[drag] {line}");
    let Some(dir) = dir else { return };
    let _ = std::fs::create_dir_all(dir);
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("drag.log"))
    {
        let _ = writeln!(f, "{} {line}", unix_secs());
    }
}

/// 새 의존성 없이 쓰는 UNIX 초 타임스탬프.
#[cfg(any(target_os = "macos", windows))]
fn unix_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs())
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
        let log_file = tauri::Manager::path(&window).app_log_dir().ok();
        drag_log(
            log_file.as_deref(),
            &format!("끌기 시작: {}개 {files:?}", files.len()),
        );
        let on_drop = {
            let log_file = log_file.clone();
            let files = files.clone();
            move |result: drag::DragResult, _: drag::CursorPosition| {
                drag_log(
                    log_file.as_deref(),
                    &format!("끌기 결과: {result:?} {files:?}"),
                );
            }
        };
        drag::start_drag(
            &window,
            drag::DragItem::Files(files),
            icon,
            on_drop,
            drag::Options::default(),
        )
        .map_err(|e| {
            drag_log(log_file.as_deref(), &format!("끌기 시작 실패: {e}"));
            e.to_string()
        })
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

/// 경로의 이미지(압축 파일 안 포함)를 운영체제 클립보드에 이미지로 복사한다. 이미지가 아니면 클립보드를 건드리지 않고 오류를 돌려준다.
#[tauri::command]
#[specta::specta]
pub fn copy_image_to_clipboard(svc: State<'_, AppService>, path: String) -> ServiceResult<()> {
    svc.copy_image_to_clipboard(&path)
}

/// 양쪽 폴더를 비교한다. 큰 파일 비교는 명령 실행 스레드에서 수행한다.
#[tauri::command]
#[specta::specta]
pub async fn compare_directories(
    app: tauri::AppHandle,
    request_id: String,
    left: String,
    right: String,
    options: SyncOptionsDto,
) -> ServiceResult<SyncComparisonDto> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<AppService>()
            .compare_directories(request_id, &left, &right, options)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
#[specta::specta]
pub fn cancel_directory_comparison(svc: State<'_, AppService>, request_id: String) {
    svc.cancel_directory_comparison(&request_id);
}
#[tauri::command]
#[specta::specta]
pub async fn sync_directories(
    app: tauri::AppHandle,
    comparison_id: u32,
    choices: Vec<SyncChoiceDto>,
) -> ServiceResult<u32> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<AppService>()
            .sync_directories(comparison_id, choices)
    })
    .await
    .map_err(|e| e.to_string())?
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

/// 연결 `connection_id`(SFTP)의 서버에 원격 셸을 연다. 돌려주는 세션 번호는 `terminal_write/resize/close`와 `terminal` 이벤트가 로컬 터미널처럼 쓴다.
/// 접속은 블로킹이라 UI 스레드를 막지 않게 따로 돌린다.
#[tauri::command]
#[specta::specta]
pub async fn terminal_open_remote(
    app: tauri::AppHandle,
    connection_id: String,
    cols: u32,
    rows: u32,
) -> ServiceResult<u32> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<AppService>()
            .remote_terminal_open(&connection_id, cols, rows)
    })
    .await
    .map_err(|e| e.to_string())?
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
            compare_directories,
            cancel_directory_comparison,
            sync_directories,
            get_config,
            load_state,
            save_state,
            reset_state,
            quit_app,
            run_shell_command,
            new_window,
            file_info,
            preview_file,
            office_preview,
            epub_open,
            system_icon,
            epub_chapter,
            write_text_file,
            glob_filter,
            reveal_path,
            open_path,
            open_releases_page,
            open_external_url,
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
            set_smb_servers,
            smb_connect,
            smb_forget_password,
            smb_mounts,
            set_remote_servers,
            remote_connect,
            remote_disconnect,
            remote_connections,
            remote_forget_password,
            remote_server_start,
            remote_server_stop,
            remote_server_status,
            set_remote_server_password,
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
            copy_image_to_clipboard,
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
            terminal_open_remote,
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

    #[test]
    fn 서버키_확인을_일반_오류로_잃지_않고_ui에_전달한다() {
        let k = td_remote::HostKeyChallenge {
            host: "fake.test".into(),
            port: 2222,
            algorithm: "ssh-ed25519".into(),
            fingerprint: "SHA256:fake".into(),
            public_key: "fake-public-key".into(),
            previous_fingerprint: Some("SHA256:old".into()),
        };
        let dto = RemoteConnectDto::from(Err(td_remote::RemoteError::HostKey(Box::new(k))));
        let json = serde_json::to_value(dto).unwrap();
        assert_eq!(json["hostKey"]["host"], "fake.test");
        assert_eq!(json["hostKey"]["previousFingerprint"], "SHA256:old");
        assert_eq!(json["hostKey"]["publicKey"], "fake-public-key");
    }

    /// 명시 실행하는 UI 통합 시험 전용. 임시 로컬 서버·키·자격증명만 사용한다.
    #[test]
    #[ignore = "TWIN_DECK_SFTP_TEST_BINARY로 UI 통합 시험에서만 실행"]
    fn sftp_ui_fixture() {
        if std::env::var("TWIN_DECK_SFTP_UI_FIXTURE").as_deref() != Ok("1") {
            return;
        }
        use std::io::{BufRead, Write};
        use td_remote::testing::sftp::{FakeSftp, USER};
        #[derive(Default)]
        struct Secrets(std::sync::Mutex<Option<String>>);
        impl td_remote::SecretStore for Secrets {
            fn get(&self, _: &str) -> td_remote::Result<Option<String>> {
                Ok(self.0.lock().unwrap().clone())
            }
            fn set(&self, _: &str, p: &str) -> td_remote::Result<()> {
                *self.0.lock().unwrap() = Some(p.into());
                Ok(())
            }
            fn delete(&self, _: &str) -> td_remote::Result<()> {
                *self.0.lock().unwrap() = None;
                Ok(())
            }
        }
        let server = FakeSftp::start();
        let directory = tempfile::tempdir().unwrap();
        let registry = td_archive::RemoteRegistry::default();
        let secrets = Secrets::default();
        let target = td_remote::RemoteTarget {
            protocol: td_remote::Protocol::Sftp,
            host: "127.0.0.1".into(),
            port: server.port,
            user: USER.into(),
            base_dir: "".into(),
        };
        for line in std::io::stdin().lock().lines() {
            let request: serde_json::Value = serde_json::from_str(&line.unwrap()).unwrap();
            let response = match request["command"].as_str().unwrap() {
                "remote_connect" => {
                    assert_eq!(request["args"]["index"], 0);
                    let args = &request["args"];
                    serde_json::to_value(RemoteConnectDto::from(connect_remote_verified(
                        &registry,
                        &target,
                        args["password"].as_str().map(String::from),
                        args["remember"].as_bool().unwrap(),
                        &secrets,
                        Some(directory.path().into()),
                        args["approvedHostKey"].as_str().map(String::from),
                    )))
                    .unwrap()
                }
                "remote_disconnect" => {
                    registry.remove(&target.id());
                    serde_json::Value::Null
                }
                "stats" => {
                    serde_json::json!({ "port": server.port, "authAttempts": server.auth_attempts.load(std::sync::atomic::Ordering::SeqCst), "keys": std::fs::read_dir(directory.path()).unwrap().count(), "remembered": secrets.0.lock().unwrap().is_some() })
                }
                _ => panic!("가짜 서버 시험에서 허용하지 않은 명령"),
            };
            println!("SFTP_FIXTURE {}", response);
            std::io::stdout().flush().unwrap();
        }
    }

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

    /// 설정 저장 경로(동기화 폴더)를 지정해도 즐겨찾기는 로컬 `favorites.toml`에만 쓰이고 동기화 폴더의 설정은 바뀌지 않는다(이슈 #106).
    #[test]
    fn favorites_local_stay_out_of_the_synced_config_dir() {
        let local = tempfile::tempdir().unwrap();
        let cloud = tempfile::tempdir().unwrap();
        fs::write(
            local.path().join("config.toml"),
            "[behavior]\ntheme = \"dark\"\n",
        )
        .unwrap();
        let (state, _rx) = ConfigState::open(Some(local.path().to_path_buf()));
        state
            .switch_location(Some(cloud.path()), LocationConflict::UseExisting)
            .unwrap();
        let synced = fs::read_to_string(cloud.path().join("config.toml")).unwrap();

        let loaded = state.add_favorite("집", "/home/a").unwrap();
        assert_eq!(loaded.config.favorites.len(), 1);
        assert_eq!(
            fs::read_to_string(cloud.path().join("config.toml")).unwrap(),
            synced
        );
        assert!(!cloud.path().join("favorites.toml").exists());
        assert!(fs::read_to_string(local.path().join("favorites.toml"))
            .unwrap()
            .contains("/home/a"));

        // 기본 위치로 되돌려도 즐겨찾기는 그대로다.
        let (back, _rx2) = state
            .switch_location(None, LocationConflict::Overwrite)
            .unwrap();
        assert_eq!(back.config.favorites.len(), 1);
        let after = state.remove_favorite("/home/a").unwrap();
        assert!(after.config.favorites.is_empty());
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

#[cfg(test)]
mod smb_tests {
    use super::*;

    #[test]
    fn smb_서버_항목을_연결_대상으로_바꾸고_빈_user는_게스트다() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("config.toml"),
            "[[smb.servers]]\nhost = \"nas\"\nshare = \"공유\"\nuser = \"\"\n\n\
             [[smb.servers]]\nhost = \"nas\"\nshare = \"home\"\nuser = \"kim\"\n",
        )
        .unwrap();
        let (state, _rx) = ConfigState::open(Some(dir.path().to_path_buf()));
        let guest = smb_target(&state, 0).unwrap();
        assert_eq!(guest.share, "공유");
        assert_eq!(guest.user, None);
        assert_eq!(smb_target(&state, 1).unwrap().user.as_deref(), Some("kim"));
        assert!(smb_target(&state, 2).is_err());
    }

    #[test]
    fn smb_마운트_위치는_항목_순서대로_찾고_없으면_none이다() {
        let server = |share: &str| td_config::SmbServer {
            name: share.into(),
            host: "nas".into(),
            share: share.into(),
            user: String::new(),
            icon: String::new(),
        };
        let found = smb_mount_points(&[server("a"), server("b")], |t| {
            (t.share == "b").then(|| std::path::PathBuf::from("/Volumes/b"))
        });
        assert_eq!(found, vec![None, Some("/Volumes/b".to_string())]);
    }

    #[test]
    fn smb_연결_결과는_인증_실패를_구분한다() {
        let ok: SmbConnectDto = Ok(std::path::PathBuf::from("/Volumes/공유")).into();
        assert_eq!(ok, SmbConnectDto::Mounted("/Volumes/공유".into()));
        let SmbConnectDto::Failed(f) = Err(td_smb::SmbError::Auth).into() else {
            panic!("실패여야 한다");
        };
        assert_eq!(f.kind, SmbErrorKindDto::Auth);
        let SmbConnectDto::Failed(f) = Err(td_smb::SmbError::Other("x".into())).into() else {
            panic!("실패여야 한다");
        };
        assert_eq!(f.kind, SmbErrorKindDto::Other);
        assert!(f.message.contains('x'));
    }
}
