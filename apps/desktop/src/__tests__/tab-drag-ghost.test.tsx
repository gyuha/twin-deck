import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "@twin-deck/ts-client";
import { renderApp, seedBackend } from "./helpers";

// 이슈 #105: 탭을 끌어 탭 줄 밖으로 나가면 스크롤 폭이 늘고 끌린 탭이 스크롤 영역에 가려 보이지 않았다.
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
const ghost = () => document.querySelector<HTMLElement>("[data-tab-ghost]");

// 탭 0 [10,60) · 탭 1 [64,144) · 탭 2 [148,208), 왼쪽 탭 줄은 [0,220)
const RECTS = [
  { left: 10, right: 60 },
  { left: 64, right: 144 },
  { left: 148, right: 208 },
];
const BAR = { left: 0, right: 220 };
const rect = (r: { left: number; right: number }, top: number, bottom: number) =>
  ({ ...r, width: r.right - r.left, top, bottom, height: bottom - top, x: r.left, y: top, toJSON() {} }) as DOMRect;
beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const list = this.closest('[role="tablist"]');
    if (this.getAttribute("role") === "tablist" && this.getAttribute("data-pane") === "left") return rect(BAR, 0, 20);
    const i = this.getAttribute("role") === "tab" && list ? Array.from(list.querySelectorAll('[role="tab"]')).indexOf(this) : -1;
    return RECTS[i] ? rect(RECTS[i], 0, 20) : rect({ left: 0, right: 0 }, 0, 0);
  });
});
afterEach(() => vi.restoreAllMocks());

const press = (el: Element, x: number) => fireEvent.mouseDown(el, { button: 0, buttons: 1, clientX: x, clientY: 10 });
const move = (el: Element, x: number, y = 10) => fireEvent.mouseMove(el, { buttons: 1, clientX: x, clientY: y });
const release = (el: Element, x: number) => fireEvent.mouseUp(el, { button: 0, buttons: 0, clientX: x, clientY: 10 });

// 끌린 탭 버튼 자신의 transform을 보므로, 닫기 버튼(기본 켜짐, 이슈 #148)이 감싸는 칸 없이 탭만 그린다.
const offBackend = () => {
  const b = seedBackend();
  b.setConfig((l) => {
    l.config.behavior.layout.tab_close_button = false;
  });
  return b;
};

describe("탭 끌기의 복제(ghost) (이슈 #105)", () => {
  it("끄는 동안 화면에 고정된 복제가 커서를 따르고, 끌린 탭은 자리만 지키며 보이지 않는다", async () => {
    await renderApp(offBackend(), undefined, undefined, { snapshot });
    const [t0] = tabs();
    expect(ghost()).toBeNull();
    press(t0, 30);
    move(t0, 130, 40); // 오른쪽으로 100, 아래로 30
    const g = ghost()!;
    expect(g).not.toBeNull();
    expect(g).toHaveTextContent("a");
    expect(g.style.position).toBe("fixed");
    expect(g.style.left).toBe("110px"); // 10 + 100
    expect(g.style.top).toBe("30px");
    expect(g.style.width).toBe("50px");
    expect(t0.style.visibility).toBe("hidden");
    release(t0, 130);
    expect(ghost()).toBeNull();
  });

  it("복제는 탭 목록의 탭으로 세지 않는다(탭 수·접근성 트리를 늘리지 않는다)", async () => {
    await renderApp(offBackend(), undefined, undefined, { snapshot });
    const [t0] = tabs();
    press(t0, 30);
    move(t0, 130);
    expect(screen.getAllByRole("tablist")[0].querySelectorAll('[role="tab"]')).toHaveLength(3);
    expect(ghost()).toHaveAttribute("aria-hidden", "true");
    release(t0, 130);
  });

  it("탭 줄 밖으로 멀리 끌어도 원래 탭의 이동 거리는 탭 줄 안에 머문다(스크롤 폭이 늘지 않는다)", async () => {
    await renderApp(offBackend(), undefined, undefined, { snapshot });
    const [t0] = tabs();
    press(t0, 30);
    move(t0, 530); // 오른쪽으로 500: 탭 줄 오른쪽 끝(220)을 넘는다
    expect(t0.style.transform).toBe("translateX(160px)"); // 220 - 50 - 10
    expect(ghost()!.style.left).toBe("510px"); // 복제는 커서를 그대로 따른다
    move(t0, -470); // 왼쪽으로 500
    expect(t0.style.transform).toBe("translateX(-10px)"); // 탭 줄 왼쪽 끝(0)
    release(t0, -470);
  });

  it("Esc로 취소해도 복제가 사라진다", async () => {
    await renderApp(offBackend(), undefined, undefined, { snapshot });
    const [t0] = tabs();
    press(t0, 30);
    move(t0, 130);
    expect(ghost()).not.toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(ghost()).toBeNull();
    release(t0, 130);
  });
});
