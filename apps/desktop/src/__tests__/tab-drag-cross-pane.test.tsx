import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "@twin-deck/ts-client";
import { renderApp, seedBackend } from "./helpers";

const tab = (path: string) => ({ path, cursorName: null, selection: [], sort: null, view: { mode: "table" as const, count: 1 as const } });
const snapshot = (leftTabs: string[], rightTabs: string[]): Snapshot => ({
  version: 1,
  activePane: "left",
  showHidden: false,
  paletteQuery: "",
  split: 500,
  previewRect: null,
  left: { tabs: leftTabs.map(tab), active: 0 },
  right: { tabs: rightTabs.map(tab), active: 0 },
});
const lists = () => screen.getAllByRole("tablist");
const names = (i: number) => within(lists()[i]).getAllByRole("tab").map((t) => t.textContent);
const tabsOf = (i: number) => within(lists()[i]).getAllByRole("tab");

// 레이아웃 흉내: 왼쪽 탭 줄 x [0,200], 오른쪽 탭 줄 x [300,500], 높이 [0,20]. 탭은 줄 안에서 폭 50, 틈 4px.
const BARS = [
  { left: 0, right: 200 },
  { left: 300, right: 500 },
];
beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const zero = { left: 0, right: 0, width: 0, top: 0, bottom: 0, height: 0, x: 0, y: 0, toJSON() {} } as DOMRect;
    const role = this.getAttribute("role");
    const bar = this.closest('[role="tablist"]');
    const barIndex = bar ? Array.from(document.querySelectorAll('[role="tablist"]')).indexOf(bar) : -1;
    if (role === "tablist") {
      const b = BARS[Array.from(document.querySelectorAll('[role="tablist"]')).indexOf(this)];
      return b ? ({ ...b, width: b.right - b.left, top: 0, bottom: 20, height: 20, x: b.left, y: 0, toJSON() {} } as DOMRect) : zero;
    }
    if (role === "tab" && bar && BARS[barIndex]) {
      const i = Array.from(bar.querySelectorAll('[role="tab"]')).indexOf(this);
      const left = BARS[barIndex].left + i * 54;
      return { left, right: left + 50, width: 50, top: 0, bottom: 20, height: 20, x: left, y: 0, toJSON() {} } as DOMRect;
    }
    return zero;
  });
});
afterEach(() => vi.restoreAllMocks());

const press = (el: Element, x: number) => fireEvent.mouseDown(el, { button: 0, buttons: 1, clientX: x, clientY: 10 });
const move = (el: Element, x: number, y = 10) => fireEvent.mouseMove(el, { buttons: 1, clientX: x, clientY: y });
const release = (el: Element, x: number, y = 10) => fireEvent.mouseUp(el, { button: 0, buttons: 0, clientX: x, clientY: y });
const setup = (left: string[], right: string[]) => renderApp(seedBackend(), undefined, undefined, { snapshot: snapshot(left, right) });

describe("탭을 다른 패널로 끌기", () => {
  it("왼쪽 탭이 둘 이상이면 오른쪽 탭 줄에 놓은 자리로 이동한다", async () => {
    await setup(["/home/a", "/home/a/docs", "/home/a/src"], ["/home/b"]);
    expect(names(0)).toEqual(["a", "docs", "src"]);
    const docs = tabsOf(0)[1];
    press(docs, 80);
    move(docs, 330); // 오른쪽 탭 줄 위, 오른쪽 첫 탭(300~350) 안쪽 오른쪽 가까이
    release(docs, 345);
    await waitFor(() => expect(names(0)).toEqual(["a", "src"]));
    expect(names(1)).toContain("docs");
    expect(names(1)).toHaveLength(2);
  });

  it("왼쪽이 탭 하나뿐이면 복사한다: 왼쪽은 그대로, 오른쪽에 같은 이름의 탭이 생긴다", async () => {
    await setup(["/home/a"], ["/home/b"]);
    const only = tabsOf(0)[0];
    press(only, 25);
    move(only, 320);
    release(only, 320);
    await waitFor(() => expect(names(1)).toHaveLength(2));
    expect(names(0)).toEqual(["a"]);
    expect(names(1)).toContain("a");
  });

  it("끄는 동안 반대쪽 탭 줄이 놓일 곳으로 표시된다(data-drop-target)", async () => {
    await setup(["/home/a", "/home/a/docs"], ["/home/b"]);
    const t = tabsOf(0)[0];
    press(t, 25);
    move(t, 320);
    expect(lists()[1].getAttribute("data-drop-target")).toBe("true");
    expect(lists()[0].getAttribute("data-drop-target")).toBeNull();
    move(t, 100); // 자기 패널로 돌아오면 표시가 사라진다
    expect(lists()[1].getAttribute("data-drop-target")).toBeNull();
    release(t, 25);
  });

  it("반대쪽 탭 줄 위에서 Esc를 누르면 아무것도 바뀌지 않는다", async () => {
    await setup(["/home/a", "/home/a/docs"], ["/home/b"]);
    const t = tabsOf(0)[0];
    press(t, 25);
    move(t, 320);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(lists()[1].getAttribute("data-drop-target")).toBeNull();
    release(t, 320);
    expect(names(0)).toEqual(["a", "docs"]);
    expect(names(1)).toEqual(["b"]);
  });

  it("탭 줄이 아닌 곳(파일 목록)에서 놓으면 아무것도 바뀌지 않는다", async () => {
    await setup(["/home/a", "/home/a/docs"], ["/home/b"]);
    const t = tabsOf(0)[0];
    press(t, 25);
    move(t, 320, 200);
    release(t, 320, 200);
    expect(names(0)).toEqual(["a", "docs"]);
    expect(names(1)).toEqual(["b"]);
  });
});
