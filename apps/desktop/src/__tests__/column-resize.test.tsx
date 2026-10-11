import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";

function seed(columns?: string[]) {
  const b = new FakeBackend().seed({ "/home/a/a.txt": "a", "/home/a/b.txt": "b", "/home/b": null });
  if (columns) b.setConfig((l) => (l.config.view.table.columns = columns));
  return b;
}
const leftPane = () => within(screen.getByRole("region", { name: "왼쪽 패널" }));
const headerRow = () => leftPane().getByRole("row", { name: "컬럼 머리글" });
const handle = (name: string) => within(headerRow()).getByRole("separator", { name: `${name} 너비 조절` });
const gridOf = (el: HTMLElement) => el.style.gridTemplateColumns;
const columnsOf = async (b: FakeBackend) => (await b.getConfig()).config.view.table.columns;
const drag = (el: HTMLElement, from: number, to: number) => {
  fireEvent.mouseDown(el, { button: 0, clientX: from });
  fireEvent.mouseMove(window, { clientX: to });
};

describe("컬럼 너비 조절 (이슈 #48)", () => {
  it("이름을 뺀 각 컬럼 헤더에만 손잡이가 있다", async () => {
    await renderApp(seed());
    const seps = within(headerRow()).getAllByRole("separator");
    expect(seps.map((s) => s.getAttribute("aria-label"))).toEqual(["크기 너비 조절", "수정 너비 조절"]);
    expect(within(headerRow()).queryByRole("separator", { name: /이름/ })).toBeNull();
  });

  it("파일 행에는 손잡이가 없다", async () => {
    await renderApp(seed());
    const rows = leftPane().getAllByRole("option");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(within(row).queryByRole("separator")).toBeNull();
  });

  it("왼쪽으로 끌면 헤더와 모든 행의 열 너비가 같이 바뀐다", async () => {
    await renderApp(seed(["name", "size:100", "modified"]));
    drag(handle("크기"), 500, 470);
    await waitFor(() => expect(gridOf(headerRow())).toContain("130px"));
    for (const row of screen.getAllByRole("option")) expect(gridOf(row)).toContain("130px");
    fireEvent.mouseUp(window);
  });

  it("놓으면 그 컬럼 너비만 바뀐 목록을 설정에 쓴다 (정렬 표시 보존)", async () => {
    const b = seed(["name", ">size:100", "modified"]);
    await renderApp(b);
    drag(handle("크기"), 500, 480);
    fireEvent.mouseUp(window);
    await waitFor(async () => expect(await columnsOf(b)).toEqual(["name", ">size:120", "modified"]));
  });

  it("끄는 동안에는 저장하지 않고 놓을 때 한 번만 저장한다", async () => {
    const b = seed(["name", "size:100", "modified"]);
    const set = vi.spyOn(b, "setConfigValue");
    await renderApp(b);
    drag(handle("크기"), 500, 490);
    fireEvent.mouseMove(window, { clientX: 470 });
    fireEvent.mouseMove(window, { clientX: 460 });
    expect(set).not.toHaveBeenCalled();
    fireEvent.mouseUp(window);
    await waitFor(() => expect(set).toHaveBeenCalledTimes(1));
    expect(set).toHaveBeenCalledWith("view.table.columns", { kind: "strList", value: ["name", "size:140", "modified"] });
  });

  it("최소 40px, 최대 600px를 넘지 않는다", async () => {
    const b = seed(["name", "size:100", "modified"]);
    await renderApp(b);
    drag(handle("크기"), 500, 900);
    await waitFor(() => expect(gridOf(headerRow())).toContain("40px"));
    fireEvent.mouseMove(window, { clientX: -2000 });
    await waitFor(() => expect(gridOf(headerRow())).toContain("600px"));
    fireEvent.mouseUp(window);
    await waitFor(async () => expect(await columnsOf(b)).toEqual(["name", "size:600", "modified"]));
  });

  it("손잡이를 눌러도 정렬이 바뀌지 않는다", async () => {
    await renderApp(seed());
    const before = within(headerRow()).getByRole("columnheader", { name: /이름/ }).getAttribute("aria-sort");
    fireEvent.mouseDown(handle("크기"), { button: 0, clientX: 10 });
    fireEvent.mouseUp(window);
    fireEvent.click(handle("크기"));
    expect(within(headerRow()).getByRole("columnheader", { name: /이름/ })).toHaveAttribute("aria-sort", before!);
    expect(within(headerRow()).getByRole("columnheader", { name: /크기/ })).toHaveAttribute("aria-sort", "none");
  });
});
