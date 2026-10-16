import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Loaded } from "@twin-deck/ts-client";
import { FakeBackend } from "@twin-deck/ts-client";
import { entryNames, list, renderApp } from "./helpers";

const T = (d: number) => new Date(2026, 5, d, 12, 30).getTime();

function seed(keep: boolean, column: boolean, change: (l: Loaded) => void = () => {}) {
  const b = new FakeBackend().seed({
    "/home/a/docs/x": "x",
    "/home/a/src/y": "y",
    "/home/a/a.txt": "a",
    "/home/a/b.md": "b",
    "/home/a/c.zip": "c",
    "/home/a/d.txt": "d",
    "/home/b": null,
  });
  for (const [i, f] of ["a.txt", "b.md", "c.zip", "d.txt"].entries()) b.setTimes(`/home/a/${f}`, { modifiedMs: T(i + 1), createdMs: T(i + 1) });
  b.setConfig((l) => {
    l.config.display.relative_date = false;
    if (column) l.config.view.table.columns = ["name", "extension", "size", "modified"];
    l.config.behavior.table.keep_extension = keep;
    change(l);
  });
  return b;
}
const leftPane = () => within(screen.getByRole("region", { name: "왼쪽 패널" }));
const extHeader = () => within(leftPane().getByRole("row", { name: "컬럼 머리글" })).getByRole("columnheader", { name: /확장자/ });
/** 이름 칸 바로 다음 칸(확장자 칸)의 글자. */
const extCell = (name: string) => within(list("left")).getByText(name).nextElementSibling;
const open = (user: Awaited<ReturnType<typeof renderApp>>["user"]) => user.keyboard("{Control>},{/Control}");

describe("확장자 유지 옵션 (이슈 #86)", () => {
  it("컬럼 켬 + 유지 켬: 이름에 확장자가 남고 확장자 칸은 비며 헤더로 정렬된다", async () => {
    const { user } = await renderApp(seed(true, true));
    expect(entryNames("left")).toEqual(["docs", "src", "a.txt", "b.md", "c.zip", "d.txt"]);
    for (const name of ["a.txt", "b.md", "c.zip", "d.txt"]) expect(extCell(name)).toBeEmptyDOMElement();
    await user.click(extHeader());
    await waitFor(() => expect(entryNames("left")).toEqual(["docs", "src", "b.md", "a.txt", "d.txt", "c.zip"]));
    expect(extHeader()).toHaveAttribute("aria-sort", "ascending");
  });

  it("유지 끔(기본): 이름에서 확장자가 빠지고 확장자 칸에 보인다", async () => {
    await renderApp(seed(false, true));
    expect(entryNames("left")).toEqual(["docs", "src", "a", "b", "c", "d"]);
    expect(extCell("a")).toHaveTextContent("txt");
    expect(extCell("b")).toHaveTextContent("md");
  });

  it("컬럼 끔 + 유지 켬: 이름은 그대로 전체이고 확장자 헤더가 없다", async () => {
    await renderApp(seed(true, false));
    expect(entryNames("left")).toEqual(["docs", "src", "a.txt", "b.md", "c.zip", "d.txt"]);
    expect(within(leftPane().getByRole("row", { name: "컬럼 머리글" })).queryByRole("columnheader", { name: /확장자/ })).toBeNull();
  });

  it("설정 화면의 확장자 유지 스위치는 확장자 컬럼 표시 바로 다음 행에 있고 켜면 저장된다", async () => {
    const backend = seed(false, true);
    const { user } = await renderApp(backend);
    await open(user);
    const d = await screen.findByRole("dialog", { name: "설정" });
    await user.click(within(d).getByRole("tab", { name: "목록과 선택" }));
    const keep = within(d).getByRole("group", { name: "확장자 유지" });
    expect(keep.previousElementSibling).toBe(within(d).getByRole("group", { name: "확장자 컬럼 표시" }));
    const sw = within(keep).getByRole("switch", { name: "확장자 유지" });
    expect(sw).toBeEnabled();
    expect(sw).toHaveAttribute("aria-checked", "false");
    await user.click(sw);
    await waitFor(async () => expect((await backend.getConfig()).config.behavior.table.keep_extension).toBe(true));
  });

  it("확장자 컬럼이 꺼져 있으면 확장자 유지 스위치는 비활성이고 눌러도 저장되지 않는다", async () => {
    const backend = seed(false, false);
    const { user } = await renderApp(backend);
    await open(user);
    const d = await screen.findByRole("dialog", { name: "설정" });
    await user.click(within(d).getByRole("tab", { name: "목록과 선택" }));
    const sw = within(within(d).getByRole("group", { name: "확장자 유지" })).getByRole("switch", { name: "확장자 유지" });
    expect(sw).toBeDisabled();
    await user.click(sw);
    expect((await backend.getConfig()).config.behavior.table.keep_extension).toBe(false);
    // 확장자 컬럼을 켜면 활성이 된다.
    await user.click(within(d).getByRole("switch", { name: "확장자 컬럼 표시" }));
    await waitFor(() => expect(within(within(d).getByRole("group", { name: "확장자 유지" })).getByRole("switch", { name: "확장자 유지" })).toBeEnabled());
  });

  it("영어에서는 Keep extension이다", async () => {
    const backend = seed(false, true);
    const { user } = await renderApp(backend);
    await backend.setConfigValue("behavior.language", { kind: "str", value: "en" });
    await open(user);
    const d = await screen.findByRole("dialog", { name: "Settings" });
    await user.click(within(d).getByRole("tab", { name: "List and selection" }));
    expect(within(d).getByRole("group", { name: "Keep extension" })).toBeInTheDocument();
  });
});
