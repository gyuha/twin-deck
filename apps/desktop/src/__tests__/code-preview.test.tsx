import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { languageFor } from "../lib/highlight";
import { renderApp } from "./helpers";

async function open(files: Record<string, string>, name: string) {
  const { user } = await renderApp(new FakeBackend().seed({ ...files, "/home/b": null }));
  await user.keyboard("{ArrowRight}");
  return within(await screen.findByRole("dialog", { name: `미리보기: ${name}` }));
}

describe("코드 미리보기 신택스 하이라이트", () => {
  it("프로그램 언어 파일은 토큰별로 칠하고 원문 텍스트는 그대로 둔다", async () => {
    const src = 'fn main() {\n    let n = 42; // 주석\n    println!("hi");\n}\n';
    const dlg = await open({ "/home/a/main.rs": src }, "main.rs");
    const view = dlg.getByLabelText("코드 미리보기");
    expect(view).toHaveAttribute("data-language", "rust");
    expect(view.textContent).toBe(src);
    const has = (cls: string, text: string) => [...view.querySelectorAll(`.${cls}`)].some((n) => n.textContent === text);
    expect(has("hljs-keyword", "fn")).toBe(true);
    expect(has("hljs-number", "42")).toBe(true);
    expect(has("hljs-comment", "// 주석")).toBe(true);
    expect(has("hljs-string", '"hi"')).toBe(true);
  });

  it("HTML 같은 마크업도 태그로 해석하지 않고 글자 그대로 보여 준다", async () => {
    const src = '<script>alert("x")</script>';
    const dlg = await open({ "/home/a/page.html": src }, "page.html");
    const view = dlg.getByLabelText("코드 미리보기");
    expect(view.textContent).toBe(src);
    expect(view.querySelector("script")).toBeNull();
  });

  it("언어를 모르는 텍스트와 JSON은 기존 보기를 쓴다", async () => {
    const dlg = await open({ "/home/a/notes.txt": "fn main() {}" }, "notes.txt");
    expect(dlg.getByLabelText("텍스트 미리보기")).toBeInTheDocument();
    expect(dlg.queryByLabelText("코드 미리보기")).toBeNull();
  });
});

describe("languageFor", () => {
  it("확장자와 파일 이름으로 언어를 고른다", () => {
    expect(languageFor("App.TSX")).toBe("typescript");
    expect(languageFor("run.py")).toBe("python");
    expect(languageFor("Dockerfile")).toBe("dockerfile");
    expect(languageFor("Makefile")).toBe("makefile");
    expect(languageFor("notes.txt")).toBeNull();
    expect(languageFor("data.json")).toBeNull();
    expect(languageFor("README.md")).toBeNull();
    expect(languageFor(".gitignore")).toBeNull();
  });
});
