import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { activePane, renderApp, seedBackend } from "./helpers";

// 탭 줄의 빈 곳을 더블클릭하면 그 패널에 새 탭이 생긴다(탭을 더블클릭해도 만들어지지 않는다).
const list = (i: number) => screen.getAllByRole("tablist")[i];
const tabsOf = (i: number) => within(list(i)).getAllByRole("tab");
const selected = (i: number) => tabsOf(i).findIndex((t) => t.getAttribute("aria-selected") === "true");

describe("탭 줄 빈 곳 더블클릭", () => {
  it("왼쪽 탭 줄의 빈 곳을 더블클릭하면 새 탭이 끝에 생기고 활성이 되며 현재 폴더를 가리킨다", async () => {
    await renderApp(seedBackend());
    expect(tabsOf(0)).toHaveLength(1);
    fireEvent.doubleClick(list(0));
    await waitFor(() => expect(tabsOf(0)).toHaveLength(2));
    expect(selected(0)).toBe(1);
    expect(tabsOf(0).map((t) => t.textContent)).toEqual(["a", "a"]);
    expect(tabsOf(1)).toHaveLength(1);
  });

  it("활성이 아닌 오른쪽 패널의 탭 줄에서도 그 패널에 만들고 그 패널이 활성이 된다", async () => {
    await renderApp(seedBackend());
    expect(activePane()).toBe("left");
    fireEvent.doubleClick(list(1));
    await waitFor(() => expect(tabsOf(1)).toHaveLength(2));
    expect(tabsOf(0)).toHaveLength(1);
    expect(tabsOf(1).map((t) => t.textContent)).toEqual(["b", "b"]);
    expect(activePane()).toBe("right");
  });

  it("탭 자체를 더블클릭해서는 새 탭이 생기지 않는다", async () => {
    await renderApp(seedBackend());
    fireEvent.doubleClick(tabsOf(0)[0]);
    await new Promise((r) => setTimeout(r, 30));
    expect(tabsOf(0)).toHaveLength(1);
  });
});
