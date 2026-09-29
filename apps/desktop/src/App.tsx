import { useEffect, useMemo, useState } from "react";
import { createDefaultRegistry, defaultBindingsFor } from "@twin-deck/actions";
import { Keymap } from "@twin-deck/keybinds";
import type { Platform } from "@twin-deck/keybinds";
import type { Backend } from "@twin-deck/ts-client";
import { navigationHandlers } from "./actions";
import { StoreContext, useApp } from "./state/context";
import { activeTab, createAppStore } from "./state/store";
import { Pane } from "./ui/Pane";
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
  return (
    <footer role="status" aria-label="상태 표시줄" className="border-t border-neutral-300 px-2 py-0.5 text-xs">
      선택 {selected}개
    </footer>
  );
}

export function App({ backend, platform, leftPath, rightPath }: AppProps) {
  const [app] = useState(() => createAppStore(backend, leftPath, rightPath));
  const keymap = useMemo(() => new Keymap(platform, defaultBindingsFor(platform)), [platform]);
  const registry = useMemo(() => createDefaultRegistry(navigationHandlers(app)), [app]);
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
      </main>
    </StoreContext.Provider>
  );
}
