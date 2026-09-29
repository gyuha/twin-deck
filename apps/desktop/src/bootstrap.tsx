import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { homeDir } from "@tauri-apps/api/path";
import { TauriBackend } from "@twin-deck/ts-client";
import type { Backend } from "@twin-deck/ts-client";
import type { Platform } from "@twin-deck/keybinds";
import { App, detectPlatform } from "./App";

export interface BootDeps {
  backend: Backend;
  platform: Platform;
  getHome: () => Promise<string>;
}

export function defaultDeps(): BootDeps {
  return { backend: new TauriBackend(), platform: detectPlatform(), getHome: homeDir };
}

/** 앱을 시작한다. 시작 실패가 빈 화면이 되지 않도록 오류를 화면에 렌더한다. */
export async function start(rootEl: HTMLElement, deps: BootDeps = defaultDeps()): Promise<void> {
  const root = createRoot(rootEl);
  try {
    const home = (await deps.getHome()).replace(/\/$/, "") || "/";
    root.render(
      <StrictMode>
        <App backend={deps.backend} platform={deps.platform} leftPath={home} rightPath={home} />
      </StrictMode>,
    );
  } catch (e) {
    root.render(
      <pre role="alert" className="p-4 text-red-700">
        시작 실패: {String(e)}
      </pre>,
    );
  }
}
