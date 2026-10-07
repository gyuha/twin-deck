import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Snapshot } from "@twin-deck/ts-client";
import { activePane, renderApp, seedBackend } from "./helpers";

const tab = (path: string) => ({ path, cursorName: null, selection: [], sort: null, view: { mode: "table" as const, count: 1 as const } });
const snapshot = (left: string[], right: string[], leftActive = 0, activePane: "left" | "right" = "left"): Snapshot => ({
  version: 1,
  activePane,
  showHidden: false,
  paletteQuery: "",
  split: 500,
  previewRect: null,
  left: { tabs: left.map(tab), active: leftActive },
  right: { tabs: right.map(tab), active: 0 },
});
const setup = (left: string[], right: string[], leftActive = 0) => renderApp(seedBackend(), undefined, undefined, { snapshot: snapshot(left, right, leftActive) });
const list = (i: number) => screen.getAllByRole("tablist")[i];
const tabsOf = (i: number) => within(list(i)).getAllByRole("tab");
const names = (i: number) => tabsOf(i).map((t) => t.textContent);
const selected = (i: number) => tabsOf(i).find((t) => t.getAttribute("aria-selected") === "true")?.textContent;
/** 가운데 버튼 클릭: mousedown → mouseup → auxclick(button 1). 브라우저가 보내는 순서다. */
const middleClick = (el: Element) => {
  fireEvent.mouseDown(el, { button: 1, buttons: 4 });
  fireEvent.mouseUp(el, { button: 1, buttons: 0 });
  fireEvent(el, new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true }));
};
const THREE = ["/home/a", "/home/a/docs", "/home/a/src"];

describe("탭 가운데 클릭으로 닫기", () => {
  it("활성이 아닌 탭을 가운데 클릭하면 그 탭이 닫히고 활성 탭은 그대로다", async () => {
    await setup(THREE, ["/home/b"], 0);
    expect(selected(0)).toBe("a");
    middleClick(tabsOf(0)[2]);
    await waitFor(() => expect(names(0)).toEqual(["a", "docs"]));
    expect(selected(0)).toBe("a");
  });

  it("활성 탭을 가운데 클릭하면 닫히고 이웃 탭이 활성이 된다", async () => {
    await setup(THREE, ["/home/b"], 1);
    expect(selected(0)).toBe("docs");
    middleClick(tabsOf(0)[1]);
    await waitFor(() => expect(names(0)).toEqual(["a", "src"]));
    expect(selected(0)).toBe("src");
  });

  it("탭이 하나뿐이면 가운데 클릭해도 아무 일 없다", async () => {
    await setup(["/home/a"], ["/home/b"]);
    middleClick(tabsOf(0)[0]);
    expect(names(0)).toEqual(["a"]);
  });

  it("오른쪽 패널의 탭도 닫히고 활성 패널은 그대로다", async () => {
    await setup(["/home/a"], ["/home/b", "/home/b/img"]);
    expect(activePane()).toBe("left");
    middleClick(tabsOf(1)[1]);
    await waitFor(() => expect(names(1)).toEqual(["b"]));
    expect(activePane()).toBe("left");
  });

  it("왼쪽 클릭과 오른쪽 클릭(button 2)은 닫지 않는다", async () => {
    await setup(THREE, ["/home/b"]);
    fireEvent.click(tabsOf(0)[1]);
    fireEvent.contextMenu(tabsOf(0)[1], { button: 2 });
    fireEvent(tabsOf(0)[1], new MouseEvent("auxclick", { button: 2, bubbles: true, cancelable: true }));
    expect(names(0)).toEqual(["a", "docs", "src"]);
  });

  it("가운데 버튼 mousedown은 끌기를 시작하지 않고 기본 동작(자동 스크롤)이 막힌다", async () => {
    await setup(THREE, ["/home/b"]);
    const t = tabsOf(0)[0];
    const down = new MouseEvent("mousedown", { button: 1, buttons: 4, bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
    fireEvent(t, down);
    expect(down.defaultPrevented).toBe(true);
    fireEvent.mouseMove(tabsOf(0)[2], { buttons: 4, clientX: 200, clientY: 10 });
    fireEvent.mouseUp(tabsOf(0)[2], { button: 1, buttons: 0, clientX: 200, clientY: 10 });
    expect(names(0)).toEqual(["a", "docs", "src"]); // 순서가 바뀌지 않는다
  });
});
