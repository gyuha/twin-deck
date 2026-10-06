import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FakeBackend, Snapshot } from "@twin-deck/ts-client";
import { renderApp, seedBackend } from "./helpers";

type LayoutCfg = { pane_highlight: boolean; tab_style: string };
const withLayout = (change: Partial<LayoutCfg>): FakeBackend => {
  const b = seedBackend();
  b.setConfig((l) => Object.assign(l.config.behavior.layout, change));
  return b;
};
const pane = (side: "left" | "right") => screen.getByRole("region", { name: side === "left" ? "왼쪽 패널" : "오른쪽 패널" });
const tabs = (side: "left" | "right") => within(pane(side)).getAllByRole("tab");
const tablist = (side: "left" | "right") => within(pane(side)).getByRole("tablist", { name: "탭" });

/** 왼쪽 패널에 탭 n개를 가진 스냅샷. */
const snapshotWithTabs = (n: number): Snapshot => ({
  version: 1,
  activePane: "left",
  showHidden: false,
  paletteQuery: "",
  split: 500,
  previewRect: null,
  left: {
    tabs: Array.from({ length: n }, (_, i) => ({ path: i === 0 ? "/home/a" : `/home/a/${i === 1 ? "docs" : "src"}`, cursorName: null, selection: [], sort: null, view: { mode: "table" as const, count: 1 } })),
    active: 0,
  },
  right: { tabs: [{ path: "/home/b", cursorName: null, selection: [], sort: null, view: { mode: "table" as const, count: 1 } }], active: 0 },
});

describe("패널 테두리 강조 (behavior.layout.pane_highlight)", () => {
  it("켜면(기본) 활성 패널에만 accent 테두리가 있다", async () => {
    await renderApp(withLayout({ pane_highlight: true }));
    expect(pane("left").className).toContain("border-accent");
    expect(pane("right").className).not.toContain("border-accent");
    expect(pane("right").className).toContain("border-transparent");
  });

  it("끄면 두 패널 모두 테두리가 투명이고 폭(border-2)은 그대로다", async () => {
    await renderApp(withLayout({ pane_highlight: false }));
    for (const side of ["left", "right"] as const) {
      expect(pane(side).className).not.toContain("border-accent");
      expect(pane(side).className).toContain("border-transparent");
      expect(pane(side).className).toContain("border-2");
    }
  });

  it("끄더라도 활성 패널 구분(data-active)은 그대로 따라간다", async () => {
    const { user } = await renderApp(withLayout({ pane_highlight: false }));
    expect(pane("left")).toHaveAttribute("data-active", "true");
    expect(pane("right")).toHaveAttribute("data-active", "false");
    await user.keyboard("{Tab}");
    expect(pane("right")).toHaveAttribute("data-active", "true");
    expect(pane("left")).toHaveAttribute("data-active", "false");
  });
});

describe("탭 모양 (behavior.layout.tab_style)", () => {
  it("segments: 탭이 폭을 똑같이 나눠 갖고 활성 탭은 밑줄 없이 배경만 다르다", async () => {
    await renderApp(withLayout({ tab_style: "segments" }), undefined, undefined, { snapshot: snapshotWithTabs(3) });
    const t = tabs("left");
    expect(t).toHaveLength(3);
    for (const tab of t) {
      expect(tab.className).toContain("flex-1");
      expect(tab.className).toContain("min-w-0");
      expect(tab.className).toContain("truncate");
      expect(tab.className).toContain("py-1"); // 글자 높이만큼만 나오지 않게 세로 여백을 준다
    }
    expect(t[0].getAttribute("aria-selected")).toBe("true");
    expect(t[0].className).not.toContain("border-b-2");
    expect(t[0].className).toContain("bg-app-selected");
    expect(t[1].className).not.toContain("bg-app-selected");
  });

  it("underline(기본): 활성 탭에만 밑줄이 있고 폭은 나누지 않는다", async () => {
    await renderApp(withLayout({ tab_style: "underline" }), undefined, undefined, { snapshot: snapshotWithTabs(3) });
    const t = tabs("left");
    expect(t[0].className).toContain("border-b-2");
    expect(t[1].className).not.toContain("border-b-2");
    for (const tab of t) {
      expect(tab.className).not.toContain("flex-1");
      expect(tab.className).not.toContain("py-1"); // 밑줄형의 높이는 그대로
    }
  });

  it("탭이 하나여도 두 모양 모두 그 탭이 활성으로 보인다", async () => {
    await renderApp(withLayout({ tab_style: "segments" }));
    expect(tabs("left")).toHaveLength(1);
    expect(tabs("left")[0].className).toContain("bg-app-selected");
  });

  it("바꿔도 탭 선택 동작은 같다: 다른 탭을 누르면 그 탭이 활성이 된다", async () => {
    const { user } = await renderApp(withLayout({ tab_style: "segments" }), undefined, undefined, { snapshot: snapshotWithTabs(3) });
    await user.click(tabs("left")[1]);
    expect(tabs("left")[1].getAttribute("aria-selected")).toBe("true");
    expect(tabs("left")[1].className).toContain("bg-app-selected");
    expect(tabs("left")[0].className).not.toContain("bg-app-selected");
  });
});

describe("기본값에서는 지금 모양 그대로", () => {
  it("패널·탭의 클래스가 지금과 같다", async () => {
    await renderApp(withLayout({}), undefined, undefined, { snapshot: snapshotWithTabs(2) });
    expect(pane("left").className).toBe("flex min-h-0 min-w-0 flex-1 flex-col border-2 border-accent");
    expect(pane("right").className).toBe("flex min-h-0 min-w-0 flex-1 flex-col border-2 border-transparent");
    expect(tablist("left").className).toBe("flex gap-1 border-b border-app-line px-1 text-sm");
    expect(tabs("left")[0].className).toBe("border-b-2 border-accent px-2 font-semibold");
    expect(tabs("left")[1].className).toBe("px-2 text-ink-faint");
  });
});
