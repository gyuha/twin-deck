import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";

// 이슈 #98: 끊긴 원격 터미널 탭을 다시 연결한다(탭과 이전 화면은 남기고 그 아래로 새 셸이 이어진다).
// xterm.js는 jsdom에서 그려지지 않는다: 화면 엔진을 가짜로 바꿔 화면이 그대로 이어지는지만 본다(remote-terminal.test.tsx와 같은 방식).
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

const ID = "me@h:22";
const OPEN = "{Control>}{Alt>}t{/Alt}{/Control}"; // Alt+Mod+T (linux)
const text = (e: Uint8Array | string) => (typeof e === "string" ? e : new TextDecoder().decode(e));
const lost = () => document.querySelector("[data-terminal-disconnected]");
const tabNames = () => within(screen.getAllByRole("tablist")[1]).getAllByRole("tab").map((t) => t.textContent);

/** 왼쪽 패널이 원격 루트, 오른쪽에 원격 터미널 탭이 열린 상태. `remember`면 비밀번호를 키체인 흉내에 저장한다. */
async function withTerminal(remember: boolean) {
  const b = new FakeBackend().seed({ "/home/b/b.txt": "b", [`sftp://${ID}/r.txt`]: "r" });
  await b.setRemoteServers([{ name: "서버", protocol: "sftp", host: "h", port: 22, user: "me", base_dir: "" }]);
  const root = await b.remoteConnect(0, "pw", remember);
  const { user } = await renderApp(b, "linux", { left: root, right: "/home/b" });
  await user.keyboard(OPEN);
  await waitFor(() => expect(hoisted.engines).toHaveLength(1));
  const [oldId] = [...b.terminals.keys()];
  return { b, user, oldId };
}

beforeEach(() => {
  hoisted.engines.length = 0;
});

describe("끊긴 원격 터미널의 다시 연결 (이슈 #98)", () => {
  it("종료 코드 없이 닫히면(연결 끊김) 탭을 남기고 다시 연결 버튼을 보인다", async () => {
    const { b, oldId } = await withTerminal(true);
    act(() => b.emitTerminalExit(oldId, null));
    await waitFor(() => expect(lost()).not.toBeNull());
    expect(lost()).toHaveTextContent("원격 연결이 끊어졌습니다");
    expect(within(lost() as HTMLElement).getByRole("button", { name: "다시 연결" })).toBeEnabled();
    expect(tabNames()).toEqual(["b", "터미널: me@h:22"]);
  });

  it("셸이 정상 종료(종료 코드 있음)하면 지금처럼 탭이 사라진다", async () => {
    const { b, oldId } = await withTerminal(true);
    act(() => b.emitTerminalExit(oldId, 0));
    await waitFor(() => expect(tabNames()).toEqual(["b"]));
    expect(lost()).toBeNull();
  });

  it("다시 연결하면 같은 탭에 새 셸이 열리고 이전 화면 아래로 이어진다", async () => {
    const { b, user, oldId } = await withTerminal(true);
    act(() => b.emitTerminalOutput(oldId, "before\n"));
    act(() => b.simulateRemoteDrop(ID));
    act(() => b.emitTerminalExit(oldId, null));
    await waitFor(() => expect(lost()).not.toBeNull());
    await user.click(within(lost() as HTMLElement).getByRole("button", { name: "다시 연결" }));
    await waitFor(() => expect(lost()).toBeNull());

    const ids = [...b.terminals.keys()];
    expect(ids).toHaveLength(1);
    expect(ids[0]).not.toBe(oldId);
    expect(b.terminals.get(ids[0])?.remote).toBe(ID);
    expect(tabNames()).toEqual(["b", "터미널: me@h:22"]);

    // 새 화면 엔진을 만들지 않고 옛 화면에 이어서 쓴다.
    expect(hoisted.engines).toHaveLength(1);
    act(() => b.emitTerminalOutput(ids[0], "after\n"));
    await waitFor(() => expect(hoisted.engines[0].written.map(text).join("")).toBe("before\nafter\n"));
    // 옛 세션 번호의 출력은 더 이상 섞이지 않고, 입력은 새 세션으로 간다.
    act(() => b.emitTerminalOutput(oldId, "stale\n"));
    act(() => hoisted.engines[0].emitData("ls\n"));
    await waitFor(() => expect(b.terminalWrites.map((w) => w.id)).toEqual([ids[0]]));
    expect(hoisted.engines[0].written.map(text).join("")).not.toContain("stale");
  });

  it("액션 `core.remote.reconnect`도 끊긴 터미널 탭을 다시 연결한다", async () => {
    const { b, user, oldId } = await withTerminal(true);
    act(() => b.simulateRemoteDrop(ID));
    act(() => b.emitTerminalExit(oldId, null));
    await waitFor(() => expect(lost()).not.toBeNull());
    const { runAction } = await import("./search-helpers");
    await runAction(user, "core.remote.reconnect");
    await waitFor(() => expect(lost()).toBeNull());
    expect([...b.terminals.keys()]).not.toContain(oldId);
    expect(b.terminals.size).toBe(1);
  });
});
