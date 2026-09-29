import { useEffect, useMemo, useState } from "react";
import { useStore } from "zustand";
import { createDefaultRegistry, defaultBindingsFor, mergeUserBindings } from "@twin-deck/actions";
import { Keymap } from "@twin-deck/keybinds";
import type { Platform } from "@twin-deck/keybinds";
import type { Backend } from "@twin-deck/ts-client";
import { allHandlers } from "./actions";
import { StoreContext, useApp, useAppStore } from "./state/context";
import { activeTab, createAppStore } from "./state/store";
import { Dialog } from "./ui/Dialog";
import { Pane } from "./ui/Pane";
import { PopupMenu } from "./ui/PopupMenu";
import { QueueIndicator, QueuePopup } from "./ui/Queue";
import { useKeyboard } from "./ui/useKeyboard";

export interface AppProps {
  backend: Backend;
  platform: Platform;
  leftPath: string;
  rightPath: string;
}

export function detectPlatform(): Platform {
  const p = `${navigator.platform} ${navigator.userAgent}`.toLowerCase();
  if (p.includes("mac")) return "mac";
  if (p.includes("win")) return "windows";
  return "linux";
}

function StatusBar() {
  const selected = useApp((s) => activeTab(s).selection.size);
  const notice = useApp((s) => s.notice);
  const fileWarnings = useApp((s) => s.loaded.warnings.length);
  const keymapWarnings = useApp((s) => s.keymapWarnings.length);
  const { api } = useAppStore();
  const warnings = fileWarnings + keymapWarnings;
  return (
    <footer role="status" aria-label="상태 표시줄" className="border-t border-neutral-300 px-2 py-0.5 text-xs">
      선택 {selected}개
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

export function App({ backend, platform, leftPath, rightPath }: AppProps) {
  const [app] = useState(() => createAppStore(backend, leftPath, rightPath));
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
  useEffect(() => app.api.setKeymapWarnings(warnings), [app, warnings]);
  useKeyboard({ app, keymap, registry });

  useEffect(() => {
    void app.api.init();
    return () => app.api.dispose();
  }, [app]);

  return (
    <StoreContext.Provider value={app}>
      <main className="flex h-screen flex-col">
        <div className="flex min-h-0 flex-1">
          <Pane pane="left" />
          <Pane pane="right" />
        </div>
        <StatusBar />
        <PopupMenu />
        <QueueIndicator />
        <QueuePopup />
        <Dialog />
      </main>
    </StoreContext.Provider>
  );
}
