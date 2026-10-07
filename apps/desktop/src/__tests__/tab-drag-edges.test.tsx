import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "@twin-deck/ts-client";
import { renderApp, seedBackend } from "./helpers";

const tab = (path: string) => ({ path, cursorName: null, selection: [], sort: null, view: { mode: "table" as const, count: 1 as const } });
const snapshot: Snapshot = {
  version: 1,
  activePane: "left",
  showHidden: false,
  paletteQuery: "",
  split: 500,
  previewRect: null,
  left: { tabs: [tab("/home/a"), tab("/home/a/docs"), tab("/home/a/src")], active: 0 },
  right: { tabs: [tab("/home/b")], active: 0 },
};
const tabs = () => within(screen.getAllByRole("tablist")[0]).getAllByRole("tab");
const labels = () => tabs().map((t) => t.textContent);

// 레이아웃이 있는 상태를 흉내 낸다: 폭 50·80·60, 탭 사이 틈 4px. 탭 0 [0,50) · 탭 1 [54,134) · 탭 2 [138,198)
const RECTS = [
  { left: 0, right: 50 },
  { left: 54, right: 134 },
  { left: 138, right: 198 },
];
beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const list = this.closest('[role="tablist"]');
    const i = this.getAttribute("role") === "tab" && list ? Array.from(list.querySelectorAll('[role="tab"]')).indexOf(this) : -1;
    const r = RECTS[i];
    return r ? ({ ...r, width: r.right - r.left, top: 0, bottom: 20, height: 20, x: r.left, y: 0, toJSON() {} } as DOMRect) : ({ left: 0, right: 0, width: 0, top: 0, bottom: 0, height: 0, x: 0, y: 0, toJSON() {} } as DOMRect);
  });
});
afterEach(() => vi.restoreAllMocks());

const press = (el: Element, x: number) => fireEvent.mouseDown(el, { button: 0, buttons: 1, clientX: x, clientY: 10 });
const move = (el: Element, x: number, buttons = 1) => fireEvent.mouseMove(el, { buttons, clientX: x, clientY: 10 });
const release = (el: Element, x: number) => fireEvent.mouseUp(el, { button: 0, buttons: 0, clientX: x, clientY: 10 });
const setup = () => renderApp(seedBackend(), undefined, undefined, { snapshot });

describe("탭 끌기 경계 처리", () => {
  it("탭 사이 틈(4px)에서 놓으면 가장 가까운 탭 자리로 간다(맨 끝으로 튀지 않는다)", async () => {
    await setup();
    let [t0, t1] = tabs();
    press(t0, 25);
    move(t1, 51); // 틈 [50,54)에서 탭 0 쪽이 더 가깝다
    release(t1, 51);
    expect(labels()).toEqual(["a", "docs", "src"]);
    [t0, t1] = tabs();
    press(t0, 25);
    move(t1, 53); // 탭 1 쪽이 더 가깝다
    release(t1, 53);
    await waitFor(() => expect(labels()).toEqual(["docs", "a", "src"]));
  });

  it("끌린 탭이 맨 앞이면 사이 탭들은 끌린 탭 폭 + 틈(54px)만큼 왼쪽으로 비킨다", async () => {
    await setup();
    const [t0, t1, t2] = tabs();
    press(t0, 25);
    move(t2, 160);
    expect(t0.style.transform).toBe("translateX(135px)");
    expect(t1.style.transform).toBe("translateX(-54px)");
    expect(t2.style.transform).toBe("translateX(-54px)");
    release(t2, 160);
    await waitFor(() => expect(labels()).toEqual(["docs", "src", "a"]));
  });

  it("끌린 탭이 맨 끝이면 사이 탭들은 끌린 탭 폭 + 틈(64px)만큼 오른쪽으로 비킨다", async () => {
    await setup();
    const [t0, t1, t2] = tabs();
    press(t2, 160);
    move(t0, 10);
    expect(t0.style.transform).toBe("translateX(64px)");
    expect(t1.style.transform).toBe("translateX(64px)");
    release(t0, 10);
    await waitFor(() => expect(labels()).toEqual(["src", "a", "docs"]));
    void t2;
  });

  it("끄는 중 Esc를 누르면 취소된다: 변형이 지워지고 놓아도 순서가 그대로다", async () => {
    await setup();
    const [t0, , t2] = tabs();
    press(t0, 25);
    move(t2, 160);
    expect(t0.style.transform).not.toBe("");
    fireEvent.keyDown(window, { key: "Escape" });
    for (const t of tabs()) expect(t.style.transform).toBe("");
    release(t2, 160);
    expect(labels()).toEqual(["a", "docs", "src"]);
  });

  it("끄는 중 창이 포커스를 잃으면(blur) 취소된다", async () => {
    await setup();
    const [t0, , t2] = tabs();
    press(t0, 25);
    move(t2, 160);
    fireEvent.blur(window);
    for (const t of tabs()) expect(t.style.transform).toBe("");
    release(t2, 160);
    expect(labels()).toEqual(["a", "docs", "src"]);
  });

  it("마우스 버튼이 이미 떼어진 채(mouseup 유실) mousemove가 오면 끌기가 끝나고 탭이 따라오지 않는다", async () => {
    await setup();
    const [t0, , t2] = tabs();
    press(t0, 25);
    move(t2, 160);
    move(t2, 170, 0); // buttons: 0 — 버튼이 떼어졌다
    for (const t of tabs()) expect(t.style.transform).toBe("");
    move(t2, 180); // 이후 움직임에도 따라오지 않는다
    expect(t0.style.transform).toBe("");
    release(t2, 180);
    expect(labels()).toEqual(["a", "docs", "src"]);
  });
});
