import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Loaded } from "@twin-deck/ts-client";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp, seedBackend } from "./helpers";

const bar = () => screen.queryByRole("toolbar", { name: "액션 바" });
const buttons = () => within(bar()!).getAllByRole("button").map((b) => b.textContent);
const button = (name: RegExp) => within(bar()!).getByRole("button", { name });
const bind = (key: string, action: string | null) => ({ key, action, args: {}, scope: null });

function seed(change: (l: Loaded) => void = () => {}) {
  const b = seedBackend();
  b.setConfig(change);
  return b;
}

describe("PANE-07 Action Bar", () => {
  it("기본 구성: 편집/복사/이동/새 폴더/휴지통/삭제와 각 액션의 현재 키", async () => {
    await renderApp();
    expect(buttons()).toEqual(["F4편집", "F5복사", "F6이동", "F7새 폴더", "F8휴지통", "Shift+F8삭제"]);
    expect(button(/복사/)).toHaveAttribute("title", "core.copy");
  });

  it("키 표기는 플랫폼을 따른다 (Mod → Cmd/Ctrl, Alt → Opt/Alt)", async () => {
    const config = (l: Loaded) => (l.config.layout.action_bar = ["core.duplicate", "core.menu.volumes", "core.file.info"]);
    await renderApp(seed(config), "mac");
    expect(buttons()).toEqual(["Cmd+D복제", "Opt+1볼륨 메뉴", "Cmd+I파일 정보"]);
    cleanup();
    await renderApp(seed(config), "linux");
    expect(buttons()).toEqual(["Ctrl+D복제", "Alt+1볼륨 메뉴", "Ctrl+I파일 정보"]);
  });

  it("layout.action_bar 설정으로 구성을 바꾼다. 알 수 없는 ID는 무시하고 경고한다", async () => {
    const b = seed((l) => (l.config.layout.action_bar = ["core.copy", "bogus.id", "core.rename"]));
    await renderApp(b);
    expect(buttons()).toEqual(["F5복사", "Shift+F6이름 변경"]);
    expect(await screen.findByRole("button", { name: /설정 경고 1개/ })).toBeInTheDocument();
  });

  it("show_action_bar = false 이면 숨기고, 설정이 바뀌면 바로 나타난다", async () => {
    const b = seed((l) => (l.config.behavior.layout.show_action_bar = false));
    await renderApp(b);
    expect(bar()).toBeNull();
    await act(async () => b.setConfig((l) => (l.config.behavior.layout.show_action_bar = true)));
    await waitFor(() => expect(bar()).not.toBeNull());
    await act(async () => b.setConfig((l) => (l.config.behavior.layout.show_action_bar = false)));
    await waitFor(() => expect(bar()).toBeNull());
  });

  it("실행할 수 없는 액션은 비활성으로 보이고 눌러도 실행되지 않는다 (ACT-02)", async () => {
    const b = new FakeBackend().seed({ "/home/a/a.txt": "a", "/home/b": null });
    const { user } = await renderApp(b, "linux", { left: "/home/b", right: "/home/a" }, { emptyLeft: true });
    expect(button(/복사/)).toHaveAttribute("aria-disabled", "true");
    expect(button(/새 폴더/)).toHaveAttribute("aria-disabled", "false");
    await user.click(button(/복사/));
    await new Promise((r) => setTimeout(r, 30));
    expect((await b.queueJobs()).length).toBe(0);
  });

  it("커서 항목이 있으면 활성이고 버튼을 눌러 실행한다", async () => {
    const b = seed();
    const { user } = await renderApp(b);
    expect(button(/복사/)).toHaveAttribute("aria-disabled", "false");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    await user.click(button(/복사/));
    await waitFor(() => expect(b.exists("/home/b/a.txt")).toBe(true));
  });

  it("사용자 키바인딩이 바뀌면 표시되는 키도 바뀐다", async () => {
    const b = seed((l) => {
      l.config.layout.action_bar = ["core.copy", "core.move"];
      l.bindings.push(bind("F5", null), bind("F9", "core.copy"));
    });
    await renderApp(b);
    expect(buttons()).toEqual(["F9복사", "F6이동"]);
    // F5를 이동이 가져가면 복사는 키가 없어지고, 이동은 기본 F6이 그대로 첫 키다
    await act(async () => b.setConfig((l) => (l.bindings = [bind("F5", "core.move")])));
    await waitFor(() => expect(buttons()).toEqual(["복사", "F6이동"]));
  });

  it("키가 없는 액션은 이름만 보인다", async () => {
    const b = seed((l) => (l.config.layout.action_bar = ["core.reveal"]));
    await renderApp(b);
    expect(buttons()).toEqual(["파일 관리자에서 보기"]);
  });
});
