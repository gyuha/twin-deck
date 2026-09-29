import { createStore } from "zustand/vanilla";
import { baseName, joinPath, parentPath } from "@twin-deck/ts-client";
import type { Backend, ConflictDto, EntryDto, JobDto, QueueItemDto } from "@twin-deck/ts-client";
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

export const CONFLICT_CHOICES: readonly ConflictDto[] = ["overwrite", "skip", "rename"];

export type DialogState =
  | { kind: "name"; title: string; value: string; error: string | null; selectStem: boolean }
  | { kind: "confirm"; title: string; lines: string[] }
  | { kind: "conflict"; title: string; existing: string; selected: number };

export interface AppState {
  panes: Record<PaneId, PaneState>;
  activePane: PaneId;
  showHidden: boolean;
  dialog: DialogState | null;
  /** 작업 큐 스냅샷 (끝난 작업은 팝업을 닫을 때까지 남는다). */
  queue: JobDto[];
  queueOpen: boolean;
  queueCursor: number;
  /** 마지막 작업 오류. 다음 작업이 시작되면 지워진다. */
  notice: string | null;
}

export const PAGE_SIZE = 10;
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
  };
}

export function scopeStack(s: AppState): Scope[] {
  if (s.dialog) return ["dialog", "pane", "global"];
  // 큐 팝업이 열려 있으면 패널 키는 받지 않는다.
  if (s.queueOpen) return ["queue", "global"];
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
    dialog: null,
    queue: [],
    queueOpen: false,
    queueCursor: 0,
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

  /** 다이얼로그를 열고 사용자의 결정을 기다린다. 취소하면 null. */
  let pending: ((value: unknown) => void) | null = null;
  function ask<T>(dialog: DialogState): Promise<T | null> {
    return new Promise((resolve) => {
      pending = resolve as (value: unknown) => void;
      set({ dialog });
    });
  }
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

  const api = {
    async init() {
      await reloadAll();
      await syncWatches();
      applyQueue(await backend.queueJobs());
    },

    dispose() {
      unsubscribeBackend();
      unsubscribeQueue();
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
      set({ notice: null });
      patchActive({ selection: new Set() });
      await backend.enqueue("trash", targets.map((t) => ({ src: t.path, destDir: null, policy: "skip" })));
      await reloadAll();
    },
    /** 영구 삭제 (OP-07). 확인 다이얼로그를 거친다. */
    async deleteTargets() {
      const targets = targetsOf(activeTab(get()));
      if (targets.length === 0) return;
      const ok = await ask<boolean>({
        kind: "confirm",
        title: `${targets.length}개 항목을 영구 삭제할까요?`,
        lines: targets.slice(0, 5).map((t) => t.name).concat(targets.length > 5 ? [`… 외 ${targets.length - 5}개`] : []),
      });
      if (!ok) return;
      set({ notice: null });
      patchActive({ selection: new Set() });
      await backend.enqueue("delete", targets.map((t) => ({ src: t.path, destDir: null, policy: "skip" })));
      await reloadAll();
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

function quickCursor(t: TabState, text: string): Partial<TabState> {
  if (!text) return {};
  const idx = t.entries.findIndex((e) => quickMatch(e.name, text));
  return idx >= 0 ? { cursor: idx } : {};
}

export type AppStore = ReturnType<typeof createAppStore>;
