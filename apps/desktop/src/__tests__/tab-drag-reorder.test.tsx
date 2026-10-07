import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
const selected = () => tabs().findIndex((t) => t.getAttribute("aria-selected") === "true");
const press = (el: Element, x: number) => fireEvent.mouseDown(el, { button: 0, clientX: x, clientY: 10 });
const move = (el: Element, x: number) => fireEvent.mouseMove(el, { clientX: x, clientY: 10 });
const release = (el: Element, x: number) => fireEvent.mouseUp(el, { button: 0, clientX: x, clientY: 10 });
const setup = () => renderApp(seedBackend(), undefined, undefined, { snapshot });

describe("탭 끌어 순서 바꾸기", () => {
  it("탭을 다른 탭 위로 끌어 놓으면 순서가 바뀌고 활성 탭이 따라간다", async () => {
    await setup();
    expect(labels()).toEqual(["a", "docs", "src"]);
    const [first, , last] = tabs();
    press(first, 10);
    move(last, 80);
    release(last, 80);
    await waitFor(() => expect(labels()).toEqual(["docs", "src", "a"]));
    expect(selected()).toBe(2);
  });

  it("활성이 아닌 탭을 옮겨도 활성 탭은 그대로다", async () => {
    await setup();
    const [, , last] = tabs();
    press(last, 80);
    move(tabs()[0], 10);
    release(tabs()[0], 10);
    await waitFor(() => expect(labels()).toEqual(["src", "a", "docs"]));
    expect(selected()).toBe(1);
  });

  it("끌기 임계보다 적게 움직이면 순서가 같고 클릭은 그 탭을 활성으로 한다", async () => {
    const { user } = await setup();
    const t = tabs()[1];
    press(t, 10);
    move(t, 12);
    release(t, 12);
    await user.click(t);
    expect(labels()).toEqual(["a", "docs", "src"]);
    expect(selected()).toBe(1);
  });

  it("제자리에 놓으면 순서가 같다", async () => {
    await setup();
    const t = tabs()[1];
    press(t, 10);
    move(t, 60);
    release(t, 60);
    expect(labels()).toEqual(["a", "docs", "src"]);
  });

  it("끌어 놓은 직후의 클릭은 활성 탭을 바꾸지 않는다", async () => {
    await setup();
    const [first, , last] = tabs();
    press(first, 10);
    move(last, 80);
    release(last, 80);
    fireEvent.click(last);
    await waitFor(() => expect(labels()).toEqual(["docs", "src", "a"]));
    expect(selected()).toBe(2);
  });

  it("끄는 동안 끌린 탭은 커서를 따라 움직이고, 놓으면 원래 위치 표시가 사라진다", async () => {
    await setup();
    const [first, , last] = tabs();
    press(first, 10);
    move(last, 80);
    expect(first.style.transform).toBe("translateX(70px)"); // 커서가 움직인 만큼 따라온다
    expect(tabs()[1].style.transition).toContain("transform"); // 지나는 탭은 비켜 가며 움직인다
    release(last, 80);
    await waitFor(() => expect(labels()).toEqual(["docs", "src", "a"]));
    for (const t of tabs()) expect(t.style.transform).toBe("");
  });
});
