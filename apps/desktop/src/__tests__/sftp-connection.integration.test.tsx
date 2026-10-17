import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { TauriBackend } from "@twin-deck/ts-client";
import { renderApp, seedBackend } from "./helpers";

const ipc = vi.hoisted(() => ({ invoke: undefined as undefined | ((command: string, args?: unknown) => Promise<any>) }));
vi.mock("@tauri-apps/api/core", async (original) => ({
  ...await original<typeof import("@tauri-apps/api/core")>(),
  invoke: (command: string, args?: unknown) => ipc.invoke!(command, args),
}));

// cargo test -p twin-deck-desktop --no-run 출력의 테스트 실행 파일을 지정하여 실행한다.
// TWIN_DECK_SFTP_TEST_BINARY=/절대/경로 bunx vitest run src/__tests__/sftp-connection.integration.test.tsx
const binary = process.env.TWIN_DECK_SFTP_TEST_BINARY;
describe.skipIf(!binary)("가짜 SFTP 서버와 UI·IPC·신뢰 저장소 통합", () => {
  let child: ChildProcessWithoutNullStreams;
  const pending: { resolve: (value: any) => void; reject: (e: Error) => void }[] = [];
  let port: number;
  beforeAll(async () => {
    child = spawn(binary!, ["--ignored", "--exact", "commands::tests::sftp_ui_fixture", "--nocapture"], {
      env: { ...process.env, TWIN_DECK_SFTP_UI_FIXTURE: "1" },
    });
    createInterface({ input: child.stdout }).on("line", (line) => {
      if (line.startsWith("SFTP_FIXTURE ")) pending.shift()!.resolve(JSON.parse(line.slice(13)));
    });
    child.on("error", (e) => pending.splice(0).forEach((p) => p.reject(e)));
    child.on("exit", (code) => pending.splice(0).forEach((p) => p.reject(new Error(`시험 서버 종료: ${code}`))));
    ipc.invoke = (command, args) => new Promise((resolve, reject) => {
      pending.push({ resolve, reject });
      child.stdin.write(JSON.stringify({ command, args }) + "\n");
    });
    port = (await ipc.invoke("stats")).port;
  }, 15000);
  afterAll(() => { child?.stdin.end(); child?.kill(); });

  it("첫 연결 취소는 인증하지 않고, 명시 승인·저장 후 연결되며 재접속은 다시 묻지 않는다", async () => {
    const backend = seedBackend();
    backend.setConfig((l) => { l.config.remote.servers = [{ name: "로컬 시험", protocol: "sftp", host: "127.0.0.1", port, user: "u", base_dir: "" }]; });
    backend.seed({ [`sftp://u@127.0.0.1:${port}/example.txt`]: "로컬 시험" });
    const tauri = new TauriBackend();
    let connected = false;
    backend.remoteConnect = async (...args) => { const root = await tauri.remoteConnect(...args); connected = true; return root; };
    backend.remoteDisconnect = async (index) => { await tauri.remoteDisconnect(index); connected = false; };
    backend.remoteConnections = async () => connected ? [0] : [];
    const { user } = await renderApp(backend);
    const bar = () => screen.getByRole("toolbar", { name: "드라이브 (왼쪽 패널)" });
    const connect = async () => {
      await user.click(within(bar()).getByRole("button", { name: "연결" }));
      await user.click(within(screen.getByRole("dialog", { name: "서버에 연결" })).getByRole("option", { name: /SFTP 로컬 시험/ }));
    };
    const password = async () => {
      const d = await screen.findByRole("dialog", { name: "로컬 시험 비밀번호" });
      await user.type(within(d).getByLabelText("비밀번호"), "p");
      await user.click(within(d).getByRole("checkbox", { name: "비밀번호 기억" }));
      await user.click(within(d).getByRole("button", { name: "확인" }));
    };
    await connect();
    await password();
    let d = await screen.findByRole("dialog", { name: "SFTP 서버 신원 확인" });
    expect(within(d).getByText(`127.0.0.1:${port}`)).toBeVisible();
    expect(within(d).getByText(/^SHA256:/)).toBeVisible();
    expect(await ipc.invoke!("stats")).toMatchObject({ authAttempts: 0, keys: 0, remembered: false });
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await ipc.invoke!("stats")).toMatchObject({ authAttempts: 0, keys: 0, remembered: false });
    await connect();
    await password();
    d = await screen.findByRole("dialog", { name: "SFTP 서버 신원 확인" });
    const approve = within(d).getByRole("button", { name: "승인하고 연결" });
    expect(approve).toBeDisabled();
    await user.click(within(d).getByRole("checkbox", { name: /신뢰할 경로/ }));
    await user.click(approve);
    await waitFor(() => expect(connected).toBe(true));
    expect(await ipc.invoke!("stats")).toMatchObject({ authAttempts: 1, keys: 1, remembered: true });
    await user.click(within(bar()).getByRole("button", { name: "연결 끊기" }));
    await waitFor(() => expect(connected).toBe(false));
    await connect();
    await waitFor(() => expect(connected).toBe(true));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(await ipc.invoke!("stats")).toMatchObject({ authAttempts: 2, keys: 1, remembered: true });
  }, 20000);
});
