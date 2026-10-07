import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "./helpers";
import { crumbs } from "./search-helpers";

// 왼쪽 /home/a (docs, src, a.txt, b.txt …). 이슈 #22: 경로 표시줄 아래의 `..`(상위 폴더 버튼) 줄을 없앴다.
describe("상위 폴더 `..` 줄이 없다 (이슈 #22)", () => {
  it("두 패널 어디에도 이름이 '상위 폴더'인 버튼이 없다", async () => {
    await renderApp();
    expect(screen.queryAllByRole("button", { name: "상위 폴더" })).toHaveLength(0);
  });

  it("목록 위에 글자가 정확히 '..'인 요소가 없다", async () => {
    await renderApp();
    expect(screen.queryAllByText("..")).toHaveLength(0);
  });

  it("그래도 Backspace로 상위 폴더로 올라간다", async () => {
    const { user } = await renderApp();
    await user.keyboard("{Backspace}");
    await waitFor(() => expect(crumbs("left")).toEqual(["/", "home"]));
  });

  it("그래도 ←로 상위 폴더로 올라간다(여러 컬럼 보기가 아닐 때)", async () => {
    const { user } = await renderApp();
    await user.keyboard("{ArrowLeft}");
    await waitFor(() => expect(crumbs("left")).toEqual(["/", "home"]));
  });

  it("그래도 경로 표시줄의 상위 조각을 누르면 올라간다", async () => {
    const { user } = await renderApp();
    await user.click(within(screen.getAllByRole("navigation", { name: "경로" })[0]).getByRole("button", { name: "home" }));
    await waitFor(() => expect(crumbs("left")).toEqual(["/", "home"]));
  });

  it("루트(/)에서는 Backspace가 아무 일도 하지 않고 오류도 알리지 않는다", async () => {
    const { user } = await renderApp(undefined, "linux", { left: "/", right: "/home/b" });
    expect(crumbs("left")).toEqual(["/"]);
    await user.keyboard("{Backspace}");
    expect(crumbs("left")).toEqual(["/"]);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
