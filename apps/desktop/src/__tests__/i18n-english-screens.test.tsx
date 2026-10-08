import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";

// behavior.language = "en"에서 대표 화면의 글자에 한글이 하나도 없다(이슈 #32 C4).
// 파일 이름 같은 사용자 데이터는 영어로 시드하고, 화면 문구만 검사한다.
const HANGUL = /[가-힣]/;
const noHangul = (where: string) => {
  const text = (document.body.textContent ?? "") + [...document.querySelectorAll("[aria-label],[title],[placeholder]")].map((e) => `${e.getAttribute("aria-label")} ${e.getAttribute("title")} ${e.getAttribute("placeholder")}`).join(" ");
  const bad = text.match(/.{0,20}[가-힣]+.{0,20}/g);
  expect(HANGUL.test(text), `${where}: ${bad?.slice(0, 3).join(" | ")}`).toBe(false);
};
const seed = () => new FakeBackend().seed({ "/home/a/alpha.txt": "alpha", "/home/a/beta.txt": "beta", "/home/a/docs": null, "/home/b": null });
const english = async () => {
  const r = await renderApp(seed());
  await r.backend.setConfigValue("behavior.language", { kind: "str", value: "en" });
  await screen.findByRole("listbox", { name: "Left file list" });
  return r;
};

describe("영어 화면에는 한글이 없다", () => {
  it("메인 화면(목록·상태 표시줄·Action Bar·드라이브 바)", async () => {
    await english();
    noHangul("main");
  });

  it("설정 화면의 모든 탭", async () => {
    const { user } = await english();
    await user.keyboard("{Control>},{/Control}");
    const dialog = await screen.findByRole("dialog", { name: "Settings" });
    const tabs = within(dialog).getAllByRole("tab");
    expect(tabs.length).toBeGreaterThan(5);
    for (const tab of tabs) {
      await user.click(tab);
      noHangul(`settings:${tab.textContent}`);
    }
  });

  it("도움말·액션 패널·작업 큐", async () => {
    const { user } = await english();
    await user.keyboard("{F1}");
    await screen.findByRole("dialog", { name: "Help" });
    noHangul("help");
    await user.keyboard("{Escape}");
    await user.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");
    await waitFor(() => noHangul("palette"));
    await user.keyboard("{Escape}");
    await user.keyboard("=");
    await screen.findByRole("dialog", { name: "Job Queue" });
    noHangul("queue");
    await user.keyboard("{Escape}");
  });

  it("새 폴더·삭제 확인·파일 정보 대화상자", async () => {
    const { user } = await english();
    await user.keyboard("{F7}");
    await screen.findByRole("dialog", { name: "New Folder" });
    noHangul("new-folder");
    await user.keyboard("{Escape}");
    await user.keyboard("{Shift>}{F8}{/Shift}");
    await screen.findByRole("dialog");
    noHangul("delete-confirm");
    await user.keyboard("{Escape}");
  });

  it("컨텍스트 메뉴와 미리보기 안내", async () => {
    const { user } = await english();
    const row = within(screen.getByRole("listbox", { name: "Left file list" })).getAllByRole("option")[0];
    await user.pointer({ keys: "[MouseRight]", target: row });
    await screen.findByRole("menu", {}).catch(() => undefined);
    noHangul("context-menu");
    await user.keyboard("{Escape}");
    // 폴더 미리보기 본문은 Rust가 만든 글자("(빈 폴더)")라 대응표로 바뀐다.
    await user.keyboard("{Shift>}{ArrowRight}{/Shift}");
    await screen.findByRole("dialog", { name: /^Preview: docs/ });
    expect(document.body.textContent).toContain("(empty folder)");
    noHangul("preview-folder");
    await user.keyboard("{Escape}");
    await user.keyboard("{ArrowDown}{Shift>}{ArrowRight}{/Shift}");
    await screen.findByRole("dialog", { name: /^Preview: alpha/ });
    noHangul("preview");
    await user.keyboard("{Escape}");
  });

  it("파일 찾기 대화상자", async () => {
    const { user } = await english();
    await user.keyboard("{Control>}f{/Control}");
    await screen.findByRole("dialog", { name: "Find Files" });
    noHangul("find");
  });
});
