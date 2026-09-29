import { createStore } from "zustand/vanilla";
import { baseName, joinPath, parentPath } from "@twin-deck/ts-client";
import type { Backend, EntryDto } from "@twin-deck/ts-client";
import type { ActionContext } from "@twin-deck/actions";
import type { Scope } from "@twin-deck/keybinds";
import { quickMatch } from "../lib/names";

export type PaneId = "left" | "right";

export interface TabState {
  id: number;
  path: string;
  /** 방문한 경로 이력 (이 탭). */
  history: string[];
  entries: EntryDto[];
  cursor: number;
  selection: ReadonlySet<string>;
  error: string | null;
  /** Quick Select 입력 중이면 입력 문자열. */
  quick: string | null;
}

export interface PaneState {
  tabs: TabState[];
  active: number;
}

export interface AppState {
  panes: Record<PaneId, PaneState>;
  activePane: PaneId;
  showHidden: boolean;
}

export const PAGE_SIZE = 10;
const other = (p: PaneId): PaneId => (p === "left" ? "right" : "left");

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
  };
}

export function scopeStack(s: AppState): Scope[] {
  return activeTab(s).quick !== null ? ["quickSelect", "pane", "global"] : ["pane", "global"];
}

export function createAppStore(backend: Backend, leftPath: string, rightPath: string) {
  let nextTabId = 1;
  const newTab = (path: string): TabState => ({
    id: nextTabId++,
    path,
    history: [path],
    entries: [],
    cursor: 0,
    selection: new Set(),
    error: null,
    quick: null,
  });

  const store = createStore<AppState>(() => ({
    panes: {
      left: { tabs: [newTab(leftPath)], active: 0 },
      right: { tabs: [newTab(rightPath)], active: 0 },
    },
    activePane: "left",
    showHidden: false,
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
    const keepName = focusName ?? cursorEntry(tab)?.name;
    try {
      const entries = await backend.listDir(tab.path, get().showHidden);
      patchTab(pane, tabId, (t) => {
        const idx = keepName ? entries.findIndex((e) => e.name === keepName) : -1;
        const paths = new Set(entries.map((e) => e.path));
        return {
          entries,
          error: null,
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

  const api = {
    async init() {
      await reloadAll();
      await syncWatches();
    },

    dispose() {
      unsubscribeBackend();
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
      patchActive((t) => ({ cursor: clamp(t.cursor + delta, t.entries.length) }));
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
      patchActive((t) => {
        const text = (t.quick ?? "") + char;
        return { quick: text, ...quickCursor(t, text) };
      });
    },
    quickBackspace() {
      patchActive((t) => {
        const text = (t.quick ?? "").slice(0, -1);
        return { quick: text, ...quickCursor(t, text) };
      });
    },
    quickAccept() {
      patchActive({ quick: null });
    },
    quickCancel() {
      patchActive({ quick: null });
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

function quickCursor(t: TabState, text: string): Partial<TabState> {
  if (!text) return {};
  const idx = t.entries.findIndex((e) => quickMatch(e.name, text));
  return idx >= 0 ? { cursor: idx } : {};
}

export type AppStore = ReturnType<typeof createAppStore>;
