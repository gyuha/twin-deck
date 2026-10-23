import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BINDINGS } from "@twin-deck/actions";
import { FakeBackend } from "@twin-deck/ts-client";
import { FILE_MENU } from "../appMenu";
import { actionTitle, setLanguage, t } from "../i18n";
import { cursorName, renderApp } from "./helpers";
import { runAction, tabTitles } from "./search-helpers";

// 이슈 #95: 원격(SFTP·SSH) 연결 기능을 설정 창 말고 액션 패널·단축키·메뉴바에서도 쓴다.
// xterm.js는 jsdom에서 그려지지 않으므로 화면 엔진은 가짜로 바꾼다(remote-terminal-menu.test.tsx와 같은 방식).
vi.mock("../lib/terminalEngine", () => ({
  createTerminalEngine: async () => ({ open() {}, write() {}, onData() {}, onResize() {}, cols: 100, rows: 30, setFontFamily() {}, focus() {}, dispose() {} }),
}));

const SFTP = { name: "회사", protocol: "sftp", host: "nas", port: 22, user: "kim", base_dir: "", icon: "" };
const FTP = { name: "백업", protocol: "ftp", host: "backup", port: 21, user: "", base_dir: "", icon: "" };
const SHIFT_ENTER = "{Shift>}{Enter}{/Shift}";
type User = Awaited<ReturnType<typeof renderApp>>["user"];

/** SFTP·FTP 서버가 저장돼 있고 SFTP 비밀번호가 키체인에 있는 백엔드(연결 때 비밀번호를 묻지 않는다). */
const saved = () => {
  const b = new FakeBackend().seed({ "/home/a/a.txt": "a", "/home/b/b.txt": "b", "sftp://kim@nas:22/r.txt": "r" });
  b.setConfig((l) => (l.config.remote = { auto_reconnect: true, servers: [SFTP, FTP] }));
  b.remotePasswords.set("kim@nas:22/sftp", "pw");
  return b;
};
const menu = () => screen.findByRole("dialog", { name: "서버에 연결" });
const options = async () => within(await menu()).getAllByRole("option").map((o) => o.textContent?.trim());
const searchPanel = async (user: User, query: string) => {
  await user.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");
  await screen.findByRole("dialog", { name: "Actions Panel" });
  await user.type(screen.getByRole("textbox", { name: "액션 검색" }), query);
  return within(screen.getByRole("listbox", { name: "액션 목록" })).getAllByRole("option").map((r) => r.textContent ?? "");
};

afterEach(() => setLanguage("ko"));

describe("연결 액션 (이슈 #95)", () => {
  it("액션 패널에서 core.menu.connect를 실행하면 연결 메뉴가 열리고, 활성 패널(오른쪽)에서 고른 연결이 그 패널에 새 탭으로 열린다", async () => {
    const b = saved();
    const { user } = await renderApp(b);
    await user.keyboard("{Tab}"); // 오른쪽 패널이 활성
    await runAction(user, "core.menu.connect");
    expect((await options()).join("|")).toContain("SFTP 회사");
    await user.click(within(await menu()).getByRole("option", { name: /SFTP 회사/ }));
    await waitFor(() => expect(tabTitles("right")).toHaveLength(2));
    expect(tabTitles("left")).toHaveLength(1); // 왼쪽은 그대로
    expect(await b.remoteConnections()).toEqual([0]);
  });

  it("Alt+4가 같은 연결 메뉴를 열고 Esc로 닫힌다", async () => {
    const { user } = await renderApp(saved());
    await user.keyboard("{Alt>}4{/Alt}");
    expect((await options()).join("|")).toContain("백업");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "서버에 연결" })).toBeNull();
  });

  it("액션으로 연 연결 메뉴에서 SFTP 항목에 Shift+Enter를 누르면 SSH(원격 셸) 터미널 탭이 열린다", async () => {
    const b = saved();
    const { user } = await renderApp(b);
    await runAction(user, "core.menu.connect");
    await menu(); // 커서는 첫 항목(SFTP)에서 시작한다
    const sftp = within(await menu()).getByRole("option", { name: /SFTP 회사/ });
    await waitFor(() => expect(sftp).toHaveAttribute("aria-selected", "true"));
    await user.keyboard(SHIFT_ENTER);
    await waitFor(() => expect([...b.terminals.values()].map((x) => x.remote)).toEqual(["kim@nas:22"]));
  });

  it("core.remote.disconnect는 로컬 패널에서는 실행되지 않고, 원격 패널에서는 연결을 끊고 원격을 벗어난다", async () => {
    const b = saved();
    await b.remoteConnect(0, "pw", false);
    const { user } = await renderApp(b); // 활성 패널(왼쪽)은 로컬
    await user.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");
    await screen.findByRole("dialog", { name: "Actions Panel" });
    await user.type(screen.getByRole("textbox", { name: "액션 검색" }), "core.remote.disconnect");
    const row = within(screen.getByRole("listbox", { name: "액션 목록" })).getAllByRole("option")[0];
    expect(row).toHaveTextContent("원격 연결 끊기");
    expect(row).toHaveAttribute("aria-disabled", "true"); // 로컬 패널에서는 실행 불가로 흐리게 보인다
    await user.keyboard("{Enter}{Escape}");
    expect(await b.remoteConnections()).toEqual([0]);
  });

  it("원격 패널에서 core.remote.disconnect를 실행하면 그 연결이 끊긴다", async () => {
    const b = saved();
    const root = await b.remoteConnect(0, "pw", false);
    const { user } = await renderApp(b, "linux", { left: root, right: "/home/b" });
    expect(cursorName("left")).toBe("r.txt");
    await user.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");
    await screen.findByRole("dialog", { name: "Actions Panel" });
    await user.type(screen.getByRole("textbox", { name: "액션 검색" }), "core.remote.disconnect");
    expect(within(screen.getByRole("listbox", { name: "액션 목록" })).getAllByRole("option")[0]).not.toHaveAttribute("aria-disabled", "true"); // 원격 패널에서는 실행할 수 있다
    await user.keyboard("{Enter}");
    await waitFor(async () => expect(await b.remoteConnections()).toEqual([]));
    const crumbs = within(screen.getAllByRole("navigation", { name: "경로" })[0]).getAllByRole("button").map((x) => x.textContent);
    expect(crumbs.join("")).not.toContain("sftp://");
  });

  it("core.settings.remote는 설정을 SFTP·FTP 서버 탭에서, core.settings.twindeck_remote는 Twin Deck Remote 탭에서 연다", async () => {
    const { user } = await renderApp(saved());
    await runAction(user, "core.settings.remote");
    await screen.findByRole("dialog", { name: "설정" });
    expect(screen.getByRole("tab", { name: "SFTP·FTP 서버" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "설정" })).toBeNull());
    await runAction(user, "core.settings.twindeck_remote");
    await screen.findByRole("dialog", { name: "설정" });
    expect(screen.getByRole("tab", { name: "Twin Deck Remote" })).toHaveAttribute("aria-selected", "true");
  });

  it("액션 패널에서 sftp·ssh로 검색하면 연결·설정 액션이 나온다", async () => {
    const { user } = await renderApp(saved());
    const sftp = (await searchPanel(user, "sftp")).join("|");
    expect(sftp).toContain("서버에 연결");
    expect(sftp).toContain("SFTP·FTP 서버 설정 열기");
    await user.clear(screen.getByRole("textbox", { name: "액션 검색" }));
    await user.type(screen.getByRole("textbox", { name: "액션 검색" }), "ssh");
    const ssh = within(screen.getByRole("listbox", { name: "액션 목록" })).getAllByRole("option").map((r) => r.textContent ?? "");
    expect(ssh.join("|")).toContain("서버에 연결");
  });

  it("영어 제목에도 SFTP와 SSH(연결), SFTP(설정)가 들어 있다", () => {
    setLanguage("en");
    expect(actionTitle("core.menu.connect", "")).toMatch(/SFTP/);
    expect(actionTitle("core.menu.connect", "")).toMatch(/SSH/);
    expect(actionTitle("core.settings.remote", "")).toMatch(/SFTP/);
    expect(actionTitle("core.remote.disconnect", "")).toMatch(/Disconnect/);
  });

  it("기본 바인딩: 연결 메뉴는 pane 스코프의 Alt+4 하나이고, 끊기·설정 액션 셋은 기본 키가 없다", () => {
    const keysOf = (id: string) => DEFAULT_BINDINGS.filter((x) => x.actionId === id).flatMap((x) => x.keys.map((k) => `${x.scope}:${k}`));
    expect(keysOf("core.menu.connect")).toEqual(["pane:Alt+4"]);
    for (const id of ["core.remote.disconnect", "core.settings.remote", "core.settings.twindeck_remote"]) expect(keysOf(id), id).toEqual([]);
  });

  it("macOS 메뉴바 File 메뉴에 서버에 연결… 항목이 파일 정보 뒤, 마지막 구분선 앞에 있다", () => {
    const info = FILE_MENU.findIndex((e) => e?.actionId === "core.file.info");
    expect(info).toBeGreaterThan(0);
    expect(FILE_MENU[info + 1]).toBeNull();
    expect(FILE_MENU[info + 2]?.actionId).toBe("core.menu.connect");
    expect(FILE_MENU[info + 3]).toBeNull();
    expect(FILE_MENU).toHaveLength(info + 4);
    expect(t("menu.file.connect")).toBe("서버에 연결…");
    setLanguage("en");
    expect(t("menu.file.connect")).toBe("Connect to Server…");
  });
});
