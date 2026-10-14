import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Loaded } from "@twin-deck/ts-client";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp, seedBackend } from "./helpers";

function seed(position: "top" | "bottom" | null, style: "underline" | "segments" = "underline") {
  const b: FakeBackend = seedBackend();
  b.setConfig((l: Loaded) => {
    if (position) l.config.behavior.layout.tab_position = position;
    l.config.behavior.layout.tab_style = style;
  });
  return b;
}
const pane = (side: "왼쪽" | "오른쪽") => within(screen.getByRole("region", { name: `${side} 패널` }));
/** 탭 막대가 목록보다 앞(위)이면 "top", 뒤(아래)면 "bottom". 위치는 DOM 순서로만 정해진다. */
function placement(side: "왼쪽" | "오른쪽") {
  const tabs = pane(side).getByRole("tablist");
  const list = pane(side).getByRole("listbox");
  return tabs.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING ? "top" : "bottom";
}
const tabsOf = (side: "왼쪽" | "오른쪽") => pane(side).getAllByRole("tab");

describe("탭 막대 위치 (이슈 #67)", () => {
  it("bottom이면 두 패널 모두 탭 막대가 파일 목록 뒤에 있다", async () => {
    await renderApp(seed("bottom"));
    expect(placement("왼쪽")).toBe("bottom");
    expect(placement("오른쪽")).toBe("bottom");
  });

  it("top이거나 설정이 없으면(기본값) 탭 막대가 파일 목록 앞에 있다", async () => {
    await renderApp(seed("top"));
    expect(placement("왼쪽")).toBe("top");
    expect(placement("오른쪽")).toBe("top");
  });

  it("기본 설정에서는 이전과 같이 위에 있다", async () => {
    await renderApp(seedBackend());
    expect(placement("왼쪽")).toBe("top");
  });

  it("underline: 하단이면 막대는 border-t·활성 탭 강조선은 위쪽, 상단이면 border-b·아래쪽", async () => {
    await renderApp(seed("bottom", "underline"));
    const bar = pane("왼쪽").getByRole("tablist");
    expect(bar.className).toContain("border-t");
    expect(bar.className).not.toContain("border-b");
    const active = tabsOf("왼쪽").find((t) => t.getAttribute("aria-selected") === "true")!;
    expect(active.className).toContain("border-t-2");
    expect(active.className).not.toContain("border-b-2");
  });

  it("underline 상단은 이전과 같다(border-b·border-b-2)", async () => {
    await renderApp(seed("top", "underline"));
    const bar = pane("왼쪽").getByRole("tablist");
    expect(bar.className).toContain("border-b");
    expect(bar.className).not.toContain("border-t");
    const active = tabsOf("왼쪽").find((t) => t.getAttribute("aria-selected") === "true")!;
    expect(active.className).toContain("border-b-2");
  });

  it("segments: 하단이면 막대가 border-t, 상단이면 border-b", async () => {
    await renderApp(seed("bottom", "segments"));
    expect(pane("왼쪽").getByRole("tablist").className).toContain("border-t");
    expect(pane("왼쪽").getByRole("tablist").className).not.toContain("border-b");
  });

  it("segments 상단은 border-b", async () => {
    await renderApp(seed("top", "segments"));
    expect(pane("왼쪽").getByRole("tablist").className).toContain("border-b");
    expect(pane("왼쪽").getByRole("tablist").className).not.toContain("border-t");
  });

  for (const position of ["top", "bottom"] as const) {
    it(`${position}에서도 새 탭을 만들면 탭이 2개이고 새 탭이 활성이다(위치와 무관)`, async () => {
      const { user } = await renderApp(seed(position));
      await user.keyboard("{Control>}t{/Control}");
      const tabs = tabsOf("왼쪽");
      expect(tabs).toHaveLength(2);
      expect(tabs.findIndex((t) => t.getAttribute("aria-selected") === "true")).toBe(1);
    });
  }
});
