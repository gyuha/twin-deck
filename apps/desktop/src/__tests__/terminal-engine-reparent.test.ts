import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTerminalEngine } from "../lib/terminalEngine";

// 이슈 #96: 이미 열린 엔진에 다른 element로 `open`을 다시 부르면 화면(스크롤 내용)을 그대로 두고 새 자리로 옮겨 붙인다.
// xterm은 한 번만 열 수 있으므로 실제 xterm은 가짜로 바꾸고, 우리 엔진이 `open`·관찰자·정리를 어떻게 다루는지만 본다.
const mocks = vi.hoisted(() => ({
  terminals: [] as { element: HTMLElement; openCalls: HTMLElement[]; refresh: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }[],
  fit: vi.fn(),
  observers: [] as { el: Element | null; disconnected: boolean }[],
}));
vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    rows = 24;
    cols = 80;
    element = document.createElement("div");
    openCalls: HTMLElement[] = [];
    refresh = vi.fn();
    dispose = vi.fn();
    constructor() {
      mocks.terminals.push(this);
    }
    loadAddon() {}
    registerLinkProvider() {}
    attachCustomKeyEventHandler() {}
    onData() {}
    open(el: HTMLElement) {
      this.openCalls.push(el);
      el.appendChild(this.element);
    }
  },
}));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class { fit = mocks.fit; dispose() {} } }));

const fontDescriptor = Object.getOwnPropertyDescriptor(document, "fonts");
const observerDescriptor = Object.getOwnPropertyDescriptor(globalThis, "ResizeObserver");
beforeEach(() => {
  mocks.terminals.length = 0;
  mocks.observers.length = 0;
  mocks.fit.mockClear();
  Object.defineProperty(document, "fonts", { configurable: true, value: { load: vi.fn().mockResolvedValue([]) } });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      entry = { el: null as Element | null, disconnected: false };
      constructor() {
        mocks.observers.push(this.entry);
      }
      observe(el: Element) {
        this.entry.el = el;
      }
      unobserve() {}
      disconnect() {
        this.entry.disconnected = true;
      }
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (observerDescriptor) Object.defineProperty(globalThis, "ResizeObserver", observerDescriptor);
  if (fontDescriptor) Object.defineProperty(document, "fonts", fontDescriptor);
  else Reflect.deleteProperty(document, "fonts");
});

describe("터미널 엔진 재부착 (이슈 #96)", () => {
  it("open을 다른 element로 다시 부르면 xterm은 한 번만 열리고 화면이 새 자리로 옮겨 붙으며 다시 맞춘다", async () => {
    const engine = await createTerminalEngine();
    const a = document.createElement("div");
    const b = document.createElement("div");
    engine.open(a);
    const term = mocks.terminals[0];
    expect(term.openCalls).toEqual([a]);
    expect(a.contains(term.element)).toBe(true);
    const fits = mocks.fit.mock.calls.length;
    engine.open(b);
    expect(term.openCalls).toEqual([a]); // 다시 열지 않았다
    expect(b.contains(term.element)).toBe(true);
    expect(a.contains(term.element)).toBe(false);
    expect(mocks.fit.mock.calls.length).toBeGreaterThan(fits); // 새 자리에 맞춰 다시 맞춘다
    expect(term.refresh).toHaveBeenCalled();
  });

  it("크기 관찰자는 옛 element에서 풀리고 새 element에 걸린다. 같은 element로 다시 불러도 아무 일도 없다", async () => {
    const engine = await createTerminalEngine();
    const a = document.createElement("div");
    const b = document.createElement("div");
    engine.open(a);
    expect(mocks.observers).toHaveLength(1);
    engine.open(a); // 같은 자리: 변화 없음
    expect(mocks.observers).toHaveLength(1);
    engine.open(b);
    expect(mocks.observers).toHaveLength(2);
    expect(mocks.observers[0]).toMatchObject({ el: a, disconnected: true });
    expect(mocks.observers[1]).toMatchObject({ el: b, disconnected: false });
  });

  it("재부착한 뒤 dispose()는 관찰자를 풀고 xterm을 해제한다", async () => {
    const engine = await createTerminalEngine();
    engine.open(document.createElement("div"));
    engine.open(document.createElement("div"));
    engine.dispose();
    expect(mocks.observers[1].disconnected).toBe(true);
    expect(mocks.terminals[0].dispose).toHaveBeenCalledTimes(1);
  });
});
