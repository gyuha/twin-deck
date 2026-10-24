import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";

// xterm.js는 jsdom에서 그려지지 않는다: 화면 엔진을 가짜로 바꿔 입력·출력이 이어지는지만 본다(terminal-pane.test.tsx와 같은 방식).
const hoisted = vi.hoisted(() => ({
  engines: [] as { written: (Uint8Array | string)[]; emitData(d: string): void }[],
}));
vi.mock("../lib/terminalEngine", () => ({
  createTerminalEngine: async () => {
    let data: (d: string) => void = () => {};
    const eng = { written: [] as (Uint8Array | string)[], emitData: (d: string) => data(d) };
    hoisted.engines.push(eng);
    return {
      open: () => {},
      write: (d: Uint8Array | string) => void eng.written.push(d),
      onData: (cb: (d: string) => void) => void (data = cb),
      onResize: () => {},
      cols: 100,
      rows: 30,
      setFontFamily: () => {}, setTheme: () => {},
      focus: () => {},
      dispose: () => {},
    };
  },
}));

const OPEN = "{Control>}{Alt>}t{/Alt}{/Control}"; // Alt+Mod+T (linux)
const shownTerm = (pane: "left" | "right") => document.querySelector(`section[data-pane="${pane}"] [data-terminal][data-shown="true"]`);
const tabNames = (pane: "left" | "right") => within(screen.getAllByRole("tablist")[pane === "left" ? 0 : 1]).getAllByRole("tab").map((t) => t.textContent);
const text = (e: Uint8Array | string) => (typeof e === "string" ? e : new TextDecoder().decode(e));

/** 왼쪽 패널을 원격 서버(첫 항목)의 루트에서 연다. */
async function remoteBackend(protocol: "sftp" | "ftp") {
  const id = "me@h:22";
  const b = new FakeBackend().seed({ "/home/b/b.txt": "b", [`${protocol}://${id}/r.txt`]: "r" });
  await b.setRemoteServers([{ name: "서버", protocol, host: "h", port: 22, user: "me", base_dir: "" }]);
  const root = await b.remoteConnect(0, "pw", false);
  return { b, root };
}

beforeEach(() => {
  hoisted.engines.length = 0;
});

describe("원격 터미널", () => {
  it("원격(sftp) 패널에서 터미널을 열면 원격 셸이 열리고 입력이 되돌아와 화면에 나온다", async () => {
    const { b, root } = await remoteBackend("sftp");
    const { user } = await renderApp(b, "linux", { left: root, right: "/home/b" });
    await user.keyboard(OPEN);
    await waitFor(() => expect(shownTerm("right")).not.toBeNull());
    expect(tabNames("right")).toEqual(["b", "터미널: me@h:22"]); // 탭 이름에 접속 이름(연결 id)
    expect([...b.terminals.values()].map((t) => t.remote)).toEqual(["me@h:22"]);
    await waitFor(() => expect(hoisted.engines).toHaveLength(1));
    act(() => hoisted.engines[0].emitData("ls\n"));
    await waitFor(() => expect(hoisted.engines[0].written.map(text).join("")).toBe("ls\n"));
    expect(b.terminalWrites.map((w) => w.data)).toEqual(["ls\n"]);
  });

  it("원격 셸 탭을 닫으면 세션이 끝난다", async () => {
    const { b, root } = await remoteBackend("sftp");
    const { user } = await renderApp(b, "linux", { left: root, right: "/home/b" });
    await user.keyboard(OPEN);
    await waitFor(() => expect(shownTerm("right")).not.toBeNull());
    await user.keyboard("{Control>}w{/Control}");
    await waitFor(() => expect(b.terminals.size).toBe(0));
    expect(tabNames("right")).toEqual(["b"]);
  });

  it("로컬 패널에서는 기존처럼 로컬 셸이 열린다", async () => {
    const { b } = await remoteBackend("sftp");
    const { user } = await renderApp(b, "linux", { left: "/home/b", right: "/home/b" });
    await user.keyboard(OPEN);
    await waitFor(() => expect(shownTerm("right")).not.toBeNull());
    expect([...b.terminals.values()].map((t) => [t.cwd, t.remote])).toEqual([["/home/b", undefined]]);
    expect(tabNames("right")).toEqual(["b", "터미널: b"]);
  });

  it("FTP 패널에서는 셸을 열지 않는다", async () => {
    const { b, root } = await remoteBackend("ftp");
    const { user } = await renderApp(b, "linux", { left: root, right: "/home/b" });
    await user.keyboard(OPEN);
    await screen.findByText("FTP 연결에는 셸이 없어 터미널을 열 수 없습니다");
    expect(b.terminals.size).toBe(0);
    expect(tabNames("right")).toEqual(["b"]);
  });
});
