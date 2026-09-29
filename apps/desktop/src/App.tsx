import { useEffect, useMemo, useState } from "react";
import { useStore } from "zustand";
import { createDefaultRegistry, defaultBindingsFor, mergeUserBindings } from "@twin-deck/actions";
import { formatKey } from "@twin-deck/keybinds";
import { Keymap } from "@twin-deck/keybinds";
import type { Platform } from "@twin-deck/keybinds";
import type { Backend, Snapshot } from "@twin-deck/ts-client";
import { allHandlers } from "./actions";
import { StoreContext, useApp, useAppStore } from "./state/context";
import { actionContext, activeTab, createAppStore } from "./state/store";
import { ActionBar, useBarIds } from "./ui/ActionBar";
import { ActionsPalette } from "./ui/ActionsPalette";
import { Dialog } from "./ui/Dialog";
import { Preview } from "./ui/Preview";
import { Pane } from "./ui/Pane";
import { PopupMenu } from "./ui/PopupMenu";
import { QueueIndicator, QueuePopup } from "./ui/Queue";
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

/** 설정 `behavior.theme`(light | dark | system)을 `<html data-theme>`에 반영한다. system은 OS 설정을 따른다. */
function useTheme(theme: string) {
  useEffect(() => {
    const media = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && !!media?.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
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
    <footer role="status" aria-label="상태 표시줄" className="border-t border-neutral-300 px-2 py-0.5 text-xs">
      선택 {selected}개
      {flash && <span className="ml-4 text-green-800">{flash}</span>}
      {warnings > 0 && (
        <button type="button" tabIndex={-1} onClick={() => void api.showConfigWarnings()} className="ml-4 text-amber-700">
          ⚠ 설정 경고 {warnings}개
        </button>
      )}
      {notice && (
        <span role="alert" className="ml-4 text-red-700">
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
      loaded.bindings,
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

  useEffect(() => {
    void app.api.init().then(() => {
      if (stateWarning) app.api.reportStateWarning(stateWarning);
    });
    // 창이 닫히기 직전에는 미뤄 둔 저장을 바로 실행한다.
    const flush = () => void app.api.saveNow();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      app.api.dispose();
    };
  }, [app, stateWarning]);

  return (
    <StoreContext.Provider value={app}>
      <UiContext.Provider value={{ registry, keymap, platform }}>
      <BarWarnings base={warnings} />
      <main className="flex h-screen flex-col">
        <div className="flex min-h-0 flex-1">
          <Pane pane="left" />
          <Pane pane="right" />
        </div>
        <StatusBar />
        <ActionBar />
        <ActionsPalette />
        <Preview />
        <PopupMenu />
        <QueueIndicator />
        <QueuePopup />
        <Dialog />
      </main>
      </UiContext.Provider>
    </StoreContext.Provider>
  );
}
