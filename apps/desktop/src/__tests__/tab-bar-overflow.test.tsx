import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Snapshot } from "@twin-deck/ts-client";
import { renderApp, seedBackend } from "./helpers";

// 탭이 많아져 패널 폭을 넘을 때: 탭 줄이 가로로 스크롤되고, 탭이 줄어들어 사라지지 않으며, 활성 탭이 보이게 스크롤된다(이슈 #104).
// jsdom은 레이아웃을 계산하지 못한다. 실제 폭 측정은 실제 브라우저로 따로 한다(run.md).

const tab = { path: "/home/a", cursorName: null, selection: [], sort: null, view: { mode: "table" as const, count: 1 } };
/** 왼쪽 패널에 탭 n개를 두고 `active`번째를 활성으로 하는 스냅샷. */
const snapshotWith = (n: number, active: number): Snapshot => ({
  version: 1,
  activePane: "left",
  showHidden: false,
  paletteQuery: "",
  split: 500,
  previewRect: null,
  left: { tabs: Array.from({ length: n }, () => tab), active },
  right: { tabs: [{ ...tab, path: "/home/b" }], active: 0 },
});

type Layout = { style: "underline" | "segments"; position: "top" | "bottom"; closeButton: boolean };
const open = (n: number, active: number, l: Layout) => {
  const b = seedBackend();
  b.setConfig((c) => Object.assign(c.config.behavior.layout, { tab_style: l.style, tab_position: l.position, tab_close_button: l.closeButton }));
  return renderApp(b, "linux", { left: "/home/a", right: "/home/b" }, { snapshot: snapshotWith(n, active) });
};
const leftList = () => within(screen.getByRole("region", { name: "왼쪽 패널" })).getByRole("tablist", { name: "탭" });
const leftTabs = () => within(leftList()).getAllByRole("tab");
/** 탭 줄의 직접 자식(닫기 버튼이 켜지면 탭을 감싸는 div, 아니면 탭 버튼 자체). */
const items = () => Array.from(leftList().children) as HTMLElement[];

const LAYOUTS: Layout[] = [
  { style: "underline", position: "top", closeButton: false },
  { style: "underline", position: "bottom", closeButton: false },
  { style: "segments", position: "top", closeButton: false },
  { style: "segments", position: "bottom", closeButton: false },
  { style: "underline", position: "top", closeButton: true },
  { style: "segments", position: "top", closeButton: true },
];
const name = (l: Layout) => `${l.style}·${l.position}${l.closeButton ? "·닫기 버튼" : ""}`;
// 줄어들지 않거나(shrink-0) 0이 아닌 최소 폭(min-w-24 등)이 있어야 탭이 겹치거나 사라지지 않고 줄 밖으로 스크롤된다.
const cannotCollapse = (el: HTMLElement) => /(^|\s)(shrink-0|min-w-(?!0(\s|$))\S+)/.test(el.className);

// 호출 시점의 상태를 기록한다(재렌더로 DOM 노드가 바뀌어도 어느 패널의 몇 번째 탭이었는지가 남는다).
type Scrolled = { pane: string | null; index: number; selected: string | null };
let scrolled: Scrolled[] = [];
const originalScrollIntoView = Element.prototype.scrollIntoView; // test-setup.ts가 둔 빈 함수. 끝나면 되돌린다.
beforeEach(() => {
  scrolled = [];
  Element.prototype.scrollIntoView = function (this: Element) {
    const list = this.closest('[role="tablist"]');
    scrolled.push({
      pane: list?.getAttribute("data-pane") ?? null,
      index: list ? Array.from(list.querySelectorAll('[role="tab"]')).indexOf(this) : -1,
      selected: this.getAttribute("aria-selected"),
    });
  };
});
afterEach(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
});

describe.each(LAYOUTS)("탭이 많을 때 탭 줄 ($style·$position·닫기 $closeButton)", (l) => {
  it(`${name(l)}: 가로 스크롤 컨테이너이고 모든 탭이 줄어들지 않는다`, async () => {
    await open(40, 39, l);
    expect(leftTabs()).toHaveLength(40);
    expect(leftList().className).toMatch(/(^|\s)overflow-x-auto(\s|$)/);
    expect(leftList().className).toMatch(/(^|\s)overflow-y-hidden(\s|$)/); // 세로 스크롤바는 생기지 않는다
    for (const it of items()) expect(cannotCollapse(it), it.className).toBe(true);
  });

  it(`${name(l)}: 처음부터 뒤쪽 탭이 활성이면 그 탭을 보이게 스크롤한다`, async () => {
    await open(40, 39, l);
    expect(scrolled).toContainEqual({ pane: "left", index: 39, selected: "true" });
  });
});

describe("활성 탭이 바뀔 때", () => {
  it("다른 탭을 누르면 그 탭을 보이게 스크롤한다", async () => {
    const { user } = await open(40, 0, LAYOUTS[0]);
    scrolled = [];
    await user.click(leftTabs()[25]);
    expect(scrolled).toContainEqual({ pane: "left", index: 25, selected: "true" });
  });
});

describe("탭이 적을 때는 기존 모양 그대로", () => {
  it("밑줄형 3개: 탭 사이 gap-1이 있고 탭이 균등 분할(flex-1)이 아니다", async () => {
    await open(3, 0, LAYOUTS[0]);
    expect(leftList().className).toMatch(/(^|\s)gap-1(\s|$)/);
    expect(leftTabs().some((t) => /(^|\s)flex-1(\s|$)/.test(t.className))).toBe(false);
  });

  it("칸형 3개: 탭이 균등 분할(flex-1)이다", async () => {
    await open(3, 0, LAYOUTS[2]);
    expect(items().every((it) => /(^|\s)flex-1(\s|$)/.test(it.className))).toBe(true);
  });
});
