import { describe, expect, it, vi } from "vitest";
import type { Snapshot } from "@twin-deck/ts-client";
import { FakeBackend } from "@twin-deck/ts-client";
import { createAppStore } from "../state/store";

const tab = (path: string) => ({ path, cursorName: null, selection: [], sort: null, view: { mode: "table" as const, count: 1 as const } });
const snap = (left: string[], leftActive: number, right: string[], rightActive = 0): Snapshot => ({
  version: 1,
  activePane: "left",
  showHidden: false,
  paletteQuery: "",
  split: 500,
  left: { tabs: left.map(tab), active: leftActive },
  right: { tabs: right.map(tab), active: rightActive },
});
const make = (s: Snapshot, backend = new FakeBackend().seed({ "/home/a/x": "x", "/home/b/y": "y" })) => ({ app: createAppStore(backend, "/home/a", "/home/b", s), backend });
const L = (app: ReturnType<typeof make>["app"]) => app.store.getState().panes.left;
const paths = (p: { tabs: { path: string }[] }) => p.tabs.map((t) => t.path);
const THREE = ["/home/a", "/home/a/one", "/home/a/two"];

describe("탭 닫기 (closeTabAt)", () => {
  it("활성이 아닌 탭을 닫으면 그 탭만 사라지고 활성 탭은 같은 탭이다", async () => {
    const { app } = make(snap(THREE, 0, ["/home/b"]));
    const id = L(app).tabs[0].id;
    await app.api.closeTabAt("left", 2);
    expect(paths(L(app))).toEqual(["/home/a", "/home/a/one"]);
    expect(L(app).tabs[L(app).active].id).toBe(id);
  });

  it("활성 탭을 닫으면 활성은 이웃(같은 인덱스, 마지막이면 앞)으로 옮겨 간다", async () => {
    const { app } = make(snap(THREE, 1, ["/home/b"]));
    await app.api.closeTabAt("left", 1);
    expect(L(app).tabs[L(app).active].path).toBe("/home/a/two");
    const last = make(snap(THREE, 2, ["/home/b"])).app;
    await last.api.closeTabAt("left", 2);
    expect(last.store.getState().panes.left.tabs[last.store.getState().panes.left.active].path).toBe("/home/a/one");
  });

  it("앞쪽 탭을 닫아도 활성은 같은 탭을 가리킨다", async () => {
    const { app } = make(snap(THREE, 2, ["/home/b"]));
    const id = L(app).tabs[2].id;
    await app.api.closeTabAt("left", 0);
    expect(L(app).tabs[L(app).active].id).toBe(id);
  });

  it("탭이 하나뿐이면 상태 참조가 그대로다", async () => {
    const { app } = make(snap(["/home/a"], 0, ["/home/b"]));
    const before = app.store.getState().panes;
    await app.api.closeTabAt("left", 0);
    expect(app.store.getState().panes).toBe(before);
  });

  it("범위 밖 인덱스는 변화가 없다", async () => {
    const { app } = make(snap(THREE, 0, ["/home/b"]));
    const before = app.store.getState().panes;
    await app.api.closeTabAt("left", 3);
    await app.api.closeTabAt("left", -1);
    expect(app.store.getState().panes).toBe(before);
  });

  it("다른 패널의 탭을 닫아도 활성 패널은 그대로다", async () => {
    const { app } = make(snap(["/home/a"], 0, ["/home/b", "/home/b/img"]));
    expect(app.store.getState().activePane).toBe("left");
    await app.api.closeTabAt("right", 1);
    expect(paths(app.store.getState().panes.right)).toEqual(["/home/b"]);
    expect(app.store.getState().activePane).toBe("left");
  });

  it("가상 탭을 닫으면 진행 중인 스캔을 취소한다", async () => {
    const { app, backend } = make(snap(["/home/a", "/home/a/one"], 0, ["/home/b"]));
    const cancel = vi.spyOn(backend, "cancelSearch");
    backend.searchMode = "manual";
    await app.api.openVirtual("usage", "Disk Usage: a", "/home/a", async () => ({ id: await backend.startDiskUsage("/home/a"), warnings: [] }));
    const idx = L(app).tabs.length - 1;
    expect(L(app).tabs[idx].virtual?.running).toBe(true);
    await app.api.closeTabAt("left", idx);
    expect(cancel).toHaveBeenCalled();
    expect(L(app).tabs.some((t) => t.virtual)).toBe(false);
  });
});
