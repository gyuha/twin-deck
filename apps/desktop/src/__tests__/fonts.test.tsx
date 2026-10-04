import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";

// 이름순: docs, a.md, b.json, c.ts, notes.txt
const seed = () =>
  new FakeBackend().seed({
    "/home/a/docs/readme.md": "r",
    "/home/a/a.md": "# 제목\n\n`코드` 본문",
    "/home/a/b.json": '{"k": 1}',
    "/home/a/c.ts": "const x = 1;",
    "/home/a/notes.txt": "hello preview",
    "/home/b": null,
  });
const UI = "Pretendard, sans-serif";
const PREVIEW = "D2Coding, monospace";
const dlg = (name: string | RegExp) => screen.findByRole("dialog", { name });
const open = (user: Awaited<ReturnType<typeof renderApp>>["user"], n: number) =>
  user.keyboard("{ArrowDown}".repeat(n) + "{ArrowRight}");

/** 텍스트 종류별 미리보기 본문 요소(레이블, 파일 위치) */
const KINDS = [
  { file: "a.md", at: 1, label: "마크다운 미리보기" },
  { file: "b.json", at: 2, label: "JSON 미리보기" },
  { file: "c.ts", at: 3, label: "코드 미리보기" },
  { file: "notes.txt", at: 4, label: "텍스트 미리보기" },
] as const;

describe("글꼴 설정", () => {
  it("ui_font는 앱 화면에만 적용되고 미리보기 본문에는 닿지 않는다", async () => {
    const backend = seed();
    backend.setConfig((l) => (l.config.behavior.ui_font = UI));
    const { user } = await renderApp(backend);
    expect(document.body.style.fontFamily).toBe(UI);
    expect(screen.getByRole("listbox", { name: "왼쪽 파일 목록" }).style.fontFamily).toBe(""); // 목록은 body에서 상속한다
    await open(user, 4);
    const body = within(await dlg("미리보기: notes.txt")).getByLabelText("텍스트 미리보기");
    expect(body.style.fontFamily).toBe(""); // 미리보기 글꼴을 따로 지정하지 않았으니 기본 글꼴 그대로
  });

  it.each(KINDS)("preview_font는 $file 미리보기 본문에만 적용되고 앱 화면에는 닿지 않는다", async ({ file, at, label }) => {
    const backend = seed();
    backend.setConfig((l) => (l.config.behavior.preview_font = PREVIEW));
    const { user } = await renderApp(backend);
    expect(document.body.style.fontFamily).toBe(""); // UI 글꼴은 그대로
    await open(user, at);
    const d = await dlg(`미리보기: ${file}`);
    expect(within(d).getByLabelText(label).style.fontFamily).toBe(PREVIEW);
    expect(within(d).getByRole("heading", { name: file }).style.fontFamily).toBe(""); // 제목은 UI 글꼴
    if (file === "a.md") expect(d.querySelector("code")!.style.fontFamily).toBe(PREVIEW);
  });

  it("두 글꼴을 함께 지정하면 각자 자기 영역에만 적용된다", async () => {
    const backend = seed();
    backend.setConfig((l) => {
      l.config.behavior.ui_font = UI;
      l.config.behavior.preview_font = PREVIEW;
    });
    const { user } = await renderApp(backend);
    await open(user, 4);
    const d = await dlg("미리보기: notes.txt");
    expect(document.body.style.fontFamily).toBe(UI);
    expect(within(d).getByLabelText("텍스트 미리보기").style.fontFamily).toBe(PREVIEW);
  });

  it("값을 비우면 기본 글꼴로 돌아간다 (덮어쓰기가 남지 않는다)", async () => {
    const backend = seed();
    backend.setConfig((l) => {
      l.config.behavior.ui_font = UI;
      l.config.behavior.preview_font = PREVIEW;
    });
    const { user } = await renderApp(backend);
    expect(document.body.style.fontFamily).toBe(UI);
    backend.setConfig((l) => {
      l.config.behavior.ui_font = "  ";
      l.config.behavior.preview_font = "";
    });
    await waitFor(() => expect(document.body.style.fontFamily).toBe(""));
    await open(user, 4);
    const d = await dlg("미리보기: notes.txt");
    expect(within(d).getByLabelText("텍스트 미리보기").style.fontFamily).toBe("");
  });

  it("설정 화면의 두 입력칸을 바꾸면 저장되고 바로 반영된다", async () => {
    const { user, backend } = await renderApp(seed());
    await user.keyboard("{Control>},{/Control}");
    await dlg("설정");
    const ui = screen.getByRole("textbox", { name: "UI 글꼴" });
    const preview = screen.getByRole("textbox", { name: "미리보기 글꼴" });
    await user.type(ui, UI);
    await user.tab();
    await waitFor(async () => expect((await backend.getConfig()).config.behavior.ui_font).toBe(UI));
    await waitFor(() => expect(document.body.style.fontFamily).toBe(UI));
    expect((await backend.getConfig()).config.behavior.preview_font).toBe(""); // 다른 쪽은 그대로
    await user.type(preview, PREVIEW);
    await user.tab();
    await waitFor(async () => expect((await backend.getConfig()).config.behavior.preview_font).toBe(PREVIEW));
    expect(document.body.style.fontFamily).toBe(UI);
    await user.keyboard("{Escape}");
    await open(user, 4);
    const d = await dlg("미리보기: notes.txt");
    expect(within(d).getByLabelText("텍스트 미리보기").style.fontFamily).toBe(PREVIEW);
  });
});
