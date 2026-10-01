import { within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { list, names, renderApp } from "./helpers";

function seeded() {
  const b = new FakeBackend().seed({
    "/home/a/main.ts": "",
    "/home/a/package.json": "{}",
    "/home/a/src": null,
    "/home/a/x.zzz": "",
    "/home/b/y.txt": "",
    "/real/target.rs": "",
  });
  return b;
}

const rowOf = (name: string) => {
  const row = within(list("left"))
    .getAllByRole("option")
    .find((o) => o.querySelectorAll("span")[1]?.textContent === name);
  if (!row) throw new Error(`행을 찾을 수 없음: ${name}`);
  return row;
};
const iconOf = (name: string) => rowOf(name).querySelector("img") as HTMLImageElement;

describe("파일 목록 아이콘", () => {
  it("파일명, 확장자, 폴더명, 기본값에 맞는 아이콘이 렌더된다", async () => {
    await renderApp(seeded());
    expect(iconOf("main.ts").getAttribute("src")).toMatch(/\/typescript\.svg$/);
    expect(iconOf("package.json").getAttribute("src")).toMatch(/\/nodejs\.svg$/);
    expect(iconOf("src").getAttribute("src")).toMatch(/\/folder-src\.svg$/);
    expect(iconOf("x.zzz").getAttribute("src")).toMatch(/\/file\.svg$/);
  });

  it("아이콘은 장식이다: 대체 텍스트가 비어 있고 행 텍스트를 바꾸지 않는다", async () => {
    await renderApp(seeded());
    expect(iconOf("main.ts").getAttribute("alt")).toBe("");
    expect(iconOf("main.ts").closest("[aria-hidden='true']")).not.toBeNull();
    expect(iconOf("main.ts").parentElement!.textContent).toBe("");
    expect(names("left").some((t) => t.includes("main.ts"))).toBe(true);
  });

  it("크기는 behavior.table.icon_size 설정을 따른다", async () => {
    const b = seeded();
    b.setConfig((l) => {
      l.config.behavior.table.icon_size = 20;
    });
    await renderApp(b);
    const img = iconOf("main.ts");
    expect(img.getAttribute("width")).toBe("20");
    expect(img.getAttribute("height")).toBe("20");
  });

  it("심볼릭 링크는 대상 파일의 아이콘 규칙을 따르고 링크 표시가 붙는다", async () => {
    const b = seeded();
    await b.createSymlink("/real/target.rs", "/home/a", "rename");
    await renderApp(b);
    const row = within(list("left"))
      .getAllByRole("option")
      .find((o) => o.querySelector("[data-link='true']"));
    expect(row).toBeDefined();
    expect(row!.querySelector("img")!.getAttribute("src")).toMatch(/\/rust\.svg$/);
    // 일반 파일에는 링크 표시가 없다
    expect(rowOf("main.ts").querySelector("[data-link='true']")).toBeNull();
  });

  it("멀티 컬럼 모드에서도 아이콘이 렌더된다", async () => {
    const { user } = await renderApp(seeded());
    await user.keyboard("{Control>}{Alt>}3{/Alt}{/Control}");
    await within(list("left")).findAllByRole("option");
    expect(list("left").getAttribute("data-view")).toBe("columns-3");
    const imgs = within(list("left")).getAllByRole("option").map((o) => o.querySelector("img"));
    expect(imgs.every((i) => i !== null)).toBe(true);
  });
});
