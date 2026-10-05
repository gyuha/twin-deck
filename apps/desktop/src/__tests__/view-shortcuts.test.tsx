import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "./helpers";

const actionBar = () => screen.queryByRole("toolbar", { name: "액션 바" });
const driveBars = () => screen.queryAllByRole("toolbar", { name: /^드라이브/ });

describe("보기 단축키", () => {
  it("Ctrl+Shift+A는 Action Bar를, Ctrl+Shift+D는 Drive Bar를 토글한다", async () => {
    const { user } = await renderApp();
    expect(actionBar()).not.toBeNull();
    await user.keyboard("{Control>}{Shift>}a{/Shift}{/Control}");
    await waitFor(() => expect(actionBar()).toBeNull());
    await user.keyboard("{Control>}{Shift>}a{/Shift}{/Control}");
    await waitFor(() => expect(actionBar()).not.toBeNull());

    expect(driveBars().length).toBe(2);
    await user.keyboard("{Control>}{Shift>}d{/Shift}{/Control}");
    await waitFor(() => expect(driveBars().length).toBe(0));
    await user.keyboard("{Control>}{Shift>}d{/Shift}{/Control}");
    await waitFor(() => expect(driveBars().length).toBe(2));
  });

  it("macOS에서는 Cmd+Shift+A/D로 토글한다", async () => {
    const { user } = await renderApp(undefined, "mac");
    await user.keyboard("{Meta>}{Shift>}a{/Shift}{/Meta}");
    await waitFor(() => expect(actionBar()).toBeNull());
    await user.keyboard("{Meta>}{Shift>}d{/Shift}{/Meta}");
    await waitFor(() => expect(driveBars().length).toBe(0));
  });

  it("Help에 두 단축키가 표시된다", async () => {
    const { user } = await renderApp();
    await user.keyboard("{F1}");
    const help = await screen.findByRole("dialog", { name: "도움말" });
    const rowOf = (title: string) => within(help).getByText(title).parentElement!;
    expect(rowOf("Action Bar 표시 토글").textContent).toMatch(/Ctrl.*Shift.*A/);
    expect(rowOf("드라이브 바 표시 토글").textContent).toMatch(/Ctrl.*Shift.*D/);
  });

  it("상태 줄의 토글 버튼 툴팁에 단축키가 표시된다(macOS는 Cmd)", async () => {
    await renderApp();
    const status = screen.getByRole("status", { name: "상태 표시줄" });
    expect(within(status).getByRole("button", { name: "Action Bar 표시" })).toHaveAttribute("title", "Action Bar 표시 (Ctrl+Shift+A)");
    expect(within(status).getByRole("button", { name: "드라이브 바 표시" })).toHaveAttribute("title", "드라이브 바 표시 (Ctrl+Shift+D)");
  });
});
