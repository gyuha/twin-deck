import { createStore } from "zustand/vanilla";
import { baseName, defaultLoaded, expandPath, joinPath, parentPath } from "@twin-deck/ts-client";
import type {
  Backend,
  ConflictDto,
  EntryDto,
  JobDto,
  Loaded,
  PreviewDto,
  QueueItemDto,
  Snapshot,
  TabSnap,
  UserDirsDto,
} from "@twin-deck/ts-client";
import type { ActionContext } from "@twin-deck/actions";
import type { Scope } from "@twin-deck/keybinds";
import { quickMatch } from "../lib/names";
import { parseColumns } from "../lib/columns";
import { rankBy } from "../lib/fuzzy";
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
  entries: EntryDto[];
  cursor: number;
  selection: ReadonlySet<string>;
  error: string | null;
  /** Quick Select 입력 중이면 입력 문자열. */
  quick: string | null;
  /** 복원한 커서 항목 이름. 첫 목록을 읽을 때 한 번 쓰고 지운다. */
  restoreCursor?: string;
}

export interface PaneState {
  tabs: TabState[];
  active: number;
}

export const CONFLICT_CHOICES: readonly ConflictDto[] = ["overwrite", "skip", "rename"];

export type DialogState =
  | { kind: "name"; title: string; value: string; error: string | null; selectStem: boolean; goto?: boolean }
  | { kind: "confirm"; title: string; lines: string[] }
  | { kind: "conflict"; title: string; existing: string; selected: number }
  | { kind: "info"; title: string; lines: string[] };

export type MenuKind = "volumes" | "favorites" | "recent" | "hierarchy";

export interface MenuItem {
  label: string;
  /** 이동할 경로. 없으면 머리글/구분선이라 고를 수 없다. */
  path?: string;
  separator?: boolean;
}

export interface MenuState {
  kind: MenuKind;
  title: string;
  items: MenuItem[];
  cursor: number;
}

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
  status: "loading" | "ready" | "error";
  data?: PreviewDto;
  error?: string;
}

export interface AppState {
  panes: Record<PaneId, PaneState>;
  activePane: PaneId;
  showHidden: boolean;
  dialog: DialogState | null;
  /** 열려 있는 미리보기 (VIEW-01). */
  preview: PreviewState | null;
  /** 열려 있는 Actions Panel. */
  palette: PaletteState | null;
  /** 마지막 검색어. 다시 열면 이어서 보이고, 재시작 복원의 대상이다 (PANE-05). */
  lastPaletteQuery: string;
  /** 열려 있는 팝업 메뉴 (Volumes/Favorites/Recent/Hierarchy). */
  menu: MenuState | null;
  userDirs: UserDirsDto;
  /** 작업 큐 스냅샷 (끝난 작업은 팝업을 닫을 때까지 남는다). */
  queue: JobDto[];
  queueOpen: boolean;
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
/** 상태 저장을 미루는 시간(디바운스). */
export const SAVE_DELAY_MS = 400;
/** 저장하는 선택 항목 수의 상한. 폴더 전체 선택(수만 개)이 스냅샷을 키우지 않게 한다. */
export const SELECTION_SAVE_LIMIT = 5000;

/** 탭의 실제 정렬: 탭 설정 > 컬럼 명세의 정렬 표시 > 이름 오름차순. */
export function effectiveSort(tab: TabState, columns: readonly string[]): SortState {
  return tab.sort ?? sortFromColumns(parseColumns(columns)) ?? DEFAULT_SORT;
}
const other = (p: PaneId): PaneId => (p === "left" ? "right" : "left");

export const isActiveJob = (j: JobDto) => ["queued", "running", "paused"].includes(j.status);

export function activeTab(s: AppState, pane: PaneId = s.activePane): TabState {
  const p = s.panes[pane];
  return p.tabs[p.active];
}

export function cursorEntry(tab: TabState): EntryDto | undefined {
  return tab.entries[tab.cursor];
}

/** 선택이 있으면 선택 항목(목록 순서), 없으면 커서 항목이 작업 대상이다. */
export function targetsOf(tab: TabState): EntryDto[] {
  if (tab.selection.size > 0) return tab.entries.filter((e) => tab.selection.has(e.path));
  const c = cursorEntry(tab);
  return c ? [c] : [];
}

export function actionContext(s: AppState): ActionContext {
  const tab = activeTab(s);
  return {
    hasCursorItem: !!cursorEntry(tab),
    selectedCount: tab.selection.size,
    tabCount: s.panes[s.activePane].tabs.length,
    canGoUp: parentPath(tab.path) !== null,
    cursorIsDir: cursorEntry(tab)?.kind === "dir",
    multiColumn: tab.view.mode === "columns",
  };
}

export function scopeStack(s: AppState): Scope[] {
  if (s.dialog) return ["dialog", "pane", "global"];
  // Actions Panel은 입력창이 있는 모달이다(palette 스코프).
  if (s.palette) return ["palette", "global"];
  // 미리보기가 열려 있으면 패널 키는 받지 않는다(preview 스코프).
  if (s.preview) return ["preview", "global"];
  // 팝업 메뉴는 모달이다(panel 스코프).
  if (s.menu) return ["panel", "global"];
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
    showHidden: snapshot?.showHidden ?? false,
    dialog: null,
    preview: null,
    palette: null,
    lastPaletteQuery: snapshot?.paletteQuery ?? "",
    menu: null,
    userDirs: { home: null, downloads: null, documents: null, desktop: null, pictures: null, music: null, movies: null },
    queue: [],
    queueOpen: false,
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
  async function reload(pane: PaneId, tabId: number, focusName?: string) {
    const tab = get().panes[pane].tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const keepName = focusName ?? tab.restoreCursor ?? cursorEntry(tab)?.name;
    try {
      const listed = await backend.listDir(tab.path, get().showHidden);
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
    } catch (e) {
      patchTab(pane, tabId, { entries: [], cursor: 0, selection: new Set(), error: String(e instanceof Error ? e.message : e) });
    }
  }

  const watched = new Set<string>();
  async function syncWatches() {
    const s = get();
    const wanted = new Set(Object.values(s.panes).flatMap((p) => p.tabs.map((t) => t.path)));
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

  const reloadAll = () =>
    Promise.all(
      (["left", "right"] as const).flatMap((pane) => get().panes[pane].tabs.map((t) => reload(pane, t.id))),
    );

  const unsubscribeBackend = backend.onDirChanged((path) => {
    for (const pane of ["left", "right"] as const) {
      for (const t of get().panes[pane].tabs) if (t.path === path) void reload(pane, t.id);
    }
  });

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

  // 작업 상태가 바뀌면(진행/완료) 목록을 다시 읽는다.
  let lastSignature = "";
  const applyQueue = (jobs: JobDto[]) => {
    set((s) => ({
      queue: jobs,
      queueCursor: Math.min(s.queueCursor, Math.max(jobs.length - 1, 0)),
    }));
    const signature = jobs.map((j) => `${j.id}:${j.status}:${j.completed}`).join("|");
    if (signature !== lastSignature) {
      lastSignature = signature;
      void reloadAll();
    }
  };
  const unsubscribeQueue = backend.onQueueChanged(applyQueue);
  // 설정이 바뀌면 컬럼 명세(정렬 표시)나 표시 옵션이 달라질 수 있으니 목록을 다시 정렬한다.
  const unsubscribeConfig = backend.onConfigChanged((loaded) => {
    set({ loaded });
    void reloadAll();
  });
  const cfg = () => get().loaded.config;

  /** 지금 화면 상태를 저장 형식으로 만든다. */
  const toSnapshot = (): Snapshot => {
    const s = get();
    const pane = (p: PaneState) => ({
      active: p.active,
      tabs: p.tabs.map(
        (t): TabSnap => ({
          path: t.path,
          cursorName: t.entries[t.cursor]?.name ?? t.restoreCursor ?? null,
          selection: t.selection.size <= SELECTION_SAVE_LIMIT ? [...t.selection] : [],
          sort: t.sort,
          view: t.view.mode === "columns" ? { mode: "columns", count: t.view.count } : { mode: "table", count: 1 },
        }),
      ),
    });
    return {
      version: 1,
      activePane: s.activePane,
      showHidden: s.showHidden,
      paletteQuery: s.lastPaletteQuery,
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
  const unsubscribeSave = store.subscribe(() => {
    if (saveEnabled && saveTimer === undefined) saveTimer = setTimeout(() => void saveNow(), SAVE_DELAY_MS);
  });

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
    const base = { path: entry.path, name: entry.name };
    set({ preview: { ...base, status: "loading" } });
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
    const clean = dest.length > 1 ? dest.replace(/\/+$/, "") : dest;
    set({ notice: null });
    try {
      await backend.listDir(clean, true);
    } catch (e) {
      return fail(e);
    }
    await api.navigate(clean);
  }

  const api = {
    async init() {
      // 설정(컬럼 명세의 정렬 표시 등)을 먼저 읽고 첫 목록을 만든다.
      set({ loaded: await backend.getConfig(), userDirs: await backend.userDirs() });
      const moved = snapshot ? await relocateMissingTabs() : 0;
      await reloadAll();
      await syncWatches();
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
      unsubscribeSave();
      unsubscribeBackend();
      unsubscribeQueue();
      unsubscribeConfig();
      for (const p of watched) void backend.unwatch(p);
      watched.clear();
    },

    async navigate(path: string, focusName?: string) {
      const s = get();
      const tab = activeTab(s);
      patchActive((t) => ({
        path,
        history: [...t.history, path],
        cursor: 0,
        selection: new Set(),
        quick: null,
        entries: [],
      }));
      await reload(s.activePane, tab.id, focusName);
      await syncWatches();
    },

    async open() {
      const c = cursorEntry(activeTab(get()));
      if (c?.kind === "dir") await api.navigate(c.path);
    },

    async goUp() {
      const tab = activeTab(get());
      const parent = parentPath(tab.path);
      if (parent !== null) await api.navigate(parent, baseName(tab.path));
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
    selectNone() {
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

    activate(pane: PaneId) {
      set({ activePane: pane });
    },
    setCursor(index: number) {
      patchActive((t) => ({ cursor: clamp(index, t.entries.length) }));
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

    async newTab() {
      const s = get();
      const p = s.panes[s.activePane];
      const tab = newTab(activeTab(s).path);
      set({
        panes: { ...s.panes, [s.activePane]: { tabs: [...p.tabs, tab], active: p.tabs.length } },
      });
      await reload(s.activePane, tab.id);
      await syncWatches();
    },
    async closeTab() {
      const s = get();
      const p = s.panes[s.activePane];
      if (p.tabs.length <= 1) return;
      const tabs = p.tabs.filter((_, i) => i !== p.active);
      set({
        panes: { ...s.panes, [s.activePane]: { tabs, active: Math.min(p.active, tabs.length - 1) } },
      });
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
    quickAccept() {
      patchActive({ quick: null });
    },
    quickCancel() {
      patchActive({ quick: null });
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
    dialogConfirm() {
      const d = get().dialog;
      if (!d) return;
      let result: unknown = true;
      if (d.kind === "name") {
        if (d.value.trim() === "") {
          set({ dialog: { ...d, error: "이름을 입력하세요" } });
          return;
        }
        result = d.value;
      } else if (d.kind === "conflict") {
        result = CONFLICT_CHOICES[d.selected];
      }
      set({ dialog: null });
      pending?.(result);
      pending = null;
    },
    dialogCancel() {
      set({ dialog: null });
      pending?.(null);
      pending = null;
    },

    /** 새 폴더 (OP-01). 중첩 경로(`a/b/c`)를 허용한다. */
    async newFolder() {
      const tab = activeTab(get());
      const name = await ask<string>({ kind: "name", title: "새 폴더", value: "", error: null, selectStem: false });
      if (name === null) return;
      set({ notice: null });
      try {
        await backend.mkdir(joinPath(tab.path, name.trim()));
        await reloadAll();
      } catch (e) {
        fail(e);
      }
    },
    /** 새 파일 (OP-02). */
    async newFile() {
      const tab = activeTab(get());
      const name = await ask<string>({ kind: "name", title: "새 파일", value: "", error: null, selectStem: false });
      if (name === null) return;
      set({ notice: null });
      try {
        await backend.touch(joinPath(tab.path, name.trim()));
        await reloadAll();
      } catch (e) {
        fail(e);
      }
    },
    /** 이름 변경 (OP-05). 커서 항목 하나가 대상이며 확장자를 뺀 부분이 처음에 선택된다. */
    async renameCursor() {
      const s = get();
      const tab = activeTab(s);
      const entry = cursorEntry(tab);
      if (!entry) return;
      const name = await ask<string>({ kind: "name", title: "이름 변경", value: entry.name, error: null, selectStem: true });
      if (name === null || name === entry.name) return;
      set({ notice: null });
      try {
        const dest = await backend.rename(entry.path, name.trim());
        await reload(s.activePane, tab.id, baseName(dest));
        await reloadAll();
      } catch (e) {
        fail(e);
      }
    },
    /** 비활성 패널로 복사/이동 (OP-03, OP-04). 이름이 겹치면 항목마다 물어본 뒤 작업 큐에 넣는다. */
    async copyOrMove(kind: "copy" | "move") {
      const s = get();
      const targets = targetsOf(activeTab(s));
      if (targets.length === 0) return;
      const destDir = api.inactivePath();
      set({ notice: null });
      const items: QueueItemDto[] = [];
      for (const t of targets) {
        try {
          let policy: ConflictDto = "skip";
          const existing = await backend.detectConflict(t.path, destDir);
          if (existing !== null) {
            const choice = await ask<ConflictDto>({
              kind: "conflict",
              title: kind === "copy" ? "복사: 이름이 겹칩니다" : "이동: 이름이 겹칩니다",
              existing,
              selected: CONFLICT_CHOICES.indexOf("rename"),
            });
            if (choice === null) break; // 취소: 지금까지 정한 항목만 실행한다
            policy = choice;
          }
          items.push({ src: t.path, destDir, policy });
        } catch (e) {
          fail(e);
          break;
        }
      }
      patchTab(s.activePane, activeTab(s).id, { selection: new Set() });
      if (items.length > 0) await backend.enqueue(kind, items);
      await reloadAll();
    },
    /** 휴지통으로 이동 (OP-06). 기본 설정에서는 확인하지 않는다. */
    async trashTargets() {
      const targets = targetsOf(activeTab(get()));
      if (targets.length === 0) return;
      if (cfg().core.confirm.trash && !(await api.confirmTargets(`${targets.length}개 항목을 휴지통으로 보낼까요?`, targets))) return;
      set({ notice: null });
      patchActive({ selection: new Set() });
      await backend.enqueue("trash", targets.map((t) => ({ src: t.path, destDir: null, policy: "skip" })));
      await reloadAll();
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
      const path = activeTab(get()).path;
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
        await backend.revealPath(cursorEntry(tab)?.path ?? tab.path);
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
        await backend.editPaths([activeTab(get()).path]);
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
      await backend.enqueue("delete", targets.map((t) => ({ src: t.path, destDir: null, policy: "skip" })));
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
            return real ? [{ label: `${indent}${name}`, path: real }] : [];
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
          for (const p of [...tab.history].reverse()) {
            if (seen.has(p)) continue;
            seen.add(p);
            items.push({ label: p, path: p });
            if (items.length >= 20) break;
          }
        } else {
          title = "상위 폴더";
          for (let p: string | null = tab.path; p !== null; p = parentPath(p)) {
            items.push({ label: p, path: p });
          }
        }
      } catch (e) {
        fail(e);
        return;
      }
      const first = items.findIndex((i) => i.path !== undefined);
      set({ menu: { kind, title, items, cursor: Math.max(first, 0) } });
    },
    menuMove(delta: 1 | -1) {
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
    menuClose() {
      set({ menu: null });
    },
    /** 커서 항목으로 이동하고 메뉴를 닫는다. */
    async menuSelect(index?: number) {
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
    /** Volumes 메뉴에서 커서 볼륨을 언마운트/추출한다. */
    async menuVolumeAction(kind: "unmount" | "eject") {
      const m = get().menu;
      const item = m?.kind === "volumes" ? m.items[m.cursor] : undefined;
      if (!m || !item?.path) return;
      set({ notice: null });
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
      patchActive((t) => ({ history: [t.path] }));
      set({ menu: { ...m, items: [], cursor: 0 } });
    },
    /** 현재 폴더를 즐겨찾기에 추가한다. */
    async addFavoriteHere() {
      const tab = activeTab(get());
      set({ notice: null });
      try {
        await backend.addFavorite(baseName(tab.path) || tab.path, tab.path);
      } catch (e) {
        fail(e);
      }
    },
    /** Go To Path (NAV-11): 경로를 입력해 이동한다. Tab으로 폴더 이름을 완성한다. */
    async gotoPath() {
      const tab = activeTab(get());
      const value = await ask<string>({
        kind: "name",
        title: "경로로 이동",
        value: tab.path.endsWith("/") ? tab.path : `${tab.path}/`,
        error: null,
        selectStem: false,
        goto: true,
      });
      if (value === null) return;
      await navigateToPath(value);
    },
    /** `core.open.directory` (ACT-03): 인수 `src`의 폴더로 이동한다. `~`와 `${user.*}`를 확장한다. */
    async openDirectory(args?: Record<string, unknown>) {
      const src = args?.src;
      if (typeof src !== "string" || src.trim() === "") return fail("core.open.directory에는 문자열 인수 src가 필요합니다");
      await navigateToPath(src);
    },
    async gotoComplete() {
      const d = get().dialog;
      if (d?.kind !== "name" || !d.goto) return;
      const raw = expandPath(d.value, get().userDirs) ?? d.value;
      const cut = raw.lastIndexOf("/");
      const dir = cut <= 0 ? "/" : raw.slice(0, cut);
      const prefix = raw.slice(cut + 1);
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
      api.dialogSetValue(joinPath(dir, common) + (names.length === 1 ? "/" : ""));
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
    /** 미리보기를 연 채 커서를 옮기고 새 항목을 보여 준다. */
    async previewMove(delta: 1 | -1) {
      api.moveCursor(delta);
      const entry = cursorEntry(activeTab(get()));
      if (entry) await loadPreview(entry);
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

    reload: (pane: PaneId, tabId: number, focusName?: string) => reload(pane, tabId, focusName),
    reloadAll,
    /** 비활성 패널의 활성 탭 경로. */
    inactivePath(): string {
      const s = get();
      return activeTab(s, other(s.activePane)).path;
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
