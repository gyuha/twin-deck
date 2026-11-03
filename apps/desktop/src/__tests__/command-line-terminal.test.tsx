import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp, seedBackend } from "./helpers";

// xterm.js는 jsdom에서 그려지지 않는다: 화면 엔진을 가짜로 바꿔 입력·출력이 이어지는지만 본다(terminal-pane.test와 같은 방식).
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
      setFontFamily: () => {},
      setTheme: () => {},
      focus: () => {},
      dispose: () => {},
    };
  },
}));

const text = (e: Uint8Array | string) => (typeof e === "string" ? e : new TextDecoder().decode(e));
const popup = () => screen.queryByRole("dialog", { name: "명령어 실행 터미널" });

beforeEach(() => {
  hoisted.engines.length = 0;
});

describe("명령어 줄 터미널 팝업 (이슈 #157)", () => {
  const open = async (on = true) => {
    const b = seedBackend();
    b.setConfig((l) => (l.config.behavior.command_line_terminal = on));
    const r = await renderApp(b);
    const input = await screen.findByRole("textbox", { name: "명령어 줄" });
    return { ...r, backend: b, input };
  };

  it("설정이 켜져 있으면 Enter가 결과 창 대신 터미널 팝업을 열고 탭 폴더에서 명령을 실행한다", async () => {
    const { user, backend, input } = await open();
    await user.type(input, "git status{Enter}");
    expect(await screen.findByRole("dialog", { name: "명령어 실행 터미널" })).toBeInTheDocument();
    expect(backend.terminalLines.map(({ cwd, line }) => ({ cwd, line }))).toEqual([{ cwd: "/home/a", line: "git status" }]);
    expect(backend.shellRuns).toEqual([]);
    expect(screen.queryByRole("dialog", { name: "실행 결과" })).not.toBeInTheDocument();
  });

  it("설정이 꺼져 있으면 기존 결과 창이 뜬다", async () => {
    const { user, backend, input } = await open(false);
    backend.shellResult = { exit_code: 1, output: "boom", timed_out: false };
    await user.type(input, "git status{Enter}");
    expect(await screen.findByRole("dialog", { name: "실행 결과" })).toBeInTheDocument();
    expect(popup()).not.toBeInTheDocument();
    expect(backend.terminalLines).toEqual([]);
  });

  it("실행 중 입력은 pty로 가고 Esc도 팝업을 닫지 않는다", async () => {
    const { user, backend, input } = await open();
    await user.type(input, "top{Enter}");
    await screen.findByRole("dialog", { name: "명령어 실행 터미널" });
    await waitFor(() => expect(hoisted.engines).toHaveLength(1));
    act(() => hoisted.engines[0].emitData("q"));
    await waitFor(() => expect(backend.terminalWrites).toEqual([{ id: backend.terminalLines[0].id, data: "q" }]));
    await user.keyboard("{Escape}");
    expect(popup()).toBeInTheDocument();
  });

  it("명령이 끝나면 종료 안내를 쓰고, 그다음 아무 키나 누르면 닫고 명령어 줄로 포커스가 간다", async () => {
    const { user, backend, input } = await open();
    await user.type(input, "ls{Enter}");
    await screen.findByRole("dialog", { name: "명령어 실행 터미널" });
    await waitFor(() => expect(hoisted.engines).toHaveLength(1));
    const id = backend.terminalLines[0].id;
    const close = vi.spyOn(backend, "terminalClose");
    act(() => backend.emitTerminalOutput(id, "out\r\n"));
    act(() => backend.emitTerminalExit(id, 3));
    await waitFor(() => expect(hoisted.engines[0].written.map(text).join("")).toContain("[종료 코드 3] 아무 키나 누르면 닫힙니다"));
    expect(close).not.toHaveBeenCalled();
    expect(popup()).toBeInTheDocument();
    await user.keyboard("x");
    await waitFor(() => expect(popup()).not.toBeInTheDocument());
    expect(close).toHaveBeenCalledWith(id);
    expect(screen.getByRole("textbox", { name: "명령어 줄" })).toHaveFocus();
  });

  it("실행한 명령은 기록에 남아 ↑로 불러온다", async () => {
    const { user, backend, input } = await open();
    await user.type(input, "ls{Enter}");
    await screen.findByRole("dialog", { name: "명령어 실행 터미널" });
    act(() => backend.emitTerminalExit(backend.terminalLines[0].id, 0));
    await user.keyboard("x");
    await waitFor(() => expect(popup()).not.toBeInTheDocument());
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("textbox", { name: "명령어 줄" })).toHaveValue("ls");
  });

  it("세션 번호를 받기 전에 출력·종료가 와도 출력이 엔진에 가고 종료 안내가 나온다", async () => {
    const { user, backend, input } = await open();
    const orig = backend.terminalOpenLine.bind(backend);
    // 바로 끝나는 명령(echo hi)처럼 terminalOpenLine이 돌려주기 전에 출력과 종료가 먼저 온다.
    vi.spyOn(backend, "terminalOpenLine").mockImplementation(async (...args) => {
      const id = await orig(...args);
      backend.emitTerminalOutput(id, "hi\r\n");
      backend.emitTerminalExit(id, 0);
      return id;
    });
    await user.type(input, "echo hi{Enter}");
    await screen.findByRole("dialog", { name: "명령어 실행 터미널" });
    await waitFor(() => expect(hoisted.engines).toHaveLength(1));
    await waitFor(() => {
      const all = hoisted.engines[0].written.map(text).join("");
      expect(all).toContain("hi\r\n");
      expect(all).toContain("[종료 코드 0] 아무 키나 누르면 닫힙니다");
    });
  });

  it("실행 중에도 머리줄의 중단 버튼으로 세션을 닫고 팝업을 닫아 명령어 줄로 돌아간다", async () => {
    const { user, backend, input } = await open();
    await user.type(input, "sleep 100{Enter}");
    const dlg = await screen.findByRole("dialog", { name: "명령어 실행 터미널" });
    const id = backend.terminalLines[0].id;
    const close = vi.spyOn(backend, "terminalClose");
    await user.click(within(dlg).getByRole("button", { name: "중단" }));
    await waitFor(() => expect(popup()).not.toBeInTheDocument());
    expect(close).toHaveBeenCalledWith(id);
    expect(screen.getByRole("textbox", { name: "명령어 줄" })).toHaveFocus();
  });

  it("앱을 정리(dispose)하면 열린 팝업 세션을 닫아 자식 프로세스를 정리한다", async () => {
    const { user, backend, input } = await open();
    await user.type(input, "sleep 100{Enter}");
    await screen.findByRole("dialog", { name: "명령어 실행 터미널" });
    const id = backend.terminalLines[0].id;
    const close = vi.spyOn(backend, "terminalClose");
    cleanup();
    expect(close).toHaveBeenCalledWith(id);
  });
});
