import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";

const MD = [
  "# 제목",
  "",
  "- 하나",
  "- **둘**",
  "",
  "```",
  "let x = 1;",
  "```",
  "",
  "| a | b |",
  "| - | - |",
  "| 1 | 2 |",
].join("\n");

const EVIL = [
  "<script>window.__pwned = 1</script>",
  '<img src="x" onerror="window.__pwned = 2">',
  "[클릭](javascript:alert(1))",
  "![그림 설명](https://example.com/a.png)",
].join("\n\n");

async function open(files: Record<string, string>, name: string) {
  const { user } = await renderApp(new FakeBackend().seed({ ...files, "/home/b": null }));
  // 목록은 이름순이며 파일 하나뿐이다.
  await user.keyboard("{ArrowRight}");
  return { user, dlg: await screen.findByRole("dialog", { name: `미리보기: ${name}` }) };
}

describe("마크다운 미리보기", () => {
  it(".md는 제목·목록·코드블록·표로 렌더링하고 원문 기호를 남기지 않는다", async () => {
    const { dlg } = await open({ "/home/a/doc.md": MD }, "doc.md");
    const view = within(dlg).getByLabelText("마크다운 미리보기");
    expect(within(view).getByRole("heading", { level: 1, name: "제목" })).toBeTruthy();
    expect(within(view).getAllByRole("listitem")).toHaveLength(2);
    expect(view.querySelector("pre code")?.textContent).toContain("let x = 1;");
    expect(within(view).getByRole("table")).toBeTruthy();
    expect(view.textContent).not.toContain("# ");
    expect(view.textContent).not.toContain("**");
    expect(within(dlg).queryByLabelText("텍스트 미리보기")).toBeNull();
  });

  it("스크립트·onerror·javascript: 링크·이미지를 DOM에 넣지 않는다", async () => {
    const { dlg } = await open({ "/home/a/evil.md": EVIL }, "evil.md");
    const view = within(dlg).getByLabelText("마크다운 미리보기");
    expect(view.querySelector("script")).toBeNull();
    expect(view.querySelector("[onerror]")).toBeNull();
    expect(view.querySelector("img")).toBeNull();
    expect(view.querySelector("a")).toBeNull();
    expect(view.innerHTML).not.toContain("javascript:");
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    expect(view.textContent).toContain("클릭");
    expect(view.textContent).toContain("그림 설명");
  });

  it("잘린 .md도 렌더링하고 잘림 안내를 남긴다", async () => {
    const big = `# 큰 문서\n\n${"본문 ".repeat(30_000)}`;
    const { dlg } = await open({ "/home/a/big.md": big }, "big.md");
    const view = within(dlg).getByLabelText("마크다운 미리보기");
    expect(within(view).getByRole("heading", { level: 1, name: "큰 문서" })).toBeTruthy();
    expect(within(dlg).getByText(/앞부분만 표시합니다/)).toBeTruthy();
  });

  it("코드 블록의 스크롤바는 얇은 스타일(td-thin-scroll)이다", async () => {
    const { user } = await renderApp(new FakeBackend().seed({ "/home/a/a.md": MD, "/home/b": null }));
    await user.keyboard("{ArrowRight}");
    const d = within(await screen.findByRole("dialog", { name: "미리보기: a.md" }));
    const pre = (await d.findByLabelText("마크다운 미리보기")).querySelector("pre")!;
    expect(pre.className).toContain("td-thin-scroll");
    expect(pre.className).toContain("overflow-auto");
  });
});
