import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { homeDir } from "@tauri-apps/api/path";
import { TauriBackend } from "@twin-deck/ts-client";
import { App, detectPlatform } from "./App";
import "./index.css";

async function main() {
  const home = (await homeDir()).replace(/\/$/, "") || "/";
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App backend={new TauriBackend()} platform={detectPlatform()} leftPath={home} rightPath={home} />
    </StrictMode>,
  );
}

void main();
