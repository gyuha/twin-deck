import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FakeBackend, Snapshot } from "@twin-deck/ts-client";
import { renderApp, seedBackend } from "./helpers";

const tab = (path: string) => ({ path, cursorName: null, selection: [], sort: null, view: { mode: "table" as const, count: 1 } });
/** 왼쪽 패널 탭 이름: a · docs · src, 오른쪽: b · docs(오른쪽이 둘 이상일 때). */
const snapshot = (left: number, right: number): Snapshot => ({
  version: 1,
  activePane: "left",
  showHidden: false,
  paletteQuery: "",
  split: 500,
  previewRect: null,
  left: { tabs: ["/home/a", "/home/a/docs", "/home/a/src"].slice(0, left).map(tab), active: 0 },
  right: { tabs: ["/home/b", "/home/b/docs"].slice(0, right).map(tab), active: 0 },
});
const backend = (on: boolean, style = "underline"): FakeBackend => {
  const b = seedBackend();
  b.setConfig((l) => {
    l.config.behavior.layout.tab_close_button = on;
    l.config.behavior.layout.tab_style = style;
  });
  return b;
};
const pane = (side: "left" | "right") => screen.getByRole("region", { name: side === "left" ? "왼쪽 패널" : "오른쪽 패널" });
const tabs = (side: "left" | "right") => within(pane(side)).getAllByRole("tab");
const closeButtons = (side: "left" | "right") => within(pane(side)).queryAllByRole("button", { name: /^탭 닫기/ });
const render = (b: FakeBackend, left = 3, right = 1) => renderApp(b, undefined, undefined, { snapshot: snapshot(left, right) });

describe("탭 닫기 버튼 (behavior.layout.tab_close_button)", () => {
  it("꺼짐(기본): ✕가 없고 호버해도 나오지 않으며 탭 패딩은 지금과 같다", async () => {
    const { user } = await render(backend(false));
    for (const t of tabs("left")) {
      await user.hover(t);
      expect(t.className).toContain("px-2");
      expect(t.className).not.toContain("px-6");
    }
    expect(closeButtons("left")).toHaveLength(0);
  });

  it("켜짐: 호버한 탭에만 ✕가 있고 마우스를 옮기면 그 탭으로 옮겨 간다", async () => {
    const { user } = await render(backend(true));
    expect(closeButtons("left")).toHaveLength(0);
    await user.hover(tabs("left")[1]);
    expect(closeButtons("left").map((b) => b.getAttribute("aria-label"))).toEqual(["탭 닫기: docs"]);
    await user.hover(tabs("left")[2]);
    expect(closeButtons("left").map((b) => b.getAttribute("aria-label"))).toEqual(["탭 닫기: src"]);
    await user.unhover(tabs("left")[2]);
    expect(closeButtons("left")).toHaveLength(0);
  });

  it("켜짐: 탭이 하나뿐이면 호버해도 ✕가 없지만 대칭 패딩은 그대로다", async () => {
    const { user } = await render(backend(true), 3, 1);
    const only = tabs("right")[0];
    await user.hover(only);
    expect(closeButtons("right")).toHaveLength(0);
    expect(only.className).toContain("px-6");
  });

  it("켜짐: underline·segments 두 모양 모두 좌우 대칭 패딩이다", async () => {
    for (const style of ["underline", "segments"]) {
      await render(backend(true, style));
      for (const t of tabs("left")) {
        expect(t.className).toContain("px-6");
        expect(t.className).not.toContain("pl-");
        expect(t.className).not.toContain("pr-");
      }
      cleanup();
    }
  });

  it("켜짐: ✕를 누르면 그 탭이 닫히고 활성 패널은 바뀌지 않는다(다른 패널의 탭이어도)", async () => {
    const { user } = await render(backend(true), 3, 2);
    await user.hover(tabs("left")[1]);
    fireEvent.click(closeButtons("left")[0]); // user.click의 포인터 이동은 jsdom에서 relatedTarget이 없어 호버가 풀린다(실제 브라우저와 다름)
    await waitFor(() => expect(tabs("left").map((t) => t.textContent)).toEqual(["a", "src"]));
    expect(pane("left")).toHaveAttribute("data-active", "true");
    // 활성이 아닌 오른쪽 패널의 탭을 ✕로 닫아도 활성 패널은 왼쪽 그대로다.
    await user.hover(tabs("right")[1]);
    fireEvent.click(closeButtons("right")[0]);
    await waitFor(() => expect(tabs("right")).toHaveLength(1));
    expect(pane("left")).toHaveAttribute("data-active", "true");
    expect(pane("right")).toHaveAttribute("data-active", "false");
  });

  it("켜짐: ✕를 누른 채 움직여도 탭 끌기가 시작되지 않고, 탭 자체를 누르면 활성이 된다", async () => {
    const { user } = await render(backend(true));
    await user.hover(tabs("left")[1]);
    const x = closeButtons("left")[0];
    fireEvent.mouseDown(x, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.mouseMove(window, { clientX: 300, clientY: 10 });
    fireEvent.mouseUp(window, { clientX: 300, clientY: 10 });
    expect(tabs("left").map((t) => t.textContent)).toEqual(["a", "docs", "src"]);
    await user.click(tabs("left")[2]);
    expect(tabs("left")[2]).toHaveAttribute("aria-selected", "true");
  });
});
