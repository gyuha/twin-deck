import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "./helpers";
import { activeTabTitle, runAction, searchBackend, tabTitles, waitDone } from "./search-helpers";

const quickSelect = () => screen.queryByText(/빠른 선택/);

async function openUsage(action: "core.disk_usage" | "core.disk_usage.treemap") {
  const r = await renderApp(searchBackend());
  await runAction(r.user, action);
  await waitFor(() => expect(tabTitles()).toEqual(["a", "Disk Usage: a"]));
  await waitDone();
  return r;
}

describe("Disk Usage 탭에서 q로 나가기", () => {
  it("목록 보기에서 q를 누르면 탭이 닫히고 원래 탭으로 돌아온다", async () => {
    const { user } = await openUsage("core.disk_usage");
    await user.keyboard("q");
    await waitFor(() => expect(tabTitles()).toEqual(["a"]));
    expect(activeTabTitle()).toBe("a");
    expect(quickSelect()).toBeNull();
  });

  it("treemap 보기에서도 같다", async () => {
    const { user } = await openUsage("core.disk_usage.treemap");
    expect(screen.getByLabelText("용량 treemap")).toBeInTheDocument();
    await user.keyboard("q");
    await waitFor(() => expect(tabTitles()).toEqual(["a"]));
  });

  it("수식키가 있으면 나가지 않는다: Ctrl·Alt·Shift·Cmd+Q", async () => {
    const { user } = await openUsage("core.disk_usage");
    await user.keyboard("{Control>}q{/Control}");
    await user.keyboard("{Alt>}q{/Alt}");
    await user.keyboard("{Shift>}q{/Shift}");
    await user.keyboard("{Meta>}q{/Meta}");
    expect(tabTitles()).toEqual(["a", "Disk Usage: a"]);
  });

  it("한글 입력기 상태(key가 'ㅂ', 물리 키는 KeyQ)에서도 나간다", async () => {
    await openUsage("core.disk_usage");
    fireEvent.keyDown(window, { key: "ㅂ", code: "KeyQ" });
    await waitFor(() => expect(tabTitles()).toEqual(["a"]));
  });

  it("일반 폴더에서 q는 Quick Select를 시작한다(탭은 그대로)", async () => {
    const { user } = await renderApp(searchBackend());
    await user.keyboard("q");
    await waitFor(() => expect(quickSelect()).not.toBeNull());
    expect(tabTitles()).toEqual(["a"]);
  });

  it("Disk Usage 탭에서 Quick Select가 진행 중이면 q는 검색어다(나가지 않는다)", async () => {
    const { user } = await openUsage("core.disk_usage");
    await user.keyboard("d"); // 글자로 찾기 시작 — docs
    await waitFor(() => expect(quickSelect()).not.toBeNull());
    await user.keyboard("q");
    expect(tabTitles()).toEqual(["a", "Disk Usage: a"]);
    expect(quickSelect()).not.toBeNull();
  });

  it("패널의 유일한 탭이 Disk Usage이면 q는 기준 폴더의 일반 탭으로 바꾼다", async () => {
    const { user } = await openUsage("core.disk_usage");
    fireEvent(screen.getAllByRole("tab")[0], new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true })); // 원래 탭을 닫는다
    await waitFor(() => expect(tabTitles()).toEqual(["Disk Usage: a"]));
    await user.keyboard("q");
    await waitFor(() => expect(tabTitles()).toEqual(["a"]));
    expect(screen.getByRole("listbox", { name: "왼쪽 파일 목록" })).toBeInTheDocument();
  });
});
