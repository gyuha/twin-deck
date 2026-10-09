import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { resolveMarkdownImage } from "../ui/MarkdownView";
import { renderApp } from "./helpers";

// 이슈 #42: 마크다운 미리보기의 상대경로 이미지는 마크다운 파일이 있는 폴더 기준으로 풀어 보여 준다.
const asset = (path: string) => `fake-asset://localhost${path}`;

async function view(md: string) {
  const { user } = await renderApp(new FakeBackend().seed({ "/home/a/doc.md": md, "/home/b": null }));
  await user.keyboard("{ArrowRight}");
  const dlg = await screen.findByRole("dialog", { name: /^미리보기: doc\.md$/ });
  return within(dlg).getByLabelText("마크다운 미리보기");
}
const imgs = (v: HTMLElement) => Array.from(v.querySelectorAll("img")).map((i) => i.getAttribute("src"));

describe("마크다운 상대경로 이미지 (이슈 #42)", () => {
  it("img/a.png · ./img/a.png · ../pics/b.png · 공백(%20)을 폴더 기준 파일 주소로 보여 준다", async () => {
    const md = ["![a](img/a.png)", "![a2](./img/a.png)", "![b](../pics/b.png)", "![c](img/한%20글.png)", "![d](img/e.png?x=1#y)"].join("\n\n");
    const v = await view(md);
    expect(imgs(v)).toEqual([
      asset("/home/a/img/a.png"),
      asset("/home/a/img/a.png"),
      asset("/home/pics/b.png"),
      asset("/home/a/img/한 글.png"),
      asset("/home/a/img/e.png"),
    ]);
    expect(within(v).getByAltText("a")).toBeTruthy();
  });

  it("바깥 주소·javascript:·data:·절대경로 이미지는 그리지 않고 대체 텍스트만 남긴다", async () => {
    const md = ["![외부](https://example.com/a.png)", "![스크립트](javascript:alert(1))", "![데이터](data:image/png;base64,AAAA)", "![절대](/etc/x.png)"].join("\n\n");
    const v = await view(md);
    expect(imgs(v)).toEqual([]);
    for (const alt of ["외부", "절대"]) expect(within(v).getByText(alt)).toBeTruthy();
  });

  it("폴더 루트를 벗어나는 경로(`../../..`)는 그리지 않는다", async () => {
    const v = await view("![x](../../../x.png)");
    expect(imgs(v)).toEqual([]);
  });
});

describe("resolveMarkdownImage", () => {
  const url = (p: string) => `u:${p}`;
  it("압축 파일 안의 마크다운은 상대 이미지도 풀지 않는다", () => {
    expect(resolveMarkdownImage("a.png", "/home/a/x.zip!/doc.md", url)).toBeNull();
  });
  it("Windows 경로도 구분자를 따라 푼다", () => {
    expect(resolveMarkdownImage("img/a.png", "C:\\docs\\doc.md", url)).toBe("u:C:\\docs\\img\\a.png");
    expect(resolveMarkdownImage("../a.png", "C:\\docs\\doc.md", url)).toBe("u:C:\\a.png");
  });
});
