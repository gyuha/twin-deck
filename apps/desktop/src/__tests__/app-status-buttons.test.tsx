import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "./helpers";

// 메뉴바가 없는 Windows·Linux의 진입점(이슈 #40). 보기 토글 줄 옆에 `설정`·`단축키` 버튼을 둔다.
const bar = () => screen.getByRole("status", { name: "상태 표시줄" });

describe("상태 표시줄 설정·단축키 버튼", () => {
  it.each(["linux", "mac"] as const)("%s: 두 버튼이 보이고 title에 현재 키가 있다", async (platform) => {
    await renderApp(undefined, platform);
    const settings = within(bar()).getByRole("button", { name: "설정" });
    const help = within(bar()).getByRole("button", { name: "단축키 목록" });
    expect(settings.getAttribute("title")).toMatch(/설정.*\(.+\)/);
    expect(help.getAttribute("title")).toMatch(/단축키 목록.*\(F1\)/);
  });

  it("누르면 설정 화면과 도움말 화면이 열린다", async () => {
    const { user } = await renderApp();
    await user.click(within(bar()).getByRole("button", { name: "단축키 목록" }));
    expect(await screen.findByRole("dialog", { name: /도움말|단축키/ })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /도움말|단축키/ })).toBeNull());
    await user.click(within(bar()).getByRole("button", { name: "설정" }));
    expect(await screen.findByRole("dialog", { name: "설정" })).toBeInTheDocument();
  });
});
