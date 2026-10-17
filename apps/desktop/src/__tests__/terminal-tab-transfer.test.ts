import { describe, expect, it, vi } from "vitest";
import type { Snapshot } from "@twin-deck/ts-client";
import { FakeBackend } from "@twin-deck/ts-client";
import { createAppStore } from "../state/store";

// 이슈 #96: 터미널 탭도 반대편 패널로 끌어 보낼 수 있다(복사 없이 이동, 세션은 그대로).
const tab = (path: string) => ({ path, cursorName: null, selection: [], sort: null, view: { mode: "table" as const, count: 1 as const } });
const snap = (left: ReturnType<typeof tab>[], right: ReturnType<typeof tab>[]): Snapshot => ({
  version: 1,
  activePane: "left",
  showHidden: false,
  paletteQuery: "",
  split: 500,
  left: { tabs: left, active: 0 },
  right: { tabs: right, active: 0 },
});
const seeded = () => new FakeBackend().seed({ "/home/a/x.txt": "x", "/home/a/docs/d.md": "d", "/home/b/y.txt": "y" });

/** 왼쪽이 활성일 때 터미널 탭은 오른쪽 패널 끝에 생긴다: 오른쪽은 [일반 탭, 터미널]. */
async function withTerminal(b = seeded(), leftPath = "/home/a") {
  const app = createAppStore(b, leftPath, "/home/b", snap([tab(leftPath), tab("/home/a/docs")], [tab("/home/b")]));
  await app.api.terminalFocus();
  const terminal = app.store.getState().panes.right.tabs[1];
  expect(terminal.virtual?.kind).toBe("terminal");
  return { b, app, terminal };
}
const L = (app: ReturnType<typeof createAppStore>) => app.store.getState().panes.left;
const R = (app: ReturnType<typeof createAppStore>) => app.store.getState().panes.right;
const jobOf = (t: { virtual?: { kind: string; jobId?: number } }) => t.virtual?.jobId;

describe("터미널 탭 패널 간 이동 (이슈 #96)", () => {
  it("터미널 탭은 이동한다: 같은 탭 id·세션 번호로 대상 자리에 들어가고 대상 패널이 활성이 된다", async () => {
    const { app, terminal } = await withTerminal();
    const job = jobOf(terminal);
    await app.api.transferTab("right", 1, "left", 1);
    expect(R(app).tabs.map((t) => t.id)).not.toContain(terminal.id);
    expect(L(app).tabs).toHaveLength(3);
    const moved = L(app).tabs[1];
    expect(moved.id).toBe(terminal.id);
    expect(jobOf(moved)).toBe(job);
    expect(moved.virtual?.kind).toBe("terminal");
    expect(L(app).active).toBe(1);
    expect(app.store.getState().activePane).toBe("left");
  });

  it("옮겨도 세션은 닫히지 않는다", async () => {
    const { b, app, terminal } = await withTerminal();
    const close = vi.spyOn(b, "terminalClose");
    await app.api.transferTab("right", 1, "left", 0);
    expect(L(app).tabs[0].id).toBe(terminal.id); // 실제로 옮겨졌고
    expect(close).not.toHaveBeenCalled(); // 그래도 세션은 살아 있다
    expect(b.terminals.has(jobOf(terminal)!)).toBe(true);
  });

  it("마지막 탭인 터미널을 옮기면 원래 패널에 터미널이 시작한 폴더를 보는 파일 탭이 채워진다", async () => {
    const { b, app, terminal } = await withTerminal();
    await app.api.closeTabAt("right", 0); // 오른쪽에 터미널만 남긴다
    expect(R(app).tabs).toHaveLength(1);
    await app.api.transferTab("right", 0, "left", 2);
    expect(L(app).tabs.map((t) => t.id)).toContain(terminal.id);
    expect(R(app).tabs).toHaveLength(1);
    const fill = R(app).tabs[0];
    expect(fill.virtual).toBeUndefined();
    expect(fill.path).toBe(terminal.virtual!.base);
    expect(fill.entries.map((e) => e.name)).toEqual(expect.arrayContaining(["docs", "x.txt"])); // 읽혀 있다
    expect(b.terminals.has(jobOf(terminal)!)).toBe(true);
  });

  it("원격 폴더에서 시작한 터미널도 이동한다", async () => {
    const b = seeded().seed({ "sftp://me@h:22/r.txt": "r" });
    await b.setRemoteServers([{ name: "서버", protocol: "sftp", host: "h", port: 22, user: "me", base_dir: "" }]);
    const root = await b.remoteConnect(0, "pw", false);
    const { app, terminal } = await withTerminal(b, root);
    expect(terminal.virtual!.base.startsWith("sftp://")).toBe(true);
    expect(b.terminals.get(jobOf(terminal)!)?.remote).toBe("me@h:22");
    await app.api.transferTab("right", 1, "left", 1);
    expect(L(app).tabs[1].id).toBe(terminal.id);
    expect(R(app).tabs).toHaveLength(1);
    expect(b.terminals.has(jobOf(terminal)!)).toBe(true);
  });

  it("대상 자리가 범위를 벗어나면 끝으로 보정되어 들어간다", async () => {
    const { app, terminal } = await withTerminal();
    await app.api.transferTab("right", 1, "left", 99);
    expect(L(app).tabs.at(-1)?.id).toBe(terminal.id);
    expect(L(app).active).toBe(L(app).tabs.length - 1);
  });

  it("터미널이 아닌 다른 가상 탭(검색 결과 등)은 여전히 옮겨지지 않는다", async () => {
    const { app } = await withTerminal();
    app.store.setState((s) => ({
      panes: { ...s.panes, left: { ...s.panes.left, tabs: s.panes.left.tabs.map((t, i) => (i === 1 ? { ...t, virtual: { kind: "find", title: "찾기" } as never } : t)) } },
    }));
    const before = [L(app).tabs.map((t) => t.id), R(app).tabs.map((t) => t.id)];
    await app.api.transferTab("left", 1, "right", 0);
    expect([L(app).tabs.map((t) => t.id), R(app).tabs.map((t) => t.id)]).toEqual(before);
  });
});
