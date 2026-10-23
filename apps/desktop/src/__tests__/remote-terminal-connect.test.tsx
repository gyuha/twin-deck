import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderApp, seedBackend } from "./helpers";

// xterm.js는 jsdom에서 그려지지 않는다: 화면 엔진은 가짜로 바꾼다(remote-terminal.test.tsx와 같은 방식).
vi.mock("../lib/terminalEngine", () => ({
  createTerminalEngine: async () => ({
    open: () => {},
    write: () => {},
    onData: () => {},
    onResize: () => {},
    cols: 100,
    rows: 30,
    setFontFamily: () => {},
    focus: () => {},
    dispose: () => {},
  }),
}));

describe("설정의 터미널 연결 버튼 (이슈 #94)", () => {
  // 반대편 패널의 드라이브 바에도 버튼이 있어 설정 탭 안으로 좁힌다.
  const button = (name: string) => within(screen.getByRole("tabpanel")).getByRole("button", { name });
  const SFTP = { name: "회사", protocol: "sftp", host: "nas", port: 22, user: "kim", base_dir: "" };
  const FTP = { name: "백업", protocol: "ftp", host: "backup", port: 21, user: "", base_dir: "" };
  const openTab = async (backend: ReturnType<typeof seedBackend>) => {
    const app = await renderApp(backend);
    await app.user.keyboard("{Control>},{/Control}");
    await screen.findByRole("dialog", { name: "설정" });
    await app.user.click(screen.getByRole("tab", { name: "SFTP·FTP 서버" }));
    return app;
  };

  it("SFTP 서버를 고르면 버튼이 켜지고, 누르면 연결한 뒤 그 서버의 원격 셸 터미널 탭이 열린다", async () => {
    const backend = seedBackend();
    backend.setConfig((l) => (l.config.remote = { auto_reconnect: true, servers: [SFTP] }));
    backend.seed({ "sftp://kim@nas:22/docs/a.txt": "a" });
    const { user } = await openTab(backend);
    expect(button("터미널 연결")).toBeEnabled();
    await user.click(button("터미널 연결"));
    expect(screen.queryByRole("dialog", { name: "설정" })).toBeNull();
    const d = await screen.findByRole("dialog", { name: "회사 비밀번호" });
    await user.type(within(d).getByLabelText("비밀번호"), "pw{Enter}");
    await waitFor(() => expect([...backend.terminals.values()].map((t) => t.remote)).toEqual(["kim@nas:22"]));
    expect(await backend.remoteConnections()).toEqual([0]);
    // 설정이 덮고 있던 현재(왼쪽) 패널의 탭 줄에 열린다.
    const tabs = (i: number) => within(screen.getAllByRole("tablist")[i]).getAllByRole("tab").map((t) => t.textContent);
    expect(tabs(0)).toContain("터미널: kim@nas:22");
    expect(tabs(1)).not.toContain("터미널: kim@nas:22");
    // 터미널만 열고 패널은 서버 폴더로 옮기지 않는다.
    expect(within(screen.getAllByRole("navigation", { name: "경로" }).at(0)!).getAllByRole("button").map((b) => b.textContent)).not.toEqual(["sftp://kim@nas:22/"]);
  });

  it("FTP 서버를 고르면 버튼이 꺼져 있다", async () => {
    const backend = seedBackend();
    backend.setConfig((l) => (l.config.remote = { auto_reconnect: true, servers: [FTP] }));
    await openTab(backend);
    expect(button("터미널 연결")).toBeDisabled();
    expect(button("연결")).toBeEnabled();
  });

  it("비밀번호 창을 취소하면 터미널을 열지 않는다", async () => {
    const backend = seedBackend();
    backend.setConfig((l) => (l.config.remote = { auto_reconnect: true, servers: [SFTP] }));
    const { user } = await openTab(backend);
    await user.click(button("터미널 연결"));
    await screen.findByRole("dialog", { name: "회사 비밀번호" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "회사 비밀번호" })).toBeNull());
    expect(backend.terminals.size).toBe(0);
    expect(await backend.remoteConnections()).toEqual([]);
  });
});
