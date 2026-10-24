import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTerminalEngine } from "../lib/terminalEngine";
import { resolveTheme, terminalTheme } from "../lib/themeColors";

// 이슈 #118: 터미널 색은 앱 테마에서 온다. 실제 xterm은 가짜로 바꾸고 엔진이 넘기는 옵션만 본다.
const mocks = vi.hoisted(() => ({ terminals: [] as { opts: Record<string, unknown>; options: Record<string, unknown> }[] }));
vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    options: Record<string, unknown>;
    constructor(public opts: Record<string, unknown>) {
      this.options = { ...opts };
      mocks.terminals.push(this);
    }
    loadAddon() {}
    registerLinkProvider() {}
    attachCustomKeyEventHandler() {}
  },
}));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class { fit() {} dispose() {} } }));

beforeEach(() => {
  mocks.terminals.length = 0;
  Object.defineProperty(document, "fonts", { configurable: true, value: { load: vi.fn().mockResolvedValue([]) } });
});

describe("terminalTheme", () => {
  const mocha = resolveTheme("catppuccin-mocha", true);
  const latte = resolveTheme("catppuccin-latte", false);

  it("배경·글자·커서는 테마 그대로이고 ANSI 빨강·초록·노랑·파랑은 테마의 상태색이다", () => {
    const c = terminalTheme(mocha);
    expect(c).toMatchObject({ background: mocha.background, foreground: mocha.foreground, cursor: mocha.accent, red: mocha.red, green: mocha.green, yellow: mocha.yellow, blue: mocha.blue });
  });

  it("ANSI 16색이 모두 #rrggbb로 채워진다", () => {
    const c = terminalTheme(latte);
    for (const name of ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"]) {
      expect(c[name]).toMatch(/^#[0-9a-f]{6}$/);
      expect(c["bright" + name[0].toUpperCase() + name.slice(1)]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("밝은 테마와 어두운 테마는 서로 다른 배경을 준다", () => {
    expect(terminalTheme(mocha).background).not.toBe(terminalTheme(latte).background);
  });
});

describe("터미널 엔진 테마", () => {
  const colors = terminalTheme(resolveTheme("catppuccin-mocha", true));

  it("처음 받은 색으로 xterm을 연다", async () => {
    await createTerminalEngine("", () => {}, colors);
    expect(mocks.terminals[0].opts.theme).toEqual(colors);
  });

  it("색을 주지 않으면 xterm 기본 색을 쓴다", async () => {
    await createTerminalEngine();
    expect(mocks.terminals[0].opts).not.toHaveProperty("theme");
  });

  it("setTheme은 열린 xterm의 theme 옵션을 바꾼다", async () => {
    const engine = await createTerminalEngine("", () => {}, colors);
    const next = terminalTheme(resolveTheme("catppuccin-latte", false));
    engine.setTheme(next);
    expect(mocks.terminals[0].options.theme).toEqual(next);
  });
});
