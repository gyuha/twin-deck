import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "./helpers";

const HANGUL = /[가-힣]/;
// 대화상자 컴포넌트의 고정 글자(버튼·안내)는 3/5의 몫이라, 여기서는 store가 만든 제목·본문만 본다.
const heading = (d: HTMLElement) => d.querySelector("h2")?.textContent ?? "";

// 영어에서 store가 만드는 대화상자·알림에 한글이 없다(이슈 #32).
describe("영어 store 문구", () => {
  // 도우미(`renderApp`)는 한국어 목록 이름으로 화면이 뜨기를 기다리므로, 한국어로 띄운 뒤 영어로 바꾼다.
  const english = async () => {
    const r = await renderApp();
    await r.backend.setConfigValue("behavior.language", { kind: "str", value: "en" });
    await screen.findByRole("listbox", { name: "Left file list" });
    return r;
  };

  it("새 폴더·이름 변경 대화상자 제목이 영어다", async () => {
    const { user } = await english();
    await user.keyboard("{F7}");
    const d = await screen.findByRole("dialog", { name: "New Folder" });
    expect(HANGUL.test(heading(d))).toBe(false);
    await user.keyboard("{Escape}");
  });

  it("영구 삭제 확인 창과 파일 정보가 영어다", async () => {
    const { user } = await english();
    await user.keyboard("{Shift>}{F8}{/Shift}");
    const d = await screen.findByRole("dialog");
    expect(d.textContent).toMatch(/Permanently delete/);
    expect(d.textContent).not.toMatch(/영구 삭제/);
    await user.keyboard("{Escape}");
  });

  it("한국어 기본에서는 그대로 한국어다", async () => {
    const { user } = await renderApp();
    await user.keyboard("{F7}");
    expect(await screen.findByRole("dialog", { name: "새 폴더" })).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).queryByText(/New Folder/)).toBeNull();
  });
});
