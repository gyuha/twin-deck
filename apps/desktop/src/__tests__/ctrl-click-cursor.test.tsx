import { within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { cursorName, list, renderApp, selectedNames } from "./helpers";

// 왼쪽 /home/a(이름순): docs src a.txt b.txt 한글.txt
const row = (name: string) => within(list("left")).getAllByRole("option").find((o) => o.textContent?.includes(name))!;

describe("Ctrl/Cmd+클릭 선택: 커서가 클릭한 행에 머문다", () => {
  it("Ctrl+클릭하면 그 행이 선택되고 커서도 그 행에 있다 (다음 행으로 넘어가지 않는다)", async () => {
    const { user } = await renderApp();
    await user.keyboard("{Control>}");
    await user.click(row("a.txt"));
    await user.keyboard("{/Control}");
    expect(selectedNames("left")).toEqual(["a.txt"]);
    expect(cursorName("left")).toBe("a.txt");
  });

  it("macOS의 Cmd+클릭도 같다", async () => {
    const { user } = await renderApp(undefined, "mac");
    await user.keyboard("{Meta>}");
    await user.click(row("b.txt"));
    await user.keyboard("{/Meta}");
    expect(selectedNames("left")).toEqual(["b.txt"]);
    expect(cursorName("left")).toBe("b.txt");
  });

  it("이어서 다른 행을 Ctrl+클릭하면 선택이 늘고 커서는 마지막으로 클릭한 행이다", async () => {
    const { user } = await renderApp();
    await user.keyboard("{Control>}");
    await user.click(row("docs"));
    await user.click(row("b.txt"));
    await user.keyboard("{/Control}");
    expect(selectedNames("left").sort()).toEqual(["b.txt", "docs"]);
    expect(cursorName("left")).toBe("b.txt");
  });

  it("선택된 행을 다시 Ctrl+클릭하면 선택이 풀리고 커서는 그 행에 머문다", async () => {
    const { user } = await renderApp();
    await user.keyboard("{Control>}");
    await user.click(row("a.txt"));
    await user.click(row("a.txt"));
    await user.keyboard("{/Control}");
    expect(selectedNames("left")).toEqual([]);
    expect(cursorName("left")).toBe("a.txt");
  });

  it("키보드(Space)로 선택하면 기존대로 다음 행으로 넘어간다", async () => {
    const { user } = await renderApp();
    await user.keyboard("{ArrowDown}{ArrowDown}"); // a.txt
    await user.keyboard(" ");
    expect(selectedNames("left")).toEqual(["a.txt"]);
    expect(cursorName("left")).toBe("b.txt");
  });

  it("그냥 클릭은 선택 없이 커서만 옮긴다", async () => {
    const { user } = await renderApp();
    await user.click(row("a.txt"));
    expect(selectedNames("left")).toEqual([]);
    expect(cursorName("left")).toBe("a.txt");
  });
});
