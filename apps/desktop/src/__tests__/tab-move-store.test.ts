import { describe, expect, it } from "vitest";
import type { Snapshot } from "@twin-deck/ts-client";
import { FakeBackend } from "@twin-deck/ts-client";
import { createAppStore } from "../state/store";

const tab = (path: string) => ({ path, cursorName: null, selection: [], sort: null, view: { mode: "table" as const, count: 1 as const } });
const snap = (active: number): Snapshot => ({
  version: 1,
  activePane: "left",
  showHidden: false,
  paletteQuery: "",
  split: 500,
  left: { tabs: [tab("/home/a"), tab("/home/a/docs"), tab("/home/a/src")], active },
  right: { tabs: [tab("/home/b")], active: 0 },
});
const backend = () => new FakeBackend().seed({ "/home/a/x.txt": "x", "/home/a/docs/d.md": "d", "/home/a/src/m.rs": "m", "/home/b/y.txt": "y" });
const make = (active = 0) => createAppStore(backend(), "/home/a", "/home/b", snap(active));
const paths = (app: ReturnType<typeof make>) => app.store.getState().panes.left.tabs.map((t) => t.path);
const activeId = (app: ReturnType<typeof make>) => {
  const p = app.store.getState().panes.left;
  return p.tabs[p.active].id;
};

describe("탭 순서 바꾸기 (moveTab)", () => {
  it("앞의 탭을 뒤로 옮기면 순서가 바뀐다", () => {
    const app = make();
    app.api.moveTab("left", 0, 2);
    expect(paths(app)).toEqual(["/home/a/docs", "/home/a/src", "/home/a"]);
  });

  it("활성 탭을 옮기면 활성이 새 위치를 따라간다", () => {
    const app = make(0);
    const id = activeId(app);
    app.api.moveTab("left", 0, 2);
    expect(app.store.getState().panes.left.active).toBe(2);
    expect(activeId(app)).toBe(id);
  });

  it("활성이 아닌 탭을 옮겨도 활성 탭은 같은 탭이다", () => {
    const app = make(1);
    const id = activeId(app);
    app.api.moveTab("left", 2, 0);
    expect(paths(app)).toEqual(["/home/a/src", "/home/a", "/home/a/docs"]);
    expect(activeId(app)).toBe(id);
    expect(app.store.getState().panes.left.active).toBe(2);
  });

  it("가상 탭도 그대로 옮긴다", () => {
    const app = make();
    const virtual = { kind: "find" as const, title: "찾기", form: undefined };
    app.store.setState((s) => {
      const tabs = s.panes.left.tabs.map((t, i) => (i === 1 ? { ...t, virtual: virtual as never } : t));
      return { panes: { ...s.panes, left: { ...s.panes.left, tabs } } };
    });
    app.api.moveTab("left", 1, 0);
    expect(app.store.getState().panes.left.tabs[0].virtual).toBeTruthy();
    expect(app.store.getState().panes.left.tabs[1].virtual).toBeUndefined();
  });

  it("범위 밖 인덱스나 제자리는 상태를 바꾸지 않는다", () => {
    const app = make();
    const before = app.store.getState().panes;
    app.api.moveTab("left", 0, 0);
    app.api.moveTab("left", -1, 1);
    app.api.moveTab("left", 0, 3);
    app.api.moveTab("left", 5, 0);
    expect(app.store.getState().panes).toBe(before);
  });
});
