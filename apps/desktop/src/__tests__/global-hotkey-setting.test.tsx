import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "./helpers";

describe("전역 단축키 설정 (environment.global_hotkey)", () => {
  it("설정 화면에 항목이 있고 기본값은 Mod+Alt+O다", async () => {
    const { user } = await renderApp();
    await user.keyboard("{Control>},{/Control}");
    await screen.findByRole("dialog", { name: "설정" });
    await user.click(screen.getByRole("tab", { name: "환경" }));
    const box = await screen.findByRole("textbox", { name: "전역 화면 열기 단축키" });
    expect(box).toHaveValue("Mod+Alt+O");
    expect(screen.getByRole("switch", { name: "전역 화면 열기 단축키 사용" })).toBeChecked();
  });
});
