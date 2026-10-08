import { afterEach, describe, expect, it, vi } from "vitest";

// Tauri 웹뷰 모듈을 가짜로 바꿔, TauriBackend가 드래그 앤 드롭 이벤트를 어떻게 받아 올리는지 확인한다.
const hoisted = vi.hoisted(() => ({ handler: null as null | ((e: { payload: unknown }) => void), unlisten: vi.fn() }));
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: (h: (e: { payload: unknown }) => void) => {
      hoisted.handler = h;
      return Promise.resolve(hoisted.unlisten);
    },
  }),
}));

import { TauriBackend, toFileDropEvent } from "./tauri";
import { FakeBackend } from "./fake";

afterEach(() => {
  hoisted.handler = null;
  hoisted.unlisten.mockClear();
  vi.unstubAllGlobals();
});

describe("toFileDropEvent: Tauri 드래그 앤 드롭 이벤트 → FileDropEvent", () => {
  it("enter·drop은 경로를 싣고 물리 좌표를 devicePixelRatio로 나눠 CSS px로 만든다", () => {
    expect(toFileDropEvent({ type: "enter", paths: ["/a/x.txt", "/a/y.txt"], position: { x: 400, y: 200 } }, 2)).toEqual({ type: "enter", paths: ["/a/x.txt", "/a/y.txt"], x: 200, y: 100 });
    expect(toFileDropEvent({ type: "drop", paths: ["/a/x.txt"], position: { x: 300, y: 150 } }, 1.5)).toEqual({ type: "drop", paths: ["/a/x.txt"], x: 200, y: 100 });
  });
  it("over는 경로 없이 좌표만, leave는 좌표 없이 알린다", () => {
    expect(toFileDropEvent({ type: "over", position: { x: 20, y: 10 } }, 2)).toEqual({ type: "over", paths: [], x: 10, y: 5 });
    expect(toFileDropEvent({ type: "leave" }, 2)).toEqual({ type: "leave", paths: [], x: 0, y: 0 });
  });
  it("배율이 0이하이면 1로 본다", () => {
    expect(toFileDropEvent({ type: "over", position: { x: 20, y: 10 } }, 0)).toMatchObject({ x: 20, y: 10 });
  });
});

describe("TauriBackend.onFileDrop", () => {
  it("Tauri 이벤트를 받아 window.devicePixelRatio로 나눈 FileDropEvent로 올리고, 해제하면 구독을 끊는다", async () => {
    vi.stubGlobal("window", { devicePixelRatio: 2 }); // 이 패키지의 테스트는 node 환경이다
    const got: unknown[] = [];
    const off = new TauriBackend().onFileDrop((e) => got.push(e));
    expect(hoisted.handler).not.toBeNull();
    hoisted.handler!({ payload: { type: "drop", paths: ["/Users/me/a.txt"], position: { x: 600, y: 400 } } });
    expect(got).toEqual([{ type: "drop", paths: ["/Users/me/a.txt"], x: 300, y: 200 }]);
    off();
    await Promise.resolve();
    await Promise.resolve();
    expect(hoisted.unlisten).toHaveBeenCalledTimes(1);
  });
});

describe("FakeBackend.onFileDrop", () => {
  it("emitFileDrop으로 보낸 이벤트를 구독자에게 전하고, 해제하면 더 받지 않는다", () => {
    const b = new FakeBackend();
    const got: string[] = [];
    const off = b.onFileDrop((e) => got.push(e.type));
    b.emitFileDrop({ type: "enter", paths: ["/a"], x: 1, y: 2 });
    off();
    b.emitFileDrop({ type: "leave", paths: [], x: 0, y: 0 });
    expect(got).toEqual(["enter"]);
  });
});
