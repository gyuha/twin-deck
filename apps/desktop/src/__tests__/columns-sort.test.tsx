import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Loaded } from "@twin-deck/ts-client";
import { FakeBackend } from "@twin-deck/ts-client";
import { cursorName, entryNames, list, renderApp } from "./helpers";

const T = (d: number) => new Date(2026, 5, d, 12, 30).getTime(); // 2026-06-<d> 12:30 로컬

function seed(change: (l: Loaded) => void = () => {}) {
  const b = new FakeBackend().seed({
    "/home/a/docs/x": "x",
    "/home/a/src/y": "y",
    "/home/a/a.txt": "a".repeat(300),
    "/home/a/b.md": "12345",
    "/home/a/c.zip": "z".repeat(20),
    "/home/a/d.txt": "1",
    "/home/b": null,
  });
  b.setTimes("/home/a/a.txt", { modifiedMs: T(3), createdMs: T(1) });
  b.setTimes("/home/a/b.md", { modifiedMs: T(1), createdMs: T(3) });
  b.setTimes("/home/a/c.zip", { modifiedMs: T(2), createdMs: T(2) });
  b.setTimes("/home/a/d.txt", { modifiedMs: T(4), createdMs: T(4) });
  b.setConfig((l) => {
    l.config.display.relative_date = false;
    l.config.display.date_format = "%Y-%m-%d";
    change(l);
  });
  return b;
}
const bind = (key: string, action: string, args: Record<string, string> = {}) => ({ key, action, args, scope: null });
const leftPane = () => within(screen.getByRole("region", { name: "왼쪽 패널" }));
const headerRow = () => leftPane().queryByRole("row", { name: "컬럼 머리글" });
const headers = () => within(headerRow()!).queryAllByRole("columnheader").map((h) => h.textContent);
const header = (name: RegExp) => within(headerRow()!).getByRole("columnheader", { name });
const rowText = (name: string) => screen.getAllByRole("option", { name: new RegExp(name.replace(".", "\\.")) })[0].textContent;

describe("CFG-06 컬럼", () => {
  it("기본 컬럼은 이름/크기/수정일이고 포맷 설정을 따른다", async () => {
    await renderApp(seed());
    expect(headers()).toEqual(["이름 ▲", "크기", "수정"]); // 기본 정렬(이름 오름차순) 표시
    expect(rowText("a.txt")).toContain("300 B");
    expect(rowText("a.txt")).toContain("2026-06-03");
    expect(rowText("docs")).not.toContain(" B"); // 폴더는 크기가 없다
  });

  it("컬럼 명세대로 그린다: 확장자 정렬 표시, 권한, 8진 권한", async () => {
    const b = seed((l) => (l.config.view.table.columns = ["name", ">extension:50", "permissions", "permissions_octal", "size"]));
    await renderApp(b);
    expect(headers()).toEqual(["이름", "확장자 ▼", "권한", "권한(8진)", "크기"]);
    expect(header(/확장자/)).toHaveAttribute("aria-sort", "descending");
    // 명세의 `>`(내림차순)가 초기 정렬: 폴더 먼저, 파일은 확장자 내림차순(zip, txt, txt, md), 같으면 이름순
    expect(entryNames("left")).toEqual(["docs", "src", "c.zip", "a.txt", "d.txt", "b.md"]);
    expect(rowText("a.txt")).toContain("rw-r--r--");
    expect(rowText("a.txt")).toContain("644");
    expect(rowText("docs")).toContain("rwxr-xr-x");
  });

  it("size_format 설정이 반영된다", async () => {
    const b = seed((l) => {
      l.config.display.size_format = "bytes";
    });
    await renderApp(b);
    expect(rowText("c.zip")).toContain("20 B");
  });
});

describe("CFG-08 정렬 (core.view.order)", () => {
  it("인수 by=size: 크기 오름차순, 같은 키를 다시 누르면 내림차순, 폴더는 항상 먼저", async () => {
    const b = seed((l) => l.bindings.push(bind("F9", "core.view.order", { by: "size" })));
    const { user } = await renderApp(b);
    await user.keyboard("{F9}");
    await waitFor(() => expect(entryNames("left")).toEqual(["docs", "src", "d.txt", "b.md", "c.zip", "a.txt"]));
    expect(header(/크기/)).toHaveAttribute("aria-sort", "ascending");
    await user.keyboard("{F9}");
    await waitFor(() => expect(entryNames("left")).toEqual(["docs", "src", "a.txt", "c.zip", "b.md", "d.txt"]));
    expect(header(/크기/)).toHaveAttribute("aria-sort", "descending");
  });

  it("dir 인수로 방향을 지정한다", async () => {
    const b = seed((l) => l.bindings.push(bind("F9", "core.view.order", { by: "modified", dir: "desc" })));
    const { user } = await renderApp(b);
    await user.keyboard("{F9}{F9}"); // 두 번 눌러도 dir가 고정
    await waitFor(() => expect(entryNames("left")).toEqual(["docs", "src", "d.txt", "a.txt", "c.zip", "b.md"]));
  });

  it("기본 키: Alt+Shift+S 크기, +M 수정, +C 생성, +E 확장자, +N 이름", async () => {
    const { user } = await renderApp(seed());
    const press = async (k: string) => user.keyboard(`{Alt>}{Shift>}${k}{/Shift}{/Alt}`);
    await press("s");
    await waitFor(() => expect(entryNames("left").slice(2)).toEqual(["d.txt", "b.md", "c.zip", "a.txt"]));
    await press("m");
    await waitFor(() => expect(entryNames("left").slice(2)).toEqual(["b.md", "c.zip", "a.txt", "d.txt"]));
    await press("c");
    await waitFor(() => expect(entryNames("left").slice(2)).toEqual(["a.txt", "c.zip", "b.md", "d.txt"]));
    await press("e");
    await waitFor(() => expect(entryNames("left").slice(2)).toEqual(["b.md", "a.txt", "d.txt", "c.zip"]));
    await press("n");
    await waitFor(() => expect(entryNames("left")).toEqual(["docs", "src", "a.txt", "b.md", "c.zip", "d.txt"]));
  });

  it("정렬해도 커서는 같은 항목에 남는다", async () => {
    const b = seed((l) => l.bindings.push(bind("F9", "core.view.order", { by: "size", dir: "desc" })));
    const { user } = await renderApp(b);
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}"); // b.md
    expect(cursorName("left")).toBe("b.md");
    await user.keyboard("{F9}");
    await waitFor(() => expect(entryNames("left")[4]).toBe("b.md"));
    expect(cursorName("left")).toBe("b.md");
  });

  it("탭마다 정렬이 따로다", async () => {
    const b = seed((l) => l.bindings.push(bind("F9", "core.view.order", { by: "size" })));
    const { user } = await renderApp(b);
    await user.keyboard("{F9}");
    await waitFor(() => expect(entryNames("left")[2]).toBe("d.txt"));
    await user.keyboard("{Control>}t{/Control}"); // 새 탭은 기본 정렬
    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(3));
    await waitFor(() => expect(entryNames("left").slice(2)).toEqual(["a.txt", "b.md", "c.zip", "d.txt"]));
    await user.keyboard("{Control>}{PageUp}{/Control}");
    await waitFor(() => expect(entryNames("left")[2]).toBe("d.txt"));
  });

  it("머리글을 클릭해도 정렬된다", async () => {
    const { user } = await renderApp(seed());
    await user.click(header(/크기/));
    await waitFor(() => expect(entryNames("left").slice(2)).toEqual(["d.txt", "b.md", "c.zip", "a.txt"]));
  });

  it("알 수 없는 정렬 기준은 오류로 알린다", async () => {
    const b = seed((l) => l.bindings.push(bind("F9", "core.view.order", { by: "colour" })));
    const { user } = await renderApp(b);
    await user.keyboard("{F9}");
    expect(await screen.findByRole("alert")).toHaveTextContent("colour");
  });
});

describe("CFG-07 표시 모드 / NAV-05 컬럼 이동 / NAV-02 반 페이지", () => {
  const mode = (l: HTMLElement) => l.getAttribute("data-view");

  it("Mod+Alt+2로 2열 모드가 되고 머리글이 사라지며 이름만 보인다", async () => {
    const { user } = await renderApp(seed());
    expect(mode(list("left"))).toBe("table");
    await user.keyboard("{Control>}{Alt>}2{/Alt}{/Control}");
    await waitFor(() => expect(mode(list("left"))).toBe("columns-2"));
    expect(headerRow()).toBeNull();
    expect(within(list("left")).getAllByRole("option")).toHaveLength(6);
    expect(rowText("a.txt")).not.toContain("300 B");
    await user.keyboard("{Control>}{Alt>}0{/Alt}{/Control}");
    await waitFor(() => expect(mode(list("left"))).toBe("table"));
  });

  it("인수 없이 부르면 table → 1열 → 2열 → 3열 → table 순환", async () => {
    const b = seed((l) => l.bindings.push(bind("F11", "core.view.mode")));
    const { user } = await renderApp(b);
    const seen: (string | null)[] = [];
    for (let i = 0; i < 5; i++) {
      await user.keyboard("{F11}");
      await waitFor(() => expect(mode(list("left"))).not.toBe(seen.at(-1) ?? "table"));
      seen.push(mode(list("left")));
    }
    expect(seen).toEqual(["columns-1", "columns-2", "columns-3", "table", "columns-1"]);
  });

  it("좌/우 키는 여러 컬럼 보기에서 컬럼 사이를 오간다 (열 우선 배치)", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{Control>}{Alt>}2{/Alt}{/Control}");
    await waitFor(() => expect(mode(list("left"))).toBe("columns-2"));
    // 6개 항목, 2열 → 열당 3행: [docs src a.txt] [b.md c.zip d.txt]
    await user.keyboard("{ArrowRight}");
    expect(cursorName("left")).toBe("b.md");
    await user.keyboard("{ArrowDown}");
    expect(cursorName("left")).toBe("c.zip");
    await user.keyboard("{ArrowLeft}");
    expect(cursorName("left")).toBe("src");
    await user.keyboard("{ArrowRight}{ArrowRight}"); // 마지막 열을 넘어가면 마지막 항목에 머문다
    expect(cursorName("left")).toBe("d.txt");
  });

  it("Alt+PageDown/PageUp은 반 페이지(5행)씩 움직인다", async () => {
    const b = new FakeBackend().seed(Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`/home/a/f${String(i).padStart(2, "0")}`, "x"])));
    b.seed({ "/home/b": null });
    const { user } = await renderApp(b);
    await user.keyboard("{Alt>}{PageDown}{/Alt}");
    expect(cursorName("left")).toBe("f05");
    await user.keyboard("{Alt>}{PageDown}{PageDown}{/Alt}");
    expect(cursorName("left")).toBe("f15");
    await user.keyboard("{Alt>}{PageUp}{/Alt}");
    expect(cursorName("left")).toBe("f10");
    await user.keyboard("{PageDown}"); // 일반 PageDown은 10행
    expect(cursorName("left")).toBe("f20");
  });
});
