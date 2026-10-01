import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "./helpers";

const activeIndex = (pane: 0 | 1 = 0) =>
  within(screen.getAllByRole("tablist")[pane])
    .getAllByRole("tab")
    .findIndex((t) => t.getAttribute("aria-selected") === "true");

describe("탭 전환", () => {
  it("탭을 클릭하면 그 탭이 활성화된다", async () => {
    const { user } = await renderApp();
    await user.keyboard("{Control>}t{/Control}{Control>}t{/Control}");
    expect(activeIndex()).toBe(2);
    await user.click(within(screen.getAllByRole("tablist")[0]).getAllByRole("tab")[0]);
    expect(activeIndex()).toBe(0);
  });

  it("다른 패널의 탭을 클릭하면 그 패널과 탭이 활성화된다", async () => {
    const { user } = await renderApp();
    await user.keyboard("{Tab}{Control>}t{/Control}{Tab}");
    await user.click(within(screen.getAllByRole("tablist")[1]).getAllByRole("tab")[0]);
    expect(activeIndex(1)).toBe(0);
  });

  it("Ctrl+Tab / Ctrl+Shift+Tab으로 탭을 순환한다", async () => {
    const { user } = await renderApp();
    await user.keyboard("{Control>}t{/Control}{Control>}t{/Control}");
    expect(activeIndex()).toBe(2);
    await user.keyboard("{Control>}{Tab}{/Control}");
    expect(activeIndex()).toBe(0);
    await user.keyboard("{Control>}{Shift>}{Tab}{/Shift}{/Control}");
    expect(activeIndex()).toBe(2);
  });
});
