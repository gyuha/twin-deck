import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_BINDINGS } from "@twin-deck/actions";
import { renderApp, seedBackend } from "./helpers";
import { runAction } from "./search-helpers";

const URL = "https://github.com/gyuha/twin-deck/releases";
const open = (user: Awaited<ReturnType<typeof renderApp>>["user"]) => user.keyboard("{Control>},{/Control}");
const dialog = () => screen.findByRole("dialog", { name: "설정" });

describe("릴리스 노트 열기 (이슈 #70)", () => {
  it("업데이트 탭의 현재 버전 줄에 변경 사항 버튼이 있고 누르면 릴리스 목록을 연다", async () => {
    const backend = seedBackend();
    const { user } = await renderApp(backend);
    await open(user);
    const d = await dialog();
    await user.click(within(d).getByRole("tab", { name: "업데이트" }));
    const releases = within(d).getByRole("button", { name: "변경 사항" });
    expect(releases.parentElement).toHaveTextContent("1.2.3");
    expect(backend.openedUrls).toEqual([]);
    await user.click(releases);
    await waitFor(() => expect(backend.openedUrls).toEqual([URL]));
    expect(screen.getByRole("dialog", { name: "설정" })).toBeInTheDocument(); // 설정은 그대로 열려 있다
  });

  it("액션 패널의 core.app.releases도 같은 주소를 연다", async () => {
    const backend = seedBackend();
    const { user } = await renderApp(backend);
    await runAction(user, "core.app.releases");
    await waitFor(() => expect(backend.openedUrls).toEqual([URL]));
  });

  it("영어에서는 버튼 이름이 Release notes다", async () => {
    const backend = seedBackend();
    const { user } = await renderApp(backend);
    await backend.setConfigValue("behavior.language", { kind: "str", value: "en" });
    await open(user);
    const d = await screen.findByRole("dialog", { name: "Settings" });
    await user.click(within(d).getByRole("tab", { name: "Updates" }));
    expect(within(d).getByRole("button", { name: "Release notes" })).toBeInTheDocument();
  });

  it("이 액션에는 기본 단축키가 없다", () => {
    expect(DEFAULT_BINDINGS.some((b) => b.actionId === "core.app.releases")).toBe(false);
  });
});
