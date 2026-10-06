import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { list, renderApp } from "./helpers";

// /home/a 이름순(폴더 먼저): realdir(폴더) | a.txt, broken(끊어진 링크), dir-link(폴더 링크), file-link(파일 링크)
const seed = () => {
  const b = new FakeBackend().seed({
    "/home/a/realdir/inner.txt": "i",
    "/home/a/a.txt": "a",
    "/home/b/z.txt": "z",
  });
  b.seedLink("/home/a/dir-link", "/home/a/realdir");
  b.seedLink("/home/a/file-link", "/home/a/a.txt");
  b.seedLink("/home/a/broken", "/home/a/nowhere");
  return b;
};
const breadcrumb = (pane: "left" | "right") =>
  within(screen.getAllByRole("navigation", { name: "경로" })[pane === "left" ? 0 : 1])
    .getAllByRole("button")
    .map((b) => b.textContent);
const rows = () => within(list("left")).getAllByRole("option");
const rowIndex = (name: string) => rows().findIndex((r) => r.textContent?.includes(name));
const goTo = async (user: Awaited<ReturnType<typeof renderApp>>["user"], name: string) => {
  const n = rowIndex(name);
  if (n > 0) await user.keyboard("{ArrowDown}".repeat(n));
};
const names = () => rows().map((r) => r.textContent ?? "");
const IN_LINK = ["/", "home", "a", "dir-link"];

describe("폴더 심볼릭 링크", () => {
  it("Enter로 폴더 링크에 들어가면 링크 경로가 그대로 경로 표시줄에 남는다", async () => {
    const { user } = await renderApp(seed());
    await goTo(user, "dir-link");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(breadcrumb("left")).toEqual(IN_LINK));
    await waitFor(() => expect(names().some((n) => n.includes("inner.txt"))).toBe(true));
  });

  it("더블클릭으로도 들어간다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{ArrowDown}".repeat(rowIndex("dir-link")));
    fireEvent.doubleClick(rows()[rowIndex("dir-link")]);
    await waitFor(() => expect(breadcrumb("left")).toEqual(IN_LINK));
  });

  it("오른쪽 클릭 메뉴의 열기로 들어간다", async () => {
    await renderApp(seed());
    fireEvent.contextMenu(rows()[rowIndex("dir-link")], { clientX: 40, clientY: 40 });
    const menu = screen.getByRole("menu", { name: "컨텍스트 메뉴" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: /^열기/ }));
    await waitFor(() => expect(breadcrumb("left")).toEqual(IN_LINK));
  });

  it("→로도 들어간다(일반 폴더처럼)", async () => {
    const { user } = await renderApp(seed());
    await goTo(user, "dir-link");
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(breadcrumb("left")).toEqual(IN_LINK));
  });

  it("파일 링크와 끊어진 링크는 들어가지 않는다", async () => {
    const b = seed();
    const { user } = await renderApp(b);
    await goTo(user, "broken");
    await user.keyboard("{Enter}");
    await goTo(user, "file-link");
    await user.keyboard("{Enter}");
    expect(breadcrumb("left")).toEqual(["/", "home", "a"]);
  });

  it("일반 폴더는 이전처럼 들어간다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{Enter}"); // 첫 항목 realdir
    await waitFor(() => expect(breadcrumb("left")).toEqual(["/", "home", "a", "realdir"]));
  });
});
