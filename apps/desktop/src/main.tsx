import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { homeDir } from "@tauri-apps/api/path";
import { TauriBackend } from "@twin-deck/ts-client";
import { App, detectPlatform } from "./App";
import "./index.css";

async function main() {
  const root = createRoot(document.getElementById("root")!);
  try {
    const home = (await homeDir()).replace(/\/$/, "") || "/";
    root.render(
      <StrictMode>
        <App backend={new TauriBackend()} platform={detectPlatform()} leftPath={home} rightPath={home} />
      </StrictMode>,
    );
  } catch (e) {
    // 시작 실패가 빈 화면으로 보이지 않게 한다.
    root.render(
      <pre role="alert" className="p-4 text-red-700">
        시작 실패: {String(e)}
      </pre>,
    );
  }
}

void main();
