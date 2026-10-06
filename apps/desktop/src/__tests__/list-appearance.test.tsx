import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FakeBackend } from "@twin-deck/ts-client";
import type { Snapshot } from "@twin-deck/ts-client";
import { NFD, entryNames, list, renderApp, seedBackend } from "./helpers";

type TableCfg = { zebra_rows: boolean; show_marks: boolean; folder_style: string; cursor_fill: boolean };
// seedBackend 이름순: docs, src (폴더) · a.txt, b.txt, 한글.txt (.hidden은 숨김). 한글 이름은 디스크의 NFD로 들어 있다.
const HANGUL = NFD("한글.txt");
const withTable = (change: Partial<TableCfg>): FakeBackend => {
  const b = seedBackend().seed({ "/home/b/x.txt": "x" });
  b.setConfig((l) => Object.assign(l.config.behavior.table, change));
  return b;
};
const rows = (pane: "left" | "right" = "left") => within(list(pane)).getAllByRole("option");
const header = () => screen.getAllByRole("row", { name: "컬럼 머리글" })[0];
const STRIPE = "bg-app-line/20";

describe("줄무늬 행 (behavior.table.zebra_rows)", () => {
  it("켜면 홀수 번째 행만 줄무늬가 붙고 짝수 번째와 속성이 다르다", async () => {
    await renderApp(withTable({ zebra_rows: true }));
    const r = rows();
    expect(r.map((x) => x.getAttribute("data-stripe"))).toEqual(["even", "odd", "even", "odd", "even"]);
    expect(r[1].className).toContain(STRIPE);
    expect(r[0].className).not.toContain(STRIPE);
    expect(r[3].className).toContain(STRIPE);
  });

  it("끄면 어떤 행에도 줄무늬 속성과 클래스가 없다", async () => {
    await renderApp(withTable({ zebra_rows: false }));
    for (const row of rows()) {
      expect(row.hasAttribute("data-stripe")).toBe(false);
      expect(row.className).not.toContain(STRIPE);
    }
  });

  it("줄무늬가 켜져 있어도 커서 행은 커서 배경을 쓴다", async () => {
    await renderApp(withTable({ zebra_rows: true }));
    const cursor = rows().find((x) => x.getAttribute("data-cursor") === "true")!;
    expect(cursor.className).toContain("bg-app-selected");
    expect(cursor.className).not.toContain(STRIPE);
  });
});

describe("표시 칸 (behavior.table.show_marks)", () => {
  it("켜져 있으면(기본) 행 맨 앞에 표시 칸이 있고 폴더에는 ▸가 들어 있다", async () => {
    await renderApp(withTable({}));
    const first = rows()[0];
    expect(first.querySelector("[data-mark]")).not.toBeNull();
    expect(first.querySelector("[data-mark]")?.textContent).toBe("▸");
    expect(first.style.gridTemplateColumns.startsWith("1.25rem")).toBe(true);
    expect(header().style.gridTemplateColumns.startsWith("1.25rem")).toBe(true);
  });

  it("끄면 표시 칸이 사라지고 ▸·●가 DOM에 없으며 이름 칸이 첫 글자 칸이 된다", async () => {
    await renderApp(withTable({ show_marks: false }));
    const r = rows();
    for (const row of r) {
      expect(row.querySelector("[data-mark]")).toBeNull();
      expect(row.textContent).not.toMatch(/[▸●]/);
      expect(row.style.gridTemplateColumns.startsWith("1.25rem")).toBe(false);
    }
    expect(header().style.gridTemplateColumns.startsWith("1.25rem")).toBe(false);
    // 아이콘 칸 다음이 바로 이름 칸이다: 이름은 아이콘 뒤 첫 span
    expect(r[0].querySelectorAll("span")[0].textContent).toBe("docs");
  });

  it("끄면 선택한 행은 굵은 강조색 글씨로만 구분된다", async () => {
    const { user } = await renderApp(withTable({ show_marks: false }));
    await user.keyboard("{ArrowDown}{ArrowDown} "); // a.txt 선택
    const selected = rows().filter((x) => x.getAttribute("aria-selected") === "true");
    expect(selected).toHaveLength(1);
    expect(selected[0].className).toContain("font-semibold");
    expect(selected[0].className).toContain("text-accent");
    expect(selected[0].textContent).not.toContain("●");
  });
});

describe("폴더 모양 (behavior.table.folder_style)", () => {
  const cases: [string, string[]][] = [
    ["none", ["docs", "src", "a.txt", "b.txt", HANGUL]],
    ["brackets", ["[docs]", "[src]", "a.txt", "b.txt", HANGUL]],
    ["parens", ["(docs)", "(src)", "a.txt", "b.txt", HANGUL]],
    ["slash", ["docs/", "src/", "a.txt", "b.txt", HANGUL]],
  ];
  it.each(cases)("%s: 폴더 행의 이름 칸만 바뀌고 파일 행은 그대로다", async (style, expected) => {
    await renderApp(withTable({ folder_style: style }));
    expect(entryNames("left")).toEqual(expected);
  });

  it("장식은 화면 표시만 바꾼다: 이름 바꾸기 입력창의 처음 값은 장식 없는 이름이다", async () => {
    const { user } = await renderApp(withTable({ folder_style: "brackets" }));
    await user.keyboard("{F2}"); // 커서는 docs
    expect(await screen.findByRole("textbox", { name: "이름" })).toHaveValue("docs");
  });

  it("빠른 선택의 일치 글자 강조는 이름 부분에만 걸린다", async () => {
    const { user } = await renderApp(withTable({ folder_style: "brackets" }));
    await user.keyboard("do");
    const row = rows()[0];
    expect(row.querySelector("mark")?.textContent).toBe("do");
    expect(row.querySelectorAll("span")[1].textContent).toBe("[docs]");
  });
});

describe("커서 행 꽉 채움 (behavior.table.cursor_fill)", () => {
  it("켜면 활성 패널의 커서 행만 꽉 채워지고 비활성 패널의 커서 행은 지금처럼 은은하다", async () => {
    await renderApp(withTable({ cursor_fill: true }));
    const active = rows("left").find((x) => x.getAttribute("data-cursor") === "true")!;
    const inactive = rows("right").find((x) => x.getAttribute("data-cursor") === "true")!;
    expect(active.getAttribute("data-cursor-fill")).toBe("true");
    expect(active.className).toContain("bg-accent");
    expect(inactive.hasAttribute("data-cursor-fill")).toBe(false);
    expect(inactive.className).toContain("bg-app-selected");
    expect(inactive.className).not.toContain("bg-accent");
  });

  it("꽉 채운 커서 행이 선택된 행이어도 글자가 배경과 같은 색(accent)이 되지 않는다", async () => {
    const { user } = await renderApp(withTable({ cursor_fill: true }));
    await user.keyboard("{ArrowDown}{ArrowDown} {ArrowUp}"); // a.txt 선택 후 커서를 다시 a.txt로
    const row = rows().find((x) => x.getAttribute("data-cursor") === "true")!;
    expect(row.getAttribute("aria-selected")).toBe("true");
    expect(row.className).toContain("bg-accent");
    expect(row.className).not.toContain("text-accent");
  });

  it("끄면(기본) 커서 행에 꽉 채움 속성이 없다", async () => {
    await renderApp(withTable({ cursor_fill: false }));
    for (const row of rows("left")) expect(row.hasAttribute("data-cursor-fill")).toBe(false);
  });
});

describe("기본값에서는 지금 모양 그대로", () => {
  it("행 구조와 클래스가 지금과 같다(표시 칸 있음, 줄무늬·꽉 채움 없음, 폴더 장식 없음)", async () => {
    await renderApp(withTable({}));
    const r = rows();
    const cursor = r[0];
    expect(cursor.className).toContain("border-accent");
    expect(cursor.className).toContain("bg-app-selected");
    expect(cursor.className).not.toContain("bg-accent");
    expect(r.every((x) => !x.hasAttribute("data-stripe") && !x.hasAttribute("data-cursor-fill"))).toBe(true);
    expect(r[0].querySelectorAll("span")[0].hasAttribute("data-mark")).toBe(true);
    expect(entryNames("left")).toEqual(["docs", "src", "a.txt", "b.txt", HANGUL]);
  });
});

describe("다중 열 보기에서도 같은 규칙", () => {
  const columnsSnapshot = (): Snapshot => ({
    version: 1,
    activePane: "left",
    showHidden: false,
    paletteQuery: "",
    split: 500,
    previewRect: null,
    left: { tabs: [{ path: "/home/a", cursorName: null, selection: [], sort: null, view: { mode: "columns", count: 2 } }], active: 0 },
    right: { tabs: [{ path: "/home/b", cursorName: null, selection: [], sort: null, view: { mode: "table", count: 1 } }], active: 0 },
  });

  it("표시 칸을 끄면 칸이 빠지고 폴더 모양이 이름에 붙는다", async () => {
    await renderApp(withTable({ show_marks: false, folder_style: "parens" }), undefined, undefined, { snapshot: columnsSnapshot() });
    const r = rows();
    expect(list("left").getAttribute("data-view")).toBe("columns-2");
    for (const row of r) {
      expect(row.querySelector("[data-mark]")).toBeNull();
      expect(row.style.gridTemplateColumns.startsWith("1.25rem")).toBe(false);
    }
    expect(r.map((x) => x.querySelectorAll("span")[0].textContent)).toContain("(docs)");
  });

  it("표시 칸을 켜면(기본) 칸 폭이 첫 열로 들어간다", async () => {
    await renderApp(withTable({}), undefined, undefined, { snapshot: columnsSnapshot() });
    for (const row of rows()) expect(row.style.gridTemplateColumns.startsWith("1.25rem")).toBe(true);
  });
});
