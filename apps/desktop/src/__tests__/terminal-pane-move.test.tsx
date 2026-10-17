import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import type { Snapshot } from "@twin-deck/ts-client";
import { acquireTerminal } from "../lib/terminalSessions";
import { renderApp } from "./helpers";

// 이슈 #96: 터미널 탭을 다른 패널로 끌어 옮겨도 화면(엔진)과 출력이 이어진다.
// xterm.js는 jsdom에서 그려지지 않으므로 화면 엔진을 가짜로 바꾸되, 엔진마다 `open`으로 붙은 자리들을 기록한다.
const hoisted = vi.hoisted(() => ({
  engines: [] as {
    written: (Uint8Array | string)[];
    hosts: HTMLElement[];
    disposed: boolean;
    emitData(d: string): void;
    emitResize(c: number, r: number): void;
  }[],
}));
vi.mock("../lib/terminalEngine", () => ({
  createTerminalEngine: async () => {
    let data: (d: string) => void = () => {};
    let resize: (s: { cols: number; rows: number }) => void = () => {};
    const eng = {
      written: [] as (Uint8Array | string)[],
      hosts: [] as HTMLElement[],
      disposed: false,
      emitData: (d: string) => data(d),
      emitResize: (c: number, r: number) => resize({ cols: c, rows: r }),
    };
    hoisted.engines.push(eng);
    return {
      open: (el: HTMLElement) => void eng.hosts.push(el),
      write: (d: Uint8Array | string) => void eng.written.push(d),
      onData: (cb: (d: string) => void) => void (data = cb),
      onResize: (cb: (s: { cols: number; rows: number }) => void) => void (resize = cb),
      cols: 100,
      rows: 30,
      setFontFamily: () => {},
      focus: () => {},
      dispose: () => void (eng.disposed = true),
    };
  },
}));

const tab = (path: string) => ({ path, cursorName: null, selection: [], sort: null, view: { mode: "table" as const, count: 1 as const } });
const snapshot = (): Snapshot => ({
  version: 1,
  activePane: "left",
  showHidden: false,
  paletteQuery: "",
  split: 500,
  previewRect: null,
  left: { tabs: [tab("/home/a"), tab("/home/a/sub")], active: 0 },
  right: { tabs: [tab("/home/b")], active: 0 },
});
const OPEN = "{Control>}{Alt>}t{/Alt}{/Control}"; // Alt+Mod+T (linux)
const CLOSE_TAB = "{Control>}w{/Control}";
const lists = () => screen.getAllByRole("tablist");
const names = (i: number) => within(lists()[i]).getAllByRole("tab").map((t) => t.textContent);
const tabsOf = (i: number) => within(lists()[i]).getAllByRole("tab");
const shownTerm = (pane: "left" | "right") => document.querySelector(`section[data-pane="${pane}"] [data-terminal][data-shown="true"]`);
const termsIn = (pane: "left" | "right") => document.querySelectorAll(`section[data-pane="${pane}"] [data-terminal]`);
const text = (e: Uint8Array | string) => (typeof e === "string" ? e : new TextDecoder().decode(e));
const written = (i = 0) => hoisted.engines[i].written.map(text).join("");

// 레이아웃 흉내: 왼쪽 탭 줄 x [0,200], 오른쪽 탭 줄 x [300,500], 높이 [0,20]. 탭은 줄 안에서 폭 50, 틈 4px.
const BARS = [
  { left: 0, right: 200 },
  { left: 300, right: 500 },
];
beforeEach(() => {
  hoisted.engines.length = 0;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const zero = { left: 0, right: 0, width: 0, top: 0, bottom: 0, height: 0, x: 0, y: 0, toJSON() {} } as DOMRect;
    const role = this.getAttribute("role");
    const bar = this.closest('[role="tablist"]');
    const barIndex = bar ? Array.from(document.querySelectorAll('[role="tablist"]')).indexOf(bar) : -1;
    if (role === "tablist") {
      const b = BARS[Array.from(document.querySelectorAll('[role="tablist"]')).indexOf(this)];
      return b ? ({ ...b, width: b.right - b.left, top: 0, bottom: 20, height: 20, x: b.left, y: 0, toJSON() {} } as DOMRect) : zero;
    }
    if (role === "tab" && bar && BARS[barIndex]) {
      const i = Array.from(bar.querySelectorAll('[role="tab"]')).indexOf(this);
      const left = BARS[barIndex].left + i * 54;
      return { left, right: left + 50, width: 50, top: 0, bottom: 20, height: 20, x: left, y: 0, toJSON() {} } as DOMRect;
    }
    return zero;
  });
});
afterEach(() => vi.restoreAllMocks());

const backend = () => new FakeBackend().seed({ "/home/a/a.txt": "a", "/home/a/sub/x.txt": "x", "/home/b/b.txt": "b" });

/** 왼쪽 패널에서 터미널을 열면(Alt+Mod+T) 오른쪽 탭 줄에 생긴다. 그 탭을 끌어 왼쪽 탭 줄에 놓는다. */
async function openAndDragToLeft(b: FakeBackend) {
  const { user } = await renderApp(b, undefined, undefined, { snapshot: snapshot() });
  await user.keyboard(OPEN);
  await waitFor(() => expect(shownTerm("right")).not.toBeNull());
  await waitFor(() => expect(hoisted.engines[0]?.hosts.length).toBe(1));
  const id = [...b.terminals.keys()][0];
  act(() => b.emitTerminalOutput(id, "이전 화면"));
  await waitFor(() => expect(written()).toBe("이전 화면"));
  const terminalTab = tabsOf(1)[1];
  fireEvent.mouseDown(terminalTab, { button: 0, buttons: 1, clientX: 380, clientY: 10 });
  fireEvent.mouseMove(terminalTab, { buttons: 1, clientX: 100, clientY: 10 });
  fireEvent.mouseUp(terminalTab, { button: 0, buttons: 0, clientX: 100, clientY: 10 });
  await waitFor(() => expect(names(1)).toEqual(["b"]));
  return { user, id };
}

describe("터미널 탭을 다른 패널로 옮겨도 화면이 이어진다 (이슈 #96)", () => {
  it("옮긴 뒤에도 엔진이 새로 만들어지지 않고 해제되지도 않는다", async () => {
    const b = backend();
    await openAndDragToLeft(b);
    expect(names(0).some((n) => n?.startsWith("터미널"))).toBe(true);
    await new Promise((r) => setTimeout(r, 20)); // 지연 해제가 있다면 지나갈 시간을 준다
    expect(hoisted.engines).toHaveLength(1);
    expect(hoisted.engines[0].disposed).toBe(false);
  });

  it("엔진이 붙은 자리가 새 패널 구역 안으로 바뀌고, 보이는 터미널은 새 패널에만 있다", async () => {
    const b = backend();
    await openAndDragToLeft(b);
    const hosts = hoisted.engines[0].hosts;
    expect(hosts.length).toBeGreaterThanOrEqual(2); // 처음 자리 + 옮긴 자리
    const last = hosts.at(-1)!;
    expect(last.isConnected).toBe(true);
    expect(last.closest('section[data-pane="left"]')).not.toBeNull();
    expect(shownTerm("left")).not.toBeNull();
    expect(shownTerm("right")).toBeNull();
    expect(termsIn("right")).toHaveLength(0);
    expect(termsIn("left")).toHaveLength(1);
  });

  it("옮기기 전에 쓴 출력이 같은 엔진에 남고, 옮긴 뒤의 출력도 이어서 쓰인다(화면 유지)", async () => {
    const b = backend();
    const { id } = await openAndDragToLeft(b);
    expect(written()).toBe("이전 화면");
    act(() => b.emitTerminalOutput(id, " + 이후 출력"));
    await waitFor(() => expect(written()).toBe("이전 화면 + 이후 출력"));
    expect(hoisted.engines).toHaveLength(1);
  });

  it("옮긴 뒤에도 입력은 세션으로 쓰이고 크기 변경은 세션에 전해진다", async () => {
    const b = backend();
    const { id } = await openAndDragToLeft(b);
    act(() => hoisted.engines[0].emitData("ls\r"));
    await waitFor(() => expect(b.terminalWrites).toEqual([{ id, data: "ls\r" }]));
    act(() => hoisted.engines[0].emitResize(120, 40));
    await waitFor(() => expect(b.terminals.get(id)).toMatchObject({ cols: 120, rows: 40 }));
  });

  it("뷰가 해제되고 다시 붙는 사이에 온 출력도 놓치지 않는다(같은 엔진에 순서대로 쓰인다)", async () => {
    const b = backend();
    const handleA = acquireTerminal(b, 7, "", () => {});
    handleA.attach(document.createElement("div"));
    await waitFor(() => expect(handleA.engine()).not.toBeNull());
    act(() => b.emitTerminalOutput(7, "앞"));
    handleA.release(); // 뷰가 사라졌다(탭이 다른 패널로 가는 중)
    act(() => b.emitTerminalOutput(7, "사이"));
    const handleB = acquireTerminal(b, 7, "", () => {}); // 새 패널의 뷰가 이어 받는다
    handleB.attach(document.createElement("div"));
    expect(handleB.engine()).toBe(handleA.engine());
    act(() => b.emitTerminalOutput(7, "뒤"));
    expect(hoisted.engines).toHaveLength(1);
    expect(written()).toBe("앞사이뒤");
    await new Promise((r) => setTimeout(r, 20));
    expect(hoisted.engines[0].disposed).toBe(false);
    handleB.release();
    await waitFor(() => expect(hoisted.engines[0].disposed).toBe(true)); // 아무도 안 쓰면 해제한다
  });

  it("옮긴 터미널 탭을 닫으면(Mod+W) 세션이 끝나고 엔진이 해제되며 출력 구독도 풀린다", async () => {
    const b = backend();
    const { user, id } = await openAndDragToLeft(b);
    await user.keyboard(CLOSE_TAB);
    await waitFor(() => expect(b.terminals.has(id)).toBe(false));
    await waitFor(() => expect(hoisted.engines[0].disposed).toBe(true));
    const before = hoisted.engines[0].written.length;
    act(() => b.emitTerminalOutput(id, "닫은 뒤 출력"));
    expect(hoisted.engines[0].written).toHaveLength(before); // 구독이 풀려 더는 쓰이지 않는다
  });
});
