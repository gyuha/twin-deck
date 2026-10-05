import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "./helpers";

describe("다중 이름 바꾸기 단축키", () => {
  it("Help에 Ctrl+Shift+R로 표시된다(macOS는 Cmd+Shift+R)", async () => {
    const { user } = await renderApp();
    await user.keyboard("{F1}");
    const help = await screen.findByRole("dialog", { name: "도움말" });
    expect(within(help).getByText("다중 이름 바꾸기").parentElement!.textContent).toMatch(/Ctrl.*Shift.*R/);
  });

  it("Ctrl+Shift+R로 다중 이름 바꾸기가 열린다(2개 이상 선택했을 때)", async () => {
    const { user } = await renderApp();
    await user.keyboard("{Control>}a{/Control}");
    await user.keyboard("{Control>}{Shift>}r{/Shift}{/Control}");
    await screen.findByRole("dialog", { name: /다중 이름 바꾸기/ });
  });

  it("Ctrl+Shift+F는 여전히 빠른 선택을 시작한다(키 충돌 없음)", async () => {
    const { user } = await renderApp();
    await user.keyboard("{Control>}{Shift>}f{/Shift}{/Control}");
    await waitFor(() => expect(screen.getByRole("status", { name: "빠른 선택" })).toBeInTheDocument());
    expect(screen.queryByRole("dialog", { name: /다중 이름 바꾸기/ })).toBeNull();
  });
});
