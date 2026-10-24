import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "./helpers";

describe("닫으면 백그라운드로 유지 설정 (environment.background_on_close)", () => {
  const openEnv = async (platform: "linux" | "mac" | "windows") => {
    const r = await renderApp(undefined, platform);
    await r.user.keyboard(platform === "mac" ? "{Meta>},{/Meta}" : "{Control>},{/Control}");
    await screen.findByRole("dialog", { name: "설정" });
    await r.user.click(screen.getByRole("tab", { name: "환경" }));
    return r;
  };

  it("macOS에서는 기본으로 꺼진 스위치가 보이고, 켜면 바로 저장한다", async () => {
    const { user, backend } = await openEnv("mac");
    const sw = await screen.findByRole("switch", { name: "닫으면 백그라운드로 유지" });
    expect(sw).not.toBeChecked();
    await user.click(sw);
    await waitFor(async () => expect((await backend.getConfig()).config.environment.background_on_close).toBe(true));
  });

  it("Dock이 없는 Windows·Linux에서는 스위치도 종료 버튼도 보이지 않는다", async () => {
    await openEnv("windows");
    expect(screen.queryByRole("switch", { name: "닫으면 백그라운드로 유지" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "앱 종료" })).not.toBeInTheDocument();
  });

  it("macOS의 종료 버튼은 앱을 실제로 끝낸다", async () => {
    const { user, backend } = await openEnv("mac");
    await user.click(await screen.findByRole("button", { name: "앱 종료" }));
    await waitFor(() => expect(backend.appQuit).toBe(true));
  });
});
