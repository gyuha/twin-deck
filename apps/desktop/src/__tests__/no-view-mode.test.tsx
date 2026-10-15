import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_ACTION_META, defaultBindingsFor } from "@twin-deck/actions";
import { FakeBackend } from "@twin-deck/ts-client";
import type { Snapshot } from "@twin-deck/ts-client";
import { cursorName, list, renderApp } from "./helpers";

// 이슈 #74: 표시 모드(`Mod+Alt+0~3`, 한 줄 표 / 열 1·2·3개 보기)를 없앴다. 열 1~3개 보기에서는 `→`로 미리보기를 쓸 수 없었다.
// 왼쪽 /home/a(폴더 먼저, 이름순): docs/ src/ a.txt — 커서는 처음에 docs(폴더)에 있다.
const seed = () => new FakeBackend().seed({ "/home/a/docs/readme.md": "r", "/home/a/src/main.rs": "m", "/home/a/a.txt": "내용A", "/home/b": null });
const header = () => screen.queryAllByRole("row", { name: "컬럼 머리글" });
const optionCount = () => within(list("left")).getAllByRole("option").length;

describe("표시 모드가 없다", () => {
  it("→는 파일에서 미리보기를 연다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(cursorName("left")).toBe("a.txt");
    await user.keyboard("{ArrowRight}");
    expect(await screen.findByRole("dialog", { name: "미리보기: a.txt" })).toBeInTheDocument();
  });

  it.each(["0", "1", "2", "3"])("Ctrl+Alt+%s는 목록 모양을 바꾸지 않는다(머리글이 그대로이고 탭·커서도 그대로다)", async (n) => {
    const { user } = await renderApp(seed());
    const before = optionCount();
    await user.keyboard(`{Control>}{Alt>}${n}{/Alt}{/Control}`);
    expect(list("left").hasAttribute("data-view")).toBe(false);
    expect(header().length).toBeGreaterThan(0);
    expect(optionCount()).toBe(before);
    expect(cursorName("left")).toBe("docs");
    expect(screen.getAllByRole("tab")).toHaveLength(2); // 왼쪽 1 + 오른쪽 1
  });

  it("액션과 기본 키에 표시 모드가 없다", () => {
    expect(DEFAULT_ACTION_META.map((a) => a.id)).not.toContain("core.view.mode");
    for (const platform of ["mac", "windows", "linux"] as const) {
      expect(defaultBindingsFor(platform).some((b) => (b.actionId as string) === "core.view.mode")).toBe(false);
      for (const n of [0, 1, 2, 3]) {
        const chord = `Mod+Alt+${n}`;
        expect(defaultBindingsFor(platform).some((b) => b.keys.includes(chord))).toBe(false);
      }
    }
  });

  it("예전에 다열 보기로 저장된 상태도 오류 없이 표로 열린다", async () => {
    const snapshot: Snapshot = {
      version: 1,
      activePane: "left",
      showHidden: false,
      paletteQuery: "",
      split: 500,
      previewRect: null,
      left: { tabs: [{ path: "/home/a", cursorName: null, selection: [], sort: null, view: { mode: "columns", count: 3 } }], active: 0 },
      right: { tabs: [{ path: "/home/b", cursorName: null, selection: [], sort: null, view: { mode: "table", count: 1 } }], active: 0 },
    };
    await renderApp(seed(), undefined, undefined, { snapshot });
    expect(list("left").hasAttribute("data-view")).toBe(false);
    expect(header().length).toBeGreaterThan(0);
  });
});
