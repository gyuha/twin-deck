import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";

// ghostty-web(wasm·canvas)은 jsdom에서 돌지 않는다: 화면 엔진을 가짜로 바꿔 입력·출력·크기가 이어지는지만 본다.
const hoisted = vi.hoisted(() => ({
  engines: [] as {
    written: (Uint8Array | string)[];
    opened: HTMLElement | null;
    disposed: boolean;
    focused: number;
    cols: number;
    rows: number;
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
      opened: null as HTMLElement | null,
      disposed: false,
      focused: 0,
      cols: 100,
      rows: 30,
      emitData: (d: string) => data(d),
      emitResize: (c: number, r: number) => resize({ cols: c, rows: r }),
    };
    hoisted.engines.push(eng);
    return {
      open: (el: HTMLElement) => void (eng.opened = el),
      write: (d: Uint8Array | string) => void eng.written.push(d),
      onData: (cb: (d: string) => void) => void (data = cb),
      onResize: (cb: (s: { cols: number; rows: number }) => void) => void (resize = cb),
      get cols() {
        return eng.cols;
      },
      get rows() {
        return eng.rows;
      },
      focus: () => void eng.focused++,
      dispose: () => void (eng.disposed = true),
    };
  },
}));

const OPEN = "{Control>}{Alt>}t{/Alt}{/Control}"; // Alt+Mod+T (linux)
const TOGGLE = "{Control>}{Alt>}o{/Alt}{/Control}"; // Alt+Mod+O
const termIn = (pane: "left" | "right") => document.querySelector(`[data-pane="${pane}"] [data-terminal]`);
const backend = () => new FakeBackend().seed({ "/home/a/a.txt": "a", "/home/a/sub/x.txt": "x", "/home/b/b.txt": "b" });
const text = (e: Uint8Array | string) => (typeof e === "string" ? e : new TextDecoder().decode(e));

beforeEach(() => {
  hoisted.engines.length = 0;
});

describe("내장 터미널 패널", () => {
  it("Alt+Mod+T가 활성 패널 폴더를 cwd로 세션을 열고 반대편 패널이 터미널이 된다(왼쪽 → 오른쪽)", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    expect(termIn("right")).toBeNull();
    await user.keyboard(OPEN);
    await waitFor(() => expect(termIn("right")).not.toBeNull());
    expect(termIn("left")).toBeNull();
    expect([...b.terminals.values()].map((t) => t.cwd)).toEqual(["/home/a"]);
    // 파일 목록은 왼쪽에 그대로 있다
    expect(screen.getByRole("listbox", { name: "왼쪽 파일 목록" })).toBeInTheDocument();
    expect(screen.queryByRole("listbox", { name: "오른쪽 파일 목록" })).toBeNull();
  });

  it("오른쪽 패널이 활성이면 터미널은 왼쪽에 뜨고 cwd는 오른쪽 폴더다", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await user.keyboard("{Tab}"); // 오른쪽 패널 활성
    await user.keyboard(OPEN);
    await waitFor(() => expect(termIn("left")).not.toBeNull());
    expect(termIn("right")).toBeNull();
    expect([...b.terminals.values()].map((t) => t.cwd)).toEqual(["/home/b"]);
  });

  it("이미 열려 있으면 Alt+Mod+T는 세션을 새로 만들지 않고 포커스만 준다", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await user.keyboard(OPEN);
    await waitFor(() => expect(termIn("right")).not.toBeNull());
    await waitFor(() => expect(hoisted.engines[0]?.opened).not.toBeNull());
    await user.click(screen.getByRole("listbox", { name: "왼쪽 파일 목록" })); // 파일 쪽으로 포커스를 돌린다
    const before = hoisted.engines[0].focused;
    await user.keyboard(OPEN);
    expect(b.terminals.size).toBe(1);
    await waitFor(() => expect(hoisted.engines[0].focused).toBeGreaterThan(before));
  });

  it("Alt+Mod+O가 숨기고 다시 보이게 하며 세션은 닫히지 않는다", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await user.keyboard(OPEN);
    await waitFor(() => expect(termIn("right")).not.toBeNull());
    const id = [...b.terminals.keys()][0];
    await user.keyboard(TOGGLE);
    await waitFor(() => expect(termIn("right")).toBeNull());
    expect(screen.getByRole("listbox", { name: "오른쪽 파일 목록" })).toBeInTheDocument();
    expect(b.terminals.has(id)).toBe(true);
    await user.keyboard(TOGGLE);
    await waitFor(() => expect(termIn("right")).not.toBeNull());
    expect(b.terminals.size).toBe(1);
  });

  it("터미널 입력은 세션으로 쓰이고 세션 출력은 화면에, 크기는 세션에 전해진다", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await user.keyboard(OPEN);
    await waitFor(() => expect(hoisted.engines[0]?.opened).not.toBeNull());
    const id = [...b.terminals.keys()][0];
    act(() => hoisted.engines[0].emitData("ls\r"));
    await waitFor(() => expect(b.terminalWrites).toEqual([{ id, data: "ls\r" }]));
    act(() => b.emitTerminalOutput(id, "안녕 파일"));
    await waitFor(() => expect(hoisted.engines[0].written.map(text).join("")).toBe("안녕 파일"));
    await waitFor(() => expect(b.terminals.get(id)).toMatchObject({ cols: 100, rows: 30 })); // 열자마자 맞춘 크기
    act(() => hoisted.engines[0].emitResize(120, 40));
    await waitFor(() => expect(b.terminals.get(id)).toMatchObject({ cols: 120, rows: 40 }));
  });

  it("터미널 포커스에서는 일반 키가 앱 단축키(Quick Select 등)로 가지 않는다", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await user.keyboard(OPEN);
    await waitFor(() => expect(termIn("right")).not.toBeNull());
    await user.keyboard("a"); // 파일 목록이면 Quick Select가 시작된다
    expect(screen.queryByRole("status", { name: "빠른 선택" })).toBeNull();
    expect(within(screen.getByRole("listbox", { name: "왼쪽 파일 목록" })).queryAllByRole("option").some((o) => o.getAttribute("data-cursor") === "true" && /sub/.test(o.textContent ?? ""))).toBe(true);
  });

  it("셸이 끝나면 패널이 파일 목록으로 돌아온다", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await user.keyboard(OPEN);
    await waitFor(() => expect(termIn("right")).not.toBeNull());
    const id = [...b.terminals.keys()][0];
    act(() => b.emitTerminalExit(id, 0));
    await waitFor(() => expect(termIn("right")).toBeNull());
    expect(screen.getByRole("listbox", { name: "오른쪽 파일 목록" })).toBeInTheDocument();
    expect(hoisted.engines[0].disposed).toBe(true);
    await user.keyboard(OPEN); // 새 세션
    await waitFor(() => expect(b.terminals.size).toBe(1));
  });

  it("압축 파일 안에서는 열지 않고 알림을 보인다", async () => {
    const b = new FakeBackend().seed({ "/home/a/pack.zip": "PK-pack", "/home/a/pack.zip!/in.txt": "i", "/home/b": null });
    const { user } = await renderApp(b, "linux", { left: "/home/a/pack.zip!", right: "/home/b" });
    await user.keyboard(OPEN);
    expect(await screen.findByText(/압축 파일 안에서는 터미널을 열 수 없습니다/)).toBeInTheDocument();
    expect(b.terminals.size).toBe(0);
    expect(termIn("right")).toBeNull();
  });

  it("검색 결과 같은 가상 탭에서는 열지 않고 알림을 보인다", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await user.keyboard("{Control>}f{/Control}");
    const d = within(await screen.findByRole("dialog", { name: "파일 찾기" }));
    await user.type(d.getByRole("textbox", { name: "파일 마스크(F)" }), "*.txt");
    await user.click(d.getByRole("button", { name: "시작" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "파일 찾기" })).toBeNull());
    await waitFor(() => expect(within(screen.getByRole("listbox", { name: "왼쪽 파일 목록" })).queryAllByRole("option").length).toBeGreaterThan(0));
    await user.keyboard(OPEN);
    expect(await screen.findByText(/가상 탭에서는 터미널을 열 수 없습니다/)).toBeInTheDocument();
    expect(b.terminals.size).toBe(0);
  });
});
