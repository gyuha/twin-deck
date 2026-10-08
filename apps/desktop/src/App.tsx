import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import { createDefaultRegistry, defaultBindingsFor, mergeUserBindings } from "@twin-deck/actions";
import { formatKey } from "@twin-deck/keybinds";
import { formatSpace } from "./lib/format";
import { selectionSummary } from "./lib/selectionSummary";
import { Keymap } from "@twin-deck/keybinds";
import type { Platform } from "@twin-deck/keybinds";
import type { Backend, Snapshot } from "@twin-deck/ts-client";
import { isTauri } from "@tauri-apps/api/core";
import { allHandlers } from "./actions";
import { installFileMenuForWindow } from "./appMenu";
import { StoreContext, useApp, useAppStore } from "./state/context";
import { actionContext, activeTab, createAppStore, scopeStack } from "./state/store";
import { ActionBar, useBarIds } from "./ui/ActionBar";
import { useTextColor, useUiFont } from "./ui/fonts";
import { ActionsPalette } from "./ui/ActionsPalette";
import { Dialog } from "./ui/Dialog";
import { DragLayer } from "./ui/DragLayer";
import { Preview } from "./ui/Preview";
import { fkeyBindings } from "./lib/fkeys";
import { parseThemeList, resolveTheme, themeVars } from "./lib/themeColors";
import { FindDialog } from "./ui/FindDialog";
import { Help } from "./ui/Help";
import { PaneSplit } from "./ui/PaneSplit";
import { ContextMenu } from "./ui/ContextMenu";
import { PopupMenu } from "./ui/PopupMenu";
import { QueueIndicator, QueuePopup } from "./ui/Queue";
import { UiContext, useUi } from "./ui/uiContext";
import { useKeyboard } from "./ui/useKeyboard";

export interface AppProps {
  backend: Backend;
  platform: Platform;
  leftPath: string;
  rightPath: string;
  /** 저장된 창 상태. 있으면 leftPath/rightPath보다 우선한다. */
  snapshot?: Snapshot | null;
  /** 저장된 상태를 읽지 못했을 때의 안내. */
  stateWarning?: string | null;
}

export function detectPlatform(): Platform {
  const p = `${navigator.platform} ${navigator.userAgent}`.toLowerCase();
  if (p.includes("mac")) return "mac";
  if (p.includes("win")) return "windows";
  return "linux";
}

/**
 * 설정 `behavior.theme`을 `<html>`에 반영한다: 테마의 색 토큰을 인라인 `--color-*`로 걸고, `data-theme`(dark/light)·`data-color-theme`(테마 이름)·
 * 클래스(dark/light, `color-scheme`용)를 정한다. system은 OS가 다크인지에 따라 Mocha/Latte이고 OS 설정이 바뀌면 따라간다.
 * 모든 테마가 같은 토큰 묶음을 덮어쓰므로 이전 테마의 값이 남지 않는다.
 */
function useTheme(setting: string) {
  useEffect(() => {
    const media = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    const apply = () => {
      const t = resolveTheme(setting, !!media?.matches);
      const root = document.documentElement;
      for (const [name, value] of Object.entries(themeVars(t))) root.style.setProperty(name, value);
      root.dataset.theme = t.dark ? "dark" : "light";
      root.dataset.colorTheme = t.id;
      root.className = t.dark ? "dark" : "light";
    };
    apply();
    if (!media) return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [setting]);
}

/**
 * 랜덤 테마(`behavior.random_theme`)가 켜져 있으면 후보(`random_themes`)에서 앱을 켤 때 한 번 고른 테마를 돌려준다.
 * 설정을 고치는 중에 테마가 계속 바뀌지 않게 고른 값은 후보에 남아 있는 한 유지하고, 후보에서 빠지면 다시 고른다.
 * 꺼져 있거나 후보가 비었으면 null이라 일반 테마(`theme`)를 쓴다.
 */
function useRandomTheme(b: { random_theme: boolean; random_themes: string }): string | null {
  const picked = useRef<string | null>(null);
  const list = b.random_theme ? parseThemeList(b.random_themes) : [];
  if (list.length === 0) return null;
  if (picked.current === null || !list.includes(picked.current)) picked.current = list[Math.floor(Math.random() * list.length)];
  return picked.current;
}

function StatusBar() {
  const entries = useApp((s) => activeTab(s).entries);
  const selection = useApp((s) => activeTab(s).selection);
  const sizeFormat = useApp((s) => s.loaded.config.display.size_format);
  const dirSizes = useApp((s) => s.dirSizes);
  const summary = useMemo(() => selectionSummary(entries, selection, dirSizes), [entries, selection, dirSizes]);
  const notice = useApp((s) => s.notice);
  const flash = useApp((s) => s.flash);
  const fileWarnings = useApp((s) => s.loaded.warnings.length);
  const keymapWarnings = useApp((s) => s.keymapWarnings.length);
  const showActionBar = useApp((s) => s.loaded.config.behavior.layout.show_action_bar);
  const showDriveBar = useApp((s) => s.loaded.config.behavior.layout.show_drive_bar);
  const showHidden = useApp((s) => s.showHidden);
  const { api } = useAppStore();
  const { keymap, platform } = useUi();
  const warnings = fileWarnings + keymapWarnings;
  // 메뉴 막대가 없는 Windows에서도 바와 숨김 파일 표시를 켜고 끌 수 있게 오른쪽 끝에 항상 보이는 토글을 둔다.
  const viewToggle = (label: string, text: string, on: boolean, toggle: () => void | Promise<void>, actionId: string) => {
    const key = keymap.keysFor(actionId)[0];
    return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      aria-pressed={on}
      title={key ? `${label} (${formatKey(key, platform)})` : label}
      onClick={() => void toggle()}
      className={["rounded border border-app-line px-1.5 hover:bg-app-selected", on ? "" : "text-ink-faint"].join(" ")}
    >
      {text}
    </button>
    );
  };
  return (
    <footer role="status" aria-label="상태 표시줄" className="flex items-center border-t border-app-line px-2 py-0.5 text-xs">
      선택: {summary.bytes.selected === 0 ? "0" : formatSpace(summary.bytes.selected, sizeFormat)} / {formatSpace(summary.bytes.total, sizeFormat)}, 파일: {summary.files.selected}/{summary.files.total}, 폴더: {summary.dirs.selected}/{summary.dirs.total}
      {flash && <span className="ml-4 text-status-success">{flash}</span>}
      {warnings > 0 && (
        <button type="button" tabIndex={-1} onClick={() => void api.showConfigWarnings()} className="ml-4 text-status-warning">
          ⚠ 설정 경고 {warnings}개
        </button>
      )}
      {notice && (
        <span role="alert" className="ml-4 text-status-error">
          {notice}
        </span>
      )}
      <span className="ml-auto flex gap-1">
        {viewToggle("숨김 파일 표시", "숨김 파일", showHidden, () => api.toggleHidden(), "core.view.hidden")}
        {viewToggle("드라이브 바 표시", "Drive Bar", showDriveBar, () => api.toggleLayoutFlag("show_drive_bar"), "core.view.drive_bar")}
        {viewToggle("Action Bar 표시", "Action Bar", showActionBar, () => api.toggleLayoutFlag("show_action_bar"), "core.view.action_bar")}
      </span>
    </footer>
  );
}

/** 설정의 Action Bar에 있는 알 수 없는 액션 ID를 경고에 더한다(Rust는 액션 ID를 모른다). */
function BarWarnings({ base }: { base: string[] }) {
  const { unknown } = useBarIds();
  const { api } = useAppStore();
  useEffect(() => {
    const extra = unknown.length ? [`config.toml: layout.action_bar의 알 수 없는 액션 ID를 무시합니다: ${unknown.join(", ")}`] : [];
    api.setKeymapWarnings([...base, ...extra]);
  }, [api, base, unknown]);
  return null;
}

export function App({ backend, platform, leftPath, rightPath, snapshot, stateWarning }: AppProps) {
  const [app] = useState(() => createAppStore(backend, leftPath, rightPath, snapshot));
  const registry = useMemo(() => createDefaultRegistry(allHandlers(app)), [app]);
  const loaded = useStore(app.store, (s) => s.loaded);
  // 기본 키맵 위에 사용자 바인딩을 병합한다. 설정이 바뀌면 다시 만든다.
  const { keymap, warnings } = useMemo(() => {
    const merged = mergeUserBindings(
      defaultBindingsFor(platform),
      [...fkeyBindings(loaded.config), ...loaded.bindings], // F키 설정 → keybindings.toml 순서라 파일이 이긴다
      (id) => registry.get(id)?.scopes,
      platform,
    );
    const km = new Keymap(platform, merged.bindings);
    const extra =
      loaded.config.behavior.selection.shift_mode === "extend"
        ? ["config.toml: behavior.selection.shift_mode = \"extend\"는 아직 지원하지 않아 invert로 동작합니다"]
        : [];
    return { keymap: km, warnings: [...merged.warnings, ...km.warnings, ...extra] };
  }, [platform, loaded, registry]);
  useKeyboard({ app, keymap, registry });
  // 설정의 테마 목록에서 이동 중인 테마(저장 전 임시 미리보기). 설정값이 바뀌면 걷는다.
  const [themePreview, setThemePreview] = useState<string | null>(null);
  useEffect(() => setThemePreview(null), [loaded.config.behavior.theme]);
  const randomTheme = useRandomTheme(loaded.config.behavior);
  useTheme(themePreview ?? randomTheme ?? loaded.config.behavior.theme);
  useUiFont(loaded.config.behavior.ui_font);
  useTextColor(loaded.config.behavior.text_color);

  // 웹뷰 기본 메뉴(Reload, Inspect Element)는 막는다. 입력창의 잘라내기/붙여넣기 메뉴는 남긴다.
  useEffect(() => {
    const block = (e: MouseEvent) => {
      if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) e.preventDefault();
    };
    window.addEventListener("contextmenu", block);
    return () => window.removeEventListener("contextmenu", block);
  }, []);

  // Actions Panel이 쓰는 액션 목록(제목, 분류, 현재 키, 실행 가능 여부)과 실행기.
  useEffect(() => {
    app.api.attachPalette(
      () => {
        const ctx = actionContext(app.store.getState());
        return registry
          .list()
          .filter((a) => a.scopes.includes("pane") || a.scopes.includes("global"))
          .map((a) => {
            return {
              id: a.id,
              title: a.title,
              category: a.category,
              keys: keymap.keysFor(a.id).map((k) => formatKey(k, platform)).join(" · "),
              applicable: registry.isApplicable(a.id, ctx),
            };
          });
      },
      (id) => registry.dispatch(id, actionContext(app.store.getState())),
    );
  }, [app, registry, keymap, platform]);

  // macOS 상단 메뉴바의 File 메뉴에 파일 항목(다중 이름 바꾸기 포함)을, View 메뉴에 화면 요소 켜고 끄기를 붙인다.
  // 열려 있는 창·메뉴 위에서는 실행하지 않는다. 화면 요소 설정이 바뀌면 체크 표시를 맞추려고 메뉴를 다시 만든다.
  const driveBar = loaded.config.behavior.layout.show_drive_bar;
  const actionBar = loaded.config.behavior.layout.show_action_bar;
  useEffect(() => {
    if (platform !== "mac" || !isTauri()) return;
    let off: (() => void) | undefined;
    let gone = false;
    installFileMenuForWindow((id) => {
      const s = app.store.getState();
      if (scopeStack(s)[0] !== "pane") return;
      void registry.dispatch(id, actionContext(s));
    }, { driveBar, actionBar }, (id) => {
      const key = keymap.keysFor(id)[0];
      return key ? formatKey(key, platform) : undefined;
    })
      .then((unlisten) => (gone ? unlisten() : (off = unlisten)))
      .catch((e) => console.warn("[twin-deck] 메뉴바를 설정하지 못했습니다", e));
    return () => {
      gone = true;
      off?.();
    };
  }, [app, registry, keymap, platform, driveBar, actionBar]);

  useEffect(() => {
    void app.api.init().then(() => {
      if (stateWarning) app.api.reportStateWarning(stateWarning);
    });
    // 창이 닫히기 직전에는 미뤄 둔 저장을 바로 실행한다.
    const flush = () => void app.api.saveNow();
    window.addEventListener("pagehide", flush);
    // 창으로 돌아올 때 볼륨 목록과 남은 용량을 다시 읽는다(밖에서 마운트·언마운트했을 수 있다).
    const refresh = () => void app.api.refreshVolumes();
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("focus", refresh);
      app.api.dispose();
    };
  }, [app, stateWarning]);

  return (
    <StoreContext.Provider value={app}>
      <UiContext.Provider value={{ registry, keymap, platform }}>
      <BarWarnings base={warnings} />
      <main className="flex h-screen flex-col">
        <PaneSplit onThemePreview={setThemePreview} />
        <StatusBar />
        <ActionBar />
        <ActionsPalette />
        <Preview />
        <DragLayer />
        <PopupMenu />
        <ContextMenu />
        <QueueIndicator />
        <QueuePopup />
        <Help />
        <FindDialog />
        <Dialog />
      </main>
      </UiContext.Provider>
    </StoreContext.Provider>
  );
}
