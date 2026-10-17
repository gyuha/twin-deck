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

describe("연결 메뉴의 Shift+Enter 터미널 (이슈 #94)", () => {
  const NAS = { name: "NAS", host: "nas.local", share: "media", user: "kim" };
  const SFTP = { name: "회사", protocol: "sftp", host: "nas", port: 22, user: "kim", base_dir: "" };
  const FTP = { name: "백업", protocol: "ftp", host: "backup", port: 21, user: "", base_dir: "" };
  const SHIFT_ENTER = "{Shift>}{Enter}{/Shift}";
  const setup = () => {
    const backend = seedBackend();
    backend.setConfig((l) => {
      l.config.smb = { servers: [NAS] };
      l.config.remote = { servers: [SFTP, FTP] };
    });
    backend.seed({ "sftp://kim@nas:22/docs/a.txt": "a" });
    const smbConnect = vi.spyOn(backend, "smbConnect");
    return { backend, smbConnect };
  };
  const menu = () => screen.getByRole("dialog", { name: "서버에 연결" });
  const open = async (user: Awaited<ReturnType<typeof renderApp>>["user"]) => {
    await user.click(screen.getAllByRole("button", { name: "연결" })[0]);
    return menu();
  };
  const option = (name: RegExp) => within(menu()).getByRole("option", { name });
  /** 커서를 이름에 맞는 항목으로 옮긴다. */
  const moveTo = async (user: Awaited<ReturnType<typeof renderApp>>["user"], name: RegExp) => {
    for (let i = 0; i < 5 && option(name).getAttribute("aria-selected") !== "true"; i++) await user.keyboard("{ArrowDown}");
    expect(option(name)).toHaveAttribute("aria-selected", "true");
  };

  it("SFTP 항목에서 Shift+Enter를 누르면 연결하고 원격 셸 터미널 탭이 열리며 메뉴가 닫힌다", async () => {
    const { backend } = setup();
    const { user } = await renderApp(backend);
    await open(user);
    await moveTo(user, /회사/);
    await user.keyboard(SHIFT_ENTER);
    expect(screen.queryByRole("dialog", { name: "서버에 연결" })).toBeNull();
    const d = await screen.findByRole("dialog", { name: "회사 비밀번호" });
    await user.type(within(d).getByLabelText("비밀번호"), "pw{Enter}");
    await waitFor(() => expect([...backend.terminals.values()].map((t) => t.remote)).toEqual(["kim@nas:22"]));
    expect(await backend.remoteConnections()).toEqual([0]);
    // 메뉴를 연 현재(왼쪽) 패널의 탭 줄에 열린다.
    const tabs = (i: number) => within(screen.getAllByRole("tablist")[i]).getAllByRole("tab").map((t) => t.textContent);
    expect(tabs(0)).toContain("터미널: kim@nas:22");
    expect(tabs(1)).not.toContain("터미널: kim@nas:22");
    // 터미널만 열고 패널은 서버 폴더로 옮기지 않는다.
    expect(within(screen.getAllByRole("navigation", { name: "경로" }).at(0)!).getAllByRole("button").map((b) => b.textContent)).not.toEqual(["sftp://kim@nas:22/"]);
  });

  it("같은 항목에서 Enter만 누르면 연결만 하고 터미널은 열지 않는다", async () => {
    const { backend } = setup();
    const { user } = await renderApp(backend);
    await open(user);
    await moveTo(user, /회사/);
    await user.keyboard("{Enter}");
    const d = await screen.findByRole("dialog", { name: "회사 비밀번호" });
    await user.type(within(d).getByLabelText("비밀번호"), "pw{Enter}");
    await waitFor(async () => expect(await backend.remoteConnections()).toEqual([0]));
    expect(backend.terminals.size).toBe(0);
  });

  it("Enter로 연결하면 현재 탭은 그대로 두고 서버 루트를 보는 새 탭을 연다", async () => {
    const { backend } = setup();
    const { user } = await renderApp(backend);
    const leftTabs = () => within(screen.getAllByRole("tablist")[0]).getAllByRole("tab");
    const before = leftTabs().map((t) => t.textContent);
    expect(before).toHaveLength(1);
    await open(user);
    await moveTo(user, /회사/);
    await user.keyboard("{Enter}");
    const d = await screen.findByRole("dialog", { name: "회사 비밀번호" });
    await user.type(within(d).getByLabelText("비밀번호"), "pw{Enter}");
    await waitFor(() => expect(leftTabs()).toHaveLength(2));
    expect(leftTabs()[0].textContent).toBe(before[0]);
    expect(leftTabs()[1]).toHaveAttribute("aria-selected", "true");
    expect(within(screen.getAllByRole("navigation", { name: "경로" }).at(0)!).getAllByRole("button").map((b) => b.textContent)).toEqual(["sftp://kim@nas:22/"]);
    // 같은 서버에 다시 연결해도 탭이 쌓이지 않고 그 탭으로 간다.
    await open(user);
    await moveTo(user, /회사/);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(leftTabs()[1]).toHaveAttribute("aria-selected", "true"));
    expect(leftTabs()).toHaveLength(2);
  });

  it("FTP·SMB 항목에서 Shift+Enter는 연결도 터미널도 하지 않고 메뉴를 그대로 둔다", async () => {
    const { backend, smbConnect } = setup();
    const { user } = await renderApp(backend);
    await open(user);
    await moveTo(user, /NAS/);
    await user.keyboard(SHIFT_ENTER);
    await moveTo(user, /백업/);
    await user.keyboard(SHIFT_ENTER);
    expect(menu()).toBeInTheDocument();
    expect(await backend.remoteConnections()).toEqual([]);
    expect(smbConnect).not.toHaveBeenCalled();
    expect(backend.terminals.size).toBe(0);
    expect(screen.queryByRole("dialog", { name: /비밀번호/ })).toBeNull();
  });

  it("'Shift+Enter: 터미널' 배지는 SFTP 항목에만 보인다", async () => {
    const { backend } = setup();
    const { user } = await renderApp(backend);
    await open(user);
    expect(option(/회사/)).toHaveTextContent("Shift+Enter: 터미널");
    expect(option(/백업/)).not.toHaveTextContent("Shift+Enter");
    expect(option(/NAS/)).not.toHaveTextContent("Shift+Enter");
  });
});
