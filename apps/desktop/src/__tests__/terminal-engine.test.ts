import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTerminalEngine, DEFAULT_TERMINAL_FONT, terminalFontFamily } from "../lib/terminalEngine";

const mocks = vi.hoisted(() => ({
  terminals: [] as { options: { fontFamily: string }; refresh: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }[],
  fit: vi.fn(),
}));
vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    rows = 24;
    cols = 80;
    refresh = vi.fn();
    dispose = vi.fn();
    constructor(public options: { fontFamily: string }) { mocks.terminals.push(this); }
    loadAddon() {}
  },
}));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class { fit = mocks.fit; dispose() {} } }));

const fontDescriptor = Object.getOwnPropertyDescriptor(document, "fonts");
const load = vi.fn<(...args: unknown[]) => Promise<unknown>>();
beforeEach(() => {
  mocks.terminals.length = 0;
  mocks.fit.mockClear();
  load.mockReset().mockResolvedValue([]);
  Object.defineProperty(document, "fonts", { configurable: true, value: { load } });
});
afterEach(() => {
  if (fontDescriptor) Object.defineProperty(document, "fonts", fontDescriptor);
  else Reflect.deleteProperty(document, "fonts");
});

function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("터미널 글꼴 적용", () => {
  it("빈 설정은 기본 고정폭 글꼴이고 사용자 목록 뒤에도 고정폭 대체 글꼴을 둔다", () => {
    expect(terminalFontFamily("  ")).toBe(DEFAULT_TERMINAL_FONT);
    for (const font of ["Jetendard", "Wanted Sans", '"Fira Code", D2Coding']) {
      expect(terminalFontFamily(` ${font} `)).toBe(`${font}, ${DEFAULT_TERMINAL_FONT}`);
    }
  });

  it("글꼴 로드가 끝난 뒤 엔진을 만들어 대체 글꼴 폭을 고정하지 않는다", async () => {
    const ready = deferred();
    load.mockReturnValue(ready.promise);
    const creating = createTerminalEngine("Jetendard");
    await vi.waitFor(() => expect(load).toHaveBeenCalledWith(`13px Jetendard, ${DEFAULT_TERMINAL_FONT}`, "MW한글"));
    expect(mocks.terminals).toHaveLength(0);
    ready.resolve([]);
    const engine = await creating;
    expect(mocks.terminals[0].options.fontFamily).toBe(terminalFontFamily("Jetendard"));
    engine.dispose();
  });

  it("글꼴을 바꾸면 다시 맞추고 화면을 갱신하며 비우면 기본 글꼴로 돌아간다", async () => {
    const engine = await createTerminalEngine();
    const term = mocks.terminals[0];
    engine.setFontFamily("Wanted Sans");
    await vi.waitFor(() => expect(term.options.fontFamily).toBe(terminalFontFamily("Wanted Sans")));
    expect(mocks.fit).toHaveBeenCalledTimes(1);
    expect(term.refresh).toHaveBeenCalledWith(0, 23);
    engine.setFontFamily("");
    await vi.waitFor(() => expect(term.options.fontFamily).toBe(DEFAULT_TERMINAL_FONT));
    engine.dispose();
  });

  it("느린 이전 요청이 최근 설정을 덮어쓰지 않고 닫힌 엔진도 갱신하지 않는다", async () => {
    const engine = await createTerminalEngine();
    const term = mocks.terminals[0];
    const old = deferred();
    load.mockReturnValueOnce(old.promise);
    engine.setFontFamily("Jetendard");
    engine.setFontFamily("Menlo");
    await vi.waitFor(() => expect(term.options.fontFamily).toBe(terminalFontFamily("Menlo")));
    old.resolve([]);
    await Promise.resolve();
    await Promise.resolve();
    expect(term.options.fontFamily).toBe(terminalFontFamily("Menlo"));
    const closing = deferred();
    load.mockReturnValueOnce(closing.promise);
    engine.setFontFamily("Wanted Sans");
    engine.dispose();
    closing.resolve([]);
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.fit).toHaveBeenCalledTimes(1);
    expect(term.dispose).toHaveBeenCalledTimes(1);
  });

  it("폰트 로드 오류나 FontFaceSet이 없는 환경에서도 터미널은 열린다", async () => {
    load.mockRejectedValueOnce(new Error("글꼴 로드 실패"));
    const engine = await createTerminalEngine("없는 글꼴");
    expect(mocks.terminals[0].options.fontFamily).toContain(DEFAULT_TERMINAL_FONT);
    engine.dispose();
    Reflect.deleteProperty(document, "fonts");
    const fallback = await createTerminalEngine();
    expect(mocks.terminals[1].options.fontFamily).toBe(DEFAULT_TERMINAL_FONT);
    fallback.dispose();
  });
});
