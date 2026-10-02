import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { cursorName, entryNames, renderApp } from "./helpers";

const crumbs = () => screen.getAllByRole("navigation", { name: "경로" })[0].textContent;

describe("좌/우 방향키 (표 보기)", () => {
  it("오른쪽 키는 폴더에 들어가고 왼쪽 키는 상위 폴더로 나간다", async () => {
    const backend = new FakeBackend().seed({ "/home/a/docs/in.txt": "x", "/home/a/f.txt": "y", "/home/b": null });
    const { user } = await renderApp(backend);
    expect(cursorName("left")).toBe("docs");
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(entryNames("left")).toEqual(["in.txt"]));
    expect(screen.queryByRole("dialog", { name: /미리보기/ })).toBeNull();
    await user.keyboard("{ArrowLeft}");
    await waitFor(() => expect(entryNames("left")).toEqual(["docs", "f.txt"]));
    expect(crumbs()).toContain("a");
  });

  it("오른쪽 키는 파일에서 미리보기를 연다", async () => {
    const backend = new FakeBackend().seed({ "/home/a/f.txt": "hello", "/home/b": null });
    const { user } = await renderApp(backend);
    await user.keyboard("{ArrowRight}");
    expect(await screen.findByRole("dialog", { name: "미리보기: f.txt" })).toBeTruthy();
  });
});
