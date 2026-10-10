import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";

// xterm.js는 jsdom에서 제대로 그려지지 않는다(canvas·크기 측정 없음): 화면 엔진을 가짜로 바꿔 입력·출력·크기가 이어지는지만 본다.
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
    fonts: string[];
  }[],
  created: [] as string[],
}));
vi.mock("../lib/terminalEngine", () => ({
  createTerminalEngine: async (font = "") => {
    hoisted.created.push(font);
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
      fonts: [] as string[],
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
      setFontFamily: (f: string) => void eng.fonts.push(f),
      focus: () => void eng.focused++,
      dispose: () => void (eng.disposed = true),
    };
  },
}));

const OPEN = "{Control>}{Alt>}t{/Alt}{/Control}"; // Alt+Mod+T (linux)
const NEXT_TAB = "{Control>}{Tab}{/Control}";
const CLOSE_TAB = "{Control>}w{/Control}";
/** 보이는 터미널(숨긴 것 제외). */
const shownTerm = (pane: "left" | "right") => document.querySelector(`section[data-pane="${pane}"] [data-terminal][data-shown="true"]`);
const allTerms = (pane: "left" | "right") => document.querySelectorAll(`section[data-pane="${pane}"] [data-terminal]`);
const tabNames = (pane: "left" | "right") => within(screen.getAllByRole("tablist")[pane === "left" ? 0 : 1]).getAllByRole("tab").map((t) => t.textContent);
const backend = () => new FakeBackend().seed({ "/home/a/a.txt": "a", "/home/a/sub/x.txt": "x", "/home/b/b.txt": "b" });
const text = (e: Uint8Array | string) => (typeof e === "string" ? e : new TextDecoder().decode(e));

beforeEach(() => {
  hoisted.engines.length = 0;
  hoisted.created.length = 0;
});

describe("내장 터미널 탭", () => {
  it("Alt+Mod+T가 활성 패널 폴더에서 시작하는 터미널 탭을 반대편 패널의 탭 줄에 만들고 그 탭이 활성이 된다(왼쪽 → 오른쪽)", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    expect(tabNames("right")).toEqual(["b"]);
    await user.keyboard(OPEN);
    await waitFor(() => expect(shownTerm("right")).not.toBeNull());
    expect(tabNames("right")).toEqual(["b", "터미널: a"]); // 파일 탭 b가 그대로 있고 터미널 탭이 더해진다
    expect(tabNames("left")).toEqual(["a"]);
    expect([...b.terminals.values()].map((t) => t.cwd)).toEqual(["/home/a"]);
    // 터미널이 활성인 패널은 파일 목록 대신 터미널을 보인다. 왼쪽 파일 목록은 그대로다.
    expect(screen.queryByRole("listbox", { name: "오른쪽 파일 목록" })).toBeNull();
    expect(screen.getByRole("listbox", { name: "왼쪽 파일 목록" })).toBeInTheDocument();
  });

  it("오른쪽 패널이 활성이면 터미널 탭은 왼쪽에 생기고 cwd는 오른쪽 폴더다", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await user.keyboard("{Tab}");
    await user.keyboard(OPEN);
    await waitFor(() => expect(shownTerm("left")).not.toBeNull());
    expect(tabNames("left")).toEqual(["a", "터미널: b"]);
    expect(shownTerm("right")).toBeNull();
    expect([...b.terminals.values()].map((t) => t.cwd)).toEqual(["/home/b"]);
  });

  it("누를 때마다 새 터미널 탭이다(세션도 새로 열린다)", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await user.keyboard(OPEN);
    await waitFor(() => expect(shownTerm("right")).not.toBeNull());
    await user.keyboard(OPEN); // 터미널 탭이 활성인 채로 누르면 같은 패널에 새 터미널 탭(그 터미널의 폴더에서)
    await waitFor(() => expect(b.terminals.size).toBe(2));
    expect(tabNames("right")).toEqual(["b", "터미널: a", "터미널: a"]);
  });

  it("다른 탭으로 옮기면 터미널은 숨겨지되 세션과 화면은 살아 있고, 돌아오면 그대로 보인다", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await user.keyboard(OPEN);
    await waitFor(() => expect(hoisted.engines[0]?.opened).not.toBeNull());
    const id = [...b.terminals.keys()][0];
    act(() => b.emitTerminalOutput(id, "남아 있어야 함"));
    await user.keyboard(NEXT_TAB); // 터미널 탭에서도 탭 이동 키는 앱이 받는다 → 파일 탭 b
    await waitFor(() => expect(shownTerm("right")).toBeNull());
    expect(screen.getByRole("listbox", { name: "오른쪽 파일 목록" })).toBeInTheDocument();
    expect(allTerms("right")).toHaveLength(1); // 숨겼을 뿐 지우지 않았다
    expect(b.terminals.has(id)).toBe(true);
    expect(hoisted.engines[0].disposed).toBe(false);
    act(() => b.emitTerminalOutput(id, " 숨겨진 동안의 출력"));
    await waitFor(() => expect(hoisted.engines[0].written.map(text).join("")).toBe("남아 있어야 함 숨겨진 동안의 출력"));
    await user.keyboard(NEXT_TAB);
    await waitFor(() => expect(shownTerm("right")).not.toBeNull());
    expect(hoisted.engines).toHaveLength(1);
  });

  it("터미널 탭을 닫으면(Mod+W) 세션이 끝나고 패널은 파일 목록으로 돌아온다", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await user.keyboard(OPEN);
    await waitFor(() => expect(shownTerm("right")).not.toBeNull());
    const id = [...b.terminals.keys()][0];
    await user.keyboard(CLOSE_TAB);
    await waitFor(() => expect(b.terminals.has(id)).toBe(false));
    await waitFor(() => expect(shownTerm("right")).toBeNull());
    expect(tabNames("right")).toEqual(["b"]);
    expect(screen.getByRole("listbox", { name: "오른쪽 파일 목록" })).toBeInTheDocument();
    expect(hoisted.engines[0].disposed).toBe(true);
  });

  it("패널에 터미널 탭만 남아도 닫을 수 있고, 그러면 시작한 폴더를 보는 파일 탭이 된다", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await user.keyboard(OPEN);
    await waitFor(() => expect(shownTerm("right")).not.toBeNull());
    await user.keyboard(NEXT_TAB); // 파일 탭 b
    await user.keyboard(CLOSE_TAB); // 파일 탭 닫기 → 터미널 탭만 남는다
    await waitFor(() => expect(tabNames("right")).toEqual(["터미널: a"]));
    await user.keyboard(CLOSE_TAB);
    await waitFor(() => expect(tabNames("right")).toEqual(["a"]));
    expect(b.terminals.size).toBe(0);
    await waitFor(() => expect(screen.getByRole("listbox", { name: "오른쪽 파일 목록" })).toBeInTheDocument());
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
    await waitFor(() => expect(b.terminals.get(id)).toMatchObject({ cols: 100, rows: 30 }));
    act(() => hoisted.engines[0].emitResize(120, 40));
    await waitFor(() => expect(b.terminals.get(id)).toMatchObject({ cols: 120, rows: 40 }));
  });

  it("터미널 탭이 활성이면 일반 키가 앱 단축키(Quick Select 등)로 가지 않는다", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await user.keyboard(OPEN);
    await waitFor(() => expect(shownTerm("right")).not.toBeNull());
    await user.keyboard("b"); // 파일 목록이면 Quick Select가 시작된다
    expect(screen.queryByRole("status", { name: "빠른 선택" })).toBeNull();
    expect(b.terminals.size).toBe(1);
  });

  it("셸이 끝나면 그 터미널 탭이 사라지고 파일 목록으로 돌아온다", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await user.keyboard(OPEN);
    await waitFor(() => expect(shownTerm("right")).not.toBeNull());
    const id = [...b.terminals.keys()][0];
    act(() => b.emitTerminalExit(id, 0));
    await waitFor(() => expect(shownTerm("right")).toBeNull());
    expect(tabNames("right")).toEqual(["b"]);
    expect(screen.getByRole("listbox", { name: "오른쪽 파일 목록" })).toBeInTheDocument();
    expect(hoisted.engines[0].disposed).toBe(true);
    await user.keyboard("{Tab}"); // 왼쪽(a)으로 돌아가 새로 연다
    await user.keyboard(OPEN);
    await waitFor(() => expect(b.terminals.size).toBe(1));
  });

  it("글꼴은 터미널 글꼴 설정(behavior.terminal_font)을 따르고 바꾸면 열린 터미널에도 반영된다. 미리보기 글꼴과는 무관하다", async () => {
    const b = backend();
    b.setConfig((l) => {
      l.config.behavior.terminal_font = "D2Coding, monospace";
      l.config.behavior.preview_font = "Georgia, serif";
    });
    const { user } = await renderApp(b);
    await user.keyboard(OPEN);
    await waitFor(() => expect(hoisted.engines[0]?.opened).not.toBeNull());
    expect(hoisted.created).toEqual(["D2Coding, monospace"]); // 미리보기 글꼴(Georgia)이 아니다
    await waitFor(() => expect(hoisted.engines[0].fonts.at(-1)).toBe("D2Coding, monospace"));
    act(() => b.setConfig((l) => (l.config.behavior.preview_font = "Verdana")));
    await new Promise((r) => setTimeout(r, 30));
    expect(hoisted.engines[0].fonts.at(-1)).toBe("D2Coding, monospace"); // 미리보기 글꼴을 바꿔도 터미널은 그대로
    act(() => b.setConfig((l) => (l.config.behavior.terminal_font = "Fira Code")));
    await waitFor(() => expect(hoisted.engines[0].fonts.at(-1)).toBe("Fira Code"));
    expect(hoisted.engines).toHaveLength(1);
  });

  it("터미널 탭이 있는 패널에서 설정을 열어도 터미널은 지워지지 않고, 설정에서 바꾼 글꼴이 닫을 때 보인다", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await user.keyboard(OPEN);
    await waitFor(() => expect(hoisted.engines[0]?.opened).not.toBeNull());
    const id = [...b.terminals.keys()][0];
    act(() => b.emitTerminalOutput(id, "지워지면 안 됨"));
    await user.keyboard("{Control>},{/Control}"); // 설정은 활성 패널(터미널이 있는 오른쪽) 자리에 뜬다
    await waitFor(() => expect(shownTerm("right")).toBeNull()); // 숨겨진다
    expect(allTerms("right")).toHaveLength(1); // 하지만 지워지지 않는다
    expect(hoisted.engines).toHaveLength(1);
    expect(hoisted.engines[0].disposed).toBe(false);
    act(() => b.setConfig((l) => (l.config.behavior.terminal_font = "Hack")));
    await waitFor(() => expect(hoisted.engines[0].fonts.at(-1)).toBe("Hack")); // 설정이 떠 있는 동안에도 반영된다
    await user.keyboard("{Escape}");
    await waitFor(() => expect(shownTerm("right")).not.toBeNull());
    expect(hoisted.engines).toHaveLength(1);
    expect(hoisted.engines[0].written.map(text).join("")).toBe("지워지면 안 됨");
  });

  it("압축 파일 안에서는 열지 않고 알림을 보인다", async () => {
    const b = new FakeBackend().seed({ "/home/a/pack.zip": "PK-pack", "/home/a/pack.zip!/in.txt": "i", "/home/b": null });
    const { user } = await renderApp(b, "linux", { left: "/home/a/pack.zip!", right: "/home/b" });
    await user.keyboard(OPEN);
    expect(await screen.findByText(/압축 파일 안에서는 터미널을 열 수 없습니다/)).toBeInTheDocument();
    expect(b.terminals.size).toBe(0);
    expect(tabNames("right")).toEqual(["b"]);
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
