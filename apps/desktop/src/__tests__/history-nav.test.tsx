import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { crumbs } from "./search-helpers";
import { cursorName, entryNames, renderApp } from "./helpers";

// /home/a: docs(sub(deep.txt), d.txt) other a.txt / /home/b: b1(x.txt)
const seed = () =>
  new FakeBackend().seed({
    "/home/a/docs/sub/deep.txt": "d",
    "/home/a/docs/d.txt": "d",
    "/home/a/other/o.txt": "o",
    "/home/a/a.txt": "a",
    "/home/b/b1/x.txt": "x",
  });
const section = (name: "왼쪽 패널" | "오른쪽 패널") => screen.getByRole("region", { name });
const mouse = (el: HTMLElement, button: number) => {
  fireEvent.mouseDown(el, { button });
  fireEvent.mouseUp(el, { button });
};
const BACK = 3;
const FORWARD = 4;
const here = () => crumbs().join("/");
/** 비동기 이동이 있었다면 반영될 시간을 준다(이동하지 않아야 하는 테스트에서 쓴다). */
const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 50)));

describe("마우스 뒤로/앞으로 버튼", () => {
  it("뒤로는 이전 폴더로, 앞으로는 다시 다음 폴더로 간다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{Enter}"); // docs
    await waitFor(() => expect(entryNames("left")).toEqual(["sub", "d.txt"]));
    await user.keyboard("{Enter}"); // sub
    await waitFor(() => expect(entryNames("left")).toEqual(["deep.txt"]));

    mouse(section("왼쪽 패널"), BACK);
    await waitFor(() => expect(entryNames("left")).toEqual(["sub", "d.txt"]));
    expect(cursorName("left")).toBe("sub"); // 방금 나온 폴더에 커서
    mouse(section("왼쪽 패널"), BACK);
    await waitFor(() => expect(entryNames("left")).toEqual(["docs", "other", "a.txt"]));
    expect(cursorName("left")).toBe("docs");

    mouse(section("왼쪽 패널"), FORWARD);
    await waitFor(() => expect(entryNames("left")).toEqual(["sub", "d.txt"]));
    mouse(section("왼쪽 패널"), FORWARD);
    await waitFor(() => expect(entryNames("left")).toEqual(["deep.txt"]));
  });

  it("기록이 없으면 아무 일도 하지 않는다", async () => {
    const { user } = await renderApp(seed());
    const start = here();
    mouse(section("왼쪽 패널"), BACK);
    mouse(section("왼쪽 패널"), FORWARD);
    await settle();
    expect(here()).toBe(start);
    expect(entryNames("left")).toEqual(["docs", "other", "a.txt"]);
  });

  it("뒤로 간 뒤 새 폴더로 이동하면 앞으로 기록이 지워진다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{Enter}"); // docs
    await waitFor(() => expect(entryNames("left")).toEqual(["sub", "d.txt"]));
    mouse(section("왼쪽 패널"), BACK); // a로 돌아감
    await waitFor(() => expect(entryNames("left")).toEqual(["docs", "other", "a.txt"]));
    await user.keyboard("{ArrowDown}{Enter}"); // other (새 이동)
    await waitFor(() => expect(entryNames("left")).toEqual(["o.txt"]));
    mouse(section("왼쪽 패널"), FORWARD); // docs로 갈 수 없다
    await settle();
    expect(entryNames("left")).toEqual(["o.txt"]);
    mouse(section("왼쪽 패널"), BACK);
    await waitFor(() => expect(entryNames("left")).toEqual(["docs", "other", "a.txt"]));
  });

  it("마우스가 있는 패널에 작용한다: 반대 패널의 기록은 그 패널에서만 움직인다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{Tab}{Enter}"); // 오른쪽 패널: b1
    await waitFor(() => expect(entryNames("right")).toEqual(["x.txt"]));
    await user.keyboard("{Tab}{Enter}"); // 왼쪽 패널: docs
    await waitFor(() => expect(entryNames("left")).toEqual(["sub", "d.txt"]));
    // 활성은 왼쪽이지만 오른쪽 패널 위에서 뒤로 버튼을 누른다
    mouse(section("오른쪽 패널"), BACK);
    await waitFor(() => expect(entryNames("right")).toEqual(["b1"]));
    expect(entryNames("left")).toEqual(["sub", "d.txt"]); // 왼쪽은 그대로
  });

  it("탭마다 기록이 따로다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{Enter}"); // 첫 탭: docs
    await waitFor(() => expect(entryNames("left")).toEqual(["sub", "d.txt"]));
    await user.keyboard("{Control>}t{/Control}"); // 새 탭(같은 폴더에서 시작)
    await waitFor(() => expect(entryNames("left")).toEqual(["sub", "d.txt"]));
    mouse(section("왼쪽 패널"), BACK); // 새 탭은 이동한 적이 없으니 기록이 없다
    await settle();
    expect(entryNames("left")).toEqual(["sub", "d.txt"]);
  });

  it("다른 버튼(왼쪽·가운데·오른쪽)은 이동하지 않는다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{Enter}");
    await waitFor(() => expect(entryNames("left")).toEqual(["sub", "d.txt"]));
    for (const b of [0, 1, 2]) mouse(section("왼쪽 패널"), b);
    await settle();
    expect(entryNames("left")).toEqual(["sub", "d.txt"]);
  });
});

describe("뒤로/앞으로 키", () => {
  it("Mod+[ 와 Mod+] (Alt+←/→ 도 같다)", async () => {
    const { user } = await renderApp(seed(), "linux");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(entryNames("left")).toEqual(["sub", "d.txt"]));
    await user.keyboard("{Alt>}{ArrowLeft}{/Alt}");
    await waitFor(() => expect(entryNames("left")).toEqual(["docs", "other", "a.txt"]));
    await user.keyboard("{Alt>}{ArrowRight}{/Alt}");
    await waitFor(() => expect(entryNames("left")).toEqual(["sub", "d.txt"]));
    await user.keyboard("{Control>}[[{/Control}");
    await waitFor(() => expect(entryNames("left")).toEqual(["docs", "other", "a.txt"]));
    await user.keyboard("{Control>}]{/Control}");
    await waitFor(() => expect(entryNames("left")).toEqual(["sub", "d.txt"]));
  });
});
