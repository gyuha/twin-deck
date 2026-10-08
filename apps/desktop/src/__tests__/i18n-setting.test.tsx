import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "./helpers";

// 언어 설정(이슈 #32): 기본은 한국어이고, 설정 화면에서 English를 고르면 바로 영어가 되고 저장된다.
describe("언어 설정", () => {
  it("기본은 ko이고 설정 화면의 언어 선택에서 English를 고르면 화면이 바로 영어로 바뀌고 저장된다", async () => {
    const { user, backend } = await renderApp();
    expect((await backend.getConfig()).config.behavior.language).toBe("ko");
    await user.keyboard("{Meta>},{/Meta}");
    await user.keyboard("{Control>},{/Control}");
    const dialog = await screen.findByRole("dialog", { name: "설정" });
    expect(within(dialog).getByText("언어")).toBeInTheDocument();
    const row = within(dialog).getByRole("group", { name: "언어" });
    await user.click(within(row).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "English" }));
    await waitFor(async () => expect((await backend.getConfig()).config.behavior.language).toBe("en"));
    expect(await screen.findByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.keyboard("{F1}");
    expect(await screen.findByRole("dialog", { name: "Help" })).toBeInTheDocument();
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
    expect(screen.getAllByText("Copy").length).toBeGreaterThan(0); // 액션 제목
  });
});
