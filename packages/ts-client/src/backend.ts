import type { SyncOptionsDto, SyncComparisonDto, SyncChoiceDto } from "./generated/bindings";
import type { ShellResultDto, CliOutcomeDto, CliStatusDto, OpenPathsDto, ConfigLocationDto, ConfigValue, ConflictDto, DiskSpaceDto, EntryDto, EpubInfoDto, ExpectedFileDto, FindSpecDto, FileInfoDto, JobDto, JobKindDto, Loaded, NormalizeResultDto, LoadedState, LocationConflict, PreviewDto, RemoteErrorKindDto, RemoteServer, RemoteServerStatus, SmbErrorKindDto, SmbServer, QueueItemDto, OfficePreviewDto, SearchStartDto, SearchSummaryDto, Snapshot, UpdateInfoDto, UserDirsDto, VolumeDto, WriteTextResultDto } from "./generated/bindings";

/** Look Up / Flatten / Disk Usage가 스트리밍으로 보내는 이벤트. 작업마다 마지막은 `done`이다. */
export type SearchEvent =
  | { type: "chunk"; id: number; entries: EntryDto[] }
  /** Disk Usage의 크기 내림차순 전체 스냅샷. `done`이면 최종 결과다. `size`는 항목의 총 크기. */
  | { type: "usage"; id: number; items: EntryDto[]; done: boolean; totalBytes: number; files: number }
  | { type: "done"; id: number; summary: SearchSummaryDto };

/** Rust 쪽이 돌려준 오류 문자열을 감싼 예외. */
let translateError: (message: string) => string = (m) => m;
/** 백엔드 오류 문구를 화면 언어로 바꾸는 함수를 정한다(Rust가 한국어 문자열로 돌려주는 오류를 영어로 보이게 한다). */
export function setBackendErrorTranslator(fn: (message: string) => string): void {
  translateError = fn;
}

export class BackendError extends Error {
  constructor(message?: string) {
    super(message === undefined ? message : translateError(message));
  }
}

/** SMB 연결 실패. `kind`가 `auth`면 비밀번호가 없거나 틀렸으니 다시 묻는다. */
export class SmbConnectError extends BackendError {
  constructor(
    readonly kind: SmbErrorKindDto,
    message: string,
  ) {
    super(message);
  }
}

/** 원격(SFTP·FTP) 연결 실패. `kind`가 `auth`면 비밀번호가 없거나 틀렸으니 다시 묻는다. */
export class HostKeyError extends BackendError {
  constructor(readonly key: import("./generated/bindings").HostKeyDto) { super("SFTP 서버 키 확인"); }
}

export class RemoteConnectError extends BackendError {
  constructor(
    readonly kind: RemoteErrorKindDto,
    message: string,
  ) {
    super(message);
  }
}

/**
 * UI가 파일시스템에 접근하는 유일한 통로.
 * 실제 앱은 `TauriBackend`, UI 테스트는 `FakeBackend`를 쓴다.
 */
/** Finder 같은 다른 앱에서 파일을 끌어 올 때의 이벤트. 좌표는 창 안의 CSS px(Tauri가 주는 물리 좌표를 `devicePixelRatio`로 나눈 값)이다. */
/** 내장 터미널이 화면으로 보내는 이벤트. 출력은 pty가 낸 바이트 그대로다(UTF-8 글자 중간에서 잘릴 수 있다). */
export type TerminalEvent = { type: "output"; id: number; data: Uint8Array } | { type: "exit"; id: number; code: number | null };

export interface FileDropEvent {
  /** `enter`: 끌어 들어옴, `over`: 창 위에서 움직임, `drop`: 놓음, `leave`: 놓지 않고 나감. */
  type: "enter" | "over" | "drop" | "leave";
  /** `enter`·`drop`에만 있다. 나머지는 빈 목록. */
  paths: string[];
  x: number;
  y: number;
}

export interface Backend {
  compareDirectories(requestId: string, left: string, right: string, options: SyncOptionsDto): Promise<SyncComparisonDto>;
  cancelDirectoryComparison(requestId: string): Promise<void>;
  syncDirectories(comparisonId: number, choices: SyncChoiceDto[]): Promise<number>;

  /** 폴더 먼저, 이름순으로 정렬된 목록. */
  listDir(path: string, showHidden: boolean): Promise<EntryDto[]>;
  mkdir(path: string): Promise<void>;
  touch(path: string): Promise<void>;
  /** `destDir`에 `src`와 같은 이름이 이미 있으면 그 경로. */
  detectConflict(src: string, destDir: string): Promise<string | null>;
  rename(path: string, newName: string): Promise<string>;
  /** 자소가 분리된(NFD) 한글 이름을 조합형(NFC)으로 고친다(이슈 #50). */
  normalizeNames(paths: string[]): Promise<NormalizeResultDto>;
  /** 폴더 바로 아래 항목의 이름을 조합형으로 고친다. 하위 폴더 안은 건드리지 않는다. */
  normalizeDir(dir: string): Promise<NormalizeResultDto>;
  /** 복사/이동/휴지통/삭제를 작업 큐에 넣는다. 작업 id를 돌려준다. */
  enqueue(kind: JobKindDto, items: QueueItemDto[]): Promise<number>;
  /** 압축 (OP-11): `sources`를 `destDir`의 ZIP 하나로 묶는 작업을 큐에 넣는다. 이름이 겹치면 번호를 붙이고 원본은 그대로 둔다. */
  enqueueCompress(sources: string[], destDir: string, name?: string): Promise<number>;
  /** 추출 (OP-11): 아카이브 `src`를 `destDir` 아래 아카이브 이름의 새 폴더에 안전하게 푸는 작업을 큐에 넣는다. */
  enqueueExtract(src: string, destDir: string): Promise<number>;
  /** 심볼릭 링크 만들기 (OP-12). 만든 링크의 경로, 정책이 건너뛰기라 만들지 않았으면 null. */
  createSymlink(src: string, destDir: string, policy: ConflictDto): Promise<string | null>;
  queueJobs(): Promise<JobDto[]>;
  queuePause(id: number): Promise<void>;
  queueResume(id: number): Promise<void>;
  queueAbort(id: number): Promise<void>;
  /** 끝난 작업을 목록에서 지운다. */
  queueClearFinished(): Promise<void>;
  /** 파일 정보 대화상자용 상세 정보. */
  fileInfo(path: string): Promise<FileInfoDto>;
  /** 텍스트 파일을 덮어쓴다(미리보기 편집 저장). `expected`와 지금 파일의 크기·수정 시각이 다르면 쓰지 않고 `saved: false`를 돌려준다. */
  writeTextFile(path: string, text: string, expected: ExpectedFileDto | null): Promise<WriteTextResultDto>;
  /** 이 창이 마지막으로 저장한 상태 (PANE-05). 없거나 읽을 수 없으면 snapshot이 null이고 경고가 올 수 있다. */
  loadState(): Promise<LoadedState>;
  saveState(snapshot: Snapshot): Promise<void>;
  /** 저장된 상태를 모두 지우고 앱을 종료한다. */
  resetState(): Promise<void>;
  /** 로컬 폴더 `cwd`에서 셸 한 줄을 실행하고 끝날 때까지 기다린다(5분 제한). */
  runShellCommand(cwd: string, command: string): Promise<ShellResultDto>;
  /** 앱을 실제로 끝낸다. 백그라운드 유지 설정과 상관없다. */
  quitApp(): Promise<void>;
  /** 새 창을 열고 그 창의 레이블을 돌려준다 (PANE-03). */
  newWindow(): Promise<string>;
  /** 미리보기: 텍스트 앞부분, 이미지 data URL, 종류 판별. */
  preview(path: string): Promise<PreviewDto>;
  /** Office 문서(docx·xlsx·pptx·doc·xls·ppt 등)를 읽어 뽑은 Markdown. 문서 모습이 아니라 글자와 표다. 압축 안 경로는 오류다. */
  officePreview(path: string): Promise<OfficePreviewDto>;
  /**
   * 항목의 시스템 파일 아이콘(`data:image/png;base64,…`). 파일 목록의 "시스템 아이콘" 옵션이 켜져 있을 때만 부른다.
   * 이 OS가 못 주면 null이다(화면은 기본 아이콘을 그대로 둔다). 폴더는 `isDir`, 압축 안 항목도 확장자로 얻는다. `size`는 한 변 픽셀이다.
   */
  systemIcon(path: string, isDir: boolean, size: number): Promise<string | null>;
  /** 디스크 위 epub의 제목·저자·표지(데이터 주소, 이미지 한도 안일 때만)·챕터 목록. 압축 파일 안의 epub·DRM·깨진 파일은 오류로 거부된다. */
  epubOpen(path: string): Promise<EpubInfoDto>;
  /** epub의 `index`번째 챕터 HTML(안의 이미지·스타일은 넣고 스크립트는 뺐다). 범위 밖이거나 너무 크면 거부된다. */
  epubChapter(path: string, index: number): Promise<string>;
  /** glob 패턴과 일치하는 이름의 인덱스 (Select Group). */
  globFilter(pattern: string, names: string[]): Promise<number[]>;
  /** 웹뷰가 파일을 직접 읽어 재생할 수 있는 주소(비디오처럼 큰 파일을 데이터로 싣지 않고 스트리밍한다). */
  fileUrl(path: string): string;
  /** 파일을 창 밖(Finder, 탐색기, 다른 앱)으로 끌어 간다: 운영체제의 드래그를 시작한다. 마우스 단추를 누르고 있는 동안 불러야 한다. */
  startNativeDrag(paths: string[]): Promise<void>;
  /** 클립보드에 텍스트를 쓴다. */
  copyText(text: string): Promise<void>;
  /** 경로의 이미지(압축 파일 안 포함)를 클립보드에 이미지로 복사한다. 이미지로 읽을 수 없으면 거부된다. */
  copyImage(path: string): Promise<void>;
  /** 운영체제 파일 클립보드에 파일 경로 목록을 쓴다(Finder/탐색기에 붙여 넣을 수 있다). 빈 목록이면 비운다. */
  setClipboardFiles(paths: string[]): Promise<void>;
  /** 운영체제 파일 클립보드에 든 파일 경로(지금 있는 것만). 파일이 없으면 빈 목록. */
  getClipboardFiles(): Promise<string[]>;
  /** 파일 관리자에서 항목을 보여 준다. */
  revealPath(path: string): Promise<void>;
  /** 파일을 운영체제 기본 프로그램으로 실행한다. */
  openPath(path: string): Promise<void>;
  /** 설정한 편집기로 항목을 연다. */
  editPaths(paths: string[]): Promise<void>;
  /** 지정한 애플리케이션으로 항목(들)을 연다. 앱은 경로를 인수로 받는다. */
  launchApp(app: string, paths: string[]): Promise<void>;
  /** 확장자와 무관하게 파일을 아카이브로 연다 (ARC-04). 아카이브 루트 경로(`파일!`)를 돌려준다. */
  openAsArchive(path: string): Promise<string>;
  /** Look Up을 시작한다. 질의가 문법에 어긋나면 위치가 든 메시지로 거부된다. 결과는 `onSearchEvent`로 온다. */
  startLookup(root: string, query: string): Promise<SearchStartDto>;
  /** 파일 찾기(기본 탭의 조건). 잘못된 정규식 같은 조건 오류는 거부된다. 결과는 `onSearchEvent`로 온다. */
  startFind(spec: FindSpecDto): Promise<SearchStartDto>;
  /** `root` 아래의 모든 파일을 평면 목록으로 흘려 보낸다. */
  startFlatten(root: string): Promise<number>;
  /** `root`의 하위 항목별 총 크기를 계산해 크기 내림차순 스냅샷으로 흘려 보낸다. */
  startDiskUsage(root: string): Promise<number>;
  /** 실행 중인 검색/순회를 취소한다. 취소돼도 `done` 이벤트는 온다. */
  cancelSearch(id: number): Promise<void>;
  /** 폴더 하나의 하위 총 용량(바이트). 숨김 파일 포함, 하드 링크는 한 번, 심볼릭 링크는 따라가지 않는다. 취소되면 null이다. */
  dirSize(path: string): Promise<number | null>;
  /** 계산 중인 `dirSize(path)`를 취소한다. 계산 중이 아니면 아무 일도 없다. */
  cancelDirSize(path: string): Promise<void>;
  onSearchEvent(callback: (event: SearchEvent) => void): () => void;
  /** 마운트된 볼륨. 루트가 첫 항목이다. */
  listVolumes(): Promise<VolumeDto[]>;
  /** 경로가 놓인 파일시스템의 남은 용량과 전체 용량(바이트). 조회할 수 없으면 거부된다. */
  diskSpace(path: string): Promise<DiskSpaceDto>;
  /** 언마운트/추출. 루트나 목록에 없는 경로는 거부된다. */
  unmountVolume(mountPoint: string): Promise<void>;
  ejectVolume(mountPoint: string): Promise<void>;
  /** `~`와 `${user.*}` 확장에 쓰는 사용자 폴더. */
  userDirs(): Promise<UserDirsDto>;
  /** 즐겨찾기를 config.toml에 덧붙이고 바로 병합한 설정을 돌려준다. */
  addFavorite(name: string, path: string): Promise<Loaded>;
  /** 즐겨찾기에서 경로(변수 확장 전 원문)가 같은 항목을 지운다. 폴더 자체는 그대로다. */
  removeFavorite(path: string): Promise<Loaded>;
  /** 현재 설정(기본값 병합 결과)과 키바인딩, 경고. */
  getConfig(): Promise<Loaded>;
  /** 설정 화면: 사용자 config.toml의 키 하나(`behavior.theme` 같은 점 표기)를 쓰고, 새로 병합된 설정을 돌려준다. */
  setConfigValue(key: string, value: ConfigValue): Promise<Loaded>;
  /** 설정 화면: 사용자 config.toml에서 키를 지워 기본값으로 되돌리고, 새로 병합된 설정을 돌려준다. */
  resetConfigValue(key: string): Promise<Loaded>;
  /** 저장된 SMB 서버 목록 전체를 바꾸고 새로 병합된 설정을 돌려준다. 목록은 `Loaded`의 `config.smb.servers`로 읽는다. host나 share가 빈 항목이 있으면 거부된다. */
  setSmbServers(servers: SmbServer[]): Promise<Loaded>;
  /**
   * 설정의 `index`번째 SMB 서버에 연결(OS 마운트)하고 마운트 지점을 돌려준다. 이미 마운트돼 있으면 그 경로다.
   * `password`가 null이면 키체인 값을 쓰고, 성공했고 `remember`면 받은 비밀번호를 키체인에 저장한다.
   * 연결 실패는 `SmbConnectError`(`kind`로 인증 실패를 구분), 없는 항목 번호 같은 문제는 `BackendError`로 거부된다.
   */
  smbConnect(index: number, password: string | null, remember: boolean): Promise<string>;
  /** 설정의 `index`번째 SMB 서버에 저장된 비밀번호를 키체인에서 지운다. 저장된 값이 없어도 성공이다. */
  smbForgetPassword(index: number): Promise<void>;
  /** 저장된 SMB 서버 항목마다 지금 마운트된 위치(항목 순서, 마운트돼 있지 않으면 null). 앱 밖에서 마운트한 공유도 찾는다. */
  smbMounts(): Promise<(string | null)[]>;
  /** 저장된 원격(SFTP·FTP) 서버 목록 전체를 바꾸고 새로 병합된 설정을 돌려준다. 목록은 `Loaded`의 `config.remote.servers`로 읽는다. protocol이 sftp·ftp가 아니거나 host가 빈 항목이 있으면 거부된다. 비밀번호는 목록에 없다(키체인). */
  setRemoteServers(servers: RemoteServer[]): Promise<Loaded>;
  /**
   * 설정의 `index`번째 원격 서버에 연결하고 패널이 이동할 루트 경로(`sftp://<id>/..`)를 돌려준다. 이미 연결돼 있으면 같은 연결의 루트다.
   * `password`가 없으면 키체인 값을 쓰고, 성공했고 `remember`면 받은 비밀번호를 키체인에 저장한다.
   * 연결 실패는 `RemoteConnectError`(`kind`로 인증 실패를 구분), 없는 항목 번호 같은 문제는 `BackendError`로 거부된다.
   */
  remoteConnect(index: number, password: string | null, remember: boolean, approvedHostKey?: string): Promise<string>;
  /** 설정의 `index`번째 원격 서버 연결을 끊는다. 연결돼 있지 않아도 성공이다. */
  remoteDisconnect(index: number): Promise<void>;
  /** 지금 연결돼 있는 원격 서버 항목의 번호들(설정 목록 기준). */
  remoteConnections(): Promise<number[]>;
  /** 설정의 `index`번째 원격 서버에 저장된 비밀번호를 키체인에서 지운다. 저장된 값이 없어도 성공이다. */
  remoteForgetPassword(index: number): Promise<void>;
  /**
   * 내장 서버(Twin Deck Remote)를 현재 설정(`config.remote_server`)으로 켜고 상태를 돌려준다. `enabled` 값과 무관하게 켠다(그 키는 앱을 켤 때만 본다).
   * 루트(`root`)나 비밀번호가 비어 있으면 사람이 읽을 사유와 함께 `BackendError`로 거부되고, 그 사유는 상태의 `lastError`에도 남는다.
   */
  remoteServerStart(): Promise<RemoteServerStatus>;
  /** 내장 서버를 끄고 상태를 돌려준다. 꺼져 있어도 성공이다. */
  remoteServerStop(): Promise<RemoteServerStatus>;
  /** 내장 서버 상태(실행 여부·수신 주소·호스트키 지문·비밀번호 설정 여부·마지막 오류). 비밀번호 값은 돌려주지 않는다. */
  remoteServerStatus(): Promise<RemoteServerStatus>;
  /** 내장 서버의 비밀번호를 키체인에 저장한다(빈 문자열이면 지운다). 설정 파일에는 쓰지 않는다. 바뀐 상태를 돌려준다. */
  setRemoteServerPassword(password: string): Promise<RemoteServerStatus>;
  /** 설정 폴더를 파일 관리자로 연다. */
  revealConfigDir(): Promise<void>;
  /** 지금 설정 파일(`config.toml`·`keybindings.toml`) 저장 경로와 기본 위치. */
  getConfigLocation(): Promise<ConfigLocationDto>;
  /** 그 폴더에 이미 설정 파일이 있는가. 있으면 저장 경로를 바꾸기 전에 어떻게 할지 묻는다. */
  configLocationHasFiles(dir: string): Promise<boolean>;
  /**
   * 설정 파일 저장 경로를 바꾼다(`dir`이 null이면 기본 위치로). 새 폴더의 설정을 바로 적용해 돌려준다.
   * 새 폴더가 비었으면 지금 파일을 복사하고, 이미 설정이 있으면 `conflict`에 따라 그 설정을 쓰거나 지금 설정으로 덮어쓴다(기존은 `.bak`).
   */
  setConfigLocation(dir: string | null, conflict: LocationConflict): Promise<Loaded>;
  /** 폴더 선택 창을 띄운다. 취소하면 null. */
  pickFolder(): Promise<string | null>;
  /** 저장 위치 선택 창을 띄운다(`extensions`는 `zip` 같은 확장자 필터). 취소하면 null. */
  pickSaveFile(defaultName: string, extensions: string[]): Promise<string | null>;
  /** 파일 선택 창을 띄운다. 취소하면 null. */
  pickFile(extensions: string[]): Promise<string | null>;
  /** 지금 설정 파일(`config.toml`·`keybindings.toml`)을 zip 파일 `dest`로 내보낸다. */
  exportConfig(dest: string): Promise<void>;
  /** 내보낸 zip 파일에서 설정을 가져와 지금 설정 파일을 바꾸고(기존은 `.bak`) 새 설정을 돌려준다. 설정 파일이 없거나 문법 오류면 거부된다. */
  importConfig(src: string): Promise<Loaded>;
  /** GitHub 릴리스 목록(변경 사항)을 기본 브라우저로 연다(이슈 #70). */
  openReleasesPage(): Promise<void>;
  /** 외부 주소(`http`·`https`·`mailto`만)를 기본 브라우저·메일 앱으로 연다(Markdown 링크, 이슈 #89). 다른 스킴이나 공백·제어 문자가 든 주소는 거부된다. */
  openExternalUrl(url: string): Promise<void>;
  /** 지금 실행 중인 앱의 버전(`tauri.conf.json`의 `version`). */
  appVersion(): Promise<string>;
  /** GitHub 릴리스의 최신 버전을 확인한다. 새 버전이 없으면 null. 확인에 실패하면 BackendError. */
  checkUpdate(): Promise<UpdateInfoDto | null>;
  /** 새 버전을 내려받아 설치하고 앱을 다시 시작한다. 실패하면 BackendError(서명 불일치 포함). */
  installUpdate(): Promise<void>;
  /** 설정 파일이 바뀔 때마다 호출된다. 문법 오류면 이전 유효 설정과 경고가 온다. */
  onConfigChanged(callback: (loaded: Loaded) => void): () => void;
  /** 큐 상태가 바뀔 때마다 전체 스냅샷과 함께 호출된다. */
  onQueueChanged(callback: (jobs: JobDto[]) => void): () => void;
  watch(path: string): Promise<void>;
  unwatch(path: string): Promise<void>;
  /** 감시 중인 디렉터리가 바뀌면 호출된다. 구독 해제 함수를 돌려준다. */
  onDirChanged(callback: (path: string) => void): () => void;
  /** `td` 명령의 설치 상태(macOS: `/usr/local/bin/td` 링크, Windows: `td.cmd`와 사용자 PATH). */
  cliStatus(): Promise<CliStatusDto>;
  /** `td` 명령을 설치한다. macOS에서는 관리자 암호 창이 뜰 수 있다. */
  cliInstall(): Promise<CliOutcomeDto>;
  /** `td` 명령을 제거한다(우리가 만든 것만). */
  cliUninstall(): Promise<CliOutcomeDto>;
  /** 시작 인수(`td 폴더`)로 받은 요청을 한 번 돌려준다. 가져가면 비워서 두 번 적용되지 않는다. 없으면 null. */
  takeLaunchPaths(): Promise<OpenPathsDto | null>;
  /** 실행 중인 앱에 `td` 명령이 경로를 넘기면 호출된다(단일 인스턴스). 구독 해제 함수를 돌려준다. */
  onOpenPaths(callback: (request: OpenPathsDto) => void): () => void;
  /** `cwd` 폴더에서 셸을 pty로 열고 세션 번호를 돌려준다. */
  terminalOpen(cwd: string, cols: number, rows: number): Promise<number>;
  /** SFTP 연결 `connectionId`(경로 `sftp://<id>/..`의 id)의 서버에 원격 셸을 열고 세션 번호를 돌려준다. 입출력·종료는 로컬 터미널과 같은 `terminalWrite/Resize/Close`·`onTerminalEvent`다. */
  terminalOpenRemote(connectionId: string, cols: number, rows: number): Promise<number>;
  /** 세션에 입력(키 입력을 글로 바꾼 것)을 쓴다. */
  terminalWrite(id: number, data: string): Promise<void>;
  terminalResize(id: number, cols: number, rows: number): Promise<void>;
  terminalClose(id: number): Promise<void>;
  /** 터미널 세션의 출력·종료를 받는다. 구독 해제 함수를 돌려준다. */
  onTerminalEvent(callback: (e: TerminalEvent) => void): () => void;
  /** 다른 앱(Finder 등)에서 끌어 온 파일 이벤트를 받는다. 구독 해제 함수를 돌려준다. */
  onFileDrop(callback: (e: FileDropEvent) => void): () => void;
}

/** 마지막 경로 구분자(`/` 또는 `\`)의 위치. 없으면 -1. */
const lastSep = (path: string) => Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));

/** `C:\`, `C:/` 같은 Windows 드라이브 루트. */
export const isDriveRoot = (path: string) => /^[A-Za-z]:[\\/]?$/.test(path);

/** 원격(SFTP·FTP) 위치: `sftp://<연결 id>/절대/경로`(ADR-0019). 연결 id는 `/`를 담지 않는다. */
export type RemoteLoc = { scheme: "sftp" | "ftp"; id: string; path: string };

/** 원격 경로를 분해한다. 원격 경로가 아니면 null. 경로가 비면 루트(`/`)다. */
export function splitRemote(path: string): RemoteLoc | null {
  const m = /^(sftp|ftp):\/\/([^/]+)(\/.*)?$/.exec(path);
  if (!m) return null;
  const rest = (m[3] ?? "/").replace(/\/+$/, "") || "/";
  return { scheme: m[1] as RemoteLoc["scheme"], id: m[2], path: rest };
}

export const isRemotePath = (path: string) => splitRemote(path) !== null;

/** 원격 서버 항목의 연결 id. Rust의 `RemoteTarget::id`와 같다: `user@host:port`(사용자가 없으면 `host:port`). 경로(`sftp://<id>/..`)의 id와 맞춘다. */
export const remoteServerId = (s: { host: string; port: number; user: string }) => (s.user ? `${s.user}@${s.host}:${s.port}` : `${s.host}:${s.port}`);

/** `splitRemote`의 역. 루트는 항상 `sftp://<id>/`처럼 끝에 `/`가 있다. */
export const remoteUrl = (scheme: RemoteLoc["scheme"], id: string, path: string) => `${scheme}://${id}${path.startsWith("/") ? "" : "/"}${path}`;

/** 경로 끝의 구분자를 뗀다. 루트(`/`, `C:\`, `sftp://id/`)는 그대로 둔다. */
export const trimTrailingSep = (path: string) => {
  const r = splitRemote(path);
  if (r) return remoteUrl(r.scheme, r.id, r.path);
  return path.length > 1 && !isDriveRoot(path) ? path.replace(/[\\/]+$/, "") : path;
};

export function joinPath(dir: string, name: string): string {
  if (/[\\/]$/.test(dir)) return dir + name;
  // 아카이브 경계(`x.zip!`) 뒤는 항상 `/`다. 그 밖에는 경로가 쓰던 구분자를 따른다.
  const sep = !dir.includes("!") && dir.includes("\\") ? "\\" : "/";
  return dir + sep + name;
}

export function parentPath(path: string): string | null {
  const r = splitRemote(path);
  if (r) {
    if (r.path === "/") return null;
    const cut = r.path.lastIndexOf("/");
    return remoteUrl(r.scheme, r.id, cut <= 0 ? "/" : r.path.slice(0, cut));
  }
  if (isDriveRoot(path)) return null;
  const i = lastSep(path);
  if (i < 0) return null;
  if (i === 0) return path.length > 1 ? "/" : null;
  // `C:\a`의 부모는 `C:`가 아니라 드라이브 루트 `C:\`다.
  return /^[A-Za-z]:$/.test(path.slice(0, i)) ? path.slice(0, i + 1) : path.slice(0, i);
}

export function baseName(path: string): string {
  const r = splitRemote(path);
  if (r) return r.path === "/" ? r.id : r.path.slice(r.path.lastIndexOf("/") + 1);
  return path.slice(lastSep(path) + 1);
}

/**
 * `~`, `~/x`, `${user.downloads}/x` 같은 경로를 실제 경로로 바꾼다.
 * 필요한 사용자 폴더를 알 수 없으면 null. 변수가 없는 경로는 그대로 돌려준다.
 */
export function expandPath(path: string, dirs: UserDirsDto): string | null {
  if (path === "~") return dirs.home;
  if (path.startsWith("~/")) return dirs.home ? dirs.home + path.slice(1) : null;
  const m = /^\$\{user\.(home|downloads|documents|desktop|pictures|music|movies)\}(.*)$/.exec(path);
  if (m) {
    const base = dirs[m[1] as keyof UserDirsDto];
    return base ? base + m[2] : null;
  }
  return path;
}
