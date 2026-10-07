import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { defaultBindingsFor } from "@twin-deck/actions";
import { FakeBackend } from "@twin-deck/ts-client";
import type { Snapshot } from "@twin-deck/ts-client";
import { cursorName, renderApp } from "./helpers";
import { crumbs } from "./search-helpers";

// 왼쪽 /home/a(폴더 먼저, 이름순): docs/ src/ a.txt — 커서는 처음에 docs(폴더)에 있다.
const seed = () => new FakeBackend().seed({ "/home/a/docs/readme.md": "r", "/home/a/src/main.rs": "m", "/home/a/a.txt": "내용A", "/home/b": null });
type User = Awaited<ReturnType<typeof renderApp>>["user"];
const shiftRight = (user: User) => user.keyboard("{Shift>}{ArrowRight}{/Shift}");
const previewDialog = (name: string) => screen.findByRole("dialog", { name });
const noPreview = () => expect(screen.queryByRole("dialog", { name: /^미리보기/ })).toBeNull();

describe("Shift+→로 미리보기 (이슈 #19)", () => {
  it("폴더에서 Shift+→: 안으로 들어가지 않고 폴더 미리보기(하위 항목 트리)가 열린다", async () => {
    const { user } = await renderApp(seed());
    expect(cursorName("left")).toBe("docs");
    await shiftRight(user);
    const d = within(await previewDialog("미리보기: docs"));
    expect(d.getByLabelText("텍스트 미리보기")).toHaveTextContent("readme.md");
    expect(crumbs("left")).toEqual(["/", "home", "a"]);
  });

  it("파일에서 Shift+→: 파일 미리보기가 열린다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(cursorName("left")).toBe("a.txt");
    await shiftRight(user);
    const d = within(await previewDialog("미리보기: a.txt"));
    expect(d.getByLabelText("텍스트 미리보기")).toHaveTextContent("내용A");
  });

  it("기존: 파일에서 →만 눌러도 미리보기가 열린다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowRight}");
    await previewDialog("미리보기: a.txt");
  });

  it("기존: 폴더에서 →는 그 폴더로 들어가고 미리보기는 열리지 않는다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{ArrowRight}");
    await screen.findByRole("option", { name: /readme\.md/ });
    expect(crumbs("left")).toEqual(["/", "home", "a", "docs"]);
    noPreview();
  });

  it("미리보기가 열려 있을 때 Shift+→는 닫지도 다른 항목으로 바꾸지도 않는다", async () => {
    const { user } = await renderApp(seed());
    await shiftRight(user);
    await previewDialog("미리보기: docs");
    await shiftRight(user);
    await previewDialog("미리보기: docs");
    expect(screen.queryAllByRole("dialog", { name: /^미리보기/ })).toHaveLength(1);
  });

  it("여러 컬럼 보기에서도 Shift+→는 컬럼 이동이 아니라 미리보기를 연다", async () => {
    const snapshot: Snapshot = {
      version: 1,
      activePane: "left",
      showHidden: false,
      paletteQuery: "",
      split: 500,
      previewRect: null,
      left: { tabs: [{ path: "/home/a", cursorName: null, selection: [], sort: null, view: { mode: "columns", count: 2 } }], active: 0 },
      right: { tabs: [{ path: "/home/b", cursorName: null, selection: [], sort: null, view: { mode: "table", count: 1 } }], active: 0 },
    };
    const { user } = await renderApp(seed(), undefined, undefined, { snapshot });
    const before = cursorName("left");
    await shiftRight(user);
    await previewDialog(`미리보기: ${before}`);
    expect(cursorName("left")).toBe(before);
  });

  it("항목이 하나도 없는 폴더에서는 아무 창도 열리지 않는다", async () => {
    const { user } = await renderApp(new FakeBackend().seed({ "/home/a": null, "/home/b": null }), undefined, undefined, { emptyLeft: true });
    await shiftRight(user);
    noPreview();
  });

  it("키 맵: core.preview의 키는 Mod+Y와 Shift+Right이고 두 플랫폼이 같다(Mod는 플랫폼별로 풀린다)", () => {
    for (const platform of ["linux", "mac"] as const) {
      const keys = defaultBindingsFor(platform).find((b) => b.actionId === "core.preview" && b.scope === "pane")?.keys;
      expect(keys).toEqual(["Mod+Y", "Shift+Right"]);
    }
  });
});
