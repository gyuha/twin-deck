import { describe, expect, it, vi } from "vitest";
import type { Snapshot } from "@twin-deck/ts-client";
import { FakeBackend } from "@twin-deck/ts-client";
import { createAppStore } from "../state/store";

const tab = (path: string) => ({ path, cursorName: null, selection: [], sort: null, view: { mode: "table" as const, count: 1 as const } });
const snap = (left: string[]): Snapshot => ({
  version: 1,
  activePane: "left",
  showHidden: false,
  paletteQuery: "",
  split: 500,
  left: { tabs: left.map(tab), active: 0 },
  right: { tabs: [tab("/home/b")], active: 0 },
});
async function withUsage(left: string[]) {
  const backend = new FakeBackend().seed({ "/home/a/x.txt": "x", "/home/a/docs/d.md": "d", "/home/b/y": "y" });
  backend.searchMode = "manual";
  const app = createAppStore(backend, "/home/a", "/home/b", snap(left));
  await app.api.openVirtual("usage", "Disk Usage: docs", "/home/a/docs", async () => ({ id: await backend.startDiskUsage("/home/a/docs"), warnings: [] }));
  return { app, backend };
}
const L = (app: Awaited<ReturnType<typeof withUsage>>["app"]) => app.store.getState().panes.left;

describe("Disk Usage 탭 나가기 (usageExit)", () => {
  it("다른 탭이 있으면 Disk Usage 탭을 닫고 이웃 탭이 활성이 된다", async () => {
    const { app } = await withUsage(["/home/a", "/home/a/src"]);
    expect(L(app).tabs).toHaveLength(3);
    expect(L(app).tabs[L(app).active].virtual?.kind).toBe("usage");
    await app.api.usageExit();
    expect(L(app).tabs.map((t) => t.path)).toEqual(["/home/a", "/home/a/src"]);
    expect(L(app).tabs.some((t) => t.virtual)).toBe(false);
    expect(L(app).tabs[L(app).active].path).toBe("/home/a/src"); // 닫힌 탭의 이웃(앞쪽 탭)
  });

  it("진행 중인 스캔을 취소한다", async () => {
    const { app, backend } = await withUsage(["/home/a"]);
    const cancel = vi.spyOn(backend, "cancelSearch");
    expect(L(app).tabs[L(app).active].virtual?.running).toBe(true);
    await app.api.usageExit();
    expect(cancel).toHaveBeenCalled();
  });

  it("패널의 유일한 탭이면 닫지 않고 기준 폴더의 일반 탭으로 바뀐다", async () => {
    const { app } = await withUsage(["/home/a"]);
    await app.api.closeTabAt("left", 0); // 원래 탭을 닫아 Disk Usage만 남긴다
    expect(L(app).tabs).toHaveLength(1);
    expect(L(app).tabs[0].virtual?.kind).toBe("usage");
    await app.api.usageExit();
    expect(L(app).tabs).toHaveLength(1);
    expect(L(app).tabs[0].virtual).toBeUndefined();
    expect(L(app).tabs[0].path).toBe("/home/a/docs");
  });

  it("Disk Usage가 아닌 탭에서는 아무것도 바꾸지 않는다(상태 참조가 그대로)", async () => {
    const backend = new FakeBackend().seed({ "/home/a/x.txt": "x", "/home/b/y": "y" });
    const app = createAppStore(backend, "/home/a", "/home/b", snap(["/home/a", "/home/a/src"]));
    const before = app.store.getState().panes;
    await app.api.usageExit();
    expect(app.store.getState().panes).toBe(before);
  });
});
