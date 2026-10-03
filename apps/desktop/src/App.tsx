import { useEffect, useMemo, useState } from "react";
import { useStore } from "zustand";
import { createDefaultRegistry, defaultBindingsFor, mergeUserBindings } from "@twin-deck/actions";
import { formatKey } from "@twin-deck/keybinds";
import { Keymap } from "@twin-deck/keybinds";
import type { Platform } from "@twin-deck/keybinds";
import type { Backend, Snapshot } from "@twin-deck/ts-client";
import { isTauri } from "@tauri-apps/api/core";
import { allHandlers } from "./actions";
import { installFileMenuForWindow } from "./appMenu";
import { StoreContext, useApp, useAppStore } from "./state/context";
import { actionContext, activeTab, createAppStore, scopeStack } from "./state/store";
import { ActionBar, useBarIds } from "./ui/ActionBar";
import { ActionsPalette } from "./ui/ActionsPalette";
import { Dialog } from "./ui/Dialog";
import { Preview } from "./ui/Preview";
import { fkeyBindings } from "./lib/fkeys";
import { Help } from "./ui/Help";
import { PaneSplit } from "./ui/PaneSplit";
import { ContextMenu } from "./ui/ContextMenu";
import { PopupMenu } from "./ui/PopupMenu";
import { QueueIndicator, QueuePopup } from "./ui/Queue";
import { Settings } from "./ui/Settings";
import { UiContext } from "./ui/uiContext";
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

/** spaceui(@spacedrive/tokens) 테마 이름 → `<html>`에 거는 클래스. */
const THEME_CLASS: Record<string, string> = {
  dark: "dark",
  light: "light",
  midnight: "midnight-theme",
  noir: "noir-theme",
  slate: "slate-theme",
  nord: "nord-theme",
  mocha: "mocha-theme",
};

/** 설정 `behavior.theme`을 `<html data-theme>`과 테마 클래스에 반영한다. system은 OS 설정에 따라 dark/light. */
function useTheme(theme: string) {
  useEffect(() => {
    const media = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    const apply = () => {
      const name = theme === "system" ? (media?.matches ? "dark" : "light") : theme in THEME_CLASS ? theme : "light";
      document.documentElement.dataset.theme = name;
      document.documentElement.className = THEME_CLASS[name];
    };
    apply();
    if (theme !== "system" || !media) return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
}

function StatusBar() {
  const selected = useApp((s) => activeTab(s).selection.size);
  const notice = useApp((s) => s.notice);
  const flash = useApp((s) => s.flash);
  const fileWarnings = useApp((s) => s.loaded.warnings.length);
  const keymapWarnings = useApp((s) => s.keymapWarnings.length);
  const { api } = useAppStore();
  const warnings = fileWarnings + keymapWarnings;
  return (
    <footer role="status" aria-label="상태 표시줄" className="border-t border-app-line px-2 py-0.5 text-xs">
      선택 {selected}개
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
  useTheme(loaded.config.behavior.theme);

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

  // macOS 상단 메뉴바의 File 메뉴에 파일 항목(다중 이름 바꾸기 포함)을 붙인다. 열려 있는 창·메뉴 위에서는 실행하지 않는다.
  useEffect(() => {
    if (platform !== "mac" || !isTauri()) return;
    let off: (() => void) | undefined;
    let gone = false;
    installFileMenuForWindow((id) => {
      const s = app.store.getState();
      if (scopeStack(s)[0] !== "pane") return;
      void registry.dispatch(id, actionContext(s));
    })
      .then((unlisten) => (gone ? unlisten() : (off = unlisten)))
      .catch((e) => console.warn("[twin-deck] 메뉴바를 설정하지 못했습니다", e));
    return () => {
      gone = true;
      off?.();
    };
  }, [app, registry, platform]);

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
        <PaneSplit />
        <StatusBar />
        <ActionBar />
        <ActionsPalette />
        <Preview />
        <PopupMenu />
        <ContextMenu />
        <QueueIndicator />
        <QueuePopup />
        <Settings />
        <Help />
        <Dialog />
      </main>
      </UiContext.Provider>
    </StoreContext.Provider>
  );
}
