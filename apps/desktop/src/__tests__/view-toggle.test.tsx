import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { names, renderApp } from "./helpers";

const actionBar = () => screen.queryByRole("toolbar", { name: "액션 바" });
const driveBars = () => screen.queryAllByRole("toolbar", { name: /^드라이브/ });
const status = () => screen.getByRole("status", { name: "상태 표시줄" });
const toggle = (name: string) => within(status()).getByRole("button", { name });

describe("보기 토글 버튼 (오른쪽 아래)", () => {
  it("Action Bar 보기 토글: 클릭하면 숨기고 다시 클릭하면 나타나며, 숨긴 동안에도 버튼이 남는다", async () => {
    const { user } = await renderApp();
    expect(actionBar()).not.toBeNull();
    expect(toggle("Action Bar 표시")).toHaveAttribute("aria-pressed", "true");
    await user.click(toggle("Action Bar 표시"));
    await waitFor(() => expect(actionBar()).toBeNull());
    expect(toggle("Action Bar 표시")).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle("Action Bar 표시"));
    await waitFor(() => expect(actionBar()).not.toBeNull());
    expect(toggle("Action Bar 표시")).toHaveAttribute("aria-pressed", "true");
  });

  it("Drive Bar 보기 토글: 클릭하면 두 패널의 드라이브 바가 사라졌다 나타나며, 숨긴 동안에도 버튼이 남는다", async () => {
    const { user } = await renderApp();
    expect(driveBars().length).toBe(2);
    await user.click(toggle("드라이브 바 표시"));
    await waitFor(() => expect(driveBars().length).toBe(0));
    expect(toggle("드라이브 바 표시")).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle("드라이브 바 표시"));
    await waitFor(() => expect(driveBars().length).toBe(2));
  });

  it("숨김 파일 표시 토글: 클릭하면 숨김 파일이 나타났다 사라진다", async () => {
    const { user } = await renderApp();
    expect(names("left").some((n) => n.includes(".hidden"))).toBe(false);
    expect(toggle("숨김 파일 표시")).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle("숨김 파일 표시"));
    await waitFor(() => expect(names("left").some((n) => n.includes(".hidden"))).toBe(true));
    expect(toggle("숨김 파일 표시")).toHaveAttribute("aria-pressed", "true");
    await user.click(toggle("숨김 파일 표시"));
    await waitFor(() => expect(names("left").some((n) => n.includes(".hidden"))).toBe(false));
  });
});
