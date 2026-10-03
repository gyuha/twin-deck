import { act, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FakeBackend } from "@twin-deck/ts-client";
import { renderApp, seedBackend } from "./helpers";

const setup = () => {
  const b = seedBackend();
  b.diskSpaces = { "/": { free: 73.8e9, total: 500e9 } };
  return b;
};
const driveBars = () => screen.queryAllByRole("toolbar", { name: /^드라이브 \(/ });
const actionBar = () => screen.queryByRole("toolbar", { name: "액션 바" });
const flags = async (b: FakeBackend) => (await b.getConfig()).config.behavior.layout;
type User = Awaited<ReturnType<typeof renderApp>>["user"];
const runAction = async (user: User, query: string) => {
  await user.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");
  const input = await screen.findByRole("textbox", { name: "액션 검색" });
  await user.clear(input); // Actions Panel은 이전 검색어를 채워 두고 연다
  await user.type(input, query);
  await user.keyboard("{Enter}");
};

describe("드라이브 바·Action Bar 켜고 끄기", () => {
  it("설정 파일의 show_drive_bar = false이면 드라이브 바가 없고, 설정이 바뀌면 바로 나타난다", async () => {
    const b = setup();
    b.setConfig((l) => (l.config.behavior.layout.show_drive_bar = false));
    await renderApp(b);
    await act(() => new Promise<void>((r) => setTimeout(r, 50)));
    expect(driveBars()).toHaveLength(0);
    await act(async () => b.setConfig((l) => (l.config.behavior.layout.show_drive_bar = true)));
    await waitFor(() => expect(driveBars()).toHaveLength(2));
  });

  it("기본은 둘 다 보인다", async () => {
    await renderApp(setup());
    await waitFor(() => expect(driveBars()).toHaveLength(2));
    expect(actionBar()).toBeInTheDocument();
  });

  it("core.view.drive_bar 액션이 드라이브 바를 끄고 켜며 설정 파일에 저장한다", async () => {
    const b = setup();
    const { user } = await renderApp(b);
    await waitFor(() => expect(driveBars()).toHaveLength(2));
    await runAction(user, "드라이브 바 표시 토글");
    await waitFor(() => expect(driveBars()).toHaveLength(0));
    expect((await flags(b)).show_drive_bar).toBe(false);
    expect(actionBar()).toBeInTheDocument(); // Action Bar는 그대로
    await runAction(user, "드라이브 바 표시 토글");
    await waitFor(() => expect(driveBars()).toHaveLength(2));
    expect((await flags(b)).show_drive_bar).toBe(true);
  });

  it("core.view.action_bar 액션이 Action Bar를 끄고 켠다", async () => {
    const b = setup();
    const { user } = await renderApp(b);
    await runAction(user, "Action Bar 표시 토글");
    await waitFor(() => expect(actionBar()).toBeNull());
    expect((await flags(b)).show_action_bar).toBe(false);
    expect(driveBars()).toHaveLength(2); // 드라이브 바는 그대로
    await runAction(user, "Action Bar 표시 토글");
    await waitFor(() => expect(actionBar()).toBeInTheDocument());
  });

  it("설정 화면의 '드라이브 바 표시' 스위치로도 끈다", async () => {
    const b = setup();
    const { user } = await renderApp(b);
    await user.keyboard("{Control>},{/Control}");
    await screen.findByRole("dialog", { name: "설정" });
    await user.click(screen.getByRole("switch", { name: "드라이브 바 표시" }));
    await waitFor(async () => expect((await flags(b)).show_drive_bar).toBe(false));
    await user.keyboard("{Escape}");
    expect(driveBars()).toHaveLength(0);
  });
});
