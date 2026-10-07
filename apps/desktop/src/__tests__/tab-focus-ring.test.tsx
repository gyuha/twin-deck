import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Snapshot } from "@twin-deck/ts-client";
import { renderApp, seedBackend } from "./helpers";

// 이슈 #28: 탭을 클릭한 뒤 미리보기(키보드 조작)를 하면 탭에 브라우저 기본 포커스 링이 테두리로 보인다.
// jsdom은 CSS를 계산하지 않아 링이 실제로 사라지는지는 볼 수 없고, 탭 버튼에 `outline-none`이 붙어 있음만 확인한다.
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

const noRing = () => {
  const tabs = screen.getAllByRole("tab");
  expect(tabs.length).toBeGreaterThanOrEqual(4); // 왼쪽 3개 + 오른쪽 1개
  for (const t of tabs) expect(t.className).toContain("outline-none");
};

describe("탭 포커스 링 (이슈 #28)", () => {
  for (const tab_style of ["underline", "segments"]) {
    it(`${tab_style}: 활성·비활성 탭 모두 기본 포커스 링이 꺼져 있고, 클릭해 포커스를 준 뒤에도 같다`, async () => {
      const b = seedBackend();
      b.setConfig((l) => Object.assign(l.config.behavior.layout, { tab_style }));
      const { user } = await renderApp(b, undefined, undefined, { snapshot: snapshotWithTabs(3) });
      noRing();
      const tabs = screen.getAllByRole("tab");
      await user.click(tabs[1]); // 클릭하면 이 버튼이 포커스를 받는다
      expect(document.activeElement).toBe(screen.getAllByRole("tab")[1]);
      noRing();
    });
  }
});
