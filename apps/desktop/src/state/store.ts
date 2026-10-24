import { rustText, setLanguage, t as tr } from "../i18n";
import { detectEol, editBlockReason, toDisk, toEditor } from "../lib/previewEdit";
import type { Eol } from "../lib/previewEdit";
import { buildNewNames, DEFAULT_RENAME_OPTIONS, needsTempStep, validateNames } from "../lib/multiRename";
import type { RenameOptions } from "../lib/multiRename";
import { createStore } from "zustand/vanilla";
import {
  archiveFileName,
  archiveRoot,
  baseName,
  defaultLoaded,
  expandPath,
  isArchiveName,
  isArchivePath,
  isDriveRoot,
  isRemotePath,
  joinPath,
  parentPath,
  HostKeyError,
  RemoteConnectError,
  remoteServerId,
  setBackendErrorTranslator,
  SmbConnectError,
  splitRemote,
  trimTrailingSep,
} from "@twin-deck/ts-client";
import type {
  ConfigLocationDto,
  LocationConflict,
  Backend,
  ConfigValue,
  FileDropEvent,
  ConflictDto,
  EntryDto,
  ExpectedFileDto,
  JobDto,
  Loaded,
  PreviewDto,
  PreviewRect,
  QueueItemDto,
  SearchEvent,
  SearchSummaryDto,
  Snapshot,
  TabSnap,
  UserDirsDto,
  VolumeDto,
  DiskSpaceDto,
  FindSpecDto,
  SmbServer,
  RemoteServer,
  UpdateInfoDto,
} from "@twin-deck/ts-client";
import type { ActionContext } from "@twin-deck/actions";
import type { Scope } from "@twin-deck/keybinds";
import { appendQuick, backspaceQuick } from "../lib/hangulInput";
import { rebindTerminal } from "../lib/terminalSessions";
import { quickMatch } from "../lib/names";
import { parseColumns } from "../lib/columns";
import { neighborTile, OTHER } from "../lib/treemap";
import type { Dir, Tile } from "../lib/treemap";
import { rankBy } from "../lib/fuzzy";
import { categoryTitle, helpMatches, helpTerms } from "../lib/helpSearch";
import { isInside, volumeOf } from "../lib/volumes";
import { formatDateTime, formatOctal, formatPermissions, formatSize } from "../lib/format";
import { DEFAULT_SORT, SORT_KEYS, sortEntries, sortFromColumns } from "../lib/sort";
import { dateGroup } from "../lib/dateGroups";
import { withIcon } from "../lib/connections";
import { isRemoteDisconnected } from "../lib/remoteErrors";
import type { SortKey, SortState } from "../lib/sort";

export type PaneId = "left" | "right";

export interface TabState {
  id: number;
  /** 탭별 정렬. null이면 설정의 컬럼 명세(`>extension` 등)를 따른다. */
  sort: SortState | null;
  path: string;
  /** 방문한 경로 이력 (이 탭). */
  history: string[];
  /** 뒤로/앞으로 이동용 방문 스택(이 탭에서 실제 폴더를 옮긴 기록). `history`는 최근 위치 메뉴용이다. */
  back: string[];
  forward: string[];
  entries: EntryDto[];
  cursor: number;
  selection: ReadonlySet<string>;
  error: string | null;
  /** Quick Select 입력 중이면 입력 문자열. */
  quick: string | null;
  /** 복원한 커서 항목 이름. 첫 목록을 읽을 때 한 번 쓰고 지운다. */
  restoreCursor?: string;
  /** 있으면 위치가 없는 가상 탭(PANE-06)이다. `path`는 `virtual:<종류>:<탭 id>` 자리표시자다. */
  virtual?: VirtualTab;
}

/** `terminal`은 내장 터미널 탭이다(이슈 #46): `jobId`가 pty 세션 번호이고 `base`가 시작한 폴더다. 탭을 닫으면 세션이 끝난다. */
export type VirtualKind = "lookup" | "flatten" | "usage" | "find" | "terminal";

/** Look Up / Flatten / Disk Usage 결과를 담은 탭의 부가 상태. 탭을 닫으면 결과를 버린다. */
export interface VirtualTab {
  kind: VirtualKind;
  title: string;
  /** 검색/순회를 시작한 위치. */
  base: string;
  /** 진행 중인 작업 id (취소에 쓴다). */
  jobId: number;
  running: boolean;
  cancelled: boolean;
  warnings: string[];
  summary: SearchSummaryDto | null;
  /** Disk Usage의 지금까지 센 총 바이트. */
  totalBytes: number;
  /** Disk Usage 탭을 보는 방식: 목록 또는 treemap(사각형 타일). 다른 종류의 가상 탭은 항상 "list"다. */
  view: "list" | "treemap";
  /** 삭제/이동/휴지통을 보낸 뒤 실제로 사라졌는지 확인할 경로들. */
  recheck: string[];
  /** Disk Usage: 항목이 사라져 합계·크기가 옛 값이다. 작업이 모두 끝나면 같은 폴더를 다시 스캔한다. */
  stale?: boolean;
  /** 터미널: 원격 셸의 연결이 끊겼다(종료 코드 없이 채널이 닫혔다). 탭과 화면은 남기고 다시 연결할 수 있게 한다(이슈 #98). */
  disconnected?: boolean;
}

/** 파일 찾기 다이얼로그(기본 탭)의 입력값. */
export interface FindForm {
  start: string;
  openTabs: boolean;
  selectedOnly: boolean;
  followSymlinks: boolean;
  excludeDirs: string;
  /** "all"(무제한) 또는 "0"(현재 디렉터리만)~"9". */
  depth: string;
  mask: string;
  substring: boolean;
  regex: boolean;
  excludeFiles: string;
  textOn: boolean;
  text: string;
  invert: boolean;
  caseSensitive: boolean;
  textRegex: boolean;
}

export const defaultFindForm = (start: string): FindForm => ({
  start,
  openTabs: false,
  selectedOnly: false,
  followSymlinks: false,
  excludeDirs: "",
  depth: "all",
  mask: "",
  substring: true,
  regex: false,
  excludeFiles: "",
  textOn: false,
  text: "",
  invert: false,
  caseSensitive: false,
  textRegex: false,
});

export interface PaneState {
  tabs: TabState[];
  active: number;
}

/** 마우스를 누른 채 이만큼(px) 움직여야 드래그가 시작된다. 그보다 작으면 클릭이다. */
const DRAG_START_PX = 5;

/** 드롭 대상: 폴더 행(`row`, 그 폴더 안으로)이거나 패널(그 패널의 현재 폴더). */
export interface DropTarget {
  pane: PaneId;
  dir: string;
  row: boolean;
  /** 폴더 트리의 노드에 놓는다(이슈 #125). 이때 `pane`은 놓은 순간의 활성 패널일 뿐 대상이 아니다. */
  tree?: boolean;
}

export interface DragState {
  paths: string[];
  /** 끌기를 시작한 패널. 다른 앱(Finder)에서 끌어 온 것이면 null. */
  sourcePane: PaneId | null;
  /** 다른 앱에서 끌어 오는 중(OS가 끌기 그림을 그리고 놓기는 Tauri 이벤트로 온다). */
  external?: boolean;
  x: number;
  y: number;
  /** Control 키가 눌려 있다(이동). 아니면 복사. */
  ctrl: boolean;
  target: DropTarget | null;
}

export const CONFLICT_CHOICES: readonly ConflictDto[] = ["overwrite", "skip", "rename"];

export type DialogState =
  | { kind: "hostKey"; title: string; host: string; port: number; algorithm: string; fingerprint: string; confirmed: boolean }
  | { kind: "name"; title: string; value: string; error: string | null; selectStem: boolean; lines?: string[]; goto?: boolean; label?: string; confirmLabel?: string; option?: { label: string; checked: boolean } }
  | { kind: "multirename"; title: string; items: { path: string; name: string; isDir: boolean; modifiedMs: number | null }[]; existing: string[]; options: RenameOptions }
  | { kind: "confirm"; title: string; lines: string[]; confirmLabel?: string }
  /** 선택지 중 하나를 고르는 창(확인이면 고른 번호, 취소면 null). */
  | { kind: "choice"; title: string; lines: string[]; choices: string[]; selected: number }
  | { kind: "conflict"; title: string; existing: string; selected: number; remaining: number; all: boolean }
  | { kind: "info"; title: string; lines: string[]; copyText?: string }
  /** SMB 비밀번호 입력(가림). 확인이면 `{ value, remember }`, 취소면 null. `error`는 앞서 넣은 비밀번호가 틀렸다는 안내다. */
  | { kind: "password"; title: string; value: string; remember: boolean; error: string | null }
  /** 실행 중인 전송(복사/이동) 작업의 진행 창. */
  | { kind: "progress"; title: string; jobId: number };

/** 최근 위치 개수 설정(1 이상). */
export const recentLimit = (c: { behavior: { layout: { recent_limit: number } } }) => Math.max(1, Math.floor(c.behavior.layout.recent_limit) || 20);

export type MenuKind = "volumes" | "favorites" | "recent" | "hierarchy" | "smb";

/** 연결 메뉴 항목의 연결 종류(이름 앞 배지, 이슈 #95). */
export type ConnectionProtocol = "smb" | "sftp" | "ftp" | "twindeck";

export interface MenuItem {
  label: string;
  /** 연결 메뉴: 이 항목의 연결 종류. 있으면 이름 앞에 종류 배지를 보인다. */
  protocol?: ConnectionProtocol;
  /** 이동할 경로. 없으면 머리글/구분선이라 고를 수 없다. */
  path?: string;
  /** 즐겨찾기 항목의 변수 확장 전 경로(삭제할 때 설정 파일과 맞춘다). */
  raw?: string;
  separator?: boolean;
  /** 연결 메뉴: 연결할 SMB 서버 항목 번호(`smb.servers`의 순번). */
  smb?: number;
  /** 연결 메뉴: 연결할 원격(SFTP·FTP) 서버 항목 번호(`remote.servers`의 순번). */
  remote?: number;
  /** SMB 연결 메뉴의 "SMB 서버 관리…": 이 순번의 설정 탭을 연다. */
  settings?: number;
  /** 보이지만 고를 수 없다(연결 중인 SMB 항목). */
  disabled?: boolean;
  /** 연결 메뉴: Shift+Enter로 터미널로 열 수 있는 항목(SFTP). */
  terminal?: boolean;
}

/** 팝업 메뉴에서 고를 수 있는 항목인지(머리글·구분선·비활성 항목이 아님). */
export const pickable = (it: MenuItem) => !it.disabled && (it.path !== undefined || it.smb !== undefined || it.remote !== undefined || it.settings !== undefined);

export interface MenuState {
  kind: MenuKind;
  title: string;
  items: MenuItem[];
  cursor: number;
  /** 최근 위치·즐겨찾기 메뉴: 필터 전 전체 목록과 입력한 필터. `items`는 필터를 거친 보이는 목록이다. */
  all?: MenuItem[];
  filter?: string;
  /** SMB 연결 메뉴를 연 드라이브 바의 패널. 연결되면 이 패널이 이동한다. */
  pane?: PaneId;
}

/** 컨텍스트 메뉴 항목. `sub`가 있으면 하위 메뉴를 연다. 둘 다 없으면 구분선이다. */
export interface CtxItem {
  label?: string;
  actionId?: string;
  sub?: CtxItem[];
  /** true이면 커서가 압축 파일(또는 선택 항목이 있을 때)만 켜진다. 일반 파일 위에서는 흐리게 보인다. */
  archiveOnly?: boolean;
}

/** 파일 행 컨텍스트 메뉴의 구성 (Finder 스타일). 단축키 힌트와 실행 가능 여부는 액션 ID로 구한다. */
export const CONTEXT_MENU: readonly CtxItem[] = [
  { get label() { return tr("ctx.open"); }, actionId: "core.open" },
  {
    get label() { return tr("ctx.open_with"); },
    sub: [
      { get label() { return tr("ctx.open_editor"); }, actionId: "core.edit" },
      { get label() { return tr("ctx.open_archive"); }, actionId: "core.open.as_archive" },
      { get label() { return tr("ctx.reveal"); }, actionId: "core.reveal" },
    ],
  },
  {},
  { get label() { return tr("ctx.compress_here"); }, actionId: "core.compress" },
  { get label() { return tr("ctx.extract"); }, actionId: "core.extract", archiveOnly: true },
  {},
  { get label() { return tr("ctx.move"); }, actionId: "core.move" },
  { get label() { return tr("ctx.copy"); }, actionId: "core.copy" },
  { get label() { return tr("ctx.delete"); }, actionId: "core.trash" },
  { get label() { return tr("ctx.rename"); }, actionId: "core.rename" },
  { get label() { return tr("ctx.copy_path"); }, actionId: "core.path.copy_files" },
  { get label() { return tr("ctx.terminal"); }, actionId: "core.terminal.open_folder" },
  {},
  { get label() { return tr("ctx.info"); }, actionId: "core.file.info" },
];

export interface CtxMenuState {
  /** 화면 좌표(마우스 위치). */
  x: number;
  y: number;
  /** 커서가 있는 최상위 항목. */
  cursor: number;
  /** 하위 메뉴가 열려 있으면 그 안의 커서. */
  subCursor: number | null;
}

const selectableIn = (items: readonly CtxItem[]) => items.flatMap((it, i) => (it.label ? [i] : []));

/** Actions Panel에 나열되는 액션 한 줄. App이 레지스트리와 키맵에서 만든다. */
export interface CatalogItem {
  id: string;
  title: string;
  category: string;
  /** 사용자에게 보일 키 표기(없으면 빈 문자열). */
  keys: string;
  /** 지금 컨텍스트에서 실행할 수 있는가. */
  applicable: boolean;
}

/** 도움말(단축키 목록) 화면의 검색어 (이슈 #56). */
/** 설정 > 업데이트 탭의 상태. 확인은 수동으로만 한다. */
export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "latest" }
  | { kind: "available"; info: UpdateInfoDto }
  | { kind: "installing"; info: UpdateInfoDto }
  | { kind: "error"; message: string };

export interface HelpState {
  query: string;
}

/** 파일 목록 안에서 바로 하는 이름 변경(이슈 #65). 대상은 목록 위치가 아니라 경로로 기억한다(편집 중 목록이 다시 읽혀도 따라간다). */
export interface RenameState {
  pane: PaneId;
  tabId: number;
  path: string;
  /** 입력칸의 현재 값. */
  value: string;
  /** 이름을 바꾸는 중이면 true. 그동안 들어온 저장·이동은 무시한다(↑/↓를 누르고 있어도 겹치지 않게). */
  busy: boolean;
}

export interface PaletteState {
  query: string;
  cursor: number;
  /** Alt를 누르고 있는 동안 액션 ID를 보여 준다 (ACT-01). */
  showIds: boolean;
}

/** 질의로 걸러 정렬한 Actions Panel 목록. 제목, ID, 분류에서 찾는다. */
export function filterCatalog(items: readonly CatalogItem[], query: string): CatalogItem[] {
  return rankBy(items, query, (i) => [i.title, i.id, `${i.category} ${i.title}`]);
}

export interface PreviewState {
  path: string;
  name: string;
  /** 폴더 미리보기(하위 항목 트리). 폴더 이름이 `.stl` 같아도 3D 모델로 보지 않게 한다. */
  isDir?: boolean;
  status: "loading" | "ready" | "error";
  data?: PreviewDto;
  error?: string;
}

/** 미리보기 안의 텍스트 편집 (이슈 #38). `text`는 편집 상자의 값(줄바꿈은 LF)이고, `base`는 마지막으로 저장했거나 처음 읽은 값이다. */
export interface PreviewEdit {
  path: string;
  text: string;
  base: string;
  /** 파일의 원래 줄바꿈. 저장할 때 되돌린다. */
  eol: Eol;
  /** 편집을 시작하거나 마지막으로 저장했을 때 본 파일의 크기·수정 시각(저장 시 밖에서 바뀌었는지 비교한다). */
  expected: ExpectedFileDto;
  /** 저장 직후 잠깐 "저장됨"을 보이는 동안 true. */
  saved: boolean;
}

export interface AppState {
  panes: Record<PaneId, PaneState>;
  activePane: PaneId;
  /** 왼쪽 패널이 차지하는 너비 비율(0~1). 화면 크기가 바뀌어도 비율이 유지된다. */
  split: number;
  /** 미리보기 창의 위치·크기(px). null이면 기본 크기로 가운데에 띄운다. */
  previewRect: PreviewRect | null;
  /** 최근 위치(두 패널 공용, 오래된 것부터). 저장하고 다시 열 때 복원한다. */
  recent: string[];
  showHidden: boolean;
  /** 선택해서 계산한 폴더의 하위 용량(바이트). null은 계산 중·대기 중이고, 없으면 계산하지 않은 폴더다. */
  dirSizes: Record<string, number | null>;
  dialog: DialogState | null;
  /** 열려 있는 미리보기 (VIEW-01). */
  preview: PreviewState | null;
  /** 미리보기에서 편집 중인 텍스트. 편집 중이 아니면 null. */
  previewEdit: PreviewEdit | null;
  /** 미리보기(epub 챕터·HWP 쪽)에서 보고 있는 시트. 둘 이상인 파일을 보고 있을 때만 있다. */
  previewSheet: { path: string; index: number; count: number } | null;
  /** 진행 중인 드래그(행을 끌어 다른 폴더·패널에 놓기). 없으면 null. */
  drag: DragState | null;
  /** 탭을 끌고 있을 때 놓일 반대쪽 패널(그 패널의 탭 줄이 놓일 곳으로 표시된다). 없으면 null. */
  tabDropTarget: PaneId | null;
  /** 열려 있는 Actions Panel. */
  palette: PaletteState | null;
  /** 마지막 검색어. 다시 열면 이어서 보이고, 재시작 복원의 대상이다 (PANE-05). */
  lastPaletteQuery: string;
  /** 열려 있는 팝업 메뉴 (Volumes/Favorites/Recent/Hierarchy). */
  menu: MenuState | null;
  ctxMenu: CtxMenuState | null;
  userDirs: UserDirsDto;
  /** 작업 큐 스냅샷 (끝난 작업은 팝업을 닫을 때까지 남는다). */
  queue: JobDto[];
  queueOpen: boolean;
  /** 설정 화면이 열려 있는지, 어느 섹션인지, 마지막 저장 오류. */
  /** 마운트된 볼륨 목록(드라이브 바). */
  volumes: VolumeDto[];
  /** 저장된 SMB 서버 항목마다 지금 마운트된 위치(항목 순서, 마운트돼 있지 않으면 null). SMB 탭의 아이콘·색에 쓴다(이슈 #92·#93). */
  smbMounts: (string | null)[];
  /** 패널별 현재 볼륨의 용량. 알 수 없으면 null. */
  diskSpace: Record<PaneId, DiskSpaceDto | null>;
  directorySyncOpen: boolean;
  settingsOpen: boolean;
  /** 설정이 떠 있는 패널(열 때의 활성 패널). 설정은 그 패널 자리에 뜬다. */
  settingsPane: PaneId;
  /** 도움말(단축키 목록) 화면. 닫혀 있으면 null. */
  help: HelpState | null;
  /** 목록 안에서 이름을 바꾸는 중인 항목. 아니면 null. */
  rename: RenameState | null;
  /** 파일 찾기 다이얼로그. 닫혀 있으면 null. `error`는 시작을 거부당한 이유(잘못된 정규식 등). */
  find: { form: FindForm; error: string | null } | null;
  /** 직전에 시작한 파일 찾기 조건("마지막 검색"). 메모리에만 보관한다. */
  lastFind: FindForm | null;
  settingsSection: number;
  settingsError: string | null;
  /** 연결 중인 SMB 서버 항목 번호. 그동안 같은 항목은 다시 연결하지 않고, 메뉴에 "연결 중…"으로 보인다. */
  smbConnecting: number[];
  /** 연결 중인 원격(SFTP·FTP) 서버 항목 번호. `smbConnecting`과 같은 방식이다. */
  remoteConnecting: number[];
  /** 설정 파일 저장 경로. 설정 화면이 열릴 때 읽는다. */
  configLocation: ConfigLocationDto | null;
  /** 지금 앱 버전. 설정 화면이 열릴 때 읽는다. */
  appVersion: string | null;
  update: UpdateState;
  queueCursor: number;
  /** 설정 파일에서 읽은 설정·키바인딩·경고. 로딩 전에는 내장 기본값. */
  loaded: Loaded;
  /** 키바인딩 병합 중 나온 경고 (App이 채운다). */
  keymapWarnings: string[];
  /** 성공 알림 (경로 복사 등). 몇 초 뒤 사라진다. */
  flash: string | null;
  /** 폴더 트리 경계를 끄는 동안의 너비(px). 끄지 않을 때는 null이고 설정 값을 쓴다(놓을 때 설정에 저장한다). */
  treeWidthDraft: number | null;
  /** 명령어 줄로 포커스를 옮기라는 요청 횟수. 늘어날 때마다 줄이 입력칸에 포커스를 준다. */
  commandLineFocus: number;
  /** 마지막 작업 오류. 다음 작업이 시작되면 지워진다. */
  notice: string | null;
}

export const PAGE_SIZE = 10;
const VIRTUAL_NO_CREATE = () => tr("store.virtual.no_create");
/** 켜 둔 동안 업데이트를 자동으로 확인하는 간격: 하루(이슈 #122). */
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** 삭제·휴지통·압축은 이 시간을 넘겨 계속 실행 중일 때만 진행 창을 띄운다(자주 쓰는 작업이라 깜빡이지 않게). */
const TRANSFER_PROGRESS_DELAY_MS = 300;
/** 확인 창을 거친 복사·이동은 기다리지 않는다: 첫 조회에서 아직 진행 중이면 바로 진행 창을 띄운다. */
const TRANSFER_PROGRESS_DELAY_COPY_MS = 0;
/** 전송이 끝날 때까지 큐를 직접 조회하는 간격. */
const TRANSFER_POLL_MS = 100;
const VIRTUAL_NO_DEST = () => tr("store.virtual.no_dest");
/** 상태 저장을 미루는 시간(디바운스). */
export const SAVE_DELAY_MS = 400;
/** 저장하는 선택 항목 수의 상한. 폴더 전체 선택(수만 개)이 스냅샷을 키우지 않게 한다. */
export const SELECTION_SAVE_LIMIT = 5000;

/** 탭의 실제 정렬: 탭 설정 > 컬럼 명세의 정렬 표시 > 이름 오름차순. */
export function effectiveSort(tab: TabState, columns: readonly string[]): SortState {
  return tab.sort ?? sortFromColumns(parseColumns(columns)) ?? DEFAULT_SORT;
}

/** 수정일 구간 그룹핑이 이 탭에 적용되는가(이슈 #62): 설정이 켜져 있고, 실제 폴더이고, 단일 컬럼 목록 보기일 때만이다. */
export function groupingActive(tab: Pick<TabState, "virtual">, enabled: boolean): boolean {
  return enabled && !tab.virtual;
}

/** 정렬한 항목을 수정일 구간 순서(최신 구간이 위)로 안정하게 다시 배열한다. 구간 안은 정렬 순서를 그대로 따른다. */
function groupByModified<T extends { modifiedMs: number | null }>(entries: T[], now = Date.now()): T[] {
  const rank = new Map(entries.map((e) => [e, dateGroup(e.modifiedMs, now).rank]));
  return [...entries].sort((a, b) => rank.get(a)! - rank.get(b)!);
}
export const SPLIT_MIN = 0.15;
/** 폴더 트리 너비(px)의 허용 범위와 기본값. */
export const TREE_WIDTH_MIN = 120;
export const TREE_WIDTH_MAX = 600;
export const TREE_WIDTH_DEFAULT = 224;
export const clampTreeWidth = (px: number) => Math.min(TREE_WIDTH_MAX, Math.max(TREE_WIDTH_MIN, Number.isFinite(px) ? Math.round(px) : TREE_WIDTH_DEFAULT));
const clampSplit = (r: number) => Math.min(1 - SPLIT_MIN, Math.max(SPLIT_MIN, Number.isFinite(r) ? r : 0.5));

const other = (p: PaneId): PaneId => (p === "left" ? "right" : "left");

/** 화면에 그려진 treemap의 타일 배치(패널별). 방향키 이동이 보이는 대로 이웃을 고르도록 UsageTreemap이 알려 준다. */
const usageTiles: Partial<Record<PaneId, Tile[]>> = {};
export function publishUsageTiles(pane: PaneId, tiles: Tile[] | undefined) {
  usageTiles[pane] = tiles;
}
const isTreemap = (tab: TabState) => tab.virtual?.kind === "usage" && tab.virtual.view === "treemap";

export const isActiveJob = (j: JobDto) => ["queued", "running", "paused"].includes(j.status);

export function activeTab(s: AppState, pane: PaneId = s.activePane): TabState {
  const p = s.panes[pane];
  return p.tabs[p.active];
}

/** 탭이 실제로 보고 있는 위치. 가상 탭은 검색을 시작한 위치를 돌려준다. */
export const hereOf = (tab: TabState): string => tab.virtual?.base ?? tab.path;

export function cursorEntry(tab: TabState): EntryDto | undefined {
  return tab.entries[tab.cursor];
}

/** 선택이 있으면 선택 항목(목록 순서), 없으면 커서 항목이 작업 대상이다. */
export function targetsOf(tab: TabState): EntryDto[] {
  if (tab.selection.size > 0) return tab.entries.filter((e) => tab.selection.has(e.path));
  const c = cursorEntry(tab);
  return c ? [c] : [];
}

/** 폴더처럼 들어갈 수 있는 항목인지: 폴더이거나, 폴더를 가리키는 심볼릭 링크다(`kind`는 링크 그대로 남는다). */
export function isFolderEntry(e: EntryDto | undefined): boolean {
  return e?.kind === "dir" || (e?.kind === "symlink" && e.linkIsDir);
}

/** 파일이면서 이름이 압축 파일(아카이브)인 항목인지. */
function isArchiveEntry(e: EntryDto | undefined, extraExts: string[]): boolean {
  return e?.kind === "file" && isArchiveName(e.name, extraExts);
}

/** `..` 상위 폴더 행을 보이는가: 옵션이 켜져 있고, 가상 탭이 아니며, 상위 폴더가 있을 때. 이 행은 커서 위치 `-1`이고 `entries`에는 들지 않는다. */
export const parentRowVisible = (tab: TabState, enabled: boolean): boolean => enabled && !tab.virtual && parentPath(tab.path) !== null;

/** 원격 경로의 연결 id로 설정의 서버 항목 순번을 찾는다. 원격 경로가 아니거나 설정에서 지워졌으면 -1. */
export function remoteIndexOf(s: AppState, path: string): number {
  const loc = splitRemote(path);
  if (!loc) return -1;
  return (s.loaded.config.remote.servers ?? []).findIndex((v) => remoteServerId(v) === loc.id && (v.protocol === "ftp" ? "ftp" : "sftp") === loc.scheme);
}

export function actionContext(s: AppState): ActionContext {
  const tab = activeTab(s);
  return {
    hasCursorItem: !!cursorEntry(tab),
    terminalTab: tab.virtual?.kind === "terminal",
    remoteDisconnected: (!tab.virtual && isRemotePath(tab.path) && isRemoteDisconnected(tab.error)) || (tab.virtual?.kind === "terminal" && !!tab.virtual.disconnected),
    onRemote: !tab.virtual && isRemotePath(tab.path),
    onParentRow: tab.cursor < 0 && parentRowVisible(tab, s.loaded.config.behavior.table.show_parent_row),
    selectedCount: tab.selection.size,
    tabCount: s.panes[s.activePane].tabs.length,
    canGoUp: tab.virtual?.kind === "usage" && tab.virtual.view === "treemap" ? parentPath(tab.virtual.base) !== null : !tab.virtual && parentPath(tab.path) !== null,
    canGoBack: !tab.virtual && tab.back.length > 0,
    canGoForward: !tab.virtual && tab.forward.length > 0,
    cursorIsDir: cursorEntry(tab)?.kind === "dir",
    cursorIsArchive: isArchiveEntry(cursorEntry(tab), s.loaded.config.file_systems.zip.additional_extensions),
    virtualTab: !!tab.virtual,
    searching: !!tab.virtual?.running,
    usageTab: tab.virtual?.kind === "usage",
  };
}

export function scopeStack(s: AppState): Scope[] {
  if (s.dialog) return ["dialog", "pane", "global"];
  // 목록 안 이름 변경: 글자는 입력칸이 받고, Return·Esc·↑/↓만 rename 스코프가 받는다(모달).
  if (s.rename) return ["rename"];
  // 설정 화면은 활성 패널 자리에 뜨지만 키는 설정이 받는다(settings 스코프).
  if (s.settingsOpen) return ["settings", "global"];
  // 도움말(단축키 목록)도 메인 창을 덮는 모달이다(help 스코프).
  if (s.help) return ["help", "global"];
  // 파일 찾기 다이얼로그도 모달이다(find 스코프).
  if (s.find) return ["find", "global"];
  if (s.directorySyncOpen) return ["dialog"];
  // Actions Panel은 입력창이 있는 모달이다(palette 스코프).
  if (s.palette) return ["palette", "global"];
  // 미리보기가 열려 있으면 패널 키는 받지 않는다(preview 스코프).
  if (s.preview) return ["preview", "global"];
  // 팝업 메뉴와 컨텍스트 메뉴는 모달이다(panel 스코프).
  if (s.menu || s.ctxMenu) return ["panel", "global"];
  // 큐 팝업이 열려 있으면 패널 키는 받지 않는다.
  if (s.queueOpen) return ["queue", "global"];
  // 활성 탭이 터미널이면 키는 pty로 간다. 새 터미널·탭 조작 키만 앱이 받는다(terminal 스코프).
  if (activeTab(s).virtual?.kind === "terminal") return ["terminal"];
  return activeTab(s).quick !== null ? ["quickSelect", "pane", "global"] : ["pane", "global"];
}

export function createAppStore(backend: Backend, leftPath: string, rightPath: string, snapshot?: Snapshot | null) {
  let nextTabId = 1;
  const newTab = (path: string): TabState => ({
    id: nextTabId++,
    sort: null,
    path,
    history: [path],
    back: [],
    forward: [],
    entries: [],
    cursor: 0,
    selection: new Set(),
    error: null,
    quick: null,
  });

  /** 저장된 탭 하나를 탭 상태로 되살린다. 목록과 커서는 첫 조회 때 채워진다. */
  const restoreTab = (t: TabSnap): TabState => ({
    ...newTab(t.path),
    selection: new Set(t.selection),
    sort: t.sort && (SORT_KEYS as readonly string[]).includes(t.sort.key) && (t.sort.dir === "asc" || t.sort.dir === "desc")
      ? { key: t.sort.key as SortKey, dir: t.sort.dir }
      : null,
    restoreCursor: t.cursorName ?? undefined,
  });

  const store = createStore<AppState>(() => ({
    panes: snapshot
      ? {
          left: { tabs: snapshot.left.tabs.map(restoreTab), active: snapshot.left.active },
          right: { tabs: snapshot.right.tabs.map(restoreTab), active: snapshot.right.active },
        }
      : {
          left: { tabs: [newTab(leftPath)], active: 0 },
          right: { tabs: [newTab(rightPath)], active: 0 },
        },
    activePane: snapshot?.activePane === "right" ? "right" : "left",
    split: clampSplit((snapshot?.split ?? 500) / 1000),
    previewRect: snapshot?.previewRect ?? null,
    recent: snapshot?.recent ?? [],
    showHidden: snapshot?.showHidden ?? false,
    dirSizes: {},
    dialog: null,
    preview: null,
    drag: null,
    tabDropTarget: null,
    palette: null,
    lastPaletteQuery: snapshot?.paletteQuery ?? "",
    menu: null,
    ctxMenu: null,
    userDirs: { home: null, downloads: null, documents: null, desktop: null, pictures: null, music: null, movies: null },
    queue: [],
    queueOpen: false,
    volumes: [],
    smbMounts: [],
    diskSpace: { left: null, right: null },
    settingsOpen: false,
    settingsPane: "left",
    previewEdit: null,
    previewSheet: null,
    help: null,
    rename: null,
    directorySyncOpen: false,
    find: null,
    lastFind: null,
    settingsSection: 0,
    settingsError: null,
    smbConnecting: [],
    remoteConnecting: [],
    configLocation: null,
    appVersion: null,
    update: { kind: "idle" },
    queueCursor: 0,
    loaded: defaultLoaded(),
    keymapWarnings: [],
    flash: null,
    treeWidthDraft: null,
    commandLineFocus: 0,
    notice: null,
  }));
  const { getState: get, setState: set } = store;

  const patchTab = (pane: PaneId, tabId: number, patch: Partial<TabState> | ((t: TabState) => Partial<TabState>)) =>
    set((s) => {
      const p = s.panes[pane];
      const tabs = p.tabs.map((t) => (t.id === tabId ? { ...t, ...(typeof patch === "function" ? patch(t) : patch) } : t));
      return { panes: { ...s.panes, [pane]: { ...p, tabs } } };
    });
  const patchActive = (patch: Partial<TabState> | ((t: TabState) => Partial<TabState>)) => {
    const s = get();
    patchTab(s.activePane, activeTab(s).id, patch);
  };

  /** 목록을 다시 읽는다. 커서는 이름으로, 선택은 남아 있는 경로로 유지한다. `focusName`이 있으면 커서를 그 이름에 둔다. */
  const reloadSeq = new Map<string, number>();
  /** 폴더 `dir`를 다시 읽었을 때: 그 안의 직계 폴더들에 계산해 둔 하위 용량을 지운다(내용이 달라졌을 수 있다). */
  function forgetDirSizesIn(dir: string) {
    const stale = Object.keys(get().dirSizes).filter((p) => parentPath(p) === dir && get().dirSizes[p] !== null);
    if (stale.length === 0) return;
    set((s) => {
      const next = { ...s.dirSizes };
      for (const p of stale) delete next[p];
      return { dirSizes: next };
    });
  }

  /**
   * 설정의 `index`번째 원격 서버에 연결하고 그 루트 경로(`sftp://<id>/..`)를 돌려준다. 취소하거나 실패하면 알리고 `null`을 돌려준다.
   * 먼저 저장된 비밀번호(키체인)로 시도하고, 인증이 필요하거나 틀리면 비밀번호를 물어 다시 시도한다(취소하면 그만둔다).
   * 연결 중에도 UI는 막지 않고, 같은 항목은 끝날 때까지 다시 연결하지 않는다(`remoteConnecting`).
   * 이미 연결돼 있고 살아 있으면 그대로 루트를 돌려주고, 끊긴 세션은 Rust가 버리고 새로 접속한다(이슈 #98).
   * `connectRemote`(패널을 옮긴다)와 `reconnectRemote`(끊긴 탭을 되살린다)가 같이 쓴다.
   * `silent`(자동 재연결, 이슈 #108)이면 저장된 비밀번호와 이미 신뢰한 호스트 키로만 시도한다: 창을 띄우거나 알리지 않고, 묻는 것이 필요하면 `null`이다.
   */
  async function openRemoteConnection(index: number, silent = false): Promise<string | null> {
    const server = get().loaded.config.remote.servers?.[index];
    if (!server || get().remoteConnecting.includes(index)) return null;
    set((s) => ({ notice: silent ? s.notice : null, remoteConnecting: [...s.remoteConnecting, index] }));
    // 알리고 멈춘다(연결하지 못했다는 뜻으로 `null`).
    const stop = (e: unknown): null => {
      if (!silent) fail(e);
      return null;
    };
    // 백엔드는 항목을 순번으로 찾는다. 기다리는 사이 목록이 바뀌어 이 순번이 다른 서버가 되면 비밀번호를 엉뚱한 서버로 보내지 않도록 멈춘다.
    const changed = () => {
      const now = get().loaded.config.remote.servers?.[index];
      return !now || now.protocol !== server.protocol || remoteServerId(now) !== remoteServerId(server);
    };
    try {
      let password: string | null = null;
      let remember = false;
      let approvedHostKey: string | undefined;
      for (;;) {
        if (changed()) return stop(tr("store.remote.changed"));
        try {
          const root = await backend.remoteConnect(index, password, remember, approvedHostKey);
          autoReconnectSpent.delete(remoteServerId(server));
          return root;
        } catch (e) {
          if (silent) return null;
          if (e instanceof HostKeyError) {
            const k = e.key;
            if (k.previousFingerprint) return stop(tr("store.remote.hostkey_changed", { host: k.host, port: k.port, algorithm: k.algorithm, previous: k.previousFingerprint, fingerprint: k.fingerprint }));
            if (get().dialog || changed()) return stop(tr("store.remote.hostkey_unfinished"));
            const answer = await ask<boolean>({
              kind: "hostKey", title: tr("sftp.trust.title"), host: k.host, port: k.port,
              algorithm: k.algorithm, fingerprint: k.fingerprint, confirmed: false,
            });
            if (answer !== true || changed()) return null;
            approvedHostKey = k.publicKey;
            continue;
          }
          // 다른 창이 떠 있으면 그 창의 응답을 가로채지 않도록 묻지 않고 오류로 알린다.
          if (!(e instanceof RemoteConnectError) || e.kind !== "auth" || get().dialog) return stop(e);
          if (changed()) return stop(tr("store.remote.changed"));
          const answer: { value: string; remember: boolean } | null = await ask<{ value: string; remember: boolean }>({
            kind: "password",
            title: tr("store.remote.password_title", { name: server.name }),
            value: "",
            remember,
            error: password === null ? null : tr("store.remote.password_wrong"),
          });
          if (answer === null) return null;
          password = answer.value;
          remember = answer.remember;
        }
      }
    } finally {
      set((s) => ({ remoteConnecting: s.remoteConnecting.filter((i) => i !== index) }));
    }
  }

  /** 자동 재연결(이슈 #108): 연결 id별로 진행 중인 시도, 그리고 이번 끊김에 이미 시도했다가 실패한 id. 다시 연결에 성공하면 풀린다. */
  const autoReconnects = new Map<string, Promise<boolean>>();
  const autoReconnectSpent = new Set<string>();
  /**
   * 끊긴 연결 `id`에 묻지 않고 한 번 다시 접속한다. 성공하면 그 연결을 보는 모든 탭을 다시 읽고 참을 돌려준다.
   * 설정이 꺼져 있거나, 이번 끊김에 이미 시도했거나, 저장된 비밀번호·신뢰한 호스트 키로 안 되면 거짓이다(탭에는 "다시 연결" 버튼이 남는다).
   */
  function autoReconnect(id: string): Promise<boolean> {
    if (!cfg().remote.auto_reconnect || autoReconnectSpent.has(id)) return Promise.resolve(false);
    const running = autoReconnects.get(id);
    if (running) return running;
    const attempt = (async () => {
      const index = (cfg().remote.servers ?? []).findIndex((v) => remoteServerId(v) === id);
      if (index < 0 || (await openRemoteConnection(index, true)) === null) {
        autoReconnectSpent.add(id);
        return false;
      }
      for (const p of ["left", "right"] as const) {
        for (const t of get().panes[p].tabs) {
          if (!t.virtual && splitRemote(t.path)?.id === id) await reload(p, t.id);
        }
      }
      return true;
    })().finally(() => autoReconnects.delete(id));
    autoReconnects.set(id, attempt);
    return attempt;
  }

  /**
   * 패널의 탭 목록을 다시 읽는다. `keepDirSizes`이면 선택해서 계산해 둔 폴더 용량을 지우지 않는다 — 폴더 내용이 바뀐 것이 아니라
   * 화면 설정이 바뀌어 다시 읽을 때(`onConfigChanged`)가 그렇다.
   */
  async function reload(pane: PaneId, tabId: number, focusName?: string, keepDirSizes = false) {
    const tab = get().panes[pane].tabs.find((t) => t.id === tabId);
    if (!tab) return;
    if (tab.virtual) return revalidateVirtual(pane, tab);
    const keepName = focusName ?? tab.restoreCursor ?? cursorEntry(tab)?.name;
    // 조회가 겹치면 나중에 시작한 것만 반영한다(느리게 도착한 옛 목록이 최신 목록을 덮어쓰지 않도록).
    const key = `${pane}:${tabId}`;
    const seq = (reloadSeq.get(key) ?? 0) + 1;
    reloadSeq.set(key, seq);
    try {
      const listed = await backend.listDir(tab.path, get().showHidden);
      if (reloadSeq.get(key) !== seq) return;
      patchTab(pane, tabId, (t) => {
        const sorted = sortEntries(listed, effectiveSort(t, cfg().view.table.columns));
        const entries = groupingActive(t, cfg().behavior.table.group_by_modified) ? groupByModified(sorted) : sorted;
        const idx = keepName ? entries.findIndex((e) => e.name === keepName) : -1;
        const paths = new Set(entries.map((e) => e.path));
        return {
          entries,
          error: null,
          restoreCursor: undefined,
          // 항목이 하나도 없으면 `..` 행(켜져 있을 때)에 둔다 — 갈 곳이 그것뿐이다.
          cursor: idx >= 0 ? idx : entries.length === 0 && parentRowVisible(t, cfg().behavior.table.show_parent_row) ? -1 : Math.min(t.cursor, Math.max(entries.length - 1, 0)),
          selection: new Set([...t.selection].filter((p) => paths.has(p))),
        };
      });
      if (!keepDirSizes) forgetDirSizesIn(tab.path);
    } catch (e) {
      if (reloadSeq.get(key) !== seq) return;
      const message = String(e instanceof Error ? e.message : e);
      // 끊긴 원격 탭이면 먼저 묻지 않고 한 번 다시 접속해 본다. 성공하면 그 연결의 탭을 모두 다시 읽었으므로 여기서는 끝낸다.
      const id = isRemoteDisconnected(message) ? splitRemote(tab.path)?.id : undefined;
      if (id && (await autoReconnect(id))) {
        if (reloadSeq.get(key) === seq) await reload(pane, tabId, focusName, keepDirSizes);
        return;
      }
      if (reloadSeq.get(key) !== seq) return;
      patchTab(pane, tabId, { entries: [], cursor: 0, selection: new Set(), error: message });
    }
  }

  /** 이 Disk Usage 탭이 `path` 폴더를 기준으로 스캔을 (다시) 시작한다. 항목은 비우고 제목은 `path`의 이름으로 맞춘다. */
  async function startUsageScan(pane: PaneId, tab: TabState, path: string) {
    stopSearch(tab);
    let id: number;
    try {
      id = await backend.startDiskUsage(path);
    } catch (e) {
      return fail(e);
    }
    patchTab(pane, tab.id, (t) => ({
      entries: [],
      cursor: 0,
      virtual: t.virtual && { ...t.virtual, title: `Disk Usage: ${baseName(path) || path}`, base: path, jobId: id, running: true, cancelled: false, summary: null, totalBytes: 0, warnings: [], stale: false },
    }));
    for (const e of earlySearchEvents.get(id) ?? []) applySearchEvent(pane, tab.id, e);
    earlySearchEvents.delete(id);
  }

  /**
   * 가상 탭: 삭제/이동/휴지통을 보낸 경로가 실제로 사라졌으면 결과에서 뺀다. 작업이 모두 끝나면 확인을 멈춘다.
   * Disk Usage는 항목을 뺀 것만으로는 합계·크기·treemap이 옛 값이라, 작업이 모두 끝나면 같은 폴더를 다시 스캔한다.
   */
  async function revalidateVirtual(pane: PaneId, tab: TabState) {
    const v = tab.virtual!;
    if (v.recheck.length === 0 && !v.stale) return;
    const gone = new Set<string>();
    for (const path of v.recheck) {
      try {
        await backend.fileInfo(path);
      } catch {
        gone.add(path);
      }
    }
    const idle = !get().queue.some(isActiveJob);
    patchTab(pane, tab.id, (t) => {
      if (!t.virtual) return {};
      const entries = t.entries.filter((e) => !gone.has(e.path));
      const cursorName = t.entries[t.cursor]?.name;
      const idx = cursorName ? entries.findIndex((e) => e.name === cursorName) : -1;
      return {
        entries,
        cursor: idx >= 0 ? idx : Math.min(t.cursor, Math.max(entries.length - 1, 0)),
        selection: new Set([...t.selection].filter((p) => !gone.has(p))),
        virtual: { ...t.virtual, recheck: idle ? [] : t.virtual.recheck.filter((p) => !gone.has(p)), stale: t.virtual.kind === "usage" && (t.virtual.stale || gone.size > 0) },
      };
    });
    if (!idle) return;
    const now = get().panes[pane].tabs.find((t) => t.id === tab.id);
    if (now?.virtual?.kind === "usage" && now.virtual.stale) {
      // 겹쳐 불린 revalidate가 스캔을 두 번 시작하지 않게, 시작을 기다리기 전에 표시부터 내린다.
      patchTab(pane, tab.id, (t) => ({ virtual: t.virtual && { ...t.virtual, stale: false } }));
      await startUsageScan(pane, now, now.virtual.base);
    }
  }

  const watched = new Set<string>();
  async function syncWatches() {
    const s = get();
    const wanted = new Set(
      Object.values(s.panes).flatMap((p) => p.tabs.filter((t) => !t.virtual).map((t) => t.path)),
    );
    for (const p of wanted) {
      if (!watched.has(p)) {
        watched.add(p);
        await backend.watch(p).catch(() => watched.delete(p));
      }
    }
    for (const p of [...watched]) {
      if (!wanted.has(p)) {
        watched.delete(p);
        await backend.unwatch(p).catch(() => {});
      }
    }
  }

  /**
   * 이 볼륨 안에 있는 모든 탭(양쪽 패널, 배경 탭 포함)을 첫 번째 볼륨으로 옮기고 그 안의 폴더 감시를 푼다.
   * Windows는 앱이 열어 둔 드라이브를 "사용 중"이라며 꺼내 주지 않으므로 언마운트 전에 해야 한다.
   */
  async function leaveVolume(mountPoint: string) {
    const dest = get().volumes.find((v) => v.mountPoint !== mountPoint)?.mountPoint ?? get().userDirs.home ?? "/";
    for (const p of ["left", "right"] as const) {
      const pn = get().panes[p];
      for (const [i, t] of pn.tabs.entries()) {
        if (t.virtual || !isInside(t.path, mountPoint)) continue;
        if (i === pn.active) await api.navigate(dest, undefined, "push", p);
        else {
          patchTab(p, t.id, { path: dest, history: [...t.history, dest], back: [], forward: [], cursor: 0, selection: new Set(), quick: null, entries: [] });
          await reload(p, t.id);
        }
      }
    }
    await syncWatches();
  }

  const reloadAll = (keepDirSizes = false) => {
    // 복사·이동·삭제로 남은 용량이 달라졌을 수 있다.
    void refreshDiskSpace("left");
    void refreshDiskSpace("right");
    return Promise.all((["left", "right"] as const).flatMap((pane) => get().panes[pane].tabs.map((t) => reload(pane, t.id, undefined, keepDirSizes))));
  };

  /**
   * 백엔드·스토어 구독 목록. `dispose()`가 모두 끊고 `init()`이 다시 만든다.
   * React StrictMode(개발 모드)는 효과를 마운트 → 정리(dispose) → 마운트(init)로 두 번 실행하는데, 구독을 한 번만 만들면
   * 정리 단계에서 끊긴 뒤 되살아나지 않아 디렉터리·설정·검색 이벤트와 자동 저장이 모두 죽는다.
   */
  const subscriptions: { make: () => () => void; off: (() => void) | null }[] = [];
  const subscribe = (make: () => () => void) => subscriptions.push({ make, off: make() });
  const resubscribe = () => {
    for (const sub of subscriptions) sub.off ??= sub.make();
  };

  /** 패널의 활성 탭이 놓인 볼륨의 용량을 다시 읽는다. 가상 탭이거나 조회에 실패하면 null(오류는 알리지 않는다). */
  const diskSeq: Record<PaneId, number> = { left: 0, right: 0 };
  async function refreshDiskSpace(pane: PaneId) {
    const tab = activeTab(get(), pane);
    const seq = ++diskSeq[pane];
    let value: DiskSpaceDto | null = null;
    if (!tab.virtual) {
      try {
        value = await backend.diskSpace(tab.path);
      } catch {
        value = null;
      }
    }
    if (seq !== diskSeq[pane]) return;
    set((s) => ({ diskSpace: { ...s.diskSpace, [pane]: value } }));
  }
  // 패널의 활성 탭 위치가 바뀌면(이동, 탭 전환, 복원) 그 볼륨의 용량을 다시 읽는다.
  const spacePath: Record<PaneId, string | null> = { left: null, right: null };
  subscribe(() => store.subscribe((s) => {
    for (const pane of ["left", "right"] as const) {
      const t = activeTab(s, pane);
      const key = t.virtual ? "" : t.path;
      if (key !== spacePath[pane]) {
        spacePath[pane] = key;
        void refreshDiskSpace(pane);
      }
    }
  }));

  // 선택한 폴더의 하위 용량 계산(옵션 `display.folder_size_on_select`). 폴더를 선택하면 백그라운드에서 한 번에 하나씩 순서대로 계산하고,
  // 선택을 풀거나 폴더를 벗어나면 진행 중·대기 중 계산을 멈춘다. 끝난 크기는 그 폴더 목록을 다시 읽기 전까지 남는다.
  const dirSizeQueue: string[] = [];
  let dirSizeRunning: string | null = null;
  let dirSizeInputs: unknown[] = [];
  // 복사·이동이 시작되면(확인 뒤 `runTransfer`가 도는 동안과 그 작업이 끝날 때까지) 새 계산을 시작하지 않고 진행 중·대기 중 계산도 멈춘다(이슈 #81).
  let transfersStarting = 0;
  const transferBusy = (s: AppState) => transfersStarting > 0 || s.queue.some((j) => (j.kind === "copy" || j.kind === "move") && isActiveJob(j));
  function wantedDirSizes(s: AppState): string[] {
    if (!s.loaded.config.display.folder_size_on_select || transferBusy(s)) return [];
    const out: string[] = [];
    for (const pane of ["left", "right"] as const) {
      const t = activeTab(s, pane);
      if (t.virtual || isArchivePath(t.path) || isRemotePath(t.path) || t.selection.size === 0) continue;
      for (const e of t.entries) if (e.kind === "dir" && t.selection.has(e.path)) out.push(e.path);
    }
    return out;
  }
  function syncDirSizes(s: AppState) {
    // 목록·선택·옵션이 그대로면(커서만 움직인 경우 등) 다시 세지 않는다.
    const inputs = [s.loaded.config.display.folder_size_on_select, transferBusy(s), ...(["left", "right"] as const).flatMap((pane) => {
      const t = activeTab(s, pane);
      return [t.entries, t.selection, t.virtual, t.path];
    })];
    if (inputs.length === dirSizeInputs.length && inputs.every((v, i) => v === dirSizeInputs[i])) return;
    dirSizeInputs = inputs;
    const wanted = wantedDirSizes(s);
    const wantedSet = new Set(wanted);
    const drop: string[] = [];
    // 더는 필요 없는 대기 중 계산은 뺀다.
    for (let i = dirSizeQueue.length - 1; i >= 0; i--) {
      if (!wantedSet.has(dirSizeQueue[i])) drop.push(...dirSizeQueue.splice(i, 1));
    }
    // 진행 중인 계산이 필요 없어졌으면 멈춘다(결과는 `pumpDirSizes`가 버린다).
    if (dirSizeRunning !== null && !wantedSet.has(dirSizeRunning)) void backend.cancelDirSize(dirSizeRunning).catch(() => {});
    const queued = new Set(dirSizeQueue);
    const add = wanted.filter((p) => typeof s.dirSizes[p] !== "number" && p !== dirSizeRunning && !queued.has(p) && s.dirSizes[p] !== null);
    dirSizeQueue.push(...add);
    // 옵션이 꺼지면 계산해 둔 크기도 모두 지운다.
    const clearAll = !s.loaded.config.display.folder_size_on_select && Object.keys(s.dirSizes).length > 0;
    if (clearAll || drop.length > 0 || add.length > 0) {
      set((cur) => {
        if (clearAll) return { dirSizes: {} };
        const next = { ...cur.dirSizes };
        for (const p of drop) if (next[p] === null) delete next[p];
        for (const p of add) next[p] = null;
        return { dirSizes: next };
      });
    }
    void pumpDirSizes();
  }
  async function pumpDirSizes() {
    if (dirSizeRunning !== null) return;
    const path = dirSizeQueue.shift();
    if (path === undefined) return;
    dirSizeRunning = path;
    let size: number | null = null;
    try {
      size = await backend.dirSize(path);
    } catch {
      size = null; // 읽지 못한 폴더는 크기 없이 둔다
    }
    dirSizeRunning = null;
    // 계산하는 사이에 같은 폴더를 다시 선택했을 수 있다. 입력 기록을 비워 이번 `set`이 필요한 계산을 다시 세게 한다.
    dirSizeInputs = [];
    set((s) => {
      const next = { ...s.dirSizes };
      if (size !== null && s.loaded.config.display.folder_size_on_select) next[path] = size;
      else delete next[path];
      return { dirSizes: next };
    });
    void pumpDirSizes();
  }
  subscribe(() => store.subscribe((s) => syncDirSizes(s)));

  // 다른 앱(Finder)에서 끌어 온 파일: Tauri가 OS 드롭을 가로채 이벤트로 알린다(이슈 #39).
  subscribe(() => backend.onFileDrop((e) => api.externalDrop(e, typeof document !== "undefined" && document.elementFromPoint ? document.elementFromPoint(e.x, e.y) : null)));
  // 내장 터미널의 셸이 끝나면(exit, Ctrl+D) 패널이 파일 목록으로 돌아온다(이슈 #46).
  // 실행 중인 앱에 `td` 명령이 경로를 넘기면 같은 규칙으로 연다(이슈 #45).
  subscribe(() => backend.onOpenPaths((request) => void api.openPaths(request)));
  subscribe(() => backend.onTerminalEvent((e) => e.type === "exit" && void api.terminalExited(e.id, e.code)));
  subscribe(() => backend.onDirChanged((path) => {
    for (const pane of ["left", "right"] as const) {
      for (const t of get().panes[pane].tabs) if (t.path === path) void reload(pane, t.id);
    }
  }));

  // Look Up / Flatten / Disk Usage 이벤트. 응답(작업 id)보다 이벤트가 먼저 올 수 있어서, 탭이 생기기 전 이벤트는 모아 둔다.
  const earlySearchEvents = new Map<number, SearchEvent[]>();
  const findVirtual = (id: number) => {
    for (const pane of ["left", "right"] as const) {
      const tab = get().panes[pane].tabs.find((t) => t.virtual?.jobId === id);
      if (tab) return { pane, tab };
    }
    return null;
  };
  function applySearchEvent(pane: PaneId, tabId: number, e: SearchEvent) {
    patchTab(pane, tabId, (t) => {
      const v = t.virtual;
      if (!v) return {};
      if (e.type === "chunk") return { entries: [...t.entries, ...e.entries] };
      // 커서가 맨 위이면 정렬/갱신 뒤에도 맨 위에 둔다(사용자가 움직이지 않은 것이다). 아니면 같은 항목을 따라간다.
      if (e.type === "usage") {
        const name = t.cursor > 0 ? t.entries[t.cursor]?.name : undefined;
        const idx = name ? e.items.findIndex((x) => x.name === name) : -1;
        return {
          entries: e.items,
          cursor: idx >= 0 ? idx : Math.min(t.cursor, Math.max(e.items.length - 1, 0)),
          virtual: { ...v, totalBytes: e.totalBytes },
        };
      }
      // done: 스트리밍 중에는 도착 순서대로 두었다가 끝나면 한 번만 정렬한다(Disk Usage는 크기 순서를 그대로 둔다).
      const name = t.cursor > 0 ? t.entries[t.cursor]?.name : undefined;
      const entries = v.kind === "usage" ? t.entries : sortEntries(t.entries, effectiveSort(t, cfg().view.table.columns));
      const idx = name ? entries.findIndex((x) => x.name === name) : -1;
      return {
        entries,
        cursor: idx >= 0 ? idx : Math.min(t.cursor, Math.max(entries.length - 1, 0)),
        virtual: {
          ...v,
          running: false,
          cancelled: e.summary.cancelled,
          summary: e.summary,
          warnings: [...new Set([...v.warnings, ...e.summary.warnings])],
        },
      };
    });
  }
  subscribe(() => backend.onSearchEvent((e) => {
    const hit = findVirtual(e.id);
    if (hit) return applySearchEvent(hit.pane, hit.tab.id, e);
    earlySearchEvents.set(e.id, [...(earlySearchEvents.get(e.id) ?? []), e]);
  }));
  /** 탭이 실행 중인 검색/순회를 취소한다. */
  /** 터미널 탭을 없앤다(세션도 닫는다). 패널의 마지막 탭이면 시작한 폴더를 보는 파일 탭으로 바꾼다. */
  async function removeTerminalTab(pane: PaneId, index: number) {
    const s = get();
    const p = s.panes[pane];
    const tab = p.tabs[index];
    if (tab?.virtual?.kind !== "terminal") return;
    void backend.terminalClose(tab.virtual.jobId).catch(() => {});
    if (p.tabs.length === 1) {
      const file = newTab(tab.virtual.base);
      set({ panes: { ...s.panes, [pane]: { tabs: [file], active: 0 } } });
      await reload(pane, file.id);
    } else {
      const tabs = p.tabs.filter((_, i) => i !== index);
      const active = index === p.active ? Math.min(index, tabs.length - 1) : tabs.indexOf(p.tabs[p.active]);
      set({ panes: { ...s.panes, [pane]: { tabs, active } } });
    }
    await syncWatches();
  }

  const stopSearch = (tab: TabState) => {
    if (tab.virtual?.running) void backend.cancelSearch(tab.virtual.jobId).catch(() => {});
  };

  /** 다이얼로그를 열고 사용자의 결정을 기다린다. 취소하면 null. */
  let pending: ((value: unknown) => void) | null = null;
  /** 설정 파일 저장 경로를 바꾼다(null = 기본 위치). 새 폴더에 이미 설정이 있으면 그 설정을 쓸지 지금 설정으로 덮어쓸지 묻는다. */
  async function changeConfigLocation(dir: string | null) {
    const loc = get().configLocation ?? (await backend.getConfigLocation());
    const target = dir ?? loc.defaultDir;
    if (target === loc.dir) return;
    let conflict: LocationConflict = "useExisting";
    if (await backend.configLocationHasFiles(target)) {
      const choice = await ask<number>({
        kind: "choice",
        title: tr("store.config_location.exists.title"),
        lines: [target, tr("store.config_location.exists.line")],
        choices: [tr("store.config_location.use_existing"), tr("store.config_location.overwrite")],
        selected: 0,
      });
      if (choice === null) return;
      conflict = choice === 0 ? "useExisting" : "overwrite";
    }
    const loaded = await backend.setConfigLocation(dir, conflict);
    set({ loaded, settingsError: null, configLocation: await backend.getConfigLocation() });
    void reloadAll();
  }

  function ask<T>(dialog: DialogState): Promise<T | null> {
    return new Promise((resolve) => {
      pending = resolve as (value: unknown) => void;
      set({ dialog });
    });
  }
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  const flash = (message: string) => {
    set({ flash: message });
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => set({ flash: null }), 3000);
  };
  const fail = (e: unknown) => set({ notice: String(e instanceof Error ? e.message : e) });
  /** 자소 문제를 고친 결과를 알리고 목록을 다시 읽는다. */
  const reportHangul = async (r: { renamed: number; conflicts: number; failed: number; first_error: string | null }) => {
    if (r.renamed > 0) await reloadAll();
    if (r.failed > 0) return fail(tr("store.hangul.failed", { count: r.failed, reason: rustText(r.first_error ?? "") }));
    if (r.renamed === 0 && r.conflicts === 0) return flash(tr("store.hangul.none"));
    flash(tr("store.hangul.done", { count: r.renamed }) + (r.conflicts > 0 ? tr("store.hangul.conflicts", { count: r.conflicts }) : ""));
  };
  /** 새로 만든 항목으로 커서를 옮긴다. 중첩 경로(`a/b/c`)면 이 폴더 바로 아래에 생긴 맨 위 폴더(`a`)로 간다. 길어서 화면 밖이어도 표가 따라 스크롤한다. */
  const cursorToCreated = (typed: string) => {
    const top = typed.split(/[\\/]/).find((part) => part !== "");
    const idx = activeTab(get()).entries.findIndex((e) => e.name.normalize("NFC") === top?.normalize("NFC"));
    if (idx >= 0) api.setCursor(idx);
  };

  // 작업 상태가 바뀌면(진행/완료) 목록을 다시 읽는다.
  let lastSignature = "";
  const applyQueue = (jobs: JobDto[]) => {
    set((s) => ({
      queue: jobs,
      queueCursor: Math.min(s.queueCursor, Math.max(jobs.length - 1, 0)),
    }));
    // 진행 창은 작업이 끝나면(실패 제외) 저절로 닫힌다. 실패하면 오류를 볼 수 있게 남긴다.
    const d = get().dialog;
    if (d?.kind === "progress") {
      const job = jobs.find((j) => j.id === d.jobId);
      if (!job || job.status === "done" || job.status === "aborted") set({ dialog: null });
    }
    const signature = jobs.map((j) => `${j.id}:${j.status}:${j.completed}`).join("|");
    if (signature !== lastSignature) {
      lastSignature = signature;
      void reloadAll();
    }
  };
  let sawQueueEvent = false;
  subscribe(() => backend.onQueueChanged((jobs) => {
    if (!sawQueueEvent) {
      sawQueueEvent = true;
      console.info(tr("store.log.first_queue_event"));
    }
    applyQueue(jobs);
  }));
  // 설정이 바뀌면 컬럼 명세(정렬 표시)나 표시 옵션이 달라질 수 있으니 목록을 다시 정렬한다.
  // 설정 폴더 감시는 config.toml·keybindings.toml의 내용이 바뀔 때만 알린다(같은 폴더의 state.json은 커서·선택이 바뀔 때마다 저장되지만 무시한다).
  // 이때의 다시 읽기는 설정이 바뀐 것이지 폴더 내용이 바뀐 것이 아니다 — 계산해 둔 폴더 용량을 지우지 않는다.
  subscribe(() => backend.onConfigChanged((loaded) => {
    set({ loaded });
    void reloadAll(true);
  }));
  let addingFavorite = false; // 즐겨찾기 추가 요청이 진행 중인 동안 연타를 무시한다
  const cfg = () => get().loaded.config;
  /** 최근 위치에 `paths`를 뒤에 붙인다(이미 있으면 맨 뒤로). 설정한 개수만 남긴다. */
  const addRecent = (paths: string[]) =>
    set((s) => {
      const limit = recentLimit(s.loaded.config);
      return { recent: [...s.recent.filter((r) => !paths.includes(r)), ...paths].slice(-limit) };
    });

  /** 지금 화면 상태를 저장 형식으로 만든다. */
  const toSnapshot = (): Snapshot => {
    const s = get();
    // 가상 탭은 저장하지 않는다(결과는 탭과 함께 버려진다). 진짜 탭이 하나도 없으면 시작 위치의 탭으로 대신한다.
    const pane = (p: PaneState) => {
      const real = p.tabs.filter((t) => !t.virtual);
      const keep = real.length > 0 ? real : p.tabs.slice(0, 1);
      const current = p.tabs[p.active];
      const at = keep.indexOf(current);
      const before = p.tabs.slice(0, p.active).reverse().find((t) => keep.includes(t));
      const after = p.tabs.slice(p.active).find((t) => keep.includes(t));
      const active = Math.max(keep.indexOf(at >= 0 ? current : (before ?? after ?? keep[0])), 0);
      return {
        active,
        tabs: keep.map(
        (t): TabSnap => ({
          path: hereOf(t),
          cursorName: t.entries[t.cursor]?.name ?? t.restoreCursor ?? null,
          selection: t.selection.size <= SELECTION_SAVE_LIMIT ? [...t.selection] : [],
          sort: t.sort,
          view: { mode: "table", count: 1 }, // 다열 보기는 없어졌다. 저장 형식(`ViewSnap`)은 이전 상태 파일과 호환되게 그대로 둔다.
        }),
      ),
      };
    };
    return {
      version: 1,
      activePane: s.activePane,
      showHidden: s.showHidden,
      paletteQuery: s.lastPaletteQuery,
      split: Math.round(s.split * 1000),
      previewRect: s.previewRect,
      recent: s.recent,
      left: pane(s.panes.left),
      right: pane(s.panes.right),
    };
  };

  // 자동 저장: 상태가 바뀌면 SAVE_DELAY_MS 뒤에 한 번, 실제로 달라졌을 때만 저장한다.
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let lastSaved = "";
  let saveEnabled = false;
  async function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    if (!saveEnabled) return;
    const snap = toSnapshot();
    const json = JSON.stringify(snap);
    if (json === lastSaved) return;
    lastSaved = json;
    try {
      await backend.saveState(snap);
    } catch (e) {
      lastSaved = ""; // 다음 변경 때 다시 시도한다
      fail(tr("store.save_state_failed", { error: e instanceof Error ? e.message : String(e) }));
    }
  }
  subscribe(() => store.subscribe(() => {
    if (saveEnabled && saveTimer === undefined) saveTimer = setTimeout(() => void saveNow(), SAVE_DELAY_MS);
  }));

  /** 저장된 폴더가 사라졌으면 가장 가까운 존재하는 상위 폴더로 옮긴다(docs/07 §10). 옮긴 탭 수를 돌려준다. */
  async function relocateMissingTabs(): Promise<number> {
    let moved = 0;
    for (const pane of ["left", "right"] as const) {
      for (const t of get().panes[pane].tabs) {
        let p: string | null = t.path;
        while (p !== null) {
          try {
            await backend.listDir(p, true);
            break;
          } catch {
            p = parentPath(p);
          }
        }
        const dest = p ?? "/";
        if (dest !== t.path) {
          moved++;
          patchTab(pane, t.id, { path: dest, history: [dest], selection: new Set(), restoreCursor: undefined });
        }
      }
    }
    return moved;
  }

  // 미리보기 요청 순번: 항목을 빠르게 넘길 때 늦게 온 이전 응답이 화면을 덮지 않게 한다.
  let savedTimer: ReturnType<typeof setTimeout> | undefined;
  let previewSeq = 0;
  async function loadPreview(entry: EntryDto) {
    const seq = ++previewSeq;
    const base = { path: entry.path, name: entry.name, isDir: entry.kind === "dir" };
    // 원격 파일도 서비스에 맡긴다: 텍스트(앞부분)와 이미지(한도 안)만 읽고, 나머지 형식은 "미리 볼 수 없는 형식"으로 돌아온다.
    // 항목을 넘기는 동안은 이전 내용을 그대로 두어 창이 비었다 채워지며 깜빡이지 않게 한다.
    set((s) => ({ preview: { ...base, status: "loading", data: s.preview?.data } }));
    try {
      const data = await backend.preview(entry.path);
      if (seq === previewSeq) set({ preview: { ...base, status: "ready", data } });
    } catch (e) {
      if (seq === previewSeq) set({ preview: { ...base, status: "error", error: String(e instanceof Error ? e.message : e) } });
    }
  }

  // Actions Panel이 쓰는 액션 목록과 실행기. App이 레지스트리/키맵을 만든 뒤 붙인다.
  let catalogFn: () => CatalogItem[] = () => [];
  let runFn: (id: string) => Promise<unknown> = async () => undefined;

  /** 경로 문자열(`~`, `${user.*}` 포함)로 이동한다. 없는 경로는 알리고 이동하지 않는다. */
  async function navigateToPath(raw: string) {
    const dest = expandPath(raw.trim(), get().userDirs);
    if (dest === null) return fail(tr("store.user_dirs_unknown"));
    const clean = trimTrailingSep(dest);
    set({ notice: null });
    try {
      await backend.listDir(clean, true);
    } catch (e) {
      return fail(e);
    }
    await api.navigate(clean);
  }

  /**
   * 전송 작업이 끝날 때까지 큐를 직접 조회해서 진행 창을 띄우고, 끝나면 목록을 다시 읽는다.
   * 큐/디렉터리 이벤트가 웹뷰에 닿는지는 실제 Tauri 런타임에서 검증된 적이 없어서(docs/m1-status.md) 이벤트에 기대지 않는다.
   */
  async function trackTransfer(jobId: number, verb: string, delayMs = TRANSFER_PROGRESS_DELAY_MS) {
    const started = Date.now();
    let first = delayMs === 0; // 지연이 없으면 첫 조회를 기다리지 않고 바로 확인한다
    let shownOnce = false; // 사용자가 백그라운드로 보낸(닫은) 진행 창을 다시 띄우지 않는다
    for (;;) {
      if (!first) await new Promise((r) => setTimeout(r, TRANSFER_POLL_MS));
      first = false;
      let jobs: JobDto[];
      try {
        jobs = await backend.queueJobs();
      } catch {
        return;
      }
      applyQueue(jobs);
      const job = jobs.find((j) => j.id === jobId);
      if (!job || !isActiveJob(job)) {
        // 진행 창이 뜨기 전에(또는 사용자가 닫은 뒤에) 실패로 끝나면 오류가 큐 패널에만 쌓여 알 길이 없으니 알림으로 올린다.
        // 진행 창이 이 작업을 보이고 있으면 창이 오류 목록을 남겨 두므로 따로 알리지 않는다.
        const d = get().dialog;
        const shownHere = d?.kind === "progress" && d.jobId === jobId;
        if (job?.status === "failed" && !shownHere) {
          const first = job.errors[0];
          const message = first ? `${first.path}: ${rustText(first.message)}` : "";
          const more = job.errors.length - 1;
          set({
            notice:
              more > 0
                ? tr("store.transfer.failed_more", { verb, message, more })
                : tr("store.transfer.failed", { verb, message }),
          });
        }
        await reloadAll();
        return;
      }
      if (!shownOnce && !get().dialog && Date.now() - started >= delayMs) {
        shownOnce = true;
        set({ dialog: { kind: "progress", title: tr("store.progress.title", { verb }), jobId } });
      }
    }
  }

  /** 전송 확인 창의 대상 폴더가 쓸 수 없으면 사유를, 괜찮으면 null을 돌려준다. */
  async function transferDestError(dest: string, targets: Pick<EntryDto, "path" | "kind">[]): Promise<string | null> {
    const clean = trimTrailingSep(dest);
    if (targets.some((t) => t.kind === "dir" && (clean === t.path || (clean.startsWith(t.path) && /[\\/]/.test(clean.charAt(t.path.length)))))) {
      return tr("store.dest.inside_source");
    }
    try {
      await backend.listDir(clean, true);
    } catch (e) {
      return String(e instanceof Error ? e.message : e);
    }
    return null;
  }

  /** 눌렀지만 아직 드래그가 시작되지 않은 행(5px 이상 움직이면 드래그가 된다). */
  let pendingDrag: { pane: PaneId; index: number; x: number; y: number } | null = null;
  /** 드래그를 막 끝냈다는 표시: 놓은 직후에 오는 click이 커서 이동·선택을 일으키지 않게 한다. */
  let justDragged = false;

  /** 잘라내기(Mod+X)로 표시한 경로들. 붙여 넣을 때 클립보드 내용이 이것과 같으면 이동으로 처리한다. */
  let cutPaths: string[] = [];

  /** 겹치는 이름은 항목마다(또는 "남은 항목에도 적용"으로) 정한 뒤 작업 큐에 넣는다. 복사/이동의 공통 부분. */
  async function runTransfer(kind: "copy" | "move", targets: { path: string }[], destDir: string, progressDelayMs: number, clearSelection: boolean) {
    transfersStarting++;
    syncDirSizes(get()); // 용량 계산을 바로 멈춘다
    try {
      await runTransferNow(kind, targets, destDir, progressDelayMs, clearSelection);
    } finally {
      transfersStarting--;
      syncDirSizes(get()); // 작업이 이미 끝났거나 진행 중 작업이 없으면 선택이 남은 폴더의 계산을 다시 시작한다
    }
  }
  async function runTransferNow(kind: "copy" | "move", targets: { path: string }[], destDir: string, progressDelayMs: number, clearSelection: boolean) {
    const verb = kind === "copy" ? tr("store.verb.copy") : tr("store.verb.move");
    const items: QueueItemDto[] = [];
    let sticky: ConflictDto | null = null; // "남은 항목에도 같은 선택 적용"으로 정해진 처리
    for (const [i, t] of targets.entries()) {
      try {
        let policy: ConflictDto = "skip";
        const existing = await backend.detectConflict(t.path, destDir);
        if (existing !== null) {
          if (sticky) policy = sticky;
          else {
            const answer = await ask<{ choice: ConflictDto; all: boolean }>({
              kind: "conflict",
              title: tr("store.conflict.title", { verb }),
              existing,
              selected: CONFLICT_CHOICES.indexOf("rename"),
              remaining: targets.length - i,
              all: false,
            });
            if (answer === null) break; // 취소: 지금까지 정한 항목만 실행한다
            policy = answer.choice;
            if (answer.all) sticky = policy;
          }
        }
        items.push({ src: t.path, destDir, policy });
      } catch (e) {
        fail(e);
        break;
      }
    }
    if (clearSelection) patchActive({ selection: new Set() });
    if (items.length > 0) {
      if (kind === "move") api.recheckVirtual(items.map((i) => i.src));
      const jobId = await backend.enqueue(kind, items);
      void trackTransfer(jobId, verb, progressDelayMs);
    }
    await reloadAll();
  }

  /** Mod+C/Mod+X: 대상 항목(선택, 없으면 커서)의 경로를 운영체제 파일 클립보드에 쓴다. */
  async function writeClipboard(mode: "copy" | "cut") {
    const targets = targetsOf(activeTab(get()));
    if (targets.length === 0) return;
    if (targets.some((t) => isArchivePath(t.path))) return fail(tr("store.clip.archive"));
    set({ notice: null });
    const paths = targets.map((t) => t.path);
    try {
      await backend.setClipboardFiles(paths);
    } catch (e) {
      return fail(e);
    }
    cutPaths = mode === "cut" ? paths : [];
    flash(mode === "cut" ? tr("store.clip.cut", { count: paths.length }) : tr("store.clip.copied", { count: paths.length }));
  }

  /** 커서 아래 요소에서 드롭 대상을 정한다: 폴더 행이면 그 폴더 안으로, 아니면 그 패널의 현재 폴더(같은 패널·가상 탭은 받지 않는다). */
  function dropTargetAt(el: Element | null, drag: { paths: string[]; sourcePane: PaneId | null }): DropTarget | null {
    // 폴더 트리의 노드: 그 폴더 안으로(이슈 #125). 끄는 항목 자신은 받지 않는다.
    const node = el?.closest<HTMLElement>("[data-tree-path]");
    if (node) {
      const dir = node.dataset.treePath;
      return dir && !drag.paths.includes(dir) ? { pane: get().activePane, dir, row: true, tree: true } : null;
    }
    const row = el?.closest<HTMLElement>("[data-row-kind='dir']");
    if (row) {
      const path = row.dataset.path;
      const pane = row.dataset.pane as PaneId | undefined;
      if (path && pane && !drag.paths.includes(path)) return { pane, dir: path, row: true };
      return null;
    }
    const section = el?.closest<HTMLElement>("section[data-pane]");
    const pane = section?.dataset.pane as PaneId | undefined;
    if (!pane || pane === drag.sourcePane) return null;
    const tab = activeTab(get(), pane);
    return tab.virtual ? null : { pane, dir: tab.path, row: false };
  }

  const api = {
    async init() {
      resubscribe(); // StrictMode의 마운트 → 정리 → 마운트에서 dispose가 끊은 구독을 되살린다
      // 설정(컬럼 명세의 정렬 표시 등)을 먼저 읽고 첫 목록을 만든다.
      set({ loaded: await backend.getConfig(), userDirs: await backend.userDirs() });
      const moved = snapshot ? await relocateMissingTabs() : 0;
      await reloadAll();
      await syncWatches();
      void api.refreshVolumes();
      applyQueue(await backend.queueJobs());
      if (moved > 0) fail(tr("store.state.folders_moved", { count: moved }));
      // 복원이 끝난 상태를 기준으로 삼아, 그 뒤에 달라진 것만 저장한다.
      lastSaved = JSON.stringify(toSnapshot());
      saveEnabled = true;
      // 터미널에서 `td 폴더`로 시작했다면 복원이 끝난 뒤 한 번만 연다(가져가면 비워서 StrictMode의 두 번째 init에는 없다).
      const launch = await backend.takeLaunchPaths().catch(() => null);
      if (launch) await api.openPaths(launch);
    },
    /** 저장을 미루지 않고 지금 저장한다(창을 닫기 직전 등). */
    saveNow,
    /** 시작할 때 저장된 상태를 읽지 못했다는 알림. */
    reportStateWarning(message: string) {
      fail(message);
    },
    /** 저장된 상태를 모두 지우고 앱을 종료한다 (`core.state.reset`). */
    async resetState() {
      const ok = await ask<boolean>({
        kind: "confirm",
        title: tr("store.reset.title"),
        lines: [tr("store.reset.line")],
      });
      if (!ok) return;
      // 종료 직전에 다시 저장해서 방금 지운 상태가 되살아나지 않게 한다.
      saveEnabled = false;
      clearTimeout(saveTimer);
      saveTimer = undefined; // 실패해서 저장을 다시 켤 때 예약이 막히지 않게 한다
      try {
        await backend.resetState();
      } catch (e) {
        saveEnabled = true;
        fail(e);
      }
    },
    /** 새 창 (PANE-03). 새 창은 자기 레이블의 상태를 따로 저장·복원한다. */
    async newWindow() {
      set({ notice: null });
      try {
        flash(tr("store.window.opened", { label: await backend.newWindow() }));
      } catch (e) {
        fail(e);
      }
    },

    dispose() {
      clearTimeout(flashTimer);
      clearTimeout(saveTimer);
      for (const sub of subscriptions) {
        sub.off?.();
        sub.off = null;
      }
      for (const pane of ["left", "right"] as const) for (const t of get().panes[pane].tabs) stopSearch(t);
      for (const p of watched) void backend.unwatch(p);
      watched.clear();
    },

    /** 폴더로 이동한다. `how`: 일반 이동은 방문 스택에 쌓고(앞으로 기록은 버림), back/forward는 스택 사이를 옮긴다. */
    async navigate(path: string, focusName?: string, how: "push" | "back" | "forward" = "push", pane: PaneId = get().activePane) {
      const s = get();
      const tab = activeTab(s, pane);
      if (tab.virtual?.kind === "terminal") return; // 터미널 탭은 폴더를 보지 않는다(세션이 새어 나가지 않게 막는다)
      stopSearch(tab); // 가상 탭에서 실제 위치로 나가면 결과를 버린다
      addRecent([...(tab.virtual || tab.path === path ? [] : [tab.path]), path]);
      patchTab(pane, tab.id, (t) => {
        // 가상 탭(검색 결과)에서 나올 때는 돌아갈 실제 위치가 없으므로 쌓지 않는다.
        const here = t.virtual ? [] : [t.path];
        const stacks =
          how === "back"
            ? { back: t.back.slice(0, -1), forward: [...t.forward, ...here] }
            : how === "forward"
              ? { back: [...t.back, ...here], forward: t.forward.slice(0, -1) }
              : { back: t.path === path ? t.back : [...t.back, ...here], forward: t.path === path && !t.virtual ? t.forward : [] };
        return { ...stacks, virtual: undefined,
        path,
        history: [...t.history, path],
        cursor: 0,
        selection: new Set(),
        quick: null,
        entries: [],
      }; });
      await reload(pane, tab.id, focusName);
      await syncWatches();
    },
    /**
     * 반대편 패널로 보낸다 (`core.pane.send`). 커서가 폴더면 그 폴더를, 파일이면 현재 폴더를 반대편 패널에서 연다.
     * 활성 패널은 그대로다. `to`가 이미 활성 패널이면 보낼 곳이 없으므로 이전/다음 폴더로 간다(같은 키의 기존 동작).
     */
    /** 두 패널 사이 구분선을 옮긴다. `ratio`는 왼쪽 패널이 차지할 너비 비율(0~1)이다. */
    setSplit(ratio: number) {
      set({ split: clampSplit(ratio) });
    },
    /** 폴더 트리 경계를 끄는 동안 너비를 임시로 바꾼다. null이면 끝난 것이다. */
    setTreeWidthDraft(px: number | null) {
      set({ treeWidthDraft: px === null ? null : clampTreeWidth(px) });
    },
    getTreeWidthDraft(): number | null {
      return get().treeWidthDraft;
    },
    /** 폴더 트리의 너비(px)를 설정에 저장한다. */
    async setTreeWidth(px: number) {
      await api.setConfigValue("behavior.layout.folder_tree_width", { kind: "int", value: clampTreeWidth(px) });
      set({ treeWidthDraft: null });
    },
    /** 미리보기 창의 위치·크기를 기억한다. null이면 기본값으로 되돌린다. */
    setPreviewRect(rect: PreviewRect | null) {
      set({ previewRect: rect });
    },
    async paneSend(args?: Record<string, unknown>) {
      const to = args?.to;
      if (to !== "left" && to !== "right") return fail(tr("store.pane_send.arg"));
      const s = get();
      if (s.activePane === to) return to === "right" ? api.goForward() : api.goBack();
      const tab = activeTab(s);
      const c = cursorEntry(tab);
      const dest = c?.kind === "dir" ? c.path : tab.virtual ? (c ? parentPath(c.path) : null) : tab.path;
      if (dest === null) return;
      await api.navigate(dest, undefined, "push", to);
    },
    /** 이전 폴더로 (마우스 뒤로 버튼, `core.history.back`). 방금 나온 하위 폴더가 있으면 그 폴더에 커서를 둔다. */
    async goBack() {
      const tab = activeTab(get());
      const target = tab.back.at(-1);
      if (target === undefined) return;
      await api.navigate(target, parentPath(tab.path) === target ? baseName(tab.path) : undefined, "back");
    },
    /** 다음 폴더로 (마우스 앞으로 버튼, `core.history.forward`). */
    async goForward() {
      const tab = activeTab(get());
      const target = tab.forward.at(-1);
      if (target === undefined) return;
      await api.navigate(target, parentPath(tab.path) === target ? baseName(tab.path) : undefined, "forward");
    },

    /**
     * 앱 실행(`core.open.launch`, 이슈 #90): 커서가 로컬 `.app` 폴더면 안으로 들어가지 않고 OS 기본 열기로 앱을 실행한다.
     * `.app`이 아닌 항목(원격·압축 안 포함)은 `open()`과 똑같이 한다. `.app` 폴더에서 `Enter`는 기존대로 안으로 들어간다.
     */
    async openLaunch() {
      const tab = activeTab(get());
      const c = tab.cursor >= 0 ? cursorEntry(tab) : undefined;
      if (!c || tab.virtual || isRemotePath(c.path) || isArchivePath(c.path) || !isFolderEntry(c) || !/\.app[/\\]*$/i.test(c.name)) return api.open();
      try {
        await backend.openPath(c.path);
      } catch (e) {
        fail(e);
      }
    },

    /** 열기: 폴더는 들어가고, 아카이브 파일은 폴더처럼 연다 (ARC-01). */
    async open() {
      const tab = activeTab(get());
      if (tab.virtual?.kind === "usage" && tab.virtual.view === "treemap") return api.usageOpenOther();
      if (tab.cursor < 0 && parentRowVisible(tab, cfg().behavior.table.show_parent_row)) return api.goUp(); // `..` 행
      const c = cursorEntry(tab);
      if (c && isFolderEntry(c)) await api.navigate(c.path);
      else if (c?.kind === "file" && isRemotePath(c.path)) fail(tr("store.remote.no_open"));
      else if (c?.kind === "file" && isArchiveName(c.name, cfg().file_systems.zip.additional_extensions)) {
        await api.navigate(archiveRoot(c.path));
      } else if (c && tab.virtual) {
        // 검색 결과의 일반 파일: 그 파일이 있는 폴더를 새 탭으로 연다
        await api.revealInTab();
      } else if (c?.kind === "file") {
        // 일반 파일: 운영체제 기본 프로그램으로 실행한다
        try {
          await backend.openPath(c.path);
        } catch (e) {
          fail(e);
        }
      }
    },

    /**
     * 활성 패널의 폴더에서 시작하는 새 터미널 탭을 반대편 패널의 탭 줄에 만들고 활성으로 한다(`core.terminal.focus`; `targetPane`을 주면 그 패널의 탭 줄에).
     * 누를 때마다 새 탭이다. 활성 탭이 터미널이면 그 터미널을 연 폴더에서 같은 패널에 새 탭을 만든다.
     * 검색 결과 같은 가상 탭과 압축 안에서는 열지 않는다.
     */
    async terminalFocus(folder?: string, targetPane?: PaneId) {
      const s = get();
      const here = activeTab(s);
      const fromTerminal = here.virtual?.kind === "terminal";
      // 폴더를 지정하면(컨텍스트 메뉴의 폴더 행) 가상 탭에서도 그 폴더에서 연다.
      if (!folder && here.virtual && !fromTerminal) return fail(tr("terminal.notice.virtual"));
      const cwd = folder ?? (fromTerminal ? here.virtual!.base : here.path);
      if (isArchivePath(cwd)) return fail(tr("terminal.notice.archive"));
      // 원격 폴더(sftp://)면 로컬 셸 대신 그 서버의 셸을 연다. FTP에는 셸이 없다.
      const remote = splitRemote(cwd);
      if (remote?.scheme === "ftp") return fail(tr("terminal.notice.ftp"));
      const pane = targetPane ?? (fromTerminal ? s.activePane : other(s.activePane));
      try {
        // 처음 크기는 임시다. 터미널 화면이 그려지면 패널 크기에 맞춰 바로 바꾼다.
        const id = remote ? await backend.terminalOpenRemote(remote.id, 80, 24) : await backend.terminalOpen(cwd, 80, 24);
        const now = get();
        const p = now.panes[pane];
        const tab = newTab("");
        tab.path = `virtual:terminal:${tab.id}`;
        tab.history = [tab.path];
        tab.virtual = { kind: "terminal", title: `${tr("terminal.tab")}: ${remote ? remote.id : baseName(cwd) || cwd}`, base: cwd, jobId: id, running: false, cancelled: false, warnings: [], summary: null, totalBytes: 0, view: "list", recheck: [] };
        set({ activePane: pane, panes: { ...now.panes, [pane]: { tabs: [...p.tabs, tab], active: p.tabs.length } } });
      } catch (e) {
        fail(e);
      }
    },
    /** 컨텍스트 메뉴의 "터미널 열기": 커서가 폴더 행이면 그 폴더에서, 아니면 이 패널의 현재 폴더에서 연다. */
    async terminalOpenCursorFolder() {
      const tab = activeTab(get());
      const c = cursorEntry(tab);
      await api.terminalFocus(c && isFolderEntry(c) ? c.path : undefined);
    },
    /**
     * "명령줄 도구 설치"(`core.cli.install`): 터미널에서 `td 폴더`로 앱을 열 수 있게 한다. 설치돼 있으면 알리기만 하고, 남의 `td`가 있으면 건드리지 않고
     * 알리며, 그 밖에는 무엇을 하는지 확인 창으로 보여 준 뒤 설치한다.
     */
    async installCli() {
      const st = await backend.cliStatus().catch((e) => void fail(e));
      if (!st) return;
      if (st.state === "unsupported") return fail(tr("cli.notice.unsupported"));
      if (st.state === "foreign") return fail(tr("cli.notice.foreign", { link: st.link }));
      if (st.state === "installed") return fail(tr("cli.notice.already"));
      const ok = await ask<boolean>({
        kind: "confirm",
        title: tr("cli.install.title"),
        lines: [tr(st.link.toLowerCase().endsWith(".cmd") ? "cli.install.line_win" : "cli.install.line_mac", { link: st.link })],
        confirmLabel: tr("cli.install.confirm"),
      });
      if (!ok) return;
      try {
        await backend.cliInstall();
        fail(tr("cli.notice.installed"));
      } catch (e) {
        fail(e);
      }
    },
    /** "명령줄 도구 제거"(`core.cli.uninstall`): 우리가 만든 것만 지운다. 없으면 알리기만 하고, 남의 `td`면 건드리지 않는다. */
    async uninstallCli() {
      const st = await backend.cliStatus().catch((e) => void fail(e));
      if (!st) return;
      if (st.state === "unsupported") return fail(tr("cli.notice.unsupported"));
      if (st.state === "foreign") return fail(tr("cli.notice.foreign", { link: st.link }));
      if (st.state === "absent") return fail(tr("cli.notice.not_installed"));
      const ok = await ask<boolean>({
        kind: "confirm",
        title: tr("cli.uninstall.title"),
        lines: [tr("cli.uninstall.line", { link: st.link })],
        confirmLabel: tr("cli.uninstall.confirm"),
      });
      if (!ok) return;
      try {
        await backend.cliUninstall();
        fail(tr("cli.notice.removed"));
      } catch (e) {
        fail(e);
      }
    },
    /**
     * 셸이 끝났다: 그 세션의 터미널 탭을 없앤다. 패널의 마지막 탭이면 시작한 폴더를 보는 파일 탭으로 바꾼다.
     * 원격 셸이 종료 코드 없이(`code === null`) 닫혔으면 연결이 끊긴 것이므로 탭과 화면을 남기고 끊김으로 표시한다(이슈 #98).
     */
    async terminalExited(id: number, code: number | null = 0) {
      for (const pane of ["left", "right"] as const) {
        const index = get().panes[pane].tabs.findIndex((t) => t.virtual?.kind === "terminal" && t.virtual.jobId === id);
        if (index < 0) continue;
        const tab = get().panes[pane].tabs[index];
        if (code === null && splitRemote(tab.virtual!.base)) {
          void backend.terminalClose(id).catch(() => {});
          return set((s) => ({ panes: { ...s.panes, [pane]: { ...s.panes[pane], tabs: s.panes[pane].tabs.map((t) => (t.id === tab.id ? { ...t, virtual: { ...t.virtual!, disconnected: true } } : t)) } } }));
        }
        return removeTerminalTab(pane, index);
      }
    },
    /**
     * 끊긴 원격 터미널 탭을 다시 연결한다(이슈 #98). 서버에 다시 접속(`openRemoteConnection`: 저장된 비밀번호 → 비밀번호 창·호스트 키 확인)한 뒤
     * 새 셸을 열어 같은 탭에 이어 붙인다. 이전 화면은 그대로 두고 그 아래로 이어서 출력된다(엔진을 새 세션 번호로 옮긴다).
     */
    async reconnectTerminal(pane: PaneId = get().activePane, tabId?: number) {
      const s = get();
      const tab = tabId === undefined ? activeTab(s, pane) : s.panes[pane].tabs.find((t) => t.id === tabId);
      if (tab?.virtual?.kind !== "terminal") return;
      const remote = splitRemote(tab.virtual.base);
      if (!remote) return;
      const index = remoteIndexOf(s, tab.virtual.base);
      if (index < 0) return fail(tr("store.remote.reconnect_missing"));
      if ((await openRemoteConnection(index)) === null) return;
      const oldId = tab.virtual.jobId;
      try {
        const id = await backend.terminalOpenRemote(remote.id, 80, 24);
        const now = get();
        const cur = now.panes[pane].tabs.find((t) => t.id === tab.id);
        if (!cur?.virtual || cur.virtual.jobId !== oldId) return void backend.terminalClose(id).catch(() => {});
        rebindTerminal(backend, oldId, id);
        set({ panes: { ...now.panes, [pane]: { ...now.panes[pane], tabs: now.panes[pane].tabs.map((t) => (t.id === tab.id ? { ...t, virtual: { ...t.virtual!, jobId: id, disconnected: false } } : t)) } } });
      } catch (e) {
        fail(e);
      }
    },

    /** 확장자와 무관하게 커서의 파일을 아카이브로 연다 (ARC-04, `core.open.as_archive`). */
    async openAsArchive() {
      const c = cursorEntry(activeTab(get()));
      if (!c) return;
      if (c.kind !== "file") {
        fail(tr("store.open_archive.files_only"));
        return;
      }
      set({ notice: null });
      try {
        await api.navigate(await backend.openAsArchive(c.path));
      } catch (e) {
        fail(e);
      }
    },

    /** 상위 폴더. 아카이브 루트에서는 아카이브가 들어 있는 폴더로 나가고 커서는 그 아카이브 파일에 놓인다. */
    async goUp() {
      const tab = activeTab(get());
      if (tab.virtual?.kind === "usage" && tab.virtual.view === "treemap") return api.usageUp();
      if (tab.virtual) return;
      const parent = parentPath(tab.path);
      if (parent !== null) await api.navigate(parent, archiveFileName(baseName(tab.path)));
    },

    moveCursor(delta: number) {
      if (Math.abs(delta) === 1 && isTreemap(activeTab(get()))) return api.usageMove(delta < 0 ? "up" : "down");
      const circular = cfg().behavior.table.circular_selection;
      const showParent = cfg().behavior.table.show_parent_row;
      patchActive((t) => {
        const len = t.entries.length;
        // `..` 행(커서 -1)이 보이면 목록 맨 앞 한 칸이 더 있다.
        const lo = parentRowVisible(t, showParent) ? -1 : 0;
        if (len === 0 && lo === 0) return {};
        let next = t.cursor + delta;
        // 순환 선택(NAV-06)은 한 칸 이동에만 적용한다.
        if (circular && Math.abs(delta) === 1) next = lo + ((((next - lo) % (len - lo)) + (len - lo)) % (len - lo));
        return { cursor: Math.min(Math.max(next, lo), Math.max(len - 1, lo)) };
      });
    },
    /** 반 페이지 이동 (NAV-02). */
    moveHalfPage(dir: 1 | -1) {
      api.moveCursor(dir * Math.floor(PAGE_SIZE / 2));
    },
    /** 왼쪽 키: 상위 폴더로 간다. */
    async goLeft() {
      if (isTreemap(activeTab(get()))) return api.usageMove("left");
      await api.goUp();
    },
    /** 오른쪽 키: 폴더면 들어가고 파일이면 미리보기를 연다. */
    async goRight() {
      const tab = activeTab(get());
      if (isTreemap(tab)) return api.usageMove("right");
      if (isFolderEntry(cursorEntry(tab))) await api.open();
      else await api.previewToggle();
    },
    /** 정렬 변경 (`core.view.order`). 같은 키를 다시 고르면 방향을 뒤집는다. `dir`로 방향을 지정할 수 있다. */
    setOrder(args?: Record<string, unknown>) {
      const s = get();
      const tab = activeTab(s);
      const current = effectiveSort(tab, cfg().view.table.columns);
      const by = typeof args?.by === "string" ? args.by : current.key;
      if (!(SORT_KEYS as readonly string[]).includes(by)) return fail(tr("store.sort.unknown", { by }));
      const key = by as SortKey;
      const asked = args?.dir;
      const dir =
        asked === "asc" || asked === "desc" ? asked : key === current.key ? (current.dir === "asc" ? "desc" : "asc") : "asc";
      const sort: SortState = { key, dir };
      patchActive((t) => {
        const cursorPath = t.entries[t.cursor]?.path;
        const sorted = sortEntries(t.entries, sort);
        const entries = groupingActive(t, cfg().behavior.table.group_by_modified) ? groupByModified(sorted) : sorted;
        const idx = cursorPath ? entries.findIndex((e) => e.path === cursorPath) : -1;
        return { sort, entries, cursor: idx >= 0 ? idx : 0 };
      });
    },
    cursorHome() {
      patchActive({ cursor: 0 });
    },
    cursorEnd() {
      patchActive((t) => ({ cursor: Math.max(t.entries.length - 1, 0) }));
    },

    /** Shift+이동: 지나간 범위(도착 항목 제외)의 선택을 반전하고 커서를 옮긴다 (SEL-02). */
    shiftMove(delta: number) {
      patchActive((t) => {
        if (t.entries.length === 0) return {};
        const to = clamp(t.cursor + delta, t.entries.length);
        const lo = Math.min(t.cursor, to);
        const hi = Math.max(t.cursor, to);
        const sel = new Set(t.selection);
        for (let i = Math.max(lo, 0); i <= hi; i++) {
          if (i === to && to !== t.cursor) continue;
          const path = t.entries[i].path;
          if (sel.has(path)) sel.delete(path);
          else sel.add(path);
        }
        return { cursor: to, selection: sel };
      });
    },

    /** Shift+PageUp/PageDown/Home/End: 커서 항목부터 도착 항목까지(양 끝 포함)를 선택에 더하고 커서를 옮긴다. 반전하지 않으므로 연속으로 눌러도 선택이 끊기지 않는다. */
    shiftSelectTo(delta: number) {
      patchActive((t) => {
        if (t.entries.length === 0) return {};
        const to = clamp(t.cursor + delta, t.entries.length);
        const sel = new Set(t.selection);
        for (let i = Math.max(Math.min(t.cursor, to), 0); i <= Math.max(t.cursor, to); i++) sel.add(t.entries[i].path);
        return { cursor: to, selection: sel };
      });
    },

    selectAll() {
      patchActive((t) => ({ selection: new Set(t.entries.map((e) => e.path)) }));
    },
    /** 선택 해제. 선택이 없는 채로 진행 중인 검색/분석 탭이면 대신 그 작업을 취소한다(Esc). */
    selectNone() {
      const tab = activeTab(get());
      if (tab.selection.size === 0 && tab.virtual?.running) return api.cancelSearch();
      patchActive({ selection: new Set() });
    },
    /** 커서 항목의 선택을 토글하고 한 칸 내려간다. */
    toggleSelect() {
      patchActive((t) => {
        const c = t.entries[t.cursor];
        if (!c) return {};
        const sel = new Set(t.selection);
        if (sel.has(c.path)) sel.delete(c.path);
        else sel.add(c.path);
        return { selection: sel, cursor: clamp(t.cursor + 1, t.entries.length) };
      });
    },

    activate(pane: PaneId, tab?: number) {
      if (tab === undefined) {
        set({ activePane: pane });
        return;
      }
      set((s) => ({ activePane: pane, panes: { ...s.panes, [pane]: { ...s.panes[pane], active: tab } } }));
    },
    setCursor(index: number) {
      const showParent = cfg().behavior.table.show_parent_row;
      patchActive((t) => ({ cursor: index === -1 && parentRowVisible(t, showParent) ? -1 : clamp(index, t.entries.length) }));
    },
    /** Shift+클릭: 지금 커서 항목부터 클릭한 항목까지(양 끝 포함)를 기존 선택에 더하고 커서를 옮긴다. */
    selectRangeTo(index: number) {
      patchActive((t) => {
        if (t.entries.length === 0) return {};
        const to = clamp(index, t.entries.length);
        const sel = new Set(t.selection);
        for (let i = Math.max(Math.min(t.cursor, to), 0); i <= Math.max(t.cursor, to); i++) sel.add(t.entries[i].path);
        return { cursor: to, selection: sel };
      });
    },
    /** 선택 반전 (SEL-03): 모든 항목의 선택 상태를 뒤집는다. */
    invertSelection() {
      patchActive((t) => ({ selection: new Set(t.entries.filter((e) => !t.selection.has(e.path)).map((e) => e.path)) }));
    },
    /** 현재 항목 선택 반전 (SEL-03): 커서는 움직이지 않는다. */
    invertCurrent() {
      patchActive((t) => {
        const c = t.entries[t.cursor];
        if (!c) return {};
        const sel = new Set(t.selection);
        if (sel.has(c.path)) sel.delete(c.path);
        else sel.add(c.path);
        return { selection: sel };
      });
    },
    /** Select/Deselect Group (SEL-04): glob 패턴과 일치하는 항목을 선택하거나 선택 해제한다. */
    async selectGroup(select: boolean) {
      const pattern = await ask<string>({
        kind: "name",
        title: select ? tr("store.select_group.select") : tr("store.select_group.deselect"),
        value: "*",
        error: null,
        selectStem: false,
      });
      if (pattern === null) return;
      const tab = activeTab(get());
      set({ notice: null });
      let hits: number[];
      try {
        hits = await backend.globFilter(pattern.trim(), tab.entries.map((e) => e.name));
      } catch (e) {
        return fail(e);
      }
      if (hits.length === 0) return fail(tr("store.select_group.none", { pattern: pattern.trim() }));
      patchTab(get().activePane, tab.id, (t) => {
        const sel = new Set(t.selection);
        for (const i of hits) {
          const path = tab.entries[i]?.path;
          if (path === undefined) continue;
          if (select) sel.add(path);
          else sel.delete(path);
        }
        return { selection: sel };
      });
    },
    switchPane() {
      set((s) => ({ activePane: other(s.activePane) }));
    },
    /** 왼쪽과 오른쪽 패널의 내용(탭·폴더·커서·선택·남은 용량)을 서로 바꾼다. 활성 패널은 내용을 따라간다(왼쪽에서 작업하고 있었으면 이제 오른쪽에 있는 그 패널이 계속 활성이다). */
    swapPanes() {
      set((s) => ({
        panes: { left: s.panes.right, right: s.panes.left },
        diskSpace: { left: s.diskSpace.right, right: s.diskSpace.left },
        activePane: other(s.activePane),
      }));
    },

    async newTab() {
      await api.newTabIn(get().activePane);
    },
    /** `pane`의 현재 폴더를 가리키는 새 탭을 그 패널 끝에 만들고 활성으로 한다(탭 줄의 빈 곳을 더블클릭할 때도 쓴다). */
    async newTabIn(pane: PaneId) {
      const s = get();
      const p = s.panes[pane];
      const tab = newTab(hereOf(p.tabs[p.active]));
      set({
        activePane: pane,
        panes: { ...s.panes, [pane]: { tabs: [...p.tabs, tab], active: p.tabs.length } },
      });
      await reload(pane, tab.id);
      await syncWatches();
    },
    /**
     * `td` 명령이 넘긴 요청을 연다: 왼쪽 경로는 왼쪽 패널, 오른쪽 경로는 오른쪽 패널에 새 탭으로 열고 활성으로 한다.
     * 오류면 알림만 보이고 아무것도 열지 않는다. 열린 탭이 속한 패널(왼쪽 우선)이 활성 패널이 된다.
     */
    async openPaths(request: { left: { folder: string; focus: string | null } | null; right: { folder: string; focus: string | null } | null; error: string | null }) {
      if (request.error) return fail(request.error);
      if (request.right) await api.openFolderTab("right", request.right.folder, request.right.focus ?? undefined);
      if (request.left) await api.openFolderTab("left", request.left.folder, request.left.focus ?? undefined);
    },
    /**
     * `pane`에서 `folder`를 보는 탭을 활성으로 한다. 그 패널에 같은 폴더를 보는 탭이 이미 있으면 새로 만들지 않고 그 탭을 쓴다
     * (같은 `td .`를 여러 번 쳐도 탭이 쌓이지 않게). `focus`가 있으면 커서를 그 이름에 둔다. 그 패널이 활성 패널이 된다.
     */
    async openFolderTab(pane: PaneId, folder: string, focus?: string) {
      const s = get();
      const p = s.panes[pane];
      const index = p.tabs.findIndex((t) => !t.virtual && t.path === folder);
      if (index >= 0) {
        set({ activePane: pane, panes: { ...s.panes, [pane]: { ...p, active: index } } });
        if (focus) await reload(pane, p.tabs[index].id, focus);
        return;
      }
      const tab = newTab(folder);
      set({ activePane: pane, panes: { ...s.panes, [pane]: { tabs: [...p.tabs, tab], active: p.tabs.length } } });
      await reload(pane, tab.id, focus);
      await syncWatches();
    },
    async closeTab() {
      const s = get();
      await api.closeTabAt(s.activePane, s.panes[s.activePane].active);
    },
    /**
     * `pane`의 탭 `index`를 닫는다(탭 가운데 클릭, `core.tab.close`). 패널의 마지막 탭이거나 범위 밖이면 아무것도 바꾸지 않는다.
     * 활성 탭을 닫으면 활성은 이웃으로 옮겨 가고, 다른 탭을 닫으면 활성 탭은 같은 탭을 계속 가리킨다. 활성 패널은 바꾸지 않는다.
     */
    async closeTabAt(pane: PaneId, index: number) {
      const s = get();
      const p = s.panes[pane];
      if (p.tabs[index]?.virtual?.kind === "terminal") return removeTerminalTab(pane, index);
      if (p.tabs.length <= 1 || index < 0 || index >= p.tabs.length) return;
      stopSearch(p.tabs[index]); // 가상 탭을 닫으면 진행 중인 작업도 멈추고 결과를 버린다
      const tabs = p.tabs.filter((_, i) => i !== index);
      const active = index === p.active ? Math.min(index, tabs.length - 1) : tabs.indexOf(p.tabs[p.active]);
      set({ panes: { ...s.panes, [pane]: { tabs, active } } });
      await syncWatches();
    },
    /** 같은 패널 안에서 탭 `from`을 `to` 자리로 옮긴다. 활성 탭은 같은 탭을 계속 가리킨다. 범위 밖이거나 제자리면 아무것도 바꾸지 않는다. */
    moveTab(pane: PaneId, from: number, to: number) {
      const p = get().panes[pane];
      const n = p.tabs.length;
      if (from === to || from < 0 || to < 0 || from >= n || to >= n) return;
      const tabs = [...p.tabs];
      const [moved] = tabs.splice(from, 1);
      tabs.splice(to, 0, moved);
      const active = tabs.indexOf(p.tabs[p.active]);
      set((s) => ({ panes: { ...s.panes, [pane]: { tabs, active } } }));
    },
    setTabDropTarget(pane: PaneId | null) {
      if (get().tabDropTarget !== pane) set({ tabDropTarget: pane });
    },
    /**
     * 탭 `index`를 반대쪽 패널(`to`)의 `toIndex` 자리로 보낸다. 원래 패널에 탭이 둘 이상이면 이동(탭 상태를 그대로 가져간다),
     * 하나뿐이면 복사한다(원본은 그대로 두고 같은 경로의 새 탭을 만든다 — 원래 패널이 탭 0개가 되지 않게). 보낸 탭이 그 패널의 활성 탭이 되고 그 패널이 활성 패널이 된다.
     * 터미널 탭(이슈 #96)은 pty 세션이 하나뿐이라 복사하지 않고 늘 이동한다(같은 탭 id·세션 번호, 세션은 닫지 않는다).
     * 마지막 탭인 터미널을 보내면 원래 패널에는 그 터미널이 시작한 폴더를 보는 파일 탭을 채운다(터미널 탭을 닫을 때와 같다).
     * 터미널이 아닌 가상 탭(검색 결과 등)·범위 밖·같은 패널이면 아무것도 바꾸지 않는다.
     */
    async transferTab(from: PaneId, index: number, to: PaneId, toIndex: number) {
      if (from === to) return;
      const s = get();
      const src = s.panes[from];
      const dst = s.panes[to];
      const tab = src.tabs[index];
      const terminal = tab?.virtual?.kind === "terminal";
      if (!tab || (tab.virtual && !terminal)) return;
      const at = Math.min(Math.max(toIndex, 0), dst.tabs.length);
      const copying = !terminal && src.tabs.length <= 1;
      const incoming = copying ? newTab(tab.path) : tab;
      const dstTabs = [...dst.tabs.slice(0, at), incoming, ...dst.tabs.slice(at)];
      let srcPane = src;
      // 마지막 탭이던 터미널을 보내면 원래 패널이 비지 않게 그 터미널이 시작한 폴더를 보는 파일 탭을 채운다.
      let fill: TabState | null = null;
      if (!copying) {
        const tabs = src.tabs.filter((_, i) => i !== index);
        if (tabs.length === 0 && tab.virtual?.kind === "terminal") {
          fill = newTab(tab.virtual.base);
          srcPane = { tabs: [fill], active: 0 };
        } else {
          const kept = src.tabs[src.active];
          const active = index === src.active ? Math.min(index, tabs.length - 1) : tabs.indexOf(kept);
          srcPane = { tabs, active };
        }
      }
      set((st) => ({ panes: { ...st.panes, [from]: srcPane, [to]: { tabs: dstTabs, active: at } }, activePane: to }));
      if (copying) await reload(to, incoming.id);
      if (fill) await reload(from, fill.id);
      await syncWatches();
    },
    cycleTab(delta: 1 | -1) {
      const s = get();
      const p = s.panes[s.activePane];
      const active = (p.active + delta + p.tabs.length) % p.tabs.length;
      set({ panes: { ...s.panes, [s.activePane]: { ...p, active } } });
    },

    /** `index`번째(1부터) 탭으로 간다(`core.tab.goto`). 9는 마지막 탭이고, 탭 수를 넘는 번호나 잘못된 값은 아무 일도 하지 않는다. */
    gotoTab(index: number) {
      const s = get();
      const p = s.panes[s.activePane];
      const active = index === 9 ? p.tabs.length - 1 : index - 1;
      if (!Number.isInteger(active) || active < 0 || active >= p.tabs.length || active === p.active) return;
      set({ panes: { ...s.panes, [s.activePane]: { ...p, active } } });
    },

    async toggleHidden() {
      set((s) => ({ showHidden: !s.showHidden }));
      await reloadAll();
    },

    /** 수정자 없는 문자 입력: Quick Select를 시작/확장하고 일치 항목으로 커서를 옮긴다 (SEL-05). */
    quickInput(char: string) {
      const q = cfg().behavior.quick_select;
      patchActive((t) => {
        // 아무 문자로나 시작하지 않는 설정이면 `core.quickselect.start`로만 시작한다.
        if (t.quick === null && !q.activate_on_any_character) return {};
        const text = appendQuick(t.quick ?? "", char);
        return { quick: text, ...quickCursor(t, text, q.match_only_prefix) };
      });
    },
    quickStart() {
      patchActive((t) => (t.quick === null ? { quick: "" } : {}));
    },
    quickBackspace() {
      const prefix = cfg().behavior.quick_select.match_only_prefix;
      patchActive((t) => {
        const text = backspaceQuick(t.quick ?? "");
        return { quick: text, ...quickCursor(t, text, prefix) };
      });
    },
    /** 빠른 선택 중 ↑↓: 입력과 일치한 행들 사이에서만 커서를 옮긴다. 끝에서는 멈추고 순환하지 않는다. */
    quickMove(step: -1 | 1) {
      const prefix = cfg().behavior.quick_select.match_only_prefix;
      patchActive((t) => {
        if (!t.quick) return {};
        const hits: number[] = [];
        t.entries.forEach((e, i) => quickMatch(e.name, t.quick!, prefix) && hits.push(i));
        const next = step > 0 ? hits.find((i) => i > t.cursor) : [...hits].reverse().find((i) => i < t.cursor);
        return next === undefined ? {} : { cursor: next };
      });
    },
    /** Return: 빠른 선택을 끝내고 커서 행을 연다(폴더면 들어가고 파일이면 기본 열기). */
    async quickAccept() {
      patchActive({ quick: null });
      await api.open();
    },
    quickCancel() {
      patchActive({ quick: null });
    },

    /** 이름 다이얼로그의 체크박스(비밀번호 창이면 "기억")를 바꾼다. */
    dialogSetOption(checked: boolean) {
      set((s) =>
        s.dialog?.kind === "name" && s.dialog.option
          ? { dialog: { ...s.dialog, option: { ...s.dialog.option, checked } } }
          : s.dialog?.kind === "hostKey"
            ? { dialog: { ...s.dialog, confirmed: checked } }
          : s.dialog?.kind === "password"
            ? { dialog: { ...s.dialog, remember: checked } }
            : {},
      );
    },
    /** 다중 이름 바꾸기 창의 입력을 바꾼다. */
    dialogMultiRenameSet(patch: Partial<RenameOptions>) {
      set((s) => (s.dialog?.kind === "multirename" ? { dialog: { ...s.dialog, options: { ...s.dialog.options, ...patch } } } : {}));
    },
    dialogMultiRenameReset() {
      set((s) => (s.dialog?.kind === "multirename" ? { dialog: { ...s.dialog, options: { ...DEFAULT_RENAME_OPTIONS } } } : {}));
    },
    dialogSetValue(value: string) {
      set((s) => (s.dialog?.kind === "name" || s.dialog?.kind === "password" ? { dialog: { ...s.dialog, value, error: null } } : {}));
    },
    dialogSetChoice(index: number) {
      set((s) =>
        s.dialog?.kind === "conflict"
          ? { dialog: { ...s.dialog, selected: (index + CONFLICT_CHOICES.length) % CONFLICT_CHOICES.length } }
          : s.dialog?.kind === "choice"
            ? { dialog: { ...s.dialog, selected: (index + s.dialog.choices.length) % s.dialog.choices.length } }
            : {},
      );
    },
    /** 충돌 창의 "남은 항목에도 같은 선택 적용"을 켜고 끈다. */
    dialogSetApplyAll(all?: boolean) {
      set((s) => (s.dialog?.kind === "conflict" ? { dialog: { ...s.dialog, all: all ?? !s.dialog.all } } : {}));
    },
    dialogConfirm() {
      const d = get().dialog;
      if (!d) return;
      if (d.kind === "progress") {
        // Return: 진행 중이면 창만 닫고 작업은 큐에서 계속 돌게 하고(백그라운드), 끝난(실패) 뒤에는 그냥 닫는다.
        set({ dialog: null });
        return;
      }
      let result: unknown = true;
      if (d.kind === "multirename") {
        // 오류가 있거나 바뀌는 이름이 없으면 닫지 않는다(버튼도 비활성이다).
        const newNames = buildNewNames(d.items, d.options);
        const errors = validateNames(d.items, newNames, d.existing);
        if (errors.some((e) => e !== null) || d.items.every((it, i) => it.name === newNames[i])) return;
        result = { items: d.items, newNames };
      } else if (d.kind === "hostKey") {
        if (!d.confirmed) return;
        result = true;
      } else if (d.kind === "name") {
        if (d.value.trim() === "") {
          set({ dialog: { ...d, error: tr("store.name.required") } });
          return;
        }
        result = d.option ? { value: d.value, checked: d.option.checked } : d.value;
      } else if (d.kind === "password") {
        result = { value: d.value, remember: d.remember };
      } else if (d.kind === "conflict") {
        result = { choice: CONFLICT_CHOICES[d.selected], all: d.all };
      } else if (d.kind === "choice") {
        result = d.selected;
      }
      set({ dialog: null });
      pending?.(result);
      pending = null;
    },
    dialogCancel() {
      const d = get().dialog;
      if (d?.kind === "progress") {
        const job = get().queue.find((j) => j.id === d.jobId);
        set({ dialog: null });
        if (job && isActiveJob(job)) void backend.queueAbort(d.jobId);
        return;
      }
      set({ dialog: null });
      pending?.(null);
      pending = null;
    },

    /** 새 폴더 (OP-01). 중첩 경로(`a/b/c`)를 허용한다. */
    async newFolder() {
      const tab = activeTab(get());
      if (tab.virtual) return fail(VIRTUAL_NO_CREATE());
      const name = await ask<string>({ kind: "name", title: tr("store.new_folder"), value: "", error: null, selectStem: false });
      if (name === null) return;
      set({ notice: null });
      try {
        const typed = name.trim();
        await backend.mkdir(joinPath(tab.path, typed));
        await reloadAll();
        cursorToCreated(typed);
      } catch (e) {
        fail(e);
      }
    },
    /** 명령어 줄로 포커스를 옮긴다(이슈 #110). 줄이 꺼져 있으면 먼저 켠다. 로컬 폴더가 아니면 알림만 보인다. */
    async focusCommandLine() {
      const tab = activeTab(get());
      if (tab.virtual || isArchivePath(tab.path) || isRemotePath(tab.path)) return fail(tr("store.run_command.local_only"));
      if (!get().loaded.config.behavior.layout.show_command_line) await api.toggleLayoutFlag("show_command_line");
      set({ commandLineFocus: get().commandLineFocus + 1 });
    },
    /** 명령어 줄에 입력한 셸 한 줄을 활성 탭의 로컬 폴더에서 실행한다. 출력이 있거나 실패하면 결과 창을 띄우고, 끝나면 목록을 다시 읽는다. */
    async runCommand(command: string) {
      const tab = activeTab(get());
      if (tab.virtual || isArchivePath(tab.path) || isRemotePath(tab.path)) return fail(tr("store.run_command.local_only"));
      command = command.trim();
      if (!command) return;
      set({ notice: null });
      flash(tr("store.run_command.running", { command }));
      try {
        const r = await backend.runShellCommand(tab.path, command);
        await reloadAll();
        const failed = r.timed_out || r.exit_code !== 0;
        if (!failed && !r.output) return flash(tr("store.run_command.done", { command }));
        const status = r.timed_out ? tr("store.run_command.timed_out") : tr("store.run_command.exit_code", { code: String(r.exit_code ?? "?") });
        await ask<boolean>({ kind: "info", title: tr("store.run_command.result"), lines: [command, status, ...(r.output ? r.output.split("\n") : [])], copyText: r.output || undefined });
      } catch (e) {
        fail(e);
      }
    },
    /** 새 파일 (OP-02). */
    async newFile() {
      const tab = activeTab(get());
      if (tab.virtual) return fail(VIRTUAL_NO_CREATE());
      const name = await ask<string>({ kind: "name", title: tr("store.new_file"), value: "", error: null, selectStem: false });
      if (name === null) return;
      set({ notice: null });
      try {
        const typed = name.trim();
        await backend.touch(joinPath(tab.path, typed));
        await reloadAll();
        cursorToCreated(typed);
      } catch (e) {
        fail(e);
      }
    },
    /** 이름 변경 (OP-05). 커서 항목 하나가 대상이며 확장자를 뺀 부분이 처음에 선택된다. */
    /** 커서 항목의 이름 칸을 입력칸으로 바꾼다(이슈 #65). 2개 이상 선택하면 다중 이름 바꾸기. */
    async renameCursor() {
      const s = get();
      const tab = activeTab(s);
      if (tab.selection.size >= 2) return api.multiRename();
      const entry = cursorEntry(tab);
      if (!entry) return;
      set({ notice: null, rename: { pane: s.activePane, tabId: tab.id, path: entry.path, value: entry.name, busy: false } });
    },
    renameSetValue(value: string) {
      const r = get().rename;
      if (r) set({ rename: { ...r, value } });
    },
    renameCancel() {
      set({ rename: null });
    },
    /**
     * 입력한 이름으로 바꾼다. `move`가 있으면 저장한 뒤 **편집 전 위치** 기준 위(-1)/아래(1) 항목의 이름 편집으로 넘어간다
     * (맨 위·맨 아래면 저장만 하고 끝낸다). 실패하면(중복·쓸 수 없는 문자) 이동하지 않고 편집을 이어 간다.
     * `blurPath`는 입력칸이 포커스를 잃어 저장할 때 준다: 그 항목을 편집 중일 때만 저장하고(입력칸이 사라지며 늦게 온 blur가
     * 다음 항목을 저장하지 않게), 실패하면 편집을 끝낸다(이미 다른 곳을 누른 뒤라 입력칸으로 되돌아가지 않는다).
     */
    async renameCommit(move: -1 | 0 | 1 = 0, blurPath?: string) {
      const r = get().rename;
      if (!r || r.busy || (blurPath !== undefined && r.path !== blurPath)) return;
      const tab = get().panes[r.pane].tabs.find((t) => t.id === r.tabId);
      const idx = tab ? tab.entries.findIndex((e) => e.path === r.path) : -1;
      if (!tab || idx < 0) return set({ rename: null });
      const entry = tab.entries[idx];
      const next = move === 0 ? undefined : tab.entries[idx + move];
      const name = r.value.trim();
      const cursorBefore = tab.cursor;
      let dest = entry.path;
      if (name !== entry.name) {
        set({ notice: null, rename: { ...r, busy: true } });
        try {
          dest = await backend.rename(entry.path, name);
        } catch (e) {
          set((s) => ({ rename: blurPath === undefined && s.rename ? { ...s.rename, busy: false } : null }));
          return fail(e);
        }
        if (tab.virtual) {
          // 가상 탭은 다시 읽을 폴더가 없으니 결과 항목만 새 이름으로 바꾼다
          patchTab(r.pane, r.tabId, (t) => ({
            entries: t.entries.map((e) => (e.path === entry.path ? { ...e, name: baseName(dest), path: dest } : e)),
            selection: new Set([...t.selection].map((p) => (p === entry.path ? dest : p))),
          }));
        }
        await reloadAll();
      }
      const after = get().panes[r.pane].tabs.find((t) => t.id === r.tabId);
      const indexOf = (p: string) => (after?.entries ?? []).findIndex((x) => x.path === p);
      if (!next) {
        // 커서가 편집 전 자리에 그대로 있으면 새 이름으로 옮긴다. 다른 행을 눌러 저장했으면 커서는 그 행에 남는다.
        // 경로가 아니라 위치로 본다: 다시 읽은 목록에서 옛 경로는 사라지고 커서는 같은 위치에 남는다. 다 읽은 뒤에 정해야
        // 늦게 끝난 다시 읽기가 사용자가 누른 행을 덮어쓰지 않는다.
        const at = indexOf(dest);
        if (after && at >= 0 && cursorBefore === idx && after.cursor === cursorBefore) patchTab(r.pane, r.tabId, { cursor: at });
        return set({ rename: null });
      }
      const at = indexOf(next.path);
      if (at < 0) return set({ rename: null });
      patchTab(r.pane, r.tabId, { cursor: at });
      set({ rename: { pane: r.pane, tabId: r.tabId, path: next.path, value: next.name, busy: false } });
    },
    /** 다중 이름 바꾸기 (`core.rename.multi`): 선택한 항목의 이름을 마스크·찾기/바꾸기·카운터로 한꺼번에 바꾼다. */
    async multiRename() {
      const s = get();
      const pane = s.activePane;
      const tab = activeTab(s);
      const targets = targetsOf(tab);
      if (targets.length < 2) return fail(tr("store.multi_rename.need_two"));
      if (tab.virtual) return fail(tr("store.multi_rename.virtual"));
      if (targets.some((t) => isArchivePath(t.path))) return fail(tr("store.multi_rename.archive"));
      const items = targets.map((t) => ({ path: t.path, name: t.name, isDir: t.kind === "dir", modifiedMs: t.modifiedMs }));
      const plan = await ask<{ items: typeof items; newNames: string[] }>({
        kind: "multirename",
        title: tr("store.multi_rename.title"),
        items,
        existing: tab.entries.map((e) => e.name),
        options: { ...DEFAULT_RENAME_OPTIONS },
      });
      if (!plan) return;
      set({ notice: null });
      const rows = plan.items.map((it, i) => ({ ...it, to: plan.newNames[i] })).filter((r) => r.to !== r.name);
      const done: string[] = [];
      const failed: string[] = [];
      const run = async (path: string, to: string, label: string) => {
        try {
          return await backend.rename(path, to);
        } catch (e) {
          failed.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
          return null;
        }
      };
      if (needsTempStep(plan.items, plan.newNames)) {
        // 새 이름이 다른 항목의 옛 이름과 겹치면(맞바꾸기·연쇄) 모두 임시 이름을 거쳐 옮긴다.
        const stamp = Date.now();
        const staged: { tmp: string; to: string; name: string }[] = [];
        for (const [i, r] of rows.entries()) {
          const tmp = await run(r.path, `.td-rename-${stamp}-${i}`, r.name);
          if (tmp) staged.push({ tmp, to: r.to, name: r.name });
        }
        for (const st of staged) {
          const dest = await run(st.tmp, st.to, st.name);
          if (dest) done.push(dest);
          else failed.push(tr("store.multi_rename.temp_left", { name: st.name, temp: baseName(st.tmp) }));
        }
      } else {
        for (const r of rows) {
          const dest = await run(r.path, r.to, r.name);
          if (dest) done.push(dest);
        }
      }
      patchTab(pane, tab.id, { selection: new Set(done) });
      await reloadAll();
      if (failed.length > 0) fail(tr("store.multi_rename.partial", { done: done.length, failed: failed.length, details: failed.join(" / ") }));
      else flash(tr("store.multi_rename.done", { count: done.length }));
    },
    /** 비활성 패널로 복사/이동 (OP-03, OP-04). 이름이 겹치면 항목마다 물어본 뒤 작업 큐에 넣는다. */
    async copyOrMove(kind: "copy" | "move", confirm = true) {
      const s = get();
      const targets = targetsOf(activeTab(s));
      if (targets.length === 0) return;
      const inactive = activeTab(s, other(s.activePane));
      if (inactive.virtual) return fail(VIRTUAL_NO_DEST());
      const verb = kind === "copy" ? tr("store.verb.copy") : tr("store.verb.move");
      set({ notice: null });
      const title =
        targets.length === 1
          ? tr("store.transfer.ask_one", { name: targets[0].name, verb })
          : tr("store.transfer.ask_many", { count: targets.length, verb });
      let destDir = inactive.path;
      let error: string | null = null;
      while (confirm) {
        const value = await ask<string>({ kind: "name", title, label: tr("store.transfer.dest_label"), value: destDir, error, selectStem: false, confirmLabel: tr("store.transfer.start") });
        if (value === null) return;
        destDir = value.trim();
        if (isRemotePath(destDir)) destDir = trimTrailingSep(destDir); // 원격 루트(`sftp://id/`)의 끝 `/`는 떼지 않는다
        else if (destDir.length > 1) destDir = destDir.replace(/\/+$/, "");
        error = await transferDestError(destDir, targets);
        if (!error) break;
      }
      await runTransfer(kind, targets, destDir, confirm ? TRANSFER_PROGRESS_DELAY_COPY_MS : TRANSFER_PROGRESS_DELAY_MS, true);
    },
    /** 행에서 마우스를 눌렀다: 5px 이상 움직이면 드래그가 시작된다. */
    dragPress(pane: PaneId, index: number, x: number, y: number) {
      pendingDrag = { pane, index, x, y };
    },
    /** 마우스가 움직였다. 드래그 중이면 표시와 대상을 갱신하고, 누른 상태면 거리를 재어 드래그를 시작한다. `el`은 커서 아래 요소. */
    dragMove(x: number, y: number, ctrl: boolean, el: Element | null) {
      let drag = get().drag;
      if (drag?.external) return; // 다른 앱에서 끌어 오는 중에는 앱 안 끌기로 바꾸지 않는다
      if (!drag) {
        const p = pendingDrag;
        if (!p || Math.hypot(x - p.x, y - p.y) < DRAG_START_PX) return;
        const tab = activeTab(get(), p.pane);
        const entry = tab.entries[p.index];
        pendingDrag = null;
        if (!entry) return;
        // 끄는 행이 선택에 들어 있으면 선택 전체, 아니면 그 행만 끈다.
        const paths = tab.selection.has(entry.path) ? tab.entries.filter((e) => tab.selection.has(e.path)).map((e) => e.path) : [entry.path];
        drag = { paths, sourcePane: p.pane, x, y, ctrl, target: null };
      }
      // 마우스가 창 밖으로 나갔다: 앱 안의 드래그를 접고 운영체제 드래그로 넘겨 Finder 같은 다른 앱에 놓을 수 있게 한다.
      // 단추를 누른 채 창 밖으로 나가도 웹뷰가 좌표를 계속 준다.
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
        set({ drag: null });
        justDragged = true;
        setTimeout(() => (justDragged = false), 0);
        void api.dragOutOfWindow(drag.paths);
        return;
      }
      set({ drag: { ...drag, x, y, ctrl, target: dropTargetAt(el, drag) } });
    },
    /**
     * 다른 앱(Finder)에서 끌어 온 파일 이벤트 (이슈 #39). 끄는 동안(`enter`/`over`)에는 놓을 대상(폴더 행, 아니면 패널의 현재 폴더)을
     * 강조 상태로 알리고, 놓으면(`drop`) 그 폴더로 **복사**한다(Tauri 이벤트에는 수정키가 없어 이동은 하지 않는다).
     * `el`은 이벤트 좌표 아래의 요소다.
     */
    externalDrop(e: FileDropEvent, el: Element | null) {
      if (e.type === "leave") {
        if (get().drag?.external) set({ drag: null });
        return;
      }
      const prev = get().drag;
      const paths = e.type === "over" ? (prev?.external ? prev.paths : []) : e.paths;
      const base = { paths, sourcePane: null, x: e.x, y: e.y, ctrl: false, external: true as const };
      const target = dropTargetAt(el, base);
      if (e.type !== "drop") {
        set({ drag: { ...base, target } });
        return;
      }
      set({ drag: null });
      if (paths.length === 0) return;
      if (!target) {
        // 가상 탭(검색 결과 등)에는 놓을 수 없다고 알린다. 패널 밖에 놓은 것은 조용히 무시한다.
        const pane = el?.closest<HTMLElement>("section[data-pane]")?.dataset.pane as PaneId | undefined;
        if (pane && activeTab(get(), pane).virtual) fail(tr("store.drop.virtual"));
        return;
      }
      // 이미 그 폴더 안에 있는 항목은 건너뛴다(같은 폴더로 복사해 봐야 복제본만 생긴다).
      const srcs = paths.filter((p) => parentPath(p) !== target.dir);
      if (srcs.length === 0) return flash(tr("store.drop.already_here"));
      void api.dropTransfer(srcs, target.dir, false);
    },
    /** 끌던 파일을 운영체제 드래그로 넘긴다(창 밖으로 나갔을 때). 아카이브 안의 항목은 실제 파일이 아니라 보낼 수 없다. */
    async dragOutOfWindow(paths: string[]) {
      if (paths.some((p) => isArchivePath(p))) return fail(tr("store.drag.archive"));
      try {
        await backend.startNativeDrag(paths);
      } catch (e) {
        fail(e);
      }
    },
    /** 웹뷰가 파일을 직접 읽어 재생할 수 있는 주소(비디오 미리보기). */
    fileUrl(path: string): string {
      return backend.fileUrl(path);
    },
    /** Office 문서를 office_oxide로 읽은 Markdown(글자·표). */
    officePreview(path: string) {
      return backend.officePreview(path);
    },
    /** 항목의 시스템 파일 아이콘(데이터 주소, 이 OS가 못 주면 null). 설정 `behavior.table.system_icons`가 켜졌을 때만 부른다. */
    systemIcon(path: string, isDir: boolean, size: number) {
      return backend.systemIcon(path, isDir, size);
    },
    /** epub의 제목·저자·표지·챕터 목록. */
    epubOpen(path: string) {
      return backend.epubOpen(path);
    },
    /** epub의 `index`번째 챕터 HTML. */
    epubChapter(path: string, index: number) {
      return backend.epubChapter(path, index);
    },
    /** 미리보기가 시트(챕터·쪽) `count`개짜리 파일을 열었다. 첫 시트부터 보인다. */
    previewSheetsLoaded(path: string, count: number) {
      set({ previewSheet: count > 1 ? { path, index: 0, count } : null });
    },
    /** 보고 있는 시트를 고른다. */
    previewSheetSelect(index: number) {
      set((s) => (s.previewSheet && index >= 0 && index < s.previewSheet.count ? { previewSheet: { ...s.previewSheet, index } } : {}));
    },
    /** 다음(1)·이전(-1) 시트로 간다. 끝에서는 처음으로 돌아간다. 지금 미리보기의 파일이 아니면 아무 일도 없다. */
    previewSheetStep(delta: 1 | -1) {
      const { previewSheet: ps, preview } = get();
      if (!ps || ps.path !== preview?.path) return;
      set({ previewSheet: { ...ps, index: (ps.index + delta + ps.count) % ps.count } });
    },
    isDragActive(): boolean {
      return get().drag !== null;
    },
    /** Control 키를 눌렀다 뗐다(마우스가 안 움직여도 표시가 바뀐다). */
    dragSetCtrl(ctrl: boolean) {
      set((s) => (s.drag ? { drag: { ...s.drag, ctrl } } : {}));
    },
    /** 마우스를 뗐다: 드래그 중이면 대상에 놓고, 아니면 눌림만 풀린다. 드래그였는지 돌려준다. */
    dragRelease(ctrl: boolean): boolean {
      pendingDrag = null;
      const drag = get().drag;
      if (!drag || drag.external) return false;
      set({ drag: null });
      justDragged = true;
      setTimeout(() => (justDragged = false), 0);
      if (drag.target) void api.dropTransfer(drag.paths, drag.target.dir, ctrl || drag.ctrl);
      return true;
    },
    /** Esc나 창 포커스를 잃어 드래그를 취소한다. */
    dragCancel() {
      pendingDrag = null;
      if (!get().drag) return;
      set({ drag: null });
      justDragged = true;
      setTimeout(() => (justDragged = false), 0);
    },
    /** 드래그를 막 끝냈으면 그 직후의 click을 무시하라고 알려 준다. */
    consumeDragClick(): boolean {
      return justDragged;
    },
    /** 끌어 놓기: `destDir`로 복사하거나(`move`면 이동). 확인 창 없이 겹친 이름만 묻고 작업 큐에 넣는다. */
    async dropTransfer(paths: string[], destDir: string, move: boolean) {
      if (paths.length === 0) return;
      set({ notice: null });
      // 이동인데 이미 그 폴더에 있는 항목은 할 일이 없다. 복사는 같은 폴더여도 이름을 바꿔 복제할 수 있다.
      const srcs = move ? paths.filter((p) => parentPath(p) !== destDir) : paths;
      if (srcs.length === 0) return;
      let entries: Pick<EntryDto, "path" | "kind">[];
      try {
        entries = await Promise.all(srcs.map(async (p) => ({ path: p, kind: (await backend.fileInfo(p)).kind })));
      } catch (e) {
        return fail(e);
      }
      const error = await transferDestError(destDir, entries);
      if (error) return fail(error);
      await runTransfer(move ? "move" : "copy", entries, destDir, TRANSFER_PROGRESS_DELAY_COPY_MS, false);
    },
    /** 클립보드로 복사 (Mod+C): 대상 항목을 운영체제 파일 클립보드에 쓴다. */
    async clipboardCopy() {
      await writeClipboard("copy");
    },
    /** 클립보드로 잘라내기 (Mod+X): 파일 클립보드에 쓰고, 붙여 넣을 때 이동하도록 기억한다. 붙여 넣기 전에는 원본이 그대로다. */
    async clipboardCut() {
      await writeClipboard("cut");
    },
    /** 붙여넣기 (Mod+V): 클립보드의 파일을 활성 패널의 현재 폴더로 복사한다. 잘라낸 것이면 이동한다. */
    async clipboardPaste() {
      const tab = activeTab(get());
      if (tab.virtual) return fail(VIRTUAL_NO_DEST());
      set({ notice: null });
      let paths: string[];
      try {
        paths = await backend.getClipboardFiles();
      } catch (e) {
        return fail(e);
      }
      if (paths.length === 0) return flash(tr("store.paste.none"));
      const destDir = tab.path;
      const cut = paths.length === cutPaths.length && paths.every((p) => cutPaths.includes(p));
      const kind = cut ? "move" : "copy";
      // 잘라낸 파일을 원래 폴더에 붙여 넣으면 할 일이 없다.
      const srcs = kind === "move" ? paths.filter((p) => parentPath(p) !== destDir) : paths;
      if (srcs.length === 0) return;
      let entries: Pick<EntryDto, "path" | "kind">[];
      try {
        entries = await Promise.all(srcs.map(async (p) => ({ path: p, kind: (await backend.fileInfo(p)).kind })));
      } catch (e) {
        return fail(e);
      }
      const error = await transferDestError(destDir, entries);
      if (error) return fail(error);
      await runTransfer(kind, entries, destDir, TRANSFER_PROGRESS_DELAY_COPY_MS, false);
      if (kind === "move") {
        cutPaths = [];
        await backend.setClipboardFiles([]).catch(() => {}); // 이동한 파일은 더 이상 그 자리에 없으니 비운다
      }
    },
    /** 휴지통으로 이동 (OP-06). 기본 설정에서는 확인하지 않는다. */
    async trashTargets() {
      const targets = targetsOf(activeTab(get()));
      if (targets.length === 0) return;
      if (targets.some((t) => isArchivePath(t.path))) {
        fail(tr("store.trash.archive"));
        return;
      }
      // 원격 서버에는 휴지통이 없다. 영구 삭제로 바꾸고, 되돌릴 수 없으므로 설정과 무관하게 확인한다.
      if (targets.some((t) => isRemotePath(t.path))) return api.deleteTargets(true);
      if (cfg().core.confirm.trash && !(await api.confirmTargets(tr("store.trash.confirm", { count: targets.length }), targets))) return;
      set({ notice: null });
      patchActive({ selection: new Set() });
      api.recheckVirtual(targets.map((t) => t.path));
      const jobId = await backend.enqueue("trash", targets.map((t) => ({ src: t.path, destDir: null, policy: "skip" })));
      void trackTransfer(jobId, tr("store.trash.progress"));
      await reloadAll();
    },
    /** 압축 (OP-11, `core.compress`): 대상 항목을 이 폴더의 ZIP 하나로 묶는다. 원본은 그대로 둔다. */
    async compress() {
      const tab = activeTab(get());
      const targets = targetsOf(tab);
      if (targets.length === 0) return;
      if (tab.virtual) return fail(tr("store.compress.virtual"));
      if (targets.some((t) => isArchivePath(t.path))) return fail(tr("store.compress.archive"));
      // 여러 항목은 압축 파일 이름을 물어본다(기본: 이 폴더 이름). 하나면 그 항목 이름을 쓴다.
      let name: string | undefined;
      const pane = get().activePane;
      const otherPane = other(pane);
      const inactive = activeTab(get(), otherPane);
      let toOther = false;
      if (targets.length > 1) {
        // 반대 패널이 실제 폴더일 때만 거기에 둘 수 있다(검색 결과·아카이브 안은 불가).
        const canOther = !inactive.virtual && !isArchivePath(inactive.path);
        const asked = await ask<{ value: string; checked: boolean }>({
          kind: "name",
          title: tr("store.compress.name"),
          value: `${baseName(tab.path) || "archive"}.zip`,
          error: null,
          selectStem: true,
          option: canOther ? { label: tr("store.compress.other_pane"), checked: false } : undefined,
        });
        if (asked === null) return;
        const trimmed = asked.value.trim();
        name = /\.zip$/i.test(trimmed) ? trimmed : `${trimmed}.zip`;
        toOther = canOther && asked.checked;
      }
      set({ notice: null });
      patchActive({ selection: new Set() });
      const destPane = toOther ? otherPane : pane;
      const destTab = toOther ? inactive : tab;
      const before = new Set(destTab.entries.map((e) => e.name));
      try {
        const jobId = await backend.enqueueCompress(targets.map((t) => t.path), destTab.path, name);
        await trackTransfer(jobId, tr("store.compress.progress"));
      } catch (e) {
        fail(e);
      }
      await reloadAll();
      // 만들어진 압축 파일에 커서를 둔다(작업이 끝나 목록에 나타난 새 항목).
      const after = get().panes[destPane].tabs.find((t) => t.id === destTab.id);
      const idx = after?.entries.findIndex((e) => !before.has(e.name) && e.kind === "file") ?? -1;
      if (after && idx >= 0) patchTab(destPane, destTab.id, { cursor: idx });
    },
    /** 추출 (OP-11, `core.extract`): 선택한 아카이브를 각각 그 옆의 새 폴더에 푼다. `toInactive`이면 반대편 패널 폴더에 푼다. */
    async extract(toInactive = false) {
      const s = get();
      const targets = targetsOf(activeTab(s)).filter(
        (t) => t.kind === "file" && isArchiveName(t.name, cfg().file_systems.zip.additional_extensions),
      );
      if (targets.length === 0) return fail(tr("store.extract.select"));
      if (targets.some((t) => isArchivePath(t.path))) return fail(tr("store.extract.nested"));
      let fixed: string | null = null;
      if (toInactive) {
        const inactive = activeTab(s, other(s.activePane));
        if (inactive.virtual) return fail(VIRTUAL_NO_DEST());
        if (isArchivePath(inactive.path)) return fail(tr("store.extract.into_archive"));
        fixed = inactive.path;
      }
      set({ notice: null });
      patchActive({ selection: new Set() });
      for (const t of targets) {
        try {
          const jobId = await backend.enqueueExtract(t.path, fixed ?? parentPath(t.path) ?? "/");
          void trackTransfer(jobId, tr("store.extract.progress"));
        } catch (e) {
          fail(e);
          break;
        }
      }
      await reloadAll();
    },
    /** 선택한 파일 한글 자소 문제 수정 (이슈 #50, `core.file.fix_hangul_selected`): 선택한 항목(없으면 커서 항목)의 이름만 조합형(NFC)으로 고친다. */
    async fixHangulSelected() {
      const tab = activeTab(get());
      const targets = targetsOf(tab);
      if (targets.length === 0) return;
      if (targets.some((t) => isArchivePath(t.path))) return fail(tr("store.hangul.archive"));
      set({ notice: null });
      try {
        await reportHangul(await backend.normalizeNames(targets.map((t) => t.path)));
      } catch (e) {
        fail(e);
      }
    },
    /** 현재 폴더 한글 자소 문제 수정 (이슈 #50, `core.file.fix_hangul_dir`): 현재 폴더 바로 아래 항목의 이름을 조합형으로 고친다. 하위 폴더 안은 건드리지 않는다. */
    async fixHangulDir() {
      const tab = activeTab(get());
      if (tab.virtual) return fail(tr("store.hangul.virtual"));
      if (isArchivePath(tab.path)) return fail(tr("store.hangul.archive"));
      set({ notice: null });
      try {
        await reportHangul(await backend.normalizeDir(tab.path));
      } catch (e) {
        fail(e);
      }
    },
    /** 심볼릭 링크 만들기 (OP-12, `core.file.symlink`): 커서 항목을 반대편 패널 폴더에 링크로 만든다. */
    async symlink() {
      const s = get();
      const entry = cursorEntry(activeTab(s));
      if (!entry) return;
      const inactive = activeTab(s, other(s.activePane));
      if (inactive.virtual) return fail(VIRTUAL_NO_DEST());
      if (isArchivePath(inactive.path) || isArchivePath(entry.path)) return fail(tr("store.symlink.archive"));
      set({ notice: null });
      try {
        let policy: ConflictDto = "skip";
        const existing = await backend.detectConflict(entry.path, inactive.path);
        if (existing !== null) {
          const answer = await ask<{ choice: ConflictDto; all: boolean }>({
            kind: "conflict",
            title: tr("store.symlink.conflict"),
            existing,
            selected: CONFLICT_CHOICES.indexOf("rename"),
            remaining: 1,
            all: false,
          });
          if (answer === null) return;
          policy = answer.choice;
        }
        const made = await backend.createSymlink(entry.path, inactive.path, policy);
        if (made) flash(tr("store.symlink.made", { path: made }));
        await reloadAll();
      } catch (e) {
        fail(e);
      }
    },
    /** 복제 (OP-08): 같은 폴더에 접미사를 붙여 복사한다. */
    async duplicateTargets() {
      const targets = targetsOf(activeTab(get()));
      if (targets.length === 0) return;
      set({ notice: null });
      patchActive({ selection: new Set() });
      await backend.enqueue("duplicate", targets.map((t) => ({ src: t.path, destDir: null, policy: "skip" })));
      await reloadAll();
    },
    /** 파일 정보 (OP-14): 커서 항목의 상세 정보를 대화상자로 보여 준다. */
    async showFileInfo() {
      const entry = cursorEntry(activeTab(get()));
      if (!entry) return;
      set({ notice: null });
      let info;
      try {
        info = await backend.fileInfo(entry.path);
      } catch (e) {
        return fail(e);
      }
      const display = cfg().display;
      const kind = { file: tr("store.info.kind.file"), dir: tr("store.info.kind.dir"), symlink: tr("store.info.kind.symlink") }[info.kind];
      const lines = [
        tr("store.info.name", { value: info.name }),
        tr("store.info.path", { value: info.path }),
        tr("store.info.kind", { value: kind }),
        info.kind === "dir"
          ? tr("store.info.children", { value: info.childCount ?? tr("store.info.unknown") })
          : tr("store.info.size", { value: formatSize(info.size, display.size_format), bytes: info.size }),
        tr("store.info.created", { value: formatDateTime(info.createdMs, display) }),
        tr("store.info.modified", { value: formatDateTime(info.modifiedMs, display) }),
        tr("store.info.accessed", { value: formatDateTime(info.accessedMs, display) }),
        ...(info.mode === null ? [] : [tr("store.info.mode", { value: formatPermissions(info.mode), octal: formatOctal(info.mode) })]),
        ...(info.linkTarget ? [tr("store.info.link", { value: info.linkTarget })] : []),
      ];
      await ask<boolean>({ kind: "info", title: tr("store.info.title", { name: info.name }), lines });
    },
    /** 상태 표시줄의 오류 메시지 전체를 팝업으로 보여 준다(팝업에서 복사할 수 있다). 메시지가 없으면 아무것도 하지 않는다. */
    async showNotice() {
      const text = get().notice;
      if (!text) return;
      await ask<boolean>({ kind: "info", title: tr("status.notice_title"), lines: [], copyText: text });
    },
    /** 팝업에 보이는 메시지(`copyText`)를 클립보드로 복사한다. 복사했으면 true. */
    async dialogCopyText(): Promise<boolean> {
      const d = get().dialog;
      if (d?.kind !== "info" || d.copyText === undefined) return false;
      try {
        await backend.copyText(d.copyText);
        return true;
      } catch (e) {
        fail(e);
        return false;
      }
    },
    /** 미리보기 중인 텍스트의 원문(보이는 부분)을 클립보드로 복사한다. 아직 읽는 중이거나 텍스트가 아니면 아무것도 하지 않는다. */
    async previewCopyText() {
      const pv = get().preview;
      const editing = get().previewEdit;
      const text = editing && editing.path === pv?.path ? editing.text : pv?.status === "ready" ? pv.data?.text : null;
      if (text === null || text === undefined) return;
      try {
        await backend.copyText(text);
      } catch (e) {
        fail(e);
      }
    },
    /** 미리보기 중인 이미지를 클립보드에 이미지로 복사한다. 이미지가 표시되고 있지 않으면 아무것도 하지 않고, 실패하면 알림을 띄운다. 복사했으면 true. */
    async previewCopyImage(): Promise<boolean> {
      const pv = get().preview;
      if (pv?.status !== "ready" || pv.data?.kind !== "image" || !pv.data.dataUrl) return false;
      try {
        await backend.copyImage(pv.path);
        return true;
      } catch (e) {
        fail(e);
        return false;
      }
    },
    /**
     * 미리보기에서 Mod+C: 이미지가 보이면 이미지로 복사하고, 아니면 선택한 글자를 복사한다(선택이 없으면 아무것도 하지 않는다).
     * 이 키는 `useKeyboard`가 바인딩으로 해석하는 순간 `preventDefault`되므로, 브라우저가 하던 선택 글자 복사를 여기서 대신한다.
     */
    async previewCopy() {
      const pv = get().preview;
      if (pv?.status === "ready" && pv.data?.kind === "image" && pv.data.dataUrl) {
        await api.previewCopyImage();
        return;
      }
      const selected = window.getSelection?.()?.toString() ?? "";
      if (!selected) return;
      try {
        await backend.copyText(selected);
      } catch (e) {
        fail(e);
      }
    },
    /** 폴더 경로 복사 (OP-15, F12). */
    async copyFolderPath() {
      const path = hereOf(activeTab(get()));
      try {
        await backend.copyText(path);
        flash(tr("store.path.folder_copied", { path }));
      } catch (e) {
        fail(e);
      }
    },
    /** 파일 경로 복사 (OP-15, Mod+F12): 대상 항목의 경로를 줄바꿈으로 이어 복사한다. */
    async copyFilePaths() {
      const targets = targetsOf(activeTab(get()));
      if (targets.length === 0) return;
      try {
        await backend.copyText(targets.map((t) => t.path).join("\n"));
        flash(tr("store.path.files_copied", { count: targets.length }));
      } catch (e) {
        fail(e);
      }
    },
    /** 파일 관리자에서 보기 (OP-16): 커서 항목, 없으면 현재 폴더. */
    async revealCursor() {
      const tab = activeTab(get());
      set({ notice: null });
      if (isRemotePath(cursorEntry(tab)?.path ?? hereOf(tab))) return fail(tr("store.remote.no_open"));
      try {
        await backend.revealPath(cursorEntry(tab)?.path ?? hereOf(tab));
      } catch (e) {
        fail(e);
      }
    },
    /** 편집 (OP-09, F4): 대상 항목을 설정한 편집기로 연다. */
    async editTargets() {
      const targets = targetsOf(activeTab(get()));
      if (targets.length === 0) return;
      set({ notice: null });
      if (targets.some((t) => isRemotePath(t.path))) return fail(tr("store.remote.no_open"));
      try {
        await backend.editPaths(targets.map((t) => t.path));
      } catch (e) {
        fail(e);
      }
    },
    /** 폴더 편집 (OP-09, Shift+F4): 현재 폴더를 편집기로 연다. */
    async editFolder() {
      set({ notice: null });
      if (isRemotePath(hereOf(activeTab(get())))) return fail(tr("store.remote.no_open"));
      try {
        await backend.editPaths([hereOf(activeTab(get()))]);
      } catch (e) {
        fail(e);
      }
    },

    /** 대상 이름을 보여 주는 확인 다이얼로그. 확인하면 true. */
    async confirmTargets(title: string, targets: EntryDto[]): Promise<boolean> {
      const ok = await ask<boolean>({
        kind: "confirm",
        title,
        lines: targets.slice(0, 5).map((t) => t.name).concat(targets.length > 5 ? [tr("store.more_items", { count: targets.length - 5 })] : []),
      });
      return ok === true;
    },
    /** 영구 삭제 (OP-07). `core.confirm.delete`가 켜져 있으면 확인을 거친다 (OP-13). */
    async deleteTargets(forceConfirm = false) {
      const targets = targetsOf(activeTab(get()));
      if (targets.length === 0) return;
      if ((forceConfirm || cfg().core.confirm.delete) && !(await api.confirmTargets(tr("store.delete.confirm", { count: targets.length }), targets))) return;
      set({ notice: null });
      patchActive({ selection: new Set() });
      api.recheckVirtual(targets.map((t) => t.path));
      const jobId = await backend.enqueue("delete", targets.map((t) => ({ src: t.path, destDir: null, policy: "skip" })));
      void trackTransfer(jobId, tr("store.delete.progress"));
      await reloadAll();
    },

    /** 마우스 오른쪽 클릭 선택 (`right_click_select`): 커서는 그대로 두고 그 행의 선택만 토글. */
    toggleSelectAt(index: number) {
      patchActive((t) => {
        const e = t.entries[index];
        if (!e) return {};
        const sel = new Set(t.selection);
        if (sel.has(e.path)) sel.delete(e.path);
        else sel.add(e.path);
        return { selection: sel, cursor: index };
      });
    },
    setKeymapWarnings(keymapWarnings: string[]) {
      set({ keymapWarnings });
    },
    /** 설정 경고 목록을 보여 준다. */
    async showConfigWarnings() {
      const s = get();
      const lines = s.loaded.warnings
        .map((w) => `${w.file}${w.line ? `:${w.line}` : ""}: ${rustText(w.message)}`)
        .concat(s.keymapWarnings);
      await ask<boolean>({ kind: "info", title: lines.length ? tr("store.warnings.title", { count: lines.length }) : tr("store.warnings.none"), lines });
    },

    /** Volumes/Favorites/Recent/Hierarchy 메뉴를 연다 (NAV-07~10). */
    async openMenu(kind: MenuKind) {
      const s = get();
      const tab = activeTab(s);
      let title = "";
      let items: MenuItem[] = [];
      set({ notice: null });
      try {
        if (kind === "volumes") {
          title = tr("store.menu.volumes");
          items = (await backend.listVolumes()).map((v) => ({
            label: v.name === v.mountPoint ? v.name : `${v.name} — ${v.mountPoint}`,
            path: v.mountPoint,
          }));
        } else if (kind === "favorites") {
          title = tr("store.menu.favorites");
          const dirs = s.userDirs;
          const resolve = (name: string, path: string, indent = ""): MenuItem[] => {
            const real = expandPath(path, dirs);
            return real ? [{ label: `${indent}${name}`, path: real, raw: path }] : [];
          };
          for (const f of s.loaded.config.favorites ?? []) {
            if (f.kind === "separator") items.push({ label: "", separator: true });
            else if (f.kind === "group") {
              items.push({ label: f.name ?? "" });
              for (const leaf of f.items ?? []) items.push(...resolve(leaf.name, leaf.path, "  "));
            } else items.push(...resolve(f.name ?? f.path ?? "", f.path ?? ""));
          }
        } else if (kind === "recent") {
          title = tr("store.menu.recent");
          const seen = new Set<string>([tab.path]);
          for (const p of [...s.recent].reverse()) {
            if (seen.has(p)) continue;
            seen.add(p);
            items.push({ label: p, path: p });
            if (items.length >= recentLimit(s.loaded.config)) break;
          }
        } else {
          title = tr("store.menu.hierarchy");
          for (let p: string | null = hereOf(tab); p !== null; p = parentPath(p)) {
            items.push({ label: p, path: p });
          }
        }
      } catch (e) {
        fail(e);
        return;
      }
      const first = items.findIndex(pickable);
      set({ menu: { kind, title, items, cursor: Math.max(first, 0), ...(kind === "recent" || kind === "favorites" ? { all: items, filter: "" } : {}) } });
    },
    /** 파일 행 우클릭: 선택 밖의 행이면 그 행만 대상으로 삼고, 선택 안의 행이면 선택을 유지한 채 메뉴를 연다. */
    openContextMenu(pane: PaneId, index: number, x: number, y: number) {
      api.activate(pane);
      const tab = activeTab(get());
      const entry = tab.entries[index];
      if (!entry) return;
      if (!tab.selection.has(entry.path)) patchActive({ selection: new Set() });
      api.setCursor(index);
      set({ menu: null, ctxMenu: { x, y, cursor: selectableIn(CONTEXT_MENU)[0], subCursor: null } });
    },
    ctxClose() {
      set({ ctxMenu: null });
    },
    ctxHover(cursor: number, subCursor: number | null) {
      set((s) => (s.ctxMenu ? { ctxMenu: { ...s.ctxMenu, cursor, subCursor } } : {}));
    },
    ctxMove(delta: 1 | -1) {
      set((s) => {
        const m = s.ctxMenu;
        if (!m) return {};
        const items = m.subCursor === null ? CONTEXT_MENU : (CONTEXT_MENU[m.cursor].sub ?? []);
        const cur = m.subCursor === null ? m.cursor : m.subCursor;
        const sel = selectableIn(items);
        const next = sel[Math.min(Math.max(sel.indexOf(cur) + delta, 0), sel.length - 1)];
        return { ctxMenu: m.subCursor === null ? { ...m, cursor: next } : { ...m, subCursor: next } };
      });
    },
    /** → 키: 하위 메뉴가 있는 항목이면 연다. */
    ctxRight() {
      set((s) => {
        const m = s.ctxMenu;
        const sub = m && m.subCursor === null ? CONTEXT_MENU[m.cursor].sub : undefined;
        return m && sub ? { ctxMenu: { ...m, subCursor: selectableIn(sub)[0] } } : {};
      });
    },
    /** ← 키: 하위 메뉴가 열려 있으면 닫고, 아니면 메뉴를 닫는다. */
    ctxLeft() {
      set((s) => {
        const m = s.ctxMenu;
        if (!m) return {};
        return m.subCursor === null ? { ctxMenu: null } : { ctxMenu: { ...m, subCursor: null } };
      });
    },
    /** 커서 항목을 실행한다. 하위 메뉴 항목이면 하위 메뉴를 연다. */
    async ctxSelect(item?: CtxItem) {
      const m = get().ctxMenu;
      if (!m) return;
      const it = item ?? (m.subCursor === null ? CONTEXT_MENU[m.cursor] : CONTEXT_MENU[m.cursor].sub?.[m.subCursor]);
      if (!it) return;
      if (it.sub) return api.ctxRight();
      if (!it.actionId) return;
      set({ ctxMenu: null });
      await runFn(it.actionId);
    },
    menuMove(delta: 1 | -1) {
      if (get().ctxMenu) return api.ctxMove(delta);
      set((s) => {
        const m = s.menu;
        if (!m) return {};
        const n = m.items.length;
        for (let i = m.cursor + delta; i >= 0 && i < n; i += delta) {
          if (pickable(m.items[i])) return { menu: { ...m, cursor: i } };
        }
        return {};
      });
    },
    /** Esc: 최근 위치·즐겨찾기 메뉴에 필터가 있으면 필터부터 비우고, 아니면 메뉴를 닫는다. */
    menuClose() {
      const m = get().menu;
      if ((m?.kind === "recent" || m?.kind === "favorites") && m.filter) return api.menuSetFilter("");
      set({ menu: null, ctxMenu: null });
    },
    /** 최근 위치·즐겨찾기 메뉴의 필터를 바꾼다(이름·경로 부분 문자열, 대소문자 무시, NFC). 커서는 첫 일치 항목으로 간다. */
    menuSetFilter(filter: string) {
      const m = get().menu;
      if (m?.kind !== "recent" && m?.kind !== "favorites") return;
      const q = filter.normalize("NFC").toLowerCase();
      // 필터가 비면 전체(즐겨찾기의 그룹 제목·구분선 포함), 있으면 이름이나 경로가 맞는 항목만.
      const has = (t?: string) => !!t && t.normalize("NFC").toLowerCase().includes(q);
      const items = q ? (m.all ?? []).filter((it) => it.path !== undefined && (has(it.label) || has(it.path))) : (m.all ?? []);
      set({ menu: { ...m, filter, items, cursor: Math.max(items.findIndex((i) => i.path !== undefined), 0) } });
    },
    /** 커서 항목으로 이동하고 메뉴를 닫는다. */
    async menuSelect(index?: number) {
      if (get().ctxMenu) return api.ctxSelect();
      const m = get().menu;
      if (!m) return;
      const item = m.items[index ?? m.cursor];
      if (!item || !pickable(item)) return;
      set({ menu: null });
      if (item.settings !== undefined) return api.openSettings(item.settings);
      if (item.smb !== undefined) return api.connectSmb(m.pane ?? get().activePane, item.smb);
      if (item.remote !== undefined) return api.connectRemote(m.pane ?? get().activePane, item.remote);
      if (item.path) await api.navigate(item.path);
    },
    /** Shift+Enter: 커서 항목이 SFTP 서버면 연결한 뒤 그 서버의 터미널 탭을 연다. 다른 항목은 아무것도 하지 않고 메뉴를 그대로 둔다(이슈 #94). */
    async menuSelectTerminal() {
      if (get().ctxMenu) return;
      const m = get().menu;
      const item = m?.items[m.cursor];
      if (!m || !item || !pickable(item) || !item.terminal || item.remote === undefined) return;
      set({ menu: null });
      return api.connectRemoteTerminal(m.pane ?? get().activePane, item.remote);
    },
    /**
     * 숫자키: n번째로 고를 수 있는 항목 (1~9, 0은 10번째). `terminal`이면(Shift+숫자, 이슈 #95) 그 항목이 SFTP 서버일 때만
     * 연결한 뒤 그 서버의 SSH(원격 셸) 터미널 탭을 연다. SFTP가 아닌 항목이면 아무것도 하지 않고 메뉴를 그대로 둔다(Shift+Enter와 같다).
     */
    async menuSelectNth(n: number, terminal = false) {
      const m = get().menu;
      if (!m) return;
      const selectable = m.items.map((it, i) => (pickable(it) ? i : -1)).filter((i) => i >= 0);
      const idx = selectable[n === 0 ? 9 : n - 1];
      if (idx === undefined) return;
      if (!terminal) return api.menuSelect(idx);
      const item = m.items[idx];
      if (!item.terminal || item.remote === undefined) return;
      set({ menu: null });
      return api.connectRemoteTerminal(m.pane ?? get().activePane, item.remote);
    },
    /**
     * 드라이브 바의 "연결" 메뉴: 저장된 SMB 서버 항목, 원격(SFTP·FTP) 서버 항목(연결 중이면 비활성), 그리고 각 설정 탭을 여는
     * "SMB 서버 관리…"·"SFTP·FTP 관리…". 탭 순번은 설정 화면(UI)이 정하므로 부르는 쪽이 넘긴다.
     */
    openSmbMenu(pane: PaneId, smbSection: number, remoteSection?: number) {
      api.activate(pane);
      const s = get();
      // 항목에 이모지가 있으면 이름 앞에 붙인다(이슈 #93).
      const items: MenuItem[] = (s.loaded.config.smb.servers ?? []).map((v, i) => {
        const name = withIcon(v.icon, v.name);
        return s.smbConnecting.includes(i) ? { label: tr("store.smb.connecting", { name }), smb: i, disabled: true, protocol: "smb" } : { label: name, smb: i, protocol: "smb" };
      });
      const remotes = s.loaded.config.remote.servers ?? [];
      remotes.forEach((v, i) => {
        // 연결 종류는 이름 앞 배지(`ProtocolBadge`)가 보여 주므로 이름에는 붙이지 않는다.
        const protocol: ConnectionProtocol = v.protocol === "ftp" ? "ftp" : v.protocol === "twindeck" ? "twindeck" : "sftp";
        const label = withIcon(v.icon, v.name);
        items.push(s.remoteConnecting.includes(i) ? { label: tr("store.remote.connecting", { name: label }), remote: i, disabled: true, protocol } : { label, remote: i, terminal: v.protocol === "sftp", protocol });
      });
      if (items.length > 0) items.push({ label: "", separator: true });
      items.push({ label: tr("store.smb.manage"), settings: smbSection });
      if (remoteSection !== undefined) items.push({ label: tr("store.remote.manage"), settings: remoteSection });
      set({ notice: null, ctxMenu: null, menu: { kind: "smb", title: tr("store.menu.smb"), items, cursor: Math.max(items.findIndex(pickable), 0), pane } });
    },
    /**
     * 저장된 SMB 서버 항목에 연결하고 그 패널을 마운트 지점으로 옮긴다. 이미 마운트돼 있으면 바로 옮긴다.
     * 먼저 저장된 비밀번호(키체인)로 시도하고, 인증이 필요하거나 틀리면 비밀번호를 물어 다시 시도한다(취소하면 그만둔다).
     * 그 밖의 실패는 오류로 알린다. 연결 중에도 UI는 막지 않고, 같은 항목은 끝날 때까지 다시 연결하지 않는다.
     */
    async connectSmb(pane: PaneId, index: number) {
      const server = get().loaded.config.smb.servers?.[index];
      if (!server || get().smbConnecting.includes(index)) return;
      set((s) => ({ notice: null, smbConnecting: [...s.smbConnecting, index] }));
      // 백엔드는 항목을 순번으로 찾는다. 기다리는 사이 설정에서 목록이 바뀌어 이 순번이 다른 서버가 되면,
      // 비밀번호를 엉뚱한 서버로 보내지 않도록 묻거나 다시 시도하기 전에 멈춘다.
      const changed = () => {
        const now = get().loaded.config.smb.servers?.[index];
        return !now || now.host !== server.host || now.share !== server.share || now.user !== server.user;
      };
      try {
        let password: string | null = null;
        let remember = false;
        for (;;) {
          if (changed()) return fail(tr("store.smb.changed"));
          let mountPoint: string;
          try {
            mountPoint = await backend.smbConnect(index, password, remember);
          } catch (e) {
            // 다른 창이 떠 있으면 그 창의 응답을 가로채지 않도록 묻지 않고 오류로 알린다.
            if (!(e instanceof SmbConnectError) || e.kind !== "auth" || get().dialog) return fail(e);
            if (changed()) return fail(tr("store.smb.changed"));
            const answer: { value: string; remember: boolean } | null = await ask<{ value: string; remember: boolean }>({
              kind: "password",
              title: tr("store.smb.password_title", { name: server.name }),
              value: "",
              remember,
              error: password === null ? null : tr("store.smb.password_wrong"),
            });
            if (answer === null) return;
            password = answer.value;
            remember = answer.remember;
            continue;
          }
          await api.refreshVolumes();
          await api.selectVolume(pane, mountPoint);
          return;
        }
      } finally {
        set((s) => ({ smbConnecting: s.smbConnecting.filter((i) => i !== index) }));
      }
    },
    /**
     * 저장된 원격(SFTP·FTP) 서버 항목에 연결하고 그 패널에 원격 루트를 보는 새 탭을 연다(현재 탭은 그대로 둔다). 이미 연결돼 있으면 바로 연다.
     * 그 패널에 원격 루트를 이미 보는 탭이 있으면 새로 만들지 않고 그 탭으로 간다(`openFolderTab`).
     * 먼저 저장된 비밀번호(키체인)로 시도하고, 인증이 필요하거나 틀리면 비밀번호를 물어 다시 시도한다(취소하면 그만둔다).
     * 그 밖의 실패는 오류로 알린다. 연결 중에도 UI는 막지 않고, 같은 항목은 끝날 때까지 다시 연결하지 않는다.
     * `terminal`이면 패널은 옮기지 않고 그 서버의 원격 셸 터미널 탭만 `pane`의 탭 줄에 연다(이슈 #94).
     */
    async connectRemote(pane: PaneId, index: number, terminal = false) {
      const root = await openRemoteConnection(index);
      if (root === null) return;
      api.activate(pane);
      if (terminal) await api.terminalFocus(root, pane);
      else await api.openFolderTab(pane, root);
    },
    /**
     * 끊긴 원격 탭을 다시 연결한다(이슈 #98). 탭의 연결 id로 설정의 서버 항목을 찾아 `connectRemote`와 같은 흐름(저장된 비밀번호 →
     * 비밀번호 창·호스트 키 확인)으로 접속하고, 성공하면 그 연결을 보는 모든 탭(양쪽 패널·배경 탭)을 다시 읽는다.
     * 설정에서 지워진 서버면 알리기만 한다. 끊긴 탭이 아니어도 원격 탭이면 같은 일을 한다.
     */
    async reconnectRemote(pane: PaneId = get().activePane) {
      if (activeTab(get(), pane).virtual?.kind === "terminal") return api.reconnectTerminal(pane);
      const s = get();
      const loc = splitRemote(activeTab(s, pane).path);
      if (!loc) return;
      const index = remoteIndexOf(s, activeTab(s, pane).path);
      if (index < 0) return fail(tr("store.remote.reconnect_missing"));
      if ((await openRemoteConnection(index)) === null) return;
      for (const p of ["left", "right"] as const) {
        for (const t of get().panes[p].tabs) {
          if (!t.virtual && splitRemote(t.path)?.id === loc.id) await reload(p, t.id);
        }
      }
    },
    /**
     * 저장된 SFTP 서버 항목에 연결해 그 서버의 원격 셸 터미널 탭만 연다(이슈 #94). 패널은 서버 폴더로 옮기지 않는다.
     * 연결이 실패하거나 취소되면 터미널도 열지 않는다. 터미널 탭은 `pane`의 탭 줄에 연다.
     */
    async connectRemoteTerminal(pane: PaneId, index: number) {
      if (get().loaded.config.remote.servers?.[index]?.protocol !== "sftp") return;
      await api.connectRemote(pane, index, true);
    },
    /**
     * 패널이 놓인 원격 연결을 끊는다. 그 연결 안에 있는 모든 탭(양쪽 패널, 배경 탭 포함)을 먼저 홈(없으면 `/`)으로 옮기고 연결을 닫는다.
     * 원격 위치가 아니거나 설정에서 지워진 서버면 아무것도 하지 않는다.
     */
    async disconnectRemote(pane: PaneId) {
      const loc = splitRemote(activeTab(get(), pane).path);
      if (!loc) return;
      const index = (get().loaded.config.remote.servers ?? []).findIndex((v) => remoteServerId(v) === loc.id);
      set({ notice: null });
      const dest = get().userDirs.home ?? "/";
      for (const p of ["left", "right"] as const) {
        const pn = get().panes[p];
        for (const [i, t] of pn.tabs.entries()) {
          if (t.virtual || splitRemote(t.path)?.id !== loc.id) continue;
          if (i === pn.active) await api.navigate(dest, undefined, "push", p);
          else {
            patchTab(p, t.id, { path: dest, history: [...t.history, dest], back: [], forward: [], cursor: 0, selection: new Set(), quick: null, entries: [] });
            await reload(p, t.id);
          }
        }
      }
      await syncWatches();
      if (index < 0) return;
      try {
        await backend.remoteDisconnect(index);
      } catch (e) {
        fail(e);
      }
    },
    /** 마운트된 볼륨 목록과 두 패널의 용량을 다시 읽는다(앱 시작, 창이 포커스를 얻을 때). 목록을 못 읽으면 이전 목록을 유지한다. */
    async refreshVolumes() {
      try {
        set({ volumes: await backend.listVolumes() });
      } catch {
        /* 이전 목록 유지 */
      }
      try {
        set({ smbMounts: await backend.smbMounts() });
      } catch {
        /* 이전 목록 유지 */
      }
      await Promise.all([refreshDiskSpace("left"), refreshDiskSpace("right")]);
    },
    /** 드라이브 바의 볼륨 버튼: 그 패널을 활성화하고 볼륨의 루트로 이동한다. */
    async selectVolume(pane: PaneId, mountPoint: string) {
      api.activate(pane);
      await api.navigate(mountPoint, undefined, "push", pane);
    },
    /**
     * 패널의 현재 볼륨을 언마운트한다. 먼저 그 볼륨 안에 있는 모든 탭(양쪽 패널, 배경 탭 포함)을 첫 번째 볼륨으로 옮기고
     * 감시를 푼 뒤 언마운트한다. 언마운트가 실패하면 오류를 알리지만 탭은 되돌리지 않는다. 루트 볼륨은 시도하지 않는다.
     */
    async unmountVolume(pane: PaneId) {
      const tab = activeTab(get(), pane);
      const vol = tab.virtual ? null : volumeOf(tab.path, get().volumes);
      if (!vol || vol.mountPoint === "/") return;
      set({ notice: null });
      await leaveVolume(vol.mountPoint);
      try {
        await backend.unmountVolume(vol.mountPoint);
      } catch (e) {
        fail(e);
        return;
      }
      await api.refreshVolumes();
    },
    /** Volumes 메뉴에서 커서 볼륨을 언마운트/추출한다. */
    async menuVolumeAction(kind: "unmount" | "eject") {
      const m = get().menu;
      const item = m?.kind === "volumes" ? m.items[m.cursor] : undefined;
      if (!m || !item?.path) return;
      set({ notice: null });
      if (item.path !== "/") await leaveVolume(item.path); // 루트 볼륨은 모든 탭이 그 안이라 옮기지 않는다(언마운트도 거부된다)
      try {
        if (kind === "unmount") await backend.unmountVolume(item.path);
        else await backend.ejectVolume(item.path);
      } catch (e) {
        fail(e);
        return;
      }
      set({ menu: null });
      await api.openMenu("volumes");
    },
    /** Recent 메뉴에서 이 탭의 최근 위치를 비운다. */
    menuClearRecent() {
      const m = get().menu;
      if (m?.kind !== "recent") return;
      set({ recent: [], menu: { ...m, items: [], all: [], filter: "", cursor: 0 } });
    },
    /** 즐겨찾기 메뉴에서 `Ctrl+=`: 활성 탭의 현재 폴더를 추가하고 메뉴를 다시 만든다. 이미 있는 폴더는 무시한다. */
    async menuAddFavoriteHere() {
      const m = get().menu;
      if (m?.kind !== "favorites") return;
      const norm = (p: string) => (p.length > 1 ? p.replace(/[\\/]+$/, "") : p).normalize("NFC");
      const here = hereOf(activeTab(get()));
      // 메뉴 목록이 아니라 설정에서 직접 비교한다(연타해도 갱신 전 목록 때문에 중복되지 않게).
      const dirs = get().userDirs;
      const leaves = (get().loaded.config.favorites ?? []).flatMap((f) => (f.kind === "group" ? (f.items ?? []).map((l) => l.path) : [f.path ?? ""]));
      if (leaves.some((p) => { const r = expandPath(p, dirs); return r !== null && norm(r) === norm(here); })) return;
      if (addingFavorite) return;
      addingFavorite = true;
      set({ notice: null });
      try {
        set({ loaded: await backend.addFavorite(baseName(here) || here, here) });
      } catch (e) {
        fail(e);
        return;
      } finally {
        addingFavorite = false;
      }
      await api.openMenu("favorites");
    },
    /** 즐겨찾기 메뉴에서 `Ctrl+-`: 커서가 있는 항목을 즐겨찾기에서 뺀다(폴더 자체는 그대로). 메뉴를 다시 만들고 커서는 근처에 둔다. */
    async menuRemoveFavorite() {
      const m = get().menu;
      if (m?.kind !== "favorites") return;
      const raw = m.items[m.cursor]?.raw;
      if (raw === undefined) return;
      set({ notice: null });
      try {
        set({ loaded: await backend.removeFavorite(raw) });
      } catch (e) {
        fail(e);
        return;
      }
      await api.openMenu("favorites");
      const next = get().menu;
      if (next?.kind === "favorites") {
        const last = next.items.length - 1;
        let at = Math.min(m.cursor, last);
        while (at > 0 && next.items[at]?.path === undefined) at--;
        set({ menu: { ...next, cursor: Math.max(at, 0) } });
      }
    },
    /** 현재 폴더를 즐겨찾기에 추가한다. */
    async addFavoriteHere() {
      const tab = activeTab(get());
      const here = hereOf(tab);
      set({ notice: null });
      try {
        await backend.addFavorite(baseName(here) || here, here);
      } catch (e) {
        fail(e);
      }
    },
    /** Go To Path (NAV-11): 경로를 입력해 이동한다. Tab으로 폴더 이름을 완성한다. */
    async gotoPath() {
      const here = hereOf(activeTab(get()));
      const value = await ask<string>({
        kind: "name",
        title: tr("store.goto.title"),
        value: here.endsWith("/") ? here : `${here}/`,
        error: null,
        selectStem: false,
        goto: true,
      });
      if (value === null) return;
      await navigateToPath(value);
    },
    /** 입력한 경로(`~`, `${user.*}` 허용)로 이동한다. 폴더가 아니거나 없으면 알리고 이동하지 않는다(경로 표시줄의 직접 입력). */
    async goToPath(raw: string) {
      await navigateToPath(raw);
    },
    /** `core.open.directory` (ACT-03): 인수 `src`의 폴더로 이동한다. `~`와 `${user.*}`를 확장한다. */
    async openDirectory(args?: Record<string, unknown>) {
      const src = args?.src;
      if (typeof src !== "string" || src.trim() === "") return fail(tr("store.open_dir.arg"));
      await navigateToPath(src);
    },
    /** 폴더 단축키(`shortcuts.N`)에 지정된 폴더로 간다. 비어 있으면 알리고 이동하지 않는다. */
    async openShortcut(args?: Record<string, unknown>) {
      const n = String(args?.n ?? "");
      const path = get().loaded.config.shortcuts[n]?.trim();
      if (!path) return fail(tr("store.shortcut.none", { n }));
      await navigateToPath(path);
    },
    async gotoComplete() {
      const d = get().dialog;
      if (d?.kind !== "name" || !d.goto) return;
      const raw = expandPath(d.value, get().userDirs) ?? d.value;
      const dir = isDriveRoot(raw) ? raw : (parentPath(raw) ?? "/");
      const prefix = baseName(raw);
      let names: string[];
      try {
        names = (await backend.listDir(dir, true)).filter((e) => e.kind === "dir" && quickMatch(e.name, prefix, true)).map((e) => e.name);
      } catch {
        return;
      }
      if (names.length === 0) return;
      let common = names[0].normalize("NFC");
      for (const n of names.slice(1)) {
        const nn = n.normalize("NFC");
        let i = 0;
        while (i < common.length && i < nn.length && common[i] === nn[i]) i++;
        common = common.slice(0, i);
      }
      api.dialogSetValue(joinPath(dir, common) + (names.length === 1 ? (dir.includes("\\") ? "\\" : "/") : ""));
    },

    /** 미리보기 열기/닫기 (Space, Mod+Y). 열려 있는 동안 ↑↓로 항목을 넘긴다. */
    async previewToggle() {
      if (get().preview) return api.previewClose();
      const entry = cursorEntry(activeTab(get()));
      // treemap에서 Shift+→는 폴더 타일이면 그 폴더로 내려가고, 파일 타일이면 미리보기를 연다.
      if (isTreemap(activeTab(get())) && isFolderEntry(entry)) return api.usageDescend();
      if (entry) await loadPreview(entry);
    },
    previewClose() {
      // 편집 중이면 저장하지 않은 변경을 먼저 확인한다(저장하거나 버리거나 취소).
      if (get().previewEdit) {
        void api.previewEditEnd().then((done) => {
          if (done) api.previewClose();
        });
        return;
      }
      previewSeq++;
      set({ preview: null });
    },
    /** 미리보기에서 Return: 닫고, 압축 파일이면 압축을 풀고 아니면 연다. */
    async previewOpen() {
      if (get().previewEdit && !(await api.previewEditEnd())) return;
      api.previewClose();
      if (isArchiveEntry(cursorEntry(activeTab(get())), cfg().file_systems.zip.additional_extensions)) await api.extract();
      else await api.open();
    },
    /** 미리보기에서 →: 폴더면 그 안으로 들어가 첫 항목을 미리보고(항목이 없으면 미리보기를 닫는다), 아니면 다음 항목이다. */
    async previewForward() {
      if (get().previewEdit && !(await api.previewEditEnd())) return;
      const entry = cursorEntry(activeTab(get()));
      if (entry?.kind !== "dir") return api.previewMove(1);
      await api.navigate(entry.path);
      const first = activeTab(get()).entries[0];
      if (!first) return api.previewClose();
      api.setCursor(0);
      await loadPreview(first);
    },
    /**
     * Markdown 미리보기의 상대 경로 링크(이슈 #89): 파일이면 그 폴더로 패널을 옮기고 커서를 맞춰 미리보기로 열고, 폴더면 미리보기를 닫고 그 폴더로 간다.
     * 없는 항목은 안내만 한다.
     */
    async previewLink(path: string) {
      if (get().previewEdit && !(await api.previewEditEnd())) return;
      let info;
      try {
        info = await backend.fileInfo(path);
      } catch {
        return fail(tr("store.link.missing", { path }));
      }
      if (info.kind === "dir") {
        api.previewClose();
        await api.navigate(path);
        return;
      }
      const dir = parentPath(path);
      if (dir !== null && activeTab(get()).path !== dir) await api.navigate(dir);
      const tab = activeTab(get());
      const i = tab.entries.findIndex((e) => e.path === path);
      if (i >= 0) {
        api.setCursor(i);
        await loadPreview(tab.entries[i]);
      } else {
        // 숨김 파일처럼 목록에 없는 항목도 미리보기는 연다.
        await loadPreview({ name: info.name, path, kind: info.kind, size: info.size, modifiedMs: info.modifiedMs, createdMs: info.createdMs } as EntryDto);
      }
    },
    /** 미리보기를 연 채 커서를 옮기고 새 항목을 보여 준다. */
    async previewMove(delta: 1 | -1) {
      if (get().previewEdit && !(await api.previewEditEnd())) return;
      api.moveCursor(delta);
      const entry = cursorEntry(activeTab(get()));
      if (entry) await loadPreview(entry);
    },

    /**
     * 미리보기 본문을 편집 상자로 바꾼다(더블클릭). 디스크 위의 일반 파일이고 전체가 읽혔고(64KB 이하) UTF-8 텍스트이며
     * 줄바꿈이 LF만이거나 CRLF만일 때만 시작하고, 아니면 이유를 알리고 시작하지 않는다(저장하면 파일이 망가질 수 있다).
     */
    async previewEditStart() {
      const pv = get().preview;
      if (!pv || get().previewEdit) return;
      const reason = pv.status !== "ready" ? tr("store.edit.reading") : editBlockReason({ path: pv.path, kind: pv.data?.kind, truncated: !!pv.data?.truncated, text: pv.data?.text });
      if (reason) return flash(reason);
      const raw = pv.data?.text as string;
      let info;
      try {
        info = await backend.fileInfo(pv.path);
      } catch (e) {
        return fail(e);
      }
      // 미리보기를 읽은 뒤 파일이 바뀌었으면(크기가 다르면) 낡은 내용을 편집하게 하지 않는다.
      if (info.size !== pv.data?.size) return flash(tr("store.edit.changed"));
      if (get().preview?.path !== pv.path || get().previewEdit) return; // 그 사이 다른 파일로 넘어갔다
      const text = toEditor(raw);
      set({ previewEdit: { path: pv.path, text, base: text, eol: detectEol(raw) as Eol, expected: { size: info.size, modifiedMs: info.modifiedMs }, saved: false } });
    },
    previewEditChange(text: string) {
      set((s) => (s.previewEdit ? { previewEdit: { ...s.previewEdit, text, saved: false } } : {}));
    },
    /**
     * 편집한 글자를 파일에 쓴다(Mod+S). 저장한 뒤에도 편집 상태는 유지한다.
     * 편집을 시작한 뒤 파일이 밖에서 바뀌었으면 쓰지 않고 덮어쓸지 묻는다. 저장했으면 true.
     */
    async previewEditSave(force = false): Promise<boolean> {
      const e = get().previewEdit;
      if (!e) return false;
      const body = toDisk(e.text, e.eol);
      let r;
      try {
        r = await backend.writeTextFile(e.path, body, force ? null : e.expected);
      } catch (err) {
        fail(err);
        return false;
      }
      if (!r.saved) {
        const overwrite = await ask<boolean>({
          kind: "confirm",
          title: tr("store.edit.external.title"),
          lines: [tr("store.edit.external.l1"), tr("store.edit.external.l2")],
          confirmLabel: tr("store.edit.overwrite"),
        });
        return overwrite ? api.previewEditSave(true) : false;
      }
      const cur = get().previewEdit;
      if (!cur || cur.path !== e.path) return true; // 저장하는 동안 편집이 끝났다
      set((s) => ({
        previewEdit: { ...cur, base: e.text, expected: { size: r.size, modifiedMs: r.modifiedMs }, saved: true },
        preview: s.preview && s.preview.path === e.path && s.preview.data ? { ...s.preview, data: { ...s.preview.data, text: body, size: r.size } } : s.preview,
      }));
      clearTimeout(savedTimer);
      savedTimer = setTimeout(() => set((s) => (s.previewEdit ? { previewEdit: { ...s.previewEdit, saved: false } } : {})), 1500);
      return true;
    },
    /**
     * 편집을 끝낸다(Esc 등). 저장하지 않은 변경이 있으면 "저장 / 버리기 / 취소"를 묻는다.
     * 편집 상태가 없어졌으면 true, 취소했거나 저장에 실패해 편집이 남았으면 false.
     */
    async previewEditEnd(): Promise<boolean> {
      const e = get().previewEdit;
      if (!e) return true;
      if (e.text !== e.base) {
        const choice = await ask<number>({
          kind: "choice",
          title: tr("store.edit.unsaved.title"),
          lines: [tr("store.edit.unsaved.line")],
          choices: [tr("store.edit.save"), tr("store.edit.discard")],
          selected: 0,
        });
        if (choice === null) return false;
        if (choice === 0 && !(await api.previewEditSave())) return false;
      }
      set({ previewEdit: null });
      return true;
    },

    /**
     * 미리보기 중인 파일을 영구 삭제하고 다음 파일로 넘어간다(`core.confirm.delete`가 켜져 있으면 확인을 거친다).
     * 다음이 없으면(맨 끝) 앞 파일로, 남은 파일이 없으면 미리보기를 닫는다.
     */
    async previewDelete() {
      if (get().previewEdit && !(await api.previewEditEnd())) return;
      const p = get().preview;
      if (!p) return;
      const tab = activeTab(get());
      const idx = tab.entries.findIndex((e) => e.path === p.path);
      const entry = tab.entries[idx];
      if (!entry) return;
      if (cfg().core.confirm.delete && !(await api.confirmTargets(tr("store.delete.confirm_one"), [entry]))) return;
      // 삭제는 큐에서 비동기로 끝나므로, 지금 목록에서 다음(없으면 이전) 항목을 미리 정해 그 쪽으로 옮긴다.
      const next = tab.entries[idx + 1] ?? tab.entries[idx - 1];
      set({ notice: null });
      patchActive({ selection: new Set() });
      api.recheckVirtual([entry.path]);
      const jobId = await backend.enqueue("delete", [{ src: entry.path, destDir: null, policy: "skip" }]);
      void trackTransfer(jobId, tr("store.delete.progress"));
      if (next) {
        api.setCursor(tab.entries.indexOf(next));
        await loadPreview(next);
      } else {
        api.previewClose();
      }
      await reloadAll();
    },

    /** Actions Panel에 액션 목록과 실행기를 연결한다. */
    attachPalette(catalog: () => CatalogItem[], run: (id: string) => Promise<unknown>) {
      catalogFn = catalog;
      runFn = run;
    },
    /** 현재 검색어로 걸러 정렬한 목록. */
    paletteView(): CatalogItem[] {
      return filterCatalog(catalogFn(), get().palette?.query ?? "");
    },
    paletteOpen() {
      set({ palette: { query: get().lastPaletteQuery, cursor: 0, showIds: false } });
    },
    paletteSetQuery(query: string) {
      set((s) => (s.palette ? { palette: { ...s.palette, query, cursor: 0 }, lastPaletteQuery: query } : {}));
    },
    paletteMove(delta: 1 | -1) {
      const n = api.paletteView().length;
      set((s) => (s.palette ? { palette: { ...s.palette, cursor: clamp(s.palette.cursor + delta, n) } } : {}));
    },
    paletteShowIds(showIds: boolean) {
      set((s) => (s.palette && s.palette.showIds !== showIds ? { palette: { ...s.palette, showIds } } : {}));
    },
    paletteClose() {
      set({ palette: null });
    },
    /** 커서 항목을 실행한다. 지금 실행할 수 없는 액션은 패널을 닫지 않고 아무것도 하지 않는다. */
    async paletteRun() {
      const p = get().palette;
      if (!p) return;
      const item = api.paletteView()[p.cursor];
      if (!item?.applicable) return;
      set({ palette: null });
      await runFn(item.id);
    },

    /** 설정 화면 열기/닫기 (`Mod+,`). */
    openHelp() {
      set({ help: { query: "" } });
    },
    closeHelp() {
      set({ help: null });
    },
    /**
     * 도움말 화면에 보일 줄: 키가 걸린 액션만, Actions Panel과 같은 카탈로그에서 가져온다.
     * 검색어로 설명·키·분류를 거르고(이슈 #56), 화면 순서(분류별로 묶은 순서)로 돌려준다.
     */
    helpView(): CatalogItem[] {
      const terms = helpTerms(get().help?.query ?? "");
      const groups = new Map<string, CatalogItem[]>();
      for (const i of catalogFn()) {
        if (i.keys === "" || !helpMatches(terms, [i.title, i.keys, categoryTitle(i.category)])) continue;
        groups.set(i.category, [...(groups.get(i.category) ?? []), i]);
      }
      return [...groups.values()].flat();
    },
    helpSetQuery(query: string) {
      set((s) => (s.help ? { help: { query } } : {}));
    },
    /**
     * F키 등에 지정한 애플리케이션으로 연다.
     * `items`(`core.app.launch`): 선택한 항목 전체, 없으면 커서 항목, 항목이 하나도 없으면(빈 폴더) 현재 폴더를 넘긴다.
     * `folder`(`core.app.open_folder`): 선택·커서와 무관하게 항상 현재 패널의 폴더를 넘긴다.
     */
    /** 업데이트 확인: 결과는 설정 > 업데이트 탭의 상태(`update`)로 보인다. 확인·설치 중이면 다시 시작하지 않는다. */
    async checkForUpdate(quiet = false) {
      const kind = get().update.kind;
      if (kind === "checking" || kind === "installing") return;
      set({ update: { kind: "checking" } });
      try {
        const info = await backend.checkUpdate();
        set({ update: info ? { kind: "available", info } : { kind: quiet ? "idle" : "latest" } });
      } catch (e) {
        // 시작할 때 자동으로 하는 확인은 오프라인 같은 실패를 알리지 않고 조용히 넘어간다.
        set({ update: quiet ? { kind: "idle" } : { kind: "error", message: String(e instanceof Error ? e.message : e) } });
      }
    },
    /**
     * 설정(`environment.auto_update_check`)이 켜져 있으면 새 버전을 조용히 확인한다(이슈 #115). 새 버전이 있으면 상태 줄에 배지가 뜬다.
     * 이미 새 버전을 찾았거나 확인·설치 중이면 하지 않는다. 앱을 켜 둔 채 며칠 지나도 확인하도록 최신·오류 상태에서는 다시 확인한다(이슈 #122).
     */
    async autoCheckUpdate() {
      const kind = get().update.kind;
      if (!get().loaded.config.environment.auto_update_check || kind === "checking" || kind === "available" || kind === "installing") return;
      await api.checkForUpdate(true);
    },
    /** 켜 둔 동안 하루에 한 번(`intervalMs`) 자동 확인한다(이슈 #122). 돌려주는 함수로 멈춘다. 설정은 확인할 때마다 다시 읽으므로 켜고 꺼도 바로 따른다. */
    startUpdateCheckSchedule(intervalMs = UPDATE_CHECK_INTERVAL_MS) {
      const timer = setInterval(() => void api.autoCheckUpdate(), intervalMs);
      return () => clearInterval(timer);
    },
    /** 확인한 새 버전을 내려받아 설치하고 앱을 다시 시작한다. 설치 확인은 업데이트 탭이 먼저 받는다. */
    async installUpdate() {
      const u = get().update;
      if (u.kind !== "available") return;
      set({ update: { kind: "installing", info: u.info } });
      try {
        await backend.installUpdate();
      } catch (e) {
        set({ update: { kind: "error", message: String(e instanceof Error ? e.message : e) } });
      }
    },
    async loadAppVersion() {
      try {
        set({ appVersion: await backend.appVersion() });
      } catch (e) {
        set({ settingsError: String(e instanceof Error ? e.message : e) });
      }
    },
    async launchApp(args?: Record<string, unknown>, target: "items" | "folder" = "items") {
      const app = typeof args?.app === "string" ? args.app.trim() : "";
      const key = typeof args?.key === "string" ? args.key : tr("store.key.this");
      if (!app) return fail(tr("store.app.none", { key }));
      const tab = activeTab(get());
      const selected = tab.entries.filter((e) => tab.selection.has(e.path)).map((e) => e.path);
      const cursor = cursorEntry(tab);
      const paths =
        target === "folder" ? (tab.virtual ? [] : [tab.path]) : selected.length > 0 ? selected : cursor ? [cursor.path] : tab.virtual ? [] : [tab.path];
      if (paths.length === 0) return fail(target === "folder" ? tr("store.app.no_folder") : tr("store.app.no_items"));
      set({ notice: null });
      try {
        await backend.launchApp(app, paths);
      } catch (e) {
        fail(e);
      }
    },
    /** 설정 화면을 연다. `section`을 주면 그 탭(설정 화면 `SECTIONS`의 순번)으로 연다. */
    openSettings(section = 0) {
      set((s) => ({ settingsOpen: true, settingsPane: s.activePane, settingsSection: section, settingsError: null }));
    },
    closeSettings() {
      set({ settingsOpen: false, settingsError: null });
    },
    setSettingsSection(settingsSection: number) {
      set({ settingsSection });
    },
    /** 화면 요소(Action Bar, 드라이브 바)를 켜고 끈다. 설정 파일에 저장되어 다음 실행에도 유지된다. */
    /** 수정일 구간 묶기를 켜고 끈다(이슈 #69). 설정 화면의 "수정일로 묶어 보기" 스위치와 같은 값이다. */
    async toggleGroupByModified() {
      await api.setConfigValue("behavior.table.group_by_modified", { kind: "bool", value: !get().loaded.config.behavior.table.group_by_modified });
    },
    async toggleLayoutFlag(flag: "show_action_bar" | "show_drive_bar" | "show_command_line" | "show_folder_tree") {
      await api.setConfigValue(`behavior.layout.${flag}`, { kind: "bool", value: !get().loaded.config.behavior.layout[flag] });
    },
    /** 설정 하나를 사용자 config.toml에 즉시 쓰고, 돌려받은 새 설정을 바로 적용한다(변경 이벤트를 기다리지 않는다). */
    async setConfigValue(key: string, value: ConfigValue) {
      try {
        set({ loaded: await backend.setConfigValue(key, value), settingsError: null });
        void reloadAll();
      } catch (e) {
        set({ settingsError: String(e instanceof Error ? e.message : e) });
      }
    },
    /** 저장된 SMB 서버 목록 전체를 바꾼다. 성공하면 돌려받은 설정을 바로 적용하고 `true`, 실패하면 설정 화면에 오류를 보이고 `false`. */
    async setSmbServers(servers: SmbServer[]) {
      try {
        set({ loaded: await backend.setSmbServers(servers), settingsError: null });
        void api.refreshVolumes(); // 항목 순서가 바뀌었을 수 있어 마운트 위치를 다시 맞춘다
        return true;
      } catch (e) {
        set({ settingsError: String(e instanceof Error ? e.message : e) });
        return false;
      }
    },
    /** 저장된 원격(SFTP·FTP) 서버 목록 전체를 바꾼다. 성공하면 돌려받은 설정을 바로 적용하고 `true`, 실패하면 설정 화면에 오류를 보이고 `false`. */
    async setRemoteServers(servers: RemoteServer[]) {
      try {
        set({ loaded: await backend.setRemoteServers(servers), settingsError: null });
        return true;
      } catch (e) {
        set({ settingsError: String(e instanceof Error ? e.message : e) });
        return false;
      }
    },
    /** 저장된 원격 서버 항목(`index`)의 비밀번호를 키체인에서 지운다. 실패하면 설정 화면에 오류를 보이고 `false`. */
    async remoteForgetPassword(index: number) {
      try {
        await backend.remoteForgetPassword(index);
        set({ settingsError: null });
        return true;
      } catch (e) {
        set({ settingsError: String(e instanceof Error ? e.message : e) });
        return false;
      }
    },
    /** 저장된 SMB 서버 항목(`index`)의 비밀번호를 키체인에서 지운다. 실패하면 설정 화면에 오류를 보이고 `false`. */
    async smbForgetPassword(index: number) {
      try {
        await backend.smbForgetPassword(index);
        set({ settingsError: null });
        return true;
      } catch (e) {
        set({ settingsError: String(e instanceof Error ? e.message : e) });
        return false;
      }
    },
    /** 설정 하나를 사용자 config.toml에서 지워 기본값으로 되돌린다. */
    async resetConfigValue(key: string) {
      try {
        set({ loaded: await backend.resetConfigValue(key), settingsError: null });
        void reloadAll();
      } catch (e) {
        set({ settingsError: String(e instanceof Error ? e.message : e) });
      }
    },
    /** GitHub 릴리스 목록(변경 사항)을 기본 브라우저로 연다(이슈 #70). */
    /** 외부 주소(`http`·`https`·`mailto`)를 기본 브라우저·메일 앱으로 연다(Markdown 링크, 이슈 #89). 실패하면 안내만 띄운다. */
    async openExternalUrl(url: string) {
      try {
        await backend.openExternalUrl(url);
      } catch (e) {
        fail(e);
      }
    },
    async openReleasesPage() {
      try {
        await backend.openReleasesPage();
      } catch (e) {
        fail(e);
      }
    },
    /** 설정 화면: 앱을 실제로 끝낸다(백그라운드 유지 중에도). */
    async quitApp() {
      await backend.quitApp();
    },
    async revealConfigDir() {
      try {
        await backend.revealConfigDir();
      } catch (e) {
        set({ settingsError: String(e instanceof Error ? e.message : e) });
      }
    },
    /** 설정 화면: 설정 파일 저장 경로를 읽는다. */
    async loadConfigLocation() {
      try {
        set({ configLocation: await backend.getConfigLocation() });
      } catch (e) {
        set({ settingsError: String(e instanceof Error ? e.message : e) });
      }
    },
    /** 설정 화면: 폴더를 골라 설정 파일 저장 경로로 삼는다(iCloud Drive·Google Drive 폴더를 고르면 여러 기기가 같은 설정을 쓴다). */
    async pickConfigLocation() {
      try {
        const dir = await backend.pickFolder();
        if (dir) await changeConfigLocation(dir);
      } catch (e) {
        set({ settingsError: String(e instanceof Error ? e.message : e) });
      }
    },
    /** 설정 화면: 지금 설정 파일을 zip 하나로 내보낸다. */
    async exportConfig() {
      try {
        const dest = await backend.pickSaveFile("twin-deck-settings.zip", ["zip"]);
        if (!dest) return;
        await backend.exportConfig(dest);
        set({ settingsError: null });
        flash(tr("store.config_export.done", { path: dest }));
      } catch (e) {
        set({ settingsError: String(e instanceof Error ? e.message : e) });
      }
    },
    /** 설정 화면: 내보낸 zip에서 설정을 가져와 지금 설정을 바꾼다(기존 파일은 .bak). */
    async importConfig() {
      try {
        const src = await backend.pickFile(["zip"]);
        if (!src) return;
        const ok = await ask<boolean>({
          kind: "confirm",
          title: tr("store.config_import.title"),
          lines: [src, tr("store.config_import.line")],
          confirmLabel: tr("store.config_import.confirm"),
        });
        if (!ok) return;
        set({ loaded: await backend.importConfig(src), settingsError: null });
        void reloadAll();
        flash(tr("store.config_import.done"));
      } catch (e) {
        set({ settingsError: String(e instanceof Error ? e.message : e) });
      }
    },
    /** 설정 화면: 설정 파일 저장 경로를 기본 위치로 되돌린다. */
    async resetConfigLocation() {
      try {
        await changeConfigLocation(null);
      } catch (e) {
        set({ settingsError: String(e instanceof Error ? e.message : e) });
      }
    },
    /** 작업 큐 팝업 열기/닫기 (`=`). 닫을 때 끝난 작업을 지운다. */
    toggleQueue() {
      if (get().queueOpen) {
        set({ queueOpen: false });
        void backend.queueClearFinished();
      } else {
        set({ queueOpen: true, queueCursor: 0 });
      }
    },
    queueMove(delta: number) {
      set((s) => ({ queueCursor: clamp(s.queueCursor + delta, s.queue.length) }));
    },
    /** 선택한 작업을 일시정지하거나 재개한다 (P). */
    async queuePauseToggle() {
      const s = get();
      const job = s.queue[s.queueCursor];
      if (!job) return;
      if (job.status === "paused") await backend.queueResume(job.id);
      else if (isActiveJob(job)) await backend.queuePause(job.id);
    },
    /** 선택한 작업을 중단한다 (A/D). */
    async queueAbortSelected() {
      const s = get();
      const job = s.queue[s.queueCursor];
      if (job && isActiveJob(job)) await backend.queueAbort(job.id);
    },

    /** 삭제/이동/휴지통을 보낸 경로 중 이 탭의 결과에 있는 것을 사라졌는지 확인할 목록에 올린다(가상 탭만). */
    recheckVirtual(paths: string[]) {
      const tab = activeTab(get());
      if (!tab.virtual) return;
      const set_ = new Set(paths);
      patchActive((t) => ({ virtual: t.virtual && { ...t.virtual, recheck: [...t.virtual.recheck, ...t.entries.filter((e) => set_.has(e.path)).map((e) => e.path)] } }));
    },

    /** 새 가상 탭을 열고 결과를 받기 시작한다. */
    async openVirtual(kind: VirtualKind, title: string, base: string, start: () => Promise<{ id: number; warnings: string[] }>, view: "list" | "treemap" = "list") {
      set({ notice: null });
      let started: { id: number; warnings: string[] };
      try {
        started = await start();
      } catch (e) {
        return fail(e); // 질의 문법 오류 등: 탭을 만들지 않는다
      }
      const s = get();
      const p = s.panes[s.activePane];
      const tab = newTab("");
      tab.path = `virtual:${kind}:${tab.id}`;
      tab.history = [tab.path];
      tab.sort = kind === "usage" ? { key: "size", dir: "desc" } : null;
      tab.virtual = { kind, title, base, jobId: started.id, running: true, cancelled: false, warnings: started.warnings, summary: null, totalBytes: 0, view, recheck: [] };
      set({ panes: { ...s.panes, [s.activePane]: { tabs: [...p.tabs, tab], active: p.tabs.length } } });
      // 탭이 생기기 전에 도착한 이벤트를 순서대로 반영한다
      for (const e of earlySearchEvents.get(started.id) ?? []) applySearchEvent(s.activePane, tab.id, e);
      earlySearchEvents.delete(started.id);
    },

    /** 양쪽 현재 폴더를 비교할 동기화 창을 연다. */
    openDirectorySync() {
      set({ directorySyncOpen: true, palette: null, menu: null, ctxMenu: null });
    },
    closeDirectorySync() {
      set({ directorySyncOpen: false });
    },
    async runDirectorySync(comparisonId: number, choices: Parameters<Backend["syncDirectories"]>[1]) {
      const jobId = await backend.syncDirectories(comparisonId, choices);
      set({ directorySyncOpen: false });
      void trackTransfer(jobId, tr("sync.title"), 0);
      return jobId;
    },
    /** 파일 찾기 다이얼로그를 연다(`core.find.open`). 시작 디렉터리의 기본값은 활성 패널의 현재 폴더다. */
    openFind() {
      set({ find: { form: defaultFindForm(hereOf(activeTab(get()))), error: null } });
    },
    closeFind() {
      set({ find: null });
    },
    setFindForm(patch: Partial<FindForm>) {
      set((s) => (s.find ? { find: { form: { ...s.find.form, ...patch }, error: null } } : {}));
    },
    /** "새 검색": 입력을 기본값으로 되돌린다. */
    findReset() {
      set((s) => (s.find ? { find: { form: defaultFindForm(hereOf(activeTab(s))), error: null } } : {}));
    },
    /** "마지막 검색": 직전에 시작한 조건을 되살린다. */
    findRestoreLast() {
      set((s) => (s.find && s.lastFind ? { find: { form: { ...s.lastFind }, error: null } } : {}));
    },
    /**
     * "시작": 입력값으로 `FindSpec`을 만들어 검색을 시작하고 결과를 새 가상 탭에 스트리밍한다.
     * 입력 오류(빈 텍스트, 잘못된 정규식, 선택 항목 없음 등)는 다이얼로그를 닫지 않고 그 안에 보여 준다.
     */
    async findStart() {
      const f = get().find;
      if (!f) return;
      const { form } = f;
      const reject = (error: string) => set({ find: { form, error } });
      const s = get();
      const tab = activeTab(s);
      let roots: string[];
      if (form.openTabs) {
        roots = [...new Set((["left", "right"] as const).flatMap((p) => s.panes[p].tabs.filter((t) => !t.virtual).map((t) => t.path)))];
      } else {
        const start = expandPath(form.start.trim(), s.userDirs);
        if (!start) return reject(tr("store.find.start_required"));
        roots = [start];
      }
      const selected = tab.entries.filter((e) => tab.selection.has(e.path)).map((e) => e.path);
      if (form.selectedOnly && selected.length === 0) return reject(tr("store.find.no_selection"));
      if (form.textOn && form.text === "") return reject(tr("store.find.text_required"));
      const spec: FindSpecDto = {
        roots,
        onlyItems: form.selectedOnly ? selected : null,
        followSymlinks: form.followSymlinks,
        excludeDirs: form.excludeDirs,
        maxDepth: form.depth === "all" ? null : Number(form.depth),
        mask: form.mask,
        substring: form.substring,
        regex: form.regex,
        excludeFiles: form.excludeFiles,
        text: form.textOn ? { pattern: form.text, caseSensitive: form.caseSensitive, regex: form.textRegex, invert: form.invert } : null,
      };
      let rejected: string | null = null;
      const label = form.mask.trim() || (form.textOn ? form.text : "*");
      await api.openVirtual("find", `Find: ${label}`, roots[0], async () => {
        try {
          return await backend.startFind(spec);
        } catch (e) {
          rejected = String(e instanceof Error ? e.message : e);
          throw e;
        }
      });
      if (rejected !== null) {
        set({ notice: null }); // 오류는 다이얼로그 안에서 보여 준다
        return reject(rejected);
      }
      set({ find: null, lastFind: { ...form } });
    },
    /** Look Up (FIND-01): 질의를 물어보고 결과를 새 가상 탭에 스트리밍한다. 전역은 홈 아래, 폴더는 현재 위치 아래. */
    async lookup(scope: "global" | "folder") {
      const s = get();
      const base = scope === "global" ? (s.userDirs.home ?? "/") : hereOf(activeTab(s));
      const query = await ask<string>({
        kind: "name",
        title: scope === "global" ? tr("store.lookup.global") : tr("store.lookup.folder"),
        label: tr("store.lookup.label"),
        value: "",
        error: null,
        selectStem: false,
      });
      if (query === null) return;
      const q = query.trim();
      await api.openVirtual("lookup", `Look Up: ${q}`, base, () => backend.startLookup(base, q));
    },

    /** Flatten (FIND-05): 현재 위치 아래의 모든 파일을 평면 목록으로. */
    async flatten() {
      const base = hereOf(activeTab(get()));
      await api.openVirtual("flatten", `Flatten: ${baseName(base) || base}`, base, async () => ({ id: await backend.startFlatten(base), warnings: [] }));
    },

    /** Analyze Disk Usage (FIND-06). 인수 `src`가 있으면 그 폴더(`~` 확장), 없으면 현재 위치. `view`는 처음 보는 방식(목록 또는 treemap). */
    async diskUsage(args?: Record<string, unknown>, view: "list" | "treemap" = "list") {
      const raw = typeof args?.src === "string" ? args.src : null;
      const src = raw === null ? hereOf(activeTab(get())) : expandPath(raw, get().userDirs);
      if (src === null) return fail(tr("store.user_dirs_unknown"));
      await api.openVirtual("usage", `Disk Usage: ${baseName(src) || src}`, src, async () => ({ id: await backend.startDiskUsage(src), warnings: [] }), view);
    },
    /** 같은 Disk Usage를 처음부터 treemap 보기로 연다(`core.disk_usage.treemap`). */
    async diskUsageTreemap(args?: Record<string, unknown>) {
      await api.diskUsage(args, "treemap");
    },
    /** Disk Usage 탭에서 목록 ↔ treemap을 바꾼다. 스캔·항목은 그대로다(`core.disk_usage.toggle_view`). */
    toggleUsageView() {
      patchActive((t) => (t.virtual?.kind === "usage" ? { virtual: { ...t.virtual, view: t.virtual.view === "treemap" ? "list" : "treemap" } } : {}));
    },
    /** Disk Usage 탭이 `path` 폴더를 기준으로 스캔을 다시 시작한다(내려가기·올라가기). 제목과 기준 폴더가 바뀌고 항목은 비운다. */
    async usageRescan(path: string) {
      const s = get();
      const pane = s.activePane;
      const tab = activeTab(s, pane);
      const v = tab.virtual;
      if (!v || v.kind !== "usage") return;
      await startUsageScan(pane, tab, path);
    },
    /**
     * Disk Usage 탭에서 나간다(`q`). 탭을 닫아(진행 중인 스캔은 취소) 이웃 탭으로 돌아가고, 그 패널의 유일한 탭이면 닫을 수 없으므로
     * 기준 폴더의 일반 탭으로 바꾼다. Disk Usage 탭이 아니면 아무것도 하지 않는다.
     */
    async usageExit() {
      const s = get();
      const pane = s.activePane;
      const p = s.panes[pane];
      const tab = p.tabs[p.active];
      if (tab?.virtual?.kind !== "usage") return;
      if (p.tabs.length > 1) await api.closeTabAt(pane, p.active);
      else await api.navigate(tab.virtual.base);
    },
    /** treemap에서 커서를 화면에서 `dir` 방향으로 인접한 타일로 옮긴다(방향키). 그 방향에 타일이 없으면 그대로다. */
    usageMove(dir: Dir) {
      const s = get();
      const tab = activeTab(s);
      const tiles = usageTiles[s.activePane];
      if (!isTreemap(tab) || !tiles?.length) return;
      const ids = new Set(tiles.map((t) => t.id));
      const path = tab.entries[tab.cursor]?.path;
      // 타일이 없는 항목(작아서 "기타"로 묶인 것)의 커서는 "기타" 타일에 있다.
      const next = neighborTile(tiles, path !== undefined && ids.has(path) ? path : OTHER, dir);
      if (next === null) return;
      const i = tab.entries.findIndex((e) => (next === OTHER ? !ids.has(e.path) : e.path === next));
      if (i >= 0) api.setCursor(i);
    },
    /** treemap에서 커서의 폴더 안으로 내려간다(더블클릭, Shift+→, Mod+Enter). 파일이면 아무것도 하지 않는다. */
    async usageDescend() {
      const tab = activeTab(get());
      const c = cursorEntry(tab);
      if (tab.virtual?.kind !== "usage" || !c || !isFolderEntry(c)) return;
      await api.usageRescan(c.path);
    },
    /** treemap의 기준 폴더를 한 단계 위로 올린다(Backspace). 파일 시스템 루트에서는 아무것도 하지 않는다. */
    async usageUp() {
      const tab = activeTab(get());
      if (tab.virtual?.kind !== "usage") return;
      const parent = parentPath(tab.virtual.base);
      if (parent !== null && parent !== tab.virtual.base) await api.usageRescan(parent);
    },
    /**
     * treemap의 타일(= 커서 항목)을 반대쪽 패널에 연다. 폴더는 그 폴더를, 파일은 그 파일이 있는 폴더를(커서를 그 파일에),
     * 항목이 없으면 지금 보는 기준 폴더를 연다. treemap 탭은 그대로 남는다.
     */
    async usageOpenOther(baseFolder = false) {
      const s = get();
      const tab = activeTab(s);
      if (tab.virtual?.kind !== "usage") return;
      const c = baseFolder ? undefined : cursorEntry(tab); // "기타" 타일: 어느 항목인지 가리키지 않으므로 지금 보는 폴더를 연다
      const target = other(s.activePane);
      if (!c) await api.navigate(tab.virtual.base, undefined, "push", target);
      else if (isFolderEntry(c)) await api.navigate(c.path, undefined, "push", target);
      else await api.navigate(parentPath(c.path) ?? tab.virtual.base, c.name, "push", target);
    },

    /** 진행 중인 검색/분석을 취소한다. 그때까지 온 결과는 남는다. */
    cancelSearch() {
      stopSearch(activeTab(get()));
    },
    /** 파일 찾기 다이얼로그의 "취소": 진행 중인 파일 찾기를 모두 멈춘다(결과 탭은 그대로 남는다). */
    cancelFinds() {
      for (const p of ["left", "right"] as const) for (const t of get().panes[p].tabs) if (t.virtual?.running && t.virtual.kind === "find") stopSearch(t);
    },

    /** 가상 탭의 커서 항목이 있는 폴더를 새 탭으로 연다. 커서는 그 항목에 놓인다. */
    async revealInTab() {
      const s = get();
      const entry = cursorEntry(activeTab(s));
      if (!entry) return;
      const parent = parentPath(entry.path);
      if (parent === null) return;
      const p = s.panes[s.activePane];
      const tab = newTab(parent);
      tab.restoreCursor = archiveFileName(entry.name);
      set({ panes: { ...s.panes, [s.activePane]: { tabs: [...p.tabs, tab], active: p.tabs.length } } });
      await reload(s.activePane, tab.id);
      await syncWatches();
    },

    reload: (pane: PaneId, tabId: number, focusName?: string) => reload(pane, tabId, focusName),
    reloadAll: () => reloadAll(),
    /** 비활성 패널의 활성 탭 경로(가상 탭이면 시작 위치). */
    inactivePath(): string {
      const s = get();
      return hereOf(activeTab(s, other(s.activePane)));
    },
    childPath: joinPath,
  };

  // 비-컴포넌트 코드(알림 문구 등)가 쓰는 `t`가 화면 언어를 따르게 한다.
  setBackendErrorTranslator(rustText); // 한국어 Rust 오류 문구를 영어로
  setLanguage(store.getState().loaded.config.behavior.language);
  store.subscribe((s) => setLanguage(s.loaded.config.behavior.language));
  return { store, api, backend };
}

function clamp(i: number, len: number): number {
  return Math.min(Math.max(i, 0), Math.max(len - 1, 0));
}

function quickCursor(t: TabState, text: string, prefixOnly: boolean): Partial<TabState> {
  if (!text) return {};
  const idx = t.entries.findIndex((e) => quickMatch(e.name, text, prefixOnly));
  return idx >= 0 ? { cursor: idx } : {};
}

export type AppStore = ReturnType<typeof createAppStore>;
