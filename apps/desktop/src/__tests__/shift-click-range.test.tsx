import { within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { cursorName, entryNames, list, renderApp, selectedNames } from "./helpers";

const rowAt = (i: number) => within(list("left")).getAllByRole("option")[i];

describe("Shift+클릭 범위 선택", () => {
  it("첫 파일을 누르고 Shift+다른 파일을 누르면 그 사이가 모두 선택된다", async () => {
    const { user } = await renderApp();
    const all = entryNames("left");
    expect(all.length).toBeGreaterThan(4);
    await user.click(rowAt(1));
    await user.keyboard("{Shift>}");
    await user.click(rowAt(4));
    await user.keyboard("{/Shift}");
    expect(selectedNames("left")).toEqual(all.slice(1, 5));
    expect(cursorName("left")).toBe(all[4]);
  });

  it("위쪽으로도 범위가 잡히고 기존 선택은 유지된다", async () => {
    const { user } = await renderApp();
    const all = entryNames("left");
    await user.click(rowAt(0));
    await user.keyboard("{Control>}");
    await user.click(rowAt(0)); // 0번 선택
    await user.keyboard("{/Control}");
    await user.click(rowAt(4));
    await user.keyboard("{Shift>}");
    await user.click(rowAt(2));
    await user.keyboard("{/Shift}");
    expect(selectedNames("left")).toEqual(expect.arrayContaining([all[0], all[2], all[3], all[4]]));
    expect(selectedNames("left")).not.toContain(all[1]);
  });
});
