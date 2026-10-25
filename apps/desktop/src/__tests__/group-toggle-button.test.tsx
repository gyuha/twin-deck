import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { list, renderApp } from "./helpers";

const DAY = 24 * 60 * 60 * 1000;
const bar = () => screen.getByRole("status", { name: "상태 표시줄" });
const headers = () => [...list("left").querySelectorAll("[data-group-header]")].map((h) => h.textContent);

/** 오늘과 15일 전에 고친 파일 둘. 어느 날 돌려도 구간이 달라지도록 오늘 기준 간격으로 잡는다. */
function seed(on = false) {
  const b = new FakeBackend().seed({ "/home/a/today.txt": "t", "/home/a/old.txt": "o", "/home/b": null });
  const now = Date.now();
  b.setTimes("/home/a/today.txt", { modifiedMs: now });
  b.setTimes("/home/a/old.txt", { modifiedMs: now - 15 * DAY });
  b.setConfig((l) => {
    l.config.behavior.table.group_by_modified = on;
  });
  return b;
}
const groupButton = () => within(bar()).getByRole("button", { name: "수정일로 묶어 보기" });

describe("상태 표시줄 묶어보기 버튼 (이슈 #69)", () => {
  it("숨김 파일 표시 버튼 바로 다음에 있고 글자 대신 아이콘과 툴팁이 있다 (이슈 #129)", async () => {
    await renderApp(seed());
    const hidden = within(bar()).getByRole("button", { name: "숨김 파일 표시" });
    expect(hidden.nextElementSibling).toBe(groupButton());
    expect(groupButton().querySelector("svg")).not.toBeNull();
    expect(within(groupButton()).getByRole("tooltip")).toHaveTextContent("수정일로 묶어 보기");
  });

  it("누르면 켜지고 설정에 저장되며 구간 제목이 생기고, 다시 누르면 꺼진다", async () => {
    const backend = seed(false);
    const { user } = await renderApp(backend);
    expect(groupButton()).toHaveAttribute("aria-pressed", "false");
    expect(headers()).toEqual([]);
    await user.click(groupButton());
    await waitFor(() => expect(groupButton()).toHaveAttribute("aria-pressed", "true"));
    expect((await backend.getConfig()).config.behavior.table.group_by_modified).toBe(true);
    await waitFor(() => expect(headers()).toEqual(["오늘", "이전 30일"]));
    await user.click(groupButton());
    await waitFor(() => expect(groupButton()).toHaveAttribute("aria-pressed", "false"));
    expect((await backend.getConfig()).config.behavior.table.group_by_modified).toBe(false);
    await waitFor(() => expect(headers()).toEqual([]));
  });

  it("설정이 켜져 있으면 처음부터 눌려 있고 구간 제목이 보인다", async () => {
    await renderApp(seed(true));
    expect(groupButton()).toHaveAttribute("aria-pressed", "true");
    expect(headers()).toEqual(["오늘", "이전 30일"]);
  });

  it("영어에서는 이름과 툴팁이 Group by date modified다", async () => {
    const backend = seed();
    await renderApp(backend);
    await backend.setConfigValue("behavior.language", { kind: "str", value: "en" });
    const status = await screen.findByRole("status", { name: "Status bar" });
    const button = within(status).getByRole("button", { name: "Group by date modified" });
    expect(within(button).getByRole("tooltip")).toHaveTextContent("Group by date modified");
    expect(within(status).getByRole("button", { name: "Show hidden files" }).nextElementSibling).toBe(button);
  });
});
