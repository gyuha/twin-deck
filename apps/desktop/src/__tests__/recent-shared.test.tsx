import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";

const seed = () => new FakeBackend().seed({ "/home/a/x/f": "1", "/home/a/y/f": "1", "/home/a/z/f": "1", "/home/b/p/f": "1", "/home/b/q/f": "1" });
const options = (d: HTMLElement) => within(d).getAllByRole("option").map((o) => o.textContent?.replace(/^\d?/, "").trim());

describe("최근 위치: 공용·유지·개수 설정", () => {
  it("왼쪽 패널과 오른쪽 패널의 이동이 한 목록에 쌓이고 저장된다", async () => {
    const b = seed();
    const { user } = await renderApp(b);
    await user.keyboard("{Enter}"); // 왼쪽: /home/a 의 첫 폴더 x
    await waitFor(() => expect(b.storedState?.recent).toContain("/home/a/x"));
    await user.keyboard("{Tab}{Enter}"); // 오른쪽 패널의 첫 폴더(p)
    await waitFor(() => expect(b.storedState?.recent).toContain("/home/b/p"));
    await user.keyboard("{Alt>}3{/Alt}");
    const d = await screen.findByRole("dialog", { name: "최근 위치" });
    expect(options(d)).toEqual(expect.arrayContaining(["/home/a", "/home/a/x", "/home/b"]));
  });

  it("저장된 최근 위치를 다시 열 때 복원한다", async () => {
    const b = seed();
    const snap = {
      version: 1, activePane: "left" as const, showHidden: false, paletteQuery: "", split: 500, previewRect: null,
      recent: ["/home/a/z", "/home/b/q"],
      left: { tabs: [{ path: "/home/a", cursorName: null, selection: [], sort: null, view: { mode: "table" as const, count: 1 } }], active: 0 },
      right: { tabs: [{ path: "/home/b", cursorName: null, selection: [], sort: null, view: { mode: "table" as const, count: 1 } }], active: 0 },
    };
    const { user } = await renderApp(b, undefined, undefined, { snapshot: snap });
    await user.keyboard("{Alt>}3{/Alt}");
    const d = await screen.findByRole("dialog", { name: "최근 위치" });
    expect(options(d)).toEqual(["/home/b/q", "/home/a/z"]);
  });

  it("recent_limit 개수만 기억한다", async () => {
    const b = seed();
    b.setConfig((l) => (l.config.behavior.layout.recent_limit = 2));
    const { user } = await renderApp(b);
    await user.keyboard("{Enter}{Backspace}{ArrowDown}{Enter}{Backspace}{ArrowDown}{ArrowDown}{Enter}");
    await waitFor(() => expect(b.storedState?.recent?.length).toBe(2));
  });
});
