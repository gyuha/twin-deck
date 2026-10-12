import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";

const leftPane = () => within(screen.getByRole("region", { name: "왼쪽 패널" }));
const headerRow = () => leftPane().getByRole("row", { name: "컬럼 머리글" });

/** jsdom은 레이아웃이 없어 스크롤바 폭이 늘 0이다. 목록(listbox)만 `scrollbar`px 좁은 `clientWidth`를 돌려주게 한다. */
function withScrollbar(scrollbar: number) {
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.getAttribute("role") === "listbox" ? 400 : 0;
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.getAttribute("role") === "listbox" ? 400 - scrollbar : 0;
  });
}

describe("세로 스크롤바가 생겨도 컬럼 헤더가 행과 맞는다", () => {
  afterEach(() => vi.restoreAllMocks());

  it("스크롤바가 자리를 차지하면 헤더 오른쪽에 그 폭만큼 여백을 더한다", async () => {
    withScrollbar(15);
    await renderApp(new FakeBackend().seed({ "/home/a/a.txt": "a", "/home/b": null }));
    await waitFor(() => expect(headerRow().style.paddingRight).toMatch(/^calc\((?=.*15px)(?=.*0\.5rem)/));
  });

  it("스크롤바가 없으면(겹쳐 그리는 스크롤바 포함) 헤더 여백을 따로 주지 않는다", async () => {
    withScrollbar(0);
    await renderApp(new FakeBackend().seed({ "/home/a/a.txt": "a", "/home/b": null }));
    expect(headerRow().style.paddingRight).toBe("");
  });
});
