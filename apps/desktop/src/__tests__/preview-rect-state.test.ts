import { describe, expect, it } from "vitest";
import type { Snapshot } from "@twin-deck/ts-client";
import { FakeBackend } from "@twin-deck/ts-client";
import { createAppStore } from "../state/store";

const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  version: 1,
  activePane: "left",
  showHidden: false,
  paletteQuery: "",
  split: 500,
  left: { tabs: [{ path: "/home/a", cursorName: null, selection: [], sort: null, view: { mode: "table", count: 1 } }], active: 0 },
  right: { tabs: [{ path: "/home/b", cursorName: null, selection: [], sort: null, view: { mode: "table", count: 1 } }], active: 0 },
  ...over,
});
const backend = () => new FakeBackend().seed({ "/home/a/x.txt": "x", "/home/b/y.txt": "y" });
const RECT = { x: 120, y: 40, w: 900, h: 600 };

describe("미리보기 창 상태 저장", () => {
  it("스냅샷에 값이 없으면 previewRect는 null(기본 크기·가운데)이다", () => {
    expect(createAppStore(backend(), "/home/a", "/home/b", snap()).store.getState().previewRect).toBeNull();
    expect(createAppStore(backend(), "/home/a", "/home/b", null).store.getState().previewRect).toBeNull();
    expect(createAppStore(backend(), "/home/a", "/home/b", snap({ previewRect: null })).store.getState().previewRect).toBeNull();
  });

  it("스냅샷에 값이 있으면 그 값으로 시작한다", () => {
    const app = createAppStore(backend(), "/home/a", "/home/b", snap({ previewRect: RECT }));
    expect(app.store.getState().previewRect).toEqual(RECT);
  });

  it("값을 바꾸면 자동 저장이 그 값을 담아 나가고, 지우면 null이 나간다", async () => {
    const b = backend();
    const app = createAppStore(b, "/home/a", "/home/b", snap());
    await app.api.init();
    app.api.setPreviewRect(RECT);
    await app.api.saveNow();
    expect(b.savedStates.at(-1)?.previewRect).toEqual(RECT);
    app.api.setPreviewRect(null);
    await app.api.saveNow();
    expect(b.savedStates.at(-1)?.previewRect ?? null).toBeNull();
  });
});
