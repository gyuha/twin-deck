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
  joinPath,
  parentPath,
  trimTrailingSep,
} from "@twin-deck/ts-client";
import type {
  Backend,
  ConfigValue,
  ConflictDto,
  EntryDto,
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
} from "@twin-deck/ts-client";
import type { ActionContext } from "@twin-deck/actions";
import type { Scope } from "@twin-deck/keybinds";
import { quickMatch } from "../lib/names";
import { parseColumns } from "../lib/columns";
import { rankBy } from "../lib/fuzzy";
import { isInside, volumeOf } from "../lib/volumes";
import { formatDateTime, formatOctal, formatPermissions, formatSize } from "../lib/format";
import { DEFAULT_SORT, SORT_KEYS, sortEntries, sortFromColumns } from "../lib/sort";
import type { SortKey, SortState } from "../lib/sort";

export type PaneId = "left" | "right";

export type ViewMode = { mode: "table" } | { mode: "columns"; count: 1 | 2 | 3 };

export interface TabState {
  id: number;
  /** 탭별 정렬. null이면 설정의 컬럼 명세(`>extension` 등)를 따른다. */
  sort: SortState | null;
  view: ViewMode;
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

export type VirtualKind = "lookup" | "flatten" | "usage" | "find";

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
}

export interface DragState {
  paths: string[];
  sourcePane: PaneId;
  x: number;
  y: number;
  /** Control 키가 눌려 있다(이동). 아니면 복사. */
  ctrl: boolean;
  target: DropTarget | null;
}

export const CONFLICT_CHOICES: readonly ConflictDto[] = ["overwrite", "skip", "rename"];

export type DialogState =
  | { kind: "name"; title: string; value: string; error: string | null; selectStem: boolean; goto?: boolean; label?: string; confirmLabel?: string; option?: { label: string; checked: boolean } }
  | { kind: "multirename"; title: string; items: { path: string; name: string; isDir: boolean; modifiedMs: number | null }[]; existing: string[]; options: RenameOptions }
  | { kind: "confirm"; title: string; lines: string[] }
  | { kind: "conflict"; title: string; existing: string; selected: number; remaining: number; all: boolean }
  | { kind: "info"; title: string; lines: string[] }
  /** 실행 중인 전송(복사/이동) 작업의 진행 창. */
  | { kind: "progress"; title: string; jobId: number };

/** 최근 위치 개수 설정(1 이상). */
export const recentLimit = (c: { behavior: { layout: { recent_limit: number } } }) => Math.max(1, Math.floor(c.behavior.layout.recent_limit) || 20);

export type MenuKind = "volumes" | "favorites" | "recent" | "hierarchy";

export interface MenuItem {
  label: string;
  /** 이동할 경로. 없으면 머리글/구분선이라 고를 수 없다. */
  path?: string;
  /** 즐겨찾기 항목의 변수 확장 전 경로(삭제할 때 설정 파일과 맞춘다). */
  raw?: string;
  separator?: boolean;
}

export interface MenuState {
  kind: MenuKind;
  title: string;
  items: MenuItem[];
  cursor: number;
  /** 최근 위치·즐겨찾기 메뉴: 필터 전 전체 목록과 입력한 필터. `items`는 필터를 거친 보이는 목록이다. */
  all?: MenuItem[];
  filter?: string;
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
  { label: "열기", actionId: "core.open" },
  {
    label: "다음으로 열기",
    sub: [
      { label: "편집기로 열기", actionId: "core.edit" },
      { label: "아카이브로 열기…", actionId: "core.open.as_archive" },
      { label: "파일 관리자에서 보기", actionId: "core.reveal" },
    ],
  },
  {},
  { label: "여기에 압축…", actionId: "core.compress" },
  { label: "압축 풀기", actionId: "core.extract", archiveOnly: true },
  {},
  { label: "이동", actionId: "core.move" },
  { label: "복사", actionId: "core.copy" },
  { label: "삭제", actionId: "core.trash" },
  { label: "이름 바꾸기", actionId: "core.rename" },
  {},
  { label: "파일 속성 표시", actionId: "core.file.info" },
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
  /** 패널별 현재 볼륨의 용량. 알 수 없으면 null. */
  diskSpace: Record<PaneId, DiskSpaceDto | null>;
  settingsOpen: boolean;
  /** 도움말(단축키 목록) 화면이 열려 있는지. */
  helpOpen: boolean;
  /** 파일 찾기 다이얼로그. 닫혀 있으면 null. `error`는 시작을 거부당한 이유(잘못된 정규식 등). */
  find: { form: FindForm; error: string | null } | null;
  /** 직전에 시작한 파일 찾기 조건("마지막 검색"). 메모리에만 보관한다. */
  lastFind: FindForm | null;
  settingsSection: number;
  settingsError: string | null;
  queueCursor: number;
  /** 설정 파일에서 읽은 설정·키바인딩·경고. 로딩 전에는 내장 기본값. */
  loaded: Loaded;
  /** 키바인딩 병합 중 나온 경고 (App이 채운다). */
  keymapWarnings: string[];
  /** 성공 알림 (경로 복사 등). 몇 초 뒤 사라진다. */
  flash: string | null;
  /** 마지막 작업 오류. 다음 작업이 시작되면 지워진다. */
  notice: string | null;
}

export const PAGE_SIZE = 10;
const VIRTUAL_NO_CREATE = "검색/분석 결과 탭에서는 새로 만들 수 없습니다. 폴더 탭에서 시도하세요";
/** 삭제·휴지통·압축은 이 시간을 넘겨 계속 실행 중일 때만 진행 창을 띄운다(자주 쓰는 작업이라 깜빡이지 않게). */
const TRANSFER_PROGRESS_DELAY_MS = 300;
/** 확인 창을 거친 복사·이동은 기다리지 않는다: 첫 조회에서 아직 진행 중이면 바로 진행 창을 띄운다. */
const TRANSFER_PROGRESS_DELAY_COPY_MS = 0;
/** 전송이 끝날 때까지 큐를 직접 조회하는 간격. */
const TRANSFER_POLL_MS = 100;
const VIRTUAL_NO_DEST = "검색/분석 결과 탭은 복사·이동의 대상이 될 수 없습니다. 반대편 패널을 폴더로 바꾸세요";
/** 상태 저장을 미루는 시간(디바운스). */
export const SAVE_DELAY_MS = 400;
/** 저장하는 선택 항목 수의 상한. 폴더 전체 선택(수만 개)이 스냅샷을 키우지 않게 한다. */
export const SELECTION_SAVE_LIMIT = 5000;

/** 탭의 실제 정렬: 탭 설정 > 컬럼 명세의 정렬 표시 > 이름 오름차순. */
export function effectiveSort(tab: TabState, columns: readonly string[]): SortState {
  return tab.sort ?? sortFromColumns(parseColumns(columns)) ?? DEFAULT_SORT;
}
export const SPLIT_MIN = 0.15;
const clampSplit = (r: number) => Math.min(1 - SPLIT_MIN, Math.max(SPLIT_MIN, Number.isFinite(r) ? r : 0.5));

const other = (p: PaneId): PaneId => (p === "left" ? "right" : "left");

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

export function actionContext(s: AppState): ActionContext {
  const tab = activeTab(s);
  return {
    hasCursorItem: !!cursorEntry(tab),
    selectedCount: tab.selection.size,
    tabCount: s.panes[s.activePane].tabs.length,
    canGoUp: tab.virtual?.kind === "usage" && tab.virtual.view === "treemap" ? parentPath(tab.virtual.base) !== null : !tab.virtual && parentPath(tab.path) !== null,
    canGoBack: !tab.virtual && tab.back.length > 0,
    canGoForward: !tab.virtual && tab.forward.length > 0,
    cursorIsDir: cursorEntry(tab)?.kind === "dir",
    cursorIsArchive: isArchiveEntry(cursorEntry(tab), s.loaded.config.file_systems.zip.additional_extensions),
    multiColumn: tab.view.mode === "columns",
    virtualTab: !!tab.virtual,
    searching: !!tab.virtual?.running,
    usageTab: tab.virtual?.kind === "usage",
  };
}

export function scopeStack(s: AppState): Scope[] {
  if (s.dialog) return ["dialog", "pane", "global"];
  // 설정 화면은 메인 창을 덮는 모달이다(settings 스코프).
  if (s.settingsOpen) return ["settings", "global"];
  // 도움말(단축키 목록)도 메인 창을 덮는 모달이다(help 스코프).
  if (s.helpOpen) return ["help", "global"];
  // 파일 찾기 다이얼로그도 모달이다(find 스코프).
  if (s.find) return ["find", "global"];
  // Actions Panel은 입력창이 있는 모달이다(palette 스코프).
  if (s.palette) return ["palette", "global"];
  // 미리보기가 열려 있으면 패널 키는 받지 않는다(preview 스코프).
  if (s.preview) return ["preview", "global"];
  // 팝업 메뉴와 컨텍스트 메뉴는 모달이다(panel 스코프).
  if (s.menu || s.ctxMenu) return ["panel", "global"];
  // 큐 팝업이 열려 있으면 패널 키는 받지 않는다.
  if (s.queueOpen) return ["queue", "global"];
  return activeTab(s).quick !== null ? ["quickSelect", "pane", "global"] : ["pane", "global"];
}

export function createAppStore(backend: Backend, leftPath: string, rightPath: string, snapshot?: Snapshot | null) {
  let nextTabId = 1;
  const newTab = (path: string): TabState => ({
    id: nextTabId++,
    sort: null,
    view: { mode: "table" },
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
    view:
      t.view.mode === "columns" && [1, 2, 3].includes(t.view.count)
        ? { mode: "columns", count: t.view.count as 1 | 2 | 3 }
        : { mode: "table" },
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
    diskSpace: { left: null, right: null },
    settingsOpen: false,
    helpOpen: false,
    find: null,
    lastFind: null,
    settingsSection: 0,
    settingsError: null,
    queueCursor: 0,
    loaded: defaultLoaded(),
    keymapWarnings: [],
    flash: null,
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
        const entries = sortEntries(listed, effectiveSort(t, cfg().view.table.columns));
        const idx = keepName ? entries.findIndex((e) => e.name === keepName) : -1;
        const paths = new Set(entries.map((e) => e.path));
        return {
          entries,
          error: null,
          restoreCursor: undefined,
          cursor: idx >= 0 ? idx : Math.min(t.cursor, Math.max(entries.length - 1, 0)),
          selection: new Set([...t.selection].filter((p) => paths.has(p))),
        };
      });
      if (!keepDirSizes) forgetDirSizesIn(tab.path);
    } catch (e) {
      if (reloadSeq.get(key) !== seq) return;
      patchTab(pane, tabId, { entries: [], cursor: 0, selection: new Set(), error: String(e instanceof Error ? e.message : e) });
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
  function wantedDirSizes(s: AppState): string[] {
    if (!s.loaded.config.display.folder_size_on_select) return [];
    const out: string[] = [];
    for (const pane of ["left", "right"] as const) {
      const t = activeTab(s, pane);
      if (t.virtual || isArchivePath(t.path) || t.selection.size === 0) continue;
      for (const e of t.entries) if (e.kind === "dir" && t.selection.has(e.path)) out.push(e.path);
    }
    return out;
  }
  function syncDirSizes(s: AppState) {
    // 목록·선택·옵션이 그대로면(커서만 움직인 경우 등) 다시 세지 않는다.
    const inputs = [s.loaded.config.display.folder_size_on_select, ...(["left", "right"] as const).flatMap((pane) => {
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
  const stopSearch = (tab: TabState) => {
    if (tab.virtual?.running) void backend.cancelSearch(tab.virtual.jobId).catch(() => {});
  };

  /** 다이얼로그를 열고 사용자의 결정을 기다린다. 취소하면 null. */
  let pending: ((value: unknown) => void) | null = null;
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
  /** 새로 만든 항목으로 커서를 옮긴다. 중첩 경로(`a/b/c`)면 이 폴더 바로 아래에 생긴 맨 위 폴더(`a`)로 간다. 길어서 화면 밖이어도 표가 따라 스크롤한다. */
  const cursorToCreated = (typed: string) => {
    const top = typed.split(/[\\/]/).find((part) => part !== "");
    const idx = activeTab(get()).entries.findIndex((e) => e.name.normalize("NFC") === top?.normalize("NFC"));
    if (idx >= 0) api.setCursor(idx);
  };
  /** 업데이트 확인·설치가 진행 중이면 다시 시작하지 않는다. */
  let updateBusy = false;

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
      console.info("[twin-deck] 큐 이벤트를 처음 받았습니다");
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
          view: t.view.mode === "columns" ? { mode: "columns", count: t.view.count } : { mode: "table", count: 1 },
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
      fail(`상태를 저장하지 못했습니다: ${e instanceof Error ? e.message : e}`);
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
  let previewSeq = 0;
  async function loadPreview(entry: EntryDto) {
    const seq = ++previewSeq;
    const base = { path: entry.path, name: entry.name, isDir: entry.kind === "dir" };
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
    if (dest === null) return fail("사용자 폴더를 알 수 없어 경로를 확장하지 못했습니다");
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
        await reloadAll();
        return;
      }
      if (!shownOnce && !get().dialog && Date.now() - started >= delayMs) {
        shownOnce = true;
        set({ dialog: { kind: "progress", title: `${verb} 중`, jobId } });
      }
    }
  }

  /** 전송 확인 창의 대상 폴더가 쓸 수 없으면 사유를, 괜찮으면 null을 돌려준다. */
  async function transferDestError(dest: string, targets: Pick<EntryDto, "path" | "kind">[]): Promise<string | null> {
    const clean = trimTrailingSep(dest);
    if (targets.some((t) => t.kind === "dir" && (clean === t.path || (clean.startsWith(t.path) && /[\\/]/.test(clean.charAt(t.path.length)))))) {
      return "원본 폴더 안으로는 보낼 수 없습니다";
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
    const verb = kind === "copy" ? "복사" : "이동";
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
              title: `${verb}: 이름이 겹칩니다`,
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
    if (targets.some((t) => isArchivePath(t.path))) return fail("아카이브 안의 항목은 클립보드로 복사할 수 없습니다");
    set({ notice: null });
    const paths = targets.map((t) => t.path);
    try {
      await backend.setClipboardFiles(paths);
    } catch (e) {
      return fail(e);
    }
    cutPaths = mode === "cut" ? paths : [];
    flash(mode === "cut" ? `${paths.length}개 항목을 잘라냈습니다. 붙여 넣으면 이동합니다` : `${paths.length}개 항목을 클립보드에 복사했습니다`);
  }

  /** 커서 아래 요소에서 드롭 대상을 정한다: 폴더 행이면 그 폴더 안으로, 아니면 그 패널의 현재 폴더(같은 패널·가상 탭은 받지 않는다). */
  function dropTargetAt(el: Element | null, drag: { paths: string[]; sourcePane: PaneId }): DropTarget | null {
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
      if (moved > 0) fail(`저장된 폴더 ${moved}개가 없어져 가장 가까운 상위 폴더로 옮겼습니다`);
      // 복원이 끝난 상태를 기준으로 삼아, 그 뒤에 달라진 것만 저장한다.
      lastSaved = JSON.stringify(toSnapshot());
      saveEnabled = true;
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
        title: "저장된 상태를 모두 지우고 앱을 종료할까요?",
        lines: ["열려 있던 탭, 폴더, 선택 항목, Actions Panel 검색어가 지워집니다. 설정 파일은 그대로입니다."],
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
        flash(`새 창을 열었습니다 (${await backend.newWindow()})`);
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
    /** 미리보기 창의 위치·크기를 기억한다. null이면 기본값으로 되돌린다. */
    setPreviewRect(rect: PreviewRect | null) {
      set({ previewRect: rect });
    },
    async paneSend(args?: Record<string, unknown>) {
      const to = args?.to;
      if (to !== "left" && to !== "right") return fail("core.pane.send에는 인수 to(left|right)가 필요합니다");
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

    /** 열기: 폴더는 들어가고, 아카이브 파일은 폴더처럼 연다 (ARC-01). */
    async open() {
      const tab = activeTab(get());
      if (tab.virtual?.kind === "usage" && tab.virtual.view === "treemap") return api.usageOpenOther();
      const c = cursorEntry(tab);
      if (c && isFolderEntry(c)) await api.navigate(c.path);
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

    /** 확장자와 무관하게 커서의 파일을 아카이브로 연다 (ARC-04, `core.open.as_archive`). */
    async openAsArchive() {
      const c = cursorEntry(activeTab(get()));
      if (!c) return;
      if (c.kind !== "file") {
        fail("파일만 아카이브로 열 수 있습니다");
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
      const circular = cfg().behavior.table.circular_selection;
      patchActive((t) => {
        const len = t.entries.length;
        if (len === 0) return {};
        let next = t.cursor + delta;
        // 순환 선택(NAV-06)은 한 칸 이동에만 적용한다.
        if (circular && Math.abs(delta) === 1) next = (next + len) % len;
        return { cursor: clamp(next, len) };
      });
    },
    /** 반 페이지 이동 (NAV-02). */
    moveHalfPage(dir: 1 | -1) {
      api.moveCursor(dir * Math.floor(PAGE_SIZE / 2));
    },
    /** 다중 컬럼 모드에서 이전/다음 컬럼으로 (NAV-05). 컬럼은 위에서 아래로 채워진다. */
    moveColumn(dir: 1 | -1) {
      patchActive((t) => {
        if (t.view.mode !== "columns" || t.entries.length === 0) return {};
        const rows = Math.ceil(t.entries.length / t.view.count);
        return { cursor: clamp(t.cursor + dir * rows, t.entries.length) };
      });
    },
    /** 왼쪽 키: 여러 컬럼 보기에서는 이전 컬럼, 그 밖에는 상위 폴더로 간다. */
    async goLeft() {
      if (activeTab(get()).view.mode === "columns") api.moveColumn(-1);
      else await api.goUp();
    },
    /** 오른쪽 키: 여러 컬럼 보기에서는 다음 컬럼, 그 밖에는 폴더면 들어가고 파일이면 미리보기를 연다. */
    async goRight() {
      const tab = activeTab(get());
      if (tab.virtual?.kind === "usage" && tab.virtual.view === "treemap") return api.usageDescend();
      if (tab.view.mode === "columns") api.moveColumn(1);
      else if (isFolderEntry(cursorEntry(tab))) await api.open();
      else await api.previewToggle();
    },
    /** 정렬 변경 (`core.view.order`). 같은 키를 다시 고르면 방향을 뒤집는다. `dir`로 방향을 지정할 수 있다. */
    setOrder(args?: Record<string, unknown>) {
      const s = get();
      const tab = activeTab(s);
      const current = effectiveSort(tab, cfg().view.table.columns);
      const by = typeof args?.by === "string" ? args.by : current.key;
      if (!(SORT_KEYS as readonly string[]).includes(by)) return fail(`알 수 없는 정렬 기준: ${by}`);
      const key = by as SortKey;
      const asked = args?.dir;
      const dir =
        asked === "asc" || asked === "desc" ? asked : key === current.key ? (current.dir === "asc" ? "desc" : "asc") : "asc";
      const sort: SortState = { key, dir };
      patchActive((t) => {
        const cursorPath = t.entries[t.cursor]?.path;
        const entries = sortEntries(t.entries, sort);
        const idx = cursorPath ? entries.findIndex((e) => e.path === cursorPath) : -1;
        return { sort, entries, cursor: idx >= 0 ? idx : 0 };
      });
    },
    /** 표시 모드 변경 (`core.view.mode`). 인수가 없으면 table → columns-1 → 2 → 3 → table 순환. */
    setViewMode(args?: Record<string, unknown>) {
      const order = ["table", "columns-1", "columns-2", "columns-3"] as const;
      const t = activeTab(get());
      const now = t.view.mode === "table" ? "table" : (`columns-${t.view.count}` as const);
      const asked = typeof args?.mode === "string" ? args.mode : order[(order.indexOf(now) + 1) % order.length];
      const view: ViewMode | null =
        asked === "table"
          ? { mode: "table" }
          : asked === "columns-1" || asked === "columns-2" || asked === "columns-3"
            ? { mode: "columns", count: Number(asked.slice(-1)) as 1 | 2 | 3 }
            : null;
      if (!view) return fail(`알 수 없는 표시 모드: ${asked}`);
      patchActive({ view });
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
        for (let i = lo; i <= hi; i++) {
          if (i === to && to !== t.cursor) continue;
          const path = t.entries[i].path;
          if (sel.has(path)) sel.delete(path);
          else sel.add(path);
        }
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
      patchActive((t) => ({ cursor: clamp(index, t.entries.length) }));
    },
    /** Shift+클릭: 지금 커서 항목부터 클릭한 항목까지(양 끝 포함)를 기존 선택에 더하고 커서를 옮긴다. */
    selectRangeTo(index: number) {
      patchActive((t) => {
        if (t.entries.length === 0) return {};
        const to = clamp(index, t.entries.length);
        const sel = new Set(t.selection);
        for (let i = Math.min(t.cursor, to); i <= Math.max(t.cursor, to); i++) sel.add(t.entries[i].path);
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
        title: select ? "패턴으로 선택" : "패턴으로 선택 해제",
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
      if (hits.length === 0) return fail(`'${pattern.trim()}'와 일치하는 항목이 없습니다`);
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
      const s = get();
      const p = s.panes[s.activePane];
      const tab = newTab(hereOf(activeTab(s)));
      set({
        panes: { ...s.panes, [s.activePane]: { tabs: [...p.tabs, tab], active: p.tabs.length } },
      });
      await reload(s.activePane, tab.id);
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
     * 가상 탭(검색 결과 등)·범위 밖·같은 패널이면 아무것도 바꾸지 않는다.
     */
    async transferTab(from: PaneId, index: number, to: PaneId, toIndex: number) {
      if (from === to) return;
      const s = get();
      const src = s.panes[from];
      const dst = s.panes[to];
      const tab = src.tabs[index];
      if (!tab || tab.virtual) return;
      const at = Math.min(Math.max(toIndex, 0), dst.tabs.length);
      const copying = src.tabs.length <= 1;
      const incoming = copying ? newTab(tab.path) : tab;
      const dstTabs = [...dst.tabs.slice(0, at), incoming, ...dst.tabs.slice(at)];
      let srcPane = src;
      if (!copying) {
        const tabs = src.tabs.filter((_, i) => i !== index);
        const kept = src.tabs[src.active];
        const active = index === src.active ? Math.min(index, tabs.length - 1) : tabs.indexOf(kept);
        srcPane = { tabs, active };
      }
      set((st) => ({ panes: { ...st.panes, [from]: srcPane, [to]: { tabs: dstTabs, active: at } }, activePane: to }));
      if (copying) await reload(to, incoming.id);
      await syncWatches();
    },
    cycleTab(delta: 1 | -1) {
      const s = get();
      const p = s.panes[s.activePane];
      const active = (p.active + delta + p.tabs.length) % p.tabs.length;
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
        const text = (t.quick ?? "") + char;
        return { quick: text, ...quickCursor(t, text, q.match_only_prefix) };
      });
    },
    quickStart() {
      patchActive((t) => (t.quick === null ? { quick: "" } : {}));
    },
    quickBackspace() {
      const prefix = cfg().behavior.quick_select.match_only_prefix;
      patchActive((t) => {
        const text = (t.quick ?? "").slice(0, -1);
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

    /** 이름 다이얼로그의 체크박스를 바꾼다. */
    dialogSetOption(checked: boolean) {
      set((s) => (s.dialog?.kind === "name" && s.dialog.option ? { dialog: { ...s.dialog, option: { ...s.dialog.option, checked } } } : {}));
    },
    /** 다중 이름 바꾸기 창의 입력을 바꾼다. */
    dialogMultiRenameSet(patch: Partial<RenameOptions>) {
      set((s) => (s.dialog?.kind === "multirename" ? { dialog: { ...s.dialog, options: { ...s.dialog.options, ...patch } } } : {}));
    },
    dialogMultiRenameReset() {
      set((s) => (s.dialog?.kind === "multirename" ? { dialog: { ...s.dialog, options: { ...DEFAULT_RENAME_OPTIONS } } } : {}));
    },
    dialogSetValue(value: string) {
      set((s) => (s.dialog?.kind === "name" ? { dialog: { ...s.dialog, value, error: null } } : {}));
    },
    dialogSetChoice(index: number) {
      set((s) =>
        s.dialog?.kind === "conflict"
          ? { dialog: { ...s.dialog, selected: (index + CONFLICT_CHOICES.length) % CONFLICT_CHOICES.length } }
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
      } else if (d.kind === "name") {
        if (d.value.trim() === "") {
          set({ dialog: { ...d, error: "이름을 입력하세요" } });
          return;
        }
        result = d.option ? { value: d.value, checked: d.option.checked } : d.value;
      } else if (d.kind === "conflict") {
        result = { choice: CONFLICT_CHOICES[d.selected], all: d.all };
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
      if (tab.virtual) return fail(VIRTUAL_NO_CREATE);
      const name = await ask<string>({ kind: "name", title: "새 폴더", value: "", error: null, selectStem: false });
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
    /** 새 파일 (OP-02). */
    async newFile() {
      const tab = activeTab(get());
      if (tab.virtual) return fail(VIRTUAL_NO_CREATE);
      const name = await ask<string>({ kind: "name", title: "새 파일", value: "", error: null, selectStem: false });
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
    async renameCursor() {
      const s = get();
      const tab = activeTab(s);
      // 2개 이상 선택하면 다중 이름 바꾸기, 아니면 커서 항목 하나의 이름을 바꾼다.
      if (tab.selection.size >= 2) return api.multiRename();
      const entry = cursorEntry(tab);
      if (!entry) return;
      const name = await ask<string>({ kind: "name", title: "이름 변경", value: entry.name, error: null, selectStem: true });
      if (name === null || name === entry.name) return;
      set({ notice: null });
      try {
        const dest = await backend.rename(entry.path, name.trim());
        if (tab.virtual) {
          // 가상 탭은 다시 읽을 폴더가 없으니 결과 항목만 새 이름으로 바꾼다
          patchTab(s.activePane, tab.id, (t) => ({
            entries: t.entries.map((e) => (e.path === entry.path ? { ...e, name: baseName(dest), path: dest } : e)),
            selection: new Set([...t.selection].map((p) => (p === entry.path ? dest : p))),
          }));
        } else {
          await reload(s.activePane, tab.id, baseName(dest));
        }
        await reloadAll();
      } catch (e) {
        fail(e);
      }
    },
    /** 다중 이름 바꾸기 (`core.rename.multi`): 선택한 항목의 이름을 마스크·찾기/바꾸기·카운터로 한꺼번에 바꾼다. */
    async multiRename() {
      const s = get();
      const pane = s.activePane;
      const tab = activeTab(s);
      const targets = targetsOf(tab);
      if (targets.length < 2) return fail("이름을 바꿀 항목을 2개 이상 선택하세요");
      if (tab.virtual) return fail("검색/분석 결과 탭에서는 여러 항목의 이름을 한꺼번에 바꿀 수 없습니다. 폴더 탭에서 선택하세요");
      if (targets.some((t) => isArchivePath(t.path))) return fail("아카이브 안의 항목은 이름을 바꿀 수 없습니다");
      const items = targets.map((t) => ({ path: t.path, name: t.name, isDir: t.kind === "dir", modifiedMs: t.modifiedMs }));
      const plan = await ask<{ items: typeof items; newNames: string[] }>({
        kind: "multirename",
        title: "다중 이름 바꾸기 도구",
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
          else failed.push(`${st.name}: 임시 이름(${baseName(st.tmp)})으로 남아 있습니다`);
        }
      } else {
        for (const r of rows) {
          const dest = await run(r.path, r.to, r.name);
          if (dest) done.push(dest);
        }
      }
      patchTab(pane, tab.id, { selection: new Set(done) });
      await reloadAll();
      if (failed.length > 0) fail(`${done.length}개 변경, ${failed.length}개 실패 — ${failed.join(" / ")}`);
      else flash(`${done.length}개의 이름을 바꿨습니다`);
    },
    /** 비활성 패널로 복사/이동 (OP-03, OP-04). 이름이 겹치면 항목마다 물어본 뒤 작업 큐에 넣는다. */
    async copyOrMove(kind: "copy" | "move", confirm = true) {
      const s = get();
      const targets = targetsOf(activeTab(s));
      if (targets.length === 0) return;
      const inactive = activeTab(s, other(s.activePane));
      if (inactive.virtual) return fail(VIRTUAL_NO_DEST);
      const verb = kind === "copy" ? "복사" : "이동";
      set({ notice: null });
      const title =
        targets.length === 1
          ? `"${targets[0].name}" 항목을 ${verb}하시겠습니까?`
          : `선택한 ${targets.length}개 항목을 ${verb}하시겠습니까?`;
      let destDir = inactive.path;
      let error: string | null = null;
      while (confirm) {
        const value = await ask<string>({ kind: "name", title, label: "대상 폴더", value: destDir, error, selectStem: false, confirmLabel: "시작" });
        if (value === null) return;
        destDir = value.trim();
        if (destDir.length > 1) destDir = destDir.replace(/\/+$/, "");
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
    /** 끌던 파일을 운영체제 드래그로 넘긴다(창 밖으로 나갔을 때). 아카이브 안의 항목은 실제 파일이 아니라 보낼 수 없다. */
    async dragOutOfWindow(paths: string[]) {
      if (paths.some((p) => isArchivePath(p))) return fail("아카이브 안의 항목은 다른 앱으로 끌어 갈 수 없습니다");
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
      if (!drag) return false;
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
      if (tab.virtual) return fail(VIRTUAL_NO_DEST);
      set({ notice: null });
      let paths: string[];
      try {
        paths = await backend.getClipboardFiles();
      } catch (e) {
        return fail(e);
      }
      if (paths.length === 0) return flash("클립보드에 붙여 넣을 파일이 없습니다");
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
        fail("아카이브 안에서는 휴지통을 쓸 수 없습니다. 영구 삭제(Shift+F8)를 사용하세요");
        return;
      }
      if (cfg().core.confirm.trash && !(await api.confirmTargets(`${targets.length}개 항목을 휴지통으로 보낼까요?`, targets))) return;
      set({ notice: null });
      patchActive({ selection: new Set() });
      api.recheckVirtual(targets.map((t) => t.path));
      const jobId = await backend.enqueue("trash", targets.map((t) => ({ src: t.path, destDir: null, policy: "skip" })));
      void trackTransfer(jobId, "휴지통으로 이동");
      await reloadAll();
    },
    /** 압축 (OP-11, `core.compress`): 대상 항목을 이 폴더의 ZIP 하나로 묶는다. 원본은 그대로 둔다. */
    async compress() {
      const tab = activeTab(get());
      const targets = targetsOf(tab);
      if (targets.length === 0) return;
      if (tab.virtual) return fail("검색/분석 결과 탭에서는 압축할 수 없습니다. 폴더 탭에서 항목을 선택하세요");
      if (targets.some((t) => isArchivePath(t.path))) return fail("아카이브 안의 항목은 압축할 수 없습니다. 먼저 밖으로 복사하세요");
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
          title: "압축 파일 이름",
          value: `${baseName(tab.path) || "archive"}.zip`,
          error: null,
          selectStem: true,
          option: canOther ? { label: "반대 패널에 압축 파일 놓기", checked: false } : undefined,
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
        await trackTransfer(jobId, "압축");
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
      if (targets.length === 0) return fail("압축 파일(아카이브)을 선택하세요");
      if (targets.some((t) => isArchivePath(t.path))) return fail("아카이브 안의 아카이브는 먼저 밖으로 꺼낸 뒤 추출하세요");
      let fixed: string | null = null;
      if (toInactive) {
        const inactive = activeTab(s, other(s.activePane));
        if (inactive.virtual) return fail(VIRTUAL_NO_DEST);
        if (isArchivePath(inactive.path)) return fail("아카이브 안에는 추출할 수 없습니다");
        fixed = inactive.path;
      }
      set({ notice: null });
      patchActive({ selection: new Set() });
      for (const t of targets) {
        try {
          const jobId = await backend.enqueueExtract(t.path, fixed ?? parentPath(t.path) ?? "/");
          void trackTransfer(jobId, "압축 풀기");
        } catch (e) {
          fail(e);
          break;
        }
      }
      await reloadAll();
    },
    /** 심볼릭 링크 만들기 (OP-12, `core.file.symlink`): 커서 항목을 반대편 패널 폴더에 링크로 만든다. */
    async symlink() {
      const s = get();
      const entry = cursorEntry(activeTab(s));
      if (!entry) return;
      const inactive = activeTab(s, other(s.activePane));
      if (inactive.virtual) return fail(VIRTUAL_NO_DEST);
      if (isArchivePath(inactive.path) || isArchivePath(entry.path)) return fail("아카이브 안에서는 심볼릭 링크를 만들 수 없습니다");
      set({ notice: null });
      try {
        let policy: ConflictDto = "skip";
        const existing = await backend.detectConflict(entry.path, inactive.path);
        if (existing !== null) {
          const answer = await ask<{ choice: ConflictDto; all: boolean }>({
            kind: "conflict",
            title: "링크: 이름이 겹칩니다",
            existing,
            selected: CONFLICT_CHOICES.indexOf("rename"),
            remaining: 1,
            all: false,
          });
          if (answer === null) return;
          policy = answer.choice;
        }
        const made = await backend.createSymlink(entry.path, inactive.path, policy);
        if (made) flash(`링크를 만들었습니다: ${made}`);
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
      const kind = { file: "파일", dir: "폴더", symlink: "심볼릭 링크" }[info.kind];
      const lines = [
        `이름: ${info.name}`,
        `경로: ${info.path}`,
        `종류: ${kind}`,
        info.kind === "dir"
          ? `항목 수: ${info.childCount ?? "알 수 없음"}`
          : `크기: ${formatSize(info.size, display.size_format)} (${info.size} B)`,
        `생성: ${formatDateTime(info.createdMs, display)}`,
        `수정: ${formatDateTime(info.modifiedMs, display)}`,
        `접근: ${formatDateTime(info.accessedMs, display)}`,
        ...(info.mode === null ? [] : [`권한: ${formatPermissions(info.mode)} (${formatOctal(info.mode)})`]),
        ...(info.linkTarget ? [`링크 대상: ${info.linkTarget}`] : []),
      ];
      await ask<boolean>({ kind: "info", title: `정보: ${info.name}`, lines });
    },
    /** 폴더 경로 복사 (OP-15, F12). */
    async copyFolderPath() {
      const path = hereOf(activeTab(get()));
      try {
        await backend.copyText(path);
        flash(`폴더 경로를 복사했습니다: ${path}`);
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
        flash(`${targets.length}개 경로를 복사했습니다`);
      } catch (e) {
        fail(e);
      }
    },
    /** 파일 관리자에서 보기 (OP-16): 커서 항목, 없으면 현재 폴더. */
    async revealCursor() {
      const tab = activeTab(get());
      set({ notice: null });
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
      try {
        await backend.editPaths(targets.map((t) => t.path));
      } catch (e) {
        fail(e);
      }
    },
    /** 폴더 편집 (OP-09, Shift+F4): 현재 폴더를 편집기로 연다. */
    async editFolder() {
      set({ notice: null });
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
        lines: targets.slice(0, 5).map((t) => t.name).concat(targets.length > 5 ? [`… 외 ${targets.length - 5}개`] : []),
      });
      return ok === true;
    },
    /** 영구 삭제 (OP-07). `core.confirm.delete`가 켜져 있으면 확인을 거친다 (OP-13). */
    async deleteTargets() {
      const targets = targetsOf(activeTab(get()));
      if (targets.length === 0) return;
      if (cfg().core.confirm.delete && !(await api.confirmTargets(`${targets.length}개 항목을 영구 삭제할까요?`, targets))) return;
      set({ notice: null });
      patchActive({ selection: new Set() });
      api.recheckVirtual(targets.map((t) => t.path));
      const jobId = await backend.enqueue("delete", targets.map((t) => ({ src: t.path, destDir: null, policy: "skip" })));
      void trackTransfer(jobId, "삭제");
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
        .map((w) => `${w.file}${w.line ? `:${w.line}` : ""}: ${w.message}`)
        .concat(s.keymapWarnings);
      await ask<boolean>({ kind: "info", title: lines.length ? `설정 경고 ${lines.length}개` : "설정 경고 없음", lines });
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
          title = "볼륨";
          items = (await backend.listVolumes()).map((v) => ({
            label: v.name === v.mountPoint ? v.name : `${v.name} — ${v.mountPoint}`,
            path: v.mountPoint,
          }));
        } else if (kind === "favorites") {
          title = "즐겨찾기";
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
          title = "최근 위치";
          const seen = new Set<string>([tab.path]);
          for (const p of [...s.recent].reverse()) {
            if (seen.has(p)) continue;
            seen.add(p);
            items.push({ label: p, path: p });
            if (items.length >= recentLimit(s.loaded.config)) break;
          }
        } else {
          title = "상위 폴더";
          for (let p: string | null = hereOf(tab); p !== null; p = parentPath(p)) {
            items.push({ label: p, path: p });
          }
        }
      } catch (e) {
        fail(e);
        return;
      }
      const first = items.findIndex((i) => i.path !== undefined);
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
          if (m.items[i].path !== undefined) return { menu: { ...m, cursor: i } };
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
      if (!item?.path) return;
      set({ menu: null });
      await api.navigate(item.path);
    },
    /** 숫자키: n번째로 고를 수 있는 항목 (1~9, 0은 10번째). */
    async menuSelectNth(n: number) {
      const m = get().menu;
      if (!m) return;
      const selectable = m.items.map((it, i) => (it.path !== undefined ? i : -1)).filter((i) => i >= 0);
      const idx = selectable[n === 0 ? 9 : n - 1];
      if (idx !== undefined) await api.menuSelect(idx);
    },
    /** 마운트된 볼륨 목록과 두 패널의 용량을 다시 읽는다(앱 시작, 창이 포커스를 얻을 때). 목록을 못 읽으면 이전 목록을 유지한다. */
    async refreshVolumes() {
      try {
        set({ volumes: await backend.listVolumes() });
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
        title: "경로로 이동",
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
      if (typeof src !== "string" || src.trim() === "") return fail("core.open.directory에는 문자열 인수 src가 필요합니다");
      await navigateToPath(src);
    },
    /** 폴더 단축키(`shortcuts.N`)에 지정된 폴더로 간다. 비어 있으면 알리고 이동하지 않는다. */
    async openShortcut(args?: Record<string, unknown>) {
      const n = String(args?.n ?? "");
      const path = get().loaded.config.shortcuts[n]?.trim();
      if (!path) return fail(`Ctrl+${n}에 지정된 폴더가 없습니다 (설정 > 폴더 단축키)`);
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
      if (entry) await loadPreview(entry);
    },
    previewClose() {
      previewSeq++;
      set({ preview: null });
    },
    /** 미리보기에서 Return: 닫고, 압축 파일이면 압축을 풀고 아니면 연다. */
    async previewOpen() {
      api.previewClose();
      if (isArchiveEntry(cursorEntry(activeTab(get())), cfg().file_systems.zip.additional_extensions)) await api.extract();
      else await api.open();
    },
    /** 미리보기에서 →: 폴더면 그 안으로 들어가 첫 항목을 미리보고(항목이 없으면 미리보기를 닫는다), 아니면 다음 항목이다. */
    async previewForward() {
      const entry = cursorEntry(activeTab(get()));
      if (entry?.kind !== "dir") return api.previewMove(1);
      await api.navigate(entry.path);
      const first = activeTab(get()).entries[0];
      if (!first) return api.previewClose();
      api.setCursor(0);
      await loadPreview(first);
    },
    /** 미리보기를 연 채 커서를 옮기고 새 항목을 보여 준다. */
    async previewMove(delta: 1 | -1) {
      api.moveCursor(delta);
      const entry = cursorEntry(activeTab(get()));
      if (entry) await loadPreview(entry);
    },

    /**
     * 미리보기 중인 파일을 영구 삭제하고 다음 파일로 넘어간다(`core.confirm.delete`가 켜져 있으면 확인을 거친다).
     * 다음이 없으면(맨 끝) 앞 파일로, 남은 파일이 없으면 미리보기를 닫는다.
     */
    async previewDelete() {
      const p = get().preview;
      if (!p) return;
      const tab = activeTab(get());
      const idx = tab.entries.findIndex((e) => e.path === p.path);
      const entry = tab.entries[idx];
      if (!entry) return;
      if (cfg().core.confirm.delete && !(await api.confirmTargets("이 항목을 영구 삭제할까요?", [entry]))) return;
      // 삭제는 큐에서 비동기로 끝나므로, 지금 목록에서 다음(없으면 이전) 항목을 미리 정해 그 쪽으로 옮긴다.
      const next = tab.entries[idx + 1] ?? tab.entries[idx - 1];
      set({ notice: null });
      patchActive({ selection: new Set() });
      api.recheckVirtual([entry.path]);
      const jobId = await backend.enqueue("delete", [{ src: entry.path, destDir: null, policy: "skip" }]);
      void trackTransfer(jobId, "삭제");
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
      set({ helpOpen: true });
    },
    closeHelp() {
      set({ helpOpen: false });
    },
    /** 도움말 화면에 보일 줄: 키가 걸린 액션만, Actions Panel과 같은 카탈로그에서 가져온다. */
    helpItems(): CatalogItem[] {
      return catalogFn().filter((i) => i.keys !== "");
    },
    /**
     * F키 등에 지정한 애플리케이션으로 연다.
     * `items`(`core.app.launch`): 선택한 항목 전체, 없으면 커서 항목, 항목이 하나도 없으면(빈 폴더) 현재 폴더를 넘긴다.
     * `folder`(`core.app.open_folder`): 선택·커서와 무관하게 항상 현재 패널의 폴더를 넘긴다.
     */
    /** 업데이트 확인: 새 버전이 있으면 확인 창을 거쳐 설치하고 다시 시작한다. 확인은 수동으로만 한다. */
    async checkForUpdate() {
      if (updateBusy) return;
      updateBusy = true;
      set({ notice: null });
      try {
        flash("업데이트를 확인하는 중…");
        const info = await backend.checkUpdate();
        if (!info) {
          flash("최신 버전입니다");
          return;
        }
        const ok = await ask<boolean>({
          kind: "confirm",
          title: `새 버전 ${info.version}이 있습니다. 설치하고 다시 시작할까요?`,
          lines: (info.notes ?? "").split("\n").filter((l) => l.trim()).slice(0, 8),
        });
        if (ok !== true) return;
        flash("업데이트를 설치하는 중… 끝나면 앱이 다시 시작됩니다");
        await backend.installUpdate();
      } catch (e) {
        set({ flash: null });
        fail(e);
      } finally {
        updateBusy = false;
      }
    },
    async launchApp(args?: Record<string, unknown>, target: "items" | "folder" = "items") {
      const app = typeof args?.app === "string" ? args.app.trim() : "";
      const key = typeof args?.key === "string" ? args.key : "이 키";
      if (!app) return fail(`${key}에 지정된 애플리케이션이 없습니다 (설정 > F키)`);
      const tab = activeTab(get());
      const selected = tab.entries.filter((e) => tab.selection.has(e.path)).map((e) => e.path);
      const cursor = cursorEntry(tab);
      const paths =
        target === "folder" ? (tab.virtual ? [] : [tab.path]) : selected.length > 0 ? selected : cursor ? [cursor.path] : tab.virtual ? [] : [tab.path];
      if (paths.length === 0) return fail(target === "folder" ? "검색 결과 탭에는 열 현재 폴더가 없습니다" : "애플리케이션에 전달할 항목이 없습니다");
      set({ notice: null });
      try {
        await backend.launchApp(app, paths);
      } catch (e) {
        fail(e);
      }
    },
    openSettings() {
      set({ settingsOpen: true, settingsSection: 0, settingsError: null });
    },
    closeSettings() {
      set({ settingsOpen: false, settingsError: null });
    },
    setSettingsSection(settingsSection: number) {
      set({ settingsSection });
    },
    /** 화면 요소(Action Bar, 드라이브 바)를 켜고 끈다. 설정 파일에 저장되어 다음 실행에도 유지된다. */
    async toggleLayoutFlag(flag: "show_action_bar" | "show_drive_bar") {
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
    /** 설정 하나를 사용자 config.toml에서 지워 기본값으로 되돌린다. */
    async resetConfigValue(key: string) {
      try {
        set({ loaded: await backend.resetConfigValue(key), settingsError: null });
        void reloadAll();
      } catch (e) {
        set({ settingsError: String(e instanceof Error ? e.message : e) });
      }
    },
    async revealConfigDir() {
      try {
        await backend.revealConfigDir();
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
        if (!start) return reject("시작 디렉터리를 입력하세요");
        roots = [start];
      }
      const selected = tab.entries.filter((e) => tab.selection.has(e.path)).map((e) => e.path);
      if (form.selectedOnly && selected.length === 0) return reject("선택한 디렉터리나 파일이 없습니다");
      if (form.textOn && form.text === "") return reject("찾을 텍스트를 입력하세요");
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
        title: scope === "global" ? "Look Up (전역: 홈 아래)" : "Look Up (현재 폴더 아래)",
        label: "질의",
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
      if (src === null) return fail("사용자 폴더를 알 수 없어 경로를 확장하지 못했습니다");
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
    /** treemap에서 커서의 폴더 안으로 내려간다(더블클릭, →). 파일이면 아무것도 하지 않는다. */
    async usageDescend() {
      const tab = activeTab(get());
      const c = cursorEntry(tab);
      if (tab.virtual?.kind !== "usage" || !c || !isFolderEntry(c)) return;
      await api.usageRescan(c.path);
    },
    /** treemap의 기준 폴더를 한 단계 위로 올린다(Backspace, ←). 파일 시스템 루트에서는 아무것도 하지 않는다. */
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

  return { store, api };
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
