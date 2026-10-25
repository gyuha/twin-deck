import { readFileSync } from "node:fs";
import { join } from "node:path";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp, seedBackend } from "./helpers";

// 이슈 #127: 창이 좁아져도 창 단위 가로·세로 스크롤바가 생기면 안 된다. jsdom에는 레이아웃이 없어 실제로 넘치는지는 못 재고,
// 넘침을 막는 규칙(루트 overflow 숨김, 줄 안에서 자르기)이 빠지지 않았는지를 본다.
describe("창 단위 스크롤 방지 (이슈 #127)", () => {
  it("html·body·#root는 높이를 창에 맞추고 넘치는 부분을 스크롤하지 않는다", () => {
    const css = readFileSync(join(__dirname, "..", "theme.css"), "utf8");
    expect(css).toMatch(/html,\s*body,\s*#root\s*\{[^}]*height:\s*100%[^}]*overflow:\s*hidden/s);
  });

  it("앱 루트·상태 줄·액션바는 넘치는 내용을 밖으로 내보내지 않고 안에서 자른다", async () => {
    await renderApp();
    expect(document.querySelector("main")).toHaveClass("overflow-hidden", "min-w-0", "h-full");
    const status = screen.getByRole("status", { name: "상태 표시줄" });
    // 좁아져 넘치면 왼쪽(요약 글자)이 잘리고 오른쪽 토글 버튼 묶음(shrink-0, 이슈 #101)은 남는다.
    expect(status).toHaveClass("overflow-hidden", "min-w-0", "justify-end");
    expect(screen.getByRole("toolbar", { name: "액션 바" })).toHaveClass("overflow-hidden");
  });

  it("상태 줄 오른쪽 토글 버튼과 액션바 버튼은 줄어들거나 줄바꿈하지 않는다", async () => {
    await renderApp();
    const status = screen.getByRole("status", { name: "상태 표시줄" });
    const buttons = status.querySelectorAll("button[aria-pressed], button[aria-label='설정']");
    expect(buttons.length).toBeGreaterThan(3);
    for (const b of buttons) expect(b).toHaveClass("shrink-0", "whitespace-nowrap");
    for (const b of screen.getByRole("toolbar", { name: "액션 바" }).querySelectorAll("button")) expect(b).toHaveClass("shrink-0", "whitespace-nowrap");
  });
});

describe("좁은 패널의 컬럼 머리글 (이슈 #127)", () => {
  const header = () => screen.getAllByRole("row", { name: "컬럼 머리글" })[0];
  const template = () => (header() as HTMLElement).style.gridTemplateColumns;

  it("이름 열은 최소 폭을 지키고 나머지 열은 정해진 폭까지 늘어나되 패널이 좁으면 줄어든다", async () => {
    await renderApp();
    expect(template()).toContain("minmax(6rem,1fr)"); // 이름 열: 아무리 좁아도 6rem은 남는다
    expect(template()).toMatch(/minmax\(3rem,[^)]+\)/); // 나머지 열: 3rem까지 줄어든다
  });

  it("사용자가 정한 열 폭(px)도 줄어들 수 있고, 이름 열 폭은 그대로 쓴다", async () => {
    const b: FakeBackend = seedBackend();
    b.setConfig((l) => (l.config.view.table.columns = ["name:200", "extension:160", "size:170", "modified:220"]));
    await renderApp(b);
    expect(template()).toContain("200px"); // 이름: 지정한 폭
    expect(template()).not.toMatch(/(^|\s)(160|170|220)px(\s|$)/); // 나머지는 minmax로 감싼다
    expect(template()).toContain("minmax(3rem,160px)");
    expect(template()).toContain("minmax(3rem,220px)");
  });

  it("머리글 글자는 줄바꿈하지 않는다", async () => {
    await renderApp();
    const cells = header().querySelectorAll("[role=columnheader]");
    expect(cells.length).toBeGreaterThan(1);
    for (const c of cells) expect(c).toHaveClass("whitespace-nowrap");
  });
});
