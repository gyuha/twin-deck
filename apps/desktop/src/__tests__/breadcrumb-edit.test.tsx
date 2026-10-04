import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { cursorName, entryNames, renderApp } from "./helpers";
import { crumbs } from "./search-helpers";

// 왼쪽 /home/a: docs(d.txt) other(o.txt) a.txt / 오른쪽 /home/b: b1(x.txt)
const seed = () =>
  new FakeBackend().seed({
    "/home/a/docs/d.txt": "d",
    "/home/a/other/o.txt": "o",
    "/home/a/a.txt": "a",
    "/home/b/b1/x.txt": "x",
  });
const nav = (pane: "left" | "right") => screen.getAllByRole("navigation", { name: "경로" })[pane === "left" ? 0 : 1];
const rightClick = (pane: "left" | "right") => fireEvent.contextMenu(nav(pane));
const box = () => screen.getByRole("textbox", { name: "경로 입력" }) as HTMLInputElement;

describe("경로 표시줄: 오른쪽 클릭으로 직접 입력", () => {
  it("오른쪽 클릭하면 입력 상자로 바뀌고 현재 폴더 경로가 글자로 보이며 전부 선택돼 있다", async () => {
    await renderApp(seed());
    expect(screen.queryByRole("textbox", { name: "경로 입력" })).toBeNull();
    rightClick("left");
    expect(box().value).toBe("/home/a");
    await waitFor(() => expect(box()).toHaveFocus());
    expect([box().selectionStart, box().selectionEnd]).toEqual([0, "/home/a".length]);
  });

  it("경로를 입력하고 Enter를 누르면 그 폴더로 이동하고 입력 상자는 다시 경로 표시줄로 돌아간다", async () => {
    const { user } = await renderApp(seed());
    rightClick("left");
    await user.clear(box());
    await user.type(box(), "/home/a/docs{Enter}");
    await waitFor(() => expect(entryNames("left")).toEqual(["d.txt"]));
    expect(crumbs("left")).toEqual(["/", "home", "a", "docs"]);
    expect(screen.queryByRole("textbox", { name: "경로 입력" })).toBeNull();
  });

  it("Esc는 취소한다: 이동하지 않고 원래 경로 표시줄로 돌아간다", async () => {
    const { user } = await renderApp(seed());
    rightClick("left");
    await user.clear(box());
    await user.type(box(), "/home/a/docs");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: "경로 입력" })).toBeNull();
    expect(entryNames("left")).toEqual(["docs", "other", "a.txt"]);
    expect(crumbs("left")).toEqual(["/", "home", "a"]);
  });

  it("포커스를 잃으면(다른 곳을 클릭하면) 취소한다", async () => {
    const { user } = await renderApp(seed());
    rightClick("left");
    await user.clear(box());
    await user.type(box(), "/home/a/docs");
    fireEvent.blur(box());
    expect(screen.queryByRole("textbox", { name: "경로 입력" })).toBeNull();
    expect(entryNames("left")).toEqual(["docs", "other", "a.txt"]);
  });

  it("없는 경로는 이동하지 않고 알림을 보여 준다", async () => {
    const { user } = await renderApp(seed());
    rightClick("left");
    await user.clear(box());
    await user.type(box(), "/home/a/nope{Enter}");
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(entryNames("left")).toEqual(["docs", "other", "a.txt"]);
  });

  it("입력하는 글자와 방향키가 단축키로 가지 않는다 (빠른 선택·커서 이동 없음)", async () => {
    const { user } = await renderApp(seed());
    expect(cursorName("left")).toBe("docs");
    rightClick("left");
    await user.keyboard("{ArrowDown}{ArrowDown}a");
    expect(screen.queryByRole("status", { name: "빠른 선택" })).toBeNull();
    expect(cursorName("left")).toBe("docs");
    await user.keyboard("{Escape}");
    // 닫은 뒤에는 단축키가 다시 동작한다
    await user.keyboard("{ArrowDown}");
    expect(cursorName("left")).toBe("other");
  });

  it("같은 경로를 그대로 Enter하면 아무 일도 없다", async () => {
    const { user } = await renderApp(seed());
    rightClick("left");
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("textbox", { name: "경로 입력" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(entryNames("left")).toEqual(["docs", "other", "a.txt"]);
  });

  it("오른쪽 패널의 경로 표시줄은 그 패널만 바꾼다", async () => {
    const { user } = await renderApp(seed());
    rightClick("right");
    expect(box().value).toBe("/home/b");
    await user.clear(box());
    await user.type(box(), "/home/b/b1{Enter}");
    await waitFor(() => expect(entryNames("right")).toEqual(["x.txt"]));
    expect(entryNames("left")).toEqual(["docs", "other", "a.txt"]);
  });
});
