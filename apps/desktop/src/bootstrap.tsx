import { t } from "./i18n";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { homeDir } from "@tauri-apps/api/path";
import { TauriBackend } from "@twin-deck/ts-client";
import type { Backend } from "@twin-deck/ts-client";
import type { Platform } from "@twin-deck/keybinds";
import { App, detectPlatform } from "./App";
import { PreviewWindow } from "./ui/PreviewWindow";

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
    // 별도 미리보기 창(이슈 #160)은 상태 복원·패널 없이 미리보기 화면만 그린다.
    // (창 정보를 읽지 못하는 환경 — 예: IPC만 흉내 낸 시험 — 에서는 메인 창으로 본다.)
    const inPreviewWindow = (() => {
      try {
        return deps.backend.isPreviewWindow();
      } catch {
        return false;
      }
    })();
    if (inPreviewWindow) {
      root.render(
        <StrictMode>
          <PreviewWindow backend={deps.backend} />
        </StrictMode>,
      );
      return;
    }
    // 이 창이 마지막으로 저장한 상태가 있으면 그것으로 시작한다. 읽지 못하면 기본 상태로 시작하고 안내한다.
    const saved = await deps.backend.loadState().catch(() => ({ snapshot: null, warning: null }));
    const home = (await deps.getHome()).replace(/\/$/, "") || "/";
    root.render(
      <StrictMode>
        <App
          backend={deps.backend}
          platform={deps.platform}
          leftPath={home}
          rightPath={home}
          snapshot={saved.snapshot}
          stateWarning={saved.warning}
        />
      </StrictMode>,
    );
  } catch (e) {
    root.render(
      <pre role="alert" className="p-4 text-status-error">
        {t("bootstrap.failed", { error: String(e) })}
      </pre>,
    );
  }
}
