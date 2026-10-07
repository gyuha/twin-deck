import { describe, expect, it } from "vitest";
import type { Snapshot } from "@twin-deck/ts-client";
import { FakeBackend } from "@twin-deck/ts-client";
import { createAppStore } from "../state/store";

const tab = (path: string, extra: object = {}) => ({ path, cursorName: null, selection: [], sort: null, view: { mode: "table" as const, count: 1 as const }, ...extra });
const snap = (left: ReturnType<typeof tab>[], leftActive: number, right: ReturnType<typeof tab>[], rightActive = 0): Snapshot => ({
  version: 1,
  activePane: "left",
  showHidden: false,
  paletteQuery: "",
  split: 500,
  left: { tabs: left, active: leftActive },
  right: { tabs: right, active: rightActive },
});
const backend = () => new FakeBackend().seed({ "/home/a/x.txt": "x", "/home/a/docs/d.md": "d", "/home/a/src/m.rs": "m", "/home/b/y.txt": "y", "/home/b/img/i.png": "i" });
const make = (s: Snapshot) => createAppStore(backend(), "/home/a", "/home/b", s);
const L = (app: ReturnType<typeof make>) => app.store.getState().panes.left;
const R = (app: ReturnType<typeof make>) => app.store.getState().panes.right;
const paths = (p: { tabs: { path: string }[] }) => p.tabs.map((t) => t.path);

const twoLeft = () => make(snap([tab("/home/a"), tab("/home/a/docs", { view: { mode: "columns", count: 2 } }), tab("/home/a/src")], 1, [tab("/home/b"), tab("/home/b/img")], 0));

describe("패널 간 탭 이동·복사 (transferTab)", () => {
  it("원래 패널에 탭이 둘 이상이면 이동한다: 상태를 그대로 가져가고 반대쪽 활성·활성 패널이 바뀐다", async () => {
    const app = twoLeft();
    const moved = L(app).tabs[1];
    const id = moved.id;
    app.store.setState((s) => ({ panes: { ...s.panes, left: { ...s.panes.left, tabs: s.panes.left.tabs.map((t) => (t.id === id ? { ...t, history: ["/home/a", "/home/a/docs"], back: ["/home/a"] } : t)) } } }));
    await app.api.transferTab("left", 1, "right", 1);
    expect(paths(L(app))).toEqual(["/home/a", "/home/a/src"]);
    expect(paths(R(app))).toEqual(["/home/b", "/home/a/docs", "/home/b/img"]);
    const got = R(app).tabs[1];
    expect(got.id).toBe(id);
    expect(got.view).toEqual({ mode: "columns", count: 2 });
    expect(got.history).toEqual(["/home/a", "/home/a/docs"]);
    expect(got.back).toEqual(["/home/a"]);
    expect(R(app).active).toBe(1);
    expect(app.store.getState().activePane).toBe("right");
  });

  it("원래 패널의 활성 탭을 옮기면 그 패널의 활성은 이웃 탭으로 옮겨 가고 탭이 0개가 되지 않는다", async () => {
    const app = twoLeft(); // 활성은 가운데(1)
    await app.api.transferTab("left", 1, "right", 0);
    expect(L(app).tabs.length).toBe(2);
    expect(L(app).tabs[L(app).active].path).toBe("/home/a/src");
    const solo = make(snap([tab("/home/a"), tab("/home/a/docs")], 1, [tab("/home/b")]));
    await solo.api.transferTab("left", 1, "right", 1);
    expect(L(solo).tabs.length).toBe(1);
    expect(L(solo).active).toBe(0);
  });

  it("옮기지 않은 탭이 활성이면 활성은 같은 탭을 계속 가리킨다", async () => {
    const app = make(snap([tab("/home/a"), tab("/home/a/docs"), tab("/home/a/src")], 2, [tab("/home/b")]));
    const activeId = L(app).tabs[2].id;
    await app.api.transferTab("left", 0, "right", 0);
    expect(L(app).tabs[L(app).active].id).toBe(activeId);
  });

  it("원래 패널에 탭이 하나뿐이면 복사한다: 원본은 그대로, 반대쪽에 같은 경로의 새 탭(새 id, 기록 초기화)", async () => {
    const app = make(snap([tab("/home/a/docs", { view: { mode: "columns", count: 3 } })], 0, [tab("/home/b")]));
    const original = L(app).tabs[0];
    await app.api.transferTab("left", 0, "right", 1);
    expect(L(app).tabs).toEqual([original]);
    expect(L(app).tabs[0]).toBe(original);
    expect(paths(R(app))).toEqual(["/home/b", "/home/a/docs"]);
    const copy = R(app).tabs[1];
    expect(copy.id).not.toBe(original.id);
    expect(copy.history).toEqual(["/home/a/docs"]);
    expect(R(app).active).toBe(1);
    expect(app.store.getState().activePane).toBe("right");
  });

  it("가상 탭은 패널 간에 옮기지 않는다(상태 참조가 그대로)", async () => {
    const app = twoLeft();
    app.store.setState((s) => ({ panes: { ...s.panes, left: { ...s.panes.left, tabs: s.panes.left.tabs.map((t, i) => (i === 1 ? { ...t, virtual: { kind: "find", title: "찾기" } as never } : t)) } } }));
    const before = app.store.getState().panes;
    await app.api.transferTab("left", 1, "right", 0);
    expect(app.store.getState().panes).toBe(before);
  });

  it("범위 밖 index나 같은 패널이면 변화가 없고, toIndex는 0..길이로 보정한다", async () => {
    const app = twoLeft();
    const before = app.store.getState().panes;
    await app.api.transferTab("left", 7, "right", 0);
    await app.api.transferTab("left", -1, "right", 0);
    await app.api.transferTab("left", 0, "left", 1);
    expect(app.store.getState().panes).toBe(before);
    await app.api.transferTab("left", 0, "right", 99);
    expect(paths(R(app))).toEqual(["/home/b", "/home/b/img", "/home/a"]);
    await app.api.transferTab("right", 0, "left", -5);
    expect(L(app).tabs[0].path).toBe("/home/b");
  });
});
