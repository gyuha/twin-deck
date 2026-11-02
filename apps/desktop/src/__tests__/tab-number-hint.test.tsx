import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Snapshot } from "@twin-deck/ts-client";
import { renderApp, seedBackend } from "./helpers";

const tab = (path: string) => ({ path, cursorName: null, selection: [], sort: null, view: { mode: "table" as const, count: 1 as const } });
const snap = (left: number, right = 2): Snapshot => ({
  version: 1,
  activePane: "left",
  showHidden: false,
  paletteQuery: "",
  split: 500,
  left: { tabs: Array.from({ length: left }, () => tab("/home/a")), active: 0 },
  right: { tabs: Array.from({ length: right }, () => tab("/home/b")), active: 0 },
});
const start = (left: number, platform: "mac" | "windows" = "mac", right = 2) => renderApp(seedBackend(), platform, undefined, { snapshot: snap(left, right) });
const tabsOf = (pane: "left" | "right") => within(document.querySelector(`[role="tablist"][data-pane="${pane}"]`) as HTMLElement).getAllByRole("tab");
/** 각 탭의 번호 배지(없으면 null). */
const badges = (pane: "left" | "right") => tabsOf(pane).map((t) => t.querySelector("[data-tab-number]")?.textContent ?? null);
const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));

const META = { key: "Meta", metaKey: true };
const pressMeta = () => fireEvent.keyDown(window, META);
const releaseMeta = () => fireEvent.keyUp(window, { key: "Meta" });

describe("탭 번호 배지 (이슈 #153)", () => {
  it("mac: Cmd를 누르는 즉시 활성 패널 탭에 차례대로 번호가 붙는다", async () => {
    await start(4);
    pressMeta();
    await wait(0);
    expect(badges("left")).toEqual(["1", "2", "3", "4"]);
  });

  it("탭이 2개면 두 번째 탭은 2다", async () => {
    await start(2);
    pressMeta();
    await wait(0);
    expect(badges("left")).toEqual(["1", "2"]);
  });

  it("탭이 9개면 9번째(마지막) 탭이 9다", async () => {
    await start(9);
    pressMeta();
    await wait(0);
    expect(badges("left")).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  });

  it("Cmd+C처럼 다른 키가 눌리면 배지가 사라진다", async () => {
    await start(3);
    pressMeta();
    await wait(0);
    expect(badges("left")).toEqual(["1", "2", "3"]);
    fireEvent.keyDown(window, { key: "c", metaKey: true });
    await wait(0);
    expect(badges("left")).toEqual([null, null, null]);
  });

  it("Cmd를 떼거나 창이 포커스를 잃으면 사라진다", async () => {
    await start(3);
    pressMeta();
    await wait(0);
    expect(badges("left")).toEqual(["1", "2", "3"]);
    releaseMeta();
    await wait(0);
    expect(badges("left")).toEqual([null, null, null]);

    pressMeta();
    await wait(0);
    expect(badges("left")).toEqual(["1", "2", "3"]);
    fireEvent.blur(window);
    await wait(0);
    expect(badges("left")).toEqual([null, null, null]);
  });

  it("비활성 패널에는 붙지 않고, 탭이 하나뿐인 활성 패널에도 붙지 않는다", async () => {
    await start(1, "mac", 3);
    pressMeta();
    await wait(0);
    expect(badges("left")).toEqual([null]);
    expect(badges("right")).toEqual([null, null, null]);
  });

  it("탭이 9개를 넘으면(12개) 1~8번째와 마지막 탭(9)에만 번호가 붙는다", async () => {
    await start(12);
    pressMeta();
    await wait(0);
    expect(badges("left")).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", null, null, null, "9"]);
  });

  it("Windows: Ctrl+Shift를 누르고 있으면 붙고, Ctrl만 누르면 붙지 않는다", async () => {
    await start(3, "windows");
    fireEvent.keyDown(window, { key: "Control", ctrlKey: true });
    await wait(0);
    expect(badges("left")).toEqual([null, null, null]);
    fireEvent.keyDown(window, { key: "Shift", ctrlKey: true, shiftKey: true });
    await wait(0);
    expect(badges("left")).toEqual(["1", "2", "3"]);
    fireEvent.keyUp(window, { key: "Shift", ctrlKey: true });
    await wait(0);
    expect(badges("left")).toEqual([null, null, null]);
  });

  it("Cmd를 누른 채 숫자로 탭을 옮겨도 배지가 남고, Cmd를 떼면 사라진다", async () => {
    const { user } = await start(4);
    await user.keyboard("{Meta>}");
    await wait(0);
    expect(badges("left")).toEqual(["1", "2", "3", "4"]);
    await user.keyboard("3");
    expect(tabsOf("left")[2].getAttribute("aria-selected")).toBe("true");
    expect(badges("left")).toEqual(["1", "2", "3", "4"]);
    await user.keyboard("9");
    expect(tabsOf("left")[3].getAttribute("aria-selected")).toBe("true");
    expect(badges("left")).toEqual(["1", "2", "3", "4"]);
    await user.keyboard("{/Meta}");
    await wait(0);
    expect(badges("left")).toEqual([null, null, null, null]);
  });

  it("Windows: Ctrl+Shift를 누른 채 숫자로 탭을 옮겨도 배지가 남는다", async () => {
    await start(3, "windows");
    fireEvent.keyDown(window, { key: "Shift", ctrlKey: true, shiftKey: true });
    await wait(0);
    fireEvent.keyDown(window, { key: "@", code: "Digit2", ctrlKey: true, shiftKey: true });
    await wait(0);
    expect(badges("left")).toEqual(["1", "2", "3"]);
    fireEvent.keyDown(window, { key: "A", code: "KeyA", ctrlKey: true, shiftKey: true });
    await wait(0);
    expect(badges("left")).toEqual([null, null, null]);
  });
});
