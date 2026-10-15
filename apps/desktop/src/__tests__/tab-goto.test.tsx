import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { list, renderApp } from "./helpers";

// 터미널 탭 상황을 만들기 위해 화면 엔진만 가짜로 바꾼다(xterm.js는 jsdom에서 그려지지 않는다).
vi.mock("../lib/terminalEngine", () => ({
  createTerminalEngine: async () => ({
    open: () => {},
    write: () => {},
    onData: () => {},
    onResize: () => {},
    cols: 100,
    rows: 30,
    setFontFamily: () => {},
    focus: () => {},
    dispose: () => {},
  }),
}));

// 이슈 #73: 탭을 번호로 옮긴다. macOS는 Cmd+숫자, Windows/Linux는 Ctrl+Shift+숫자(Ctrl+Alt+숫자는 표시 모드와 겹쳐 쓰지 않는다).
const MAC = (n: number) => `{Meta>}${n}{/Meta}`;
const WIN = (n: number) => `{Control>}{Shift>}${n}{/Shift}{/Control}`;
const tabs = (pane: "left" | "right") => within(screen.getAllByRole("tablist")[pane === "left" ? 0 : 1]).getAllByRole("tab");
const selected = (pane: "left" | "right") => tabs(pane).findIndex((t) => t.getAttribute("aria-selected") === "true");
const backend = () => new FakeBackend().seed({ "/home/a/a.txt": "a", "/home/b/b.txt": "b" });

beforeEach(() => vi.clearAllMocks());

describe.each([
  ["mac", "Cmd+숫자", MAC, "{Meta>}t{/Meta}"],
  ["windows", "Ctrl+Shift+숫자", WIN, "{Control>}t{/Control}"],
  ["linux", "Ctrl+Shift+숫자", WIN, "{Control>}t{/Control}"],
] as const)("탭 번호 이동 — %s %s", (platform, _label, press, newTab) => {
  const open3 = async () => {
    const r = await renderApp(backend(), platform);
    await r.user.keyboard(newTab);
    await r.user.keyboard(newTab);
    await waitFor(() => expect(tabs("left")).toHaveLength(3));
    expect(selected("left")).toBe(2); // 새 탭은 활성이 된다
    return r;
  };

  it("2는 두 번째 탭, 1은 첫 탭으로 간다", async () => {
    const { user } = await open3();
    await user.keyboard(press(2));
    await waitFor(() => expect(selected("left")).toBe(1));
    await user.keyboard(press(1));
    await waitFor(() => expect(selected("left")).toBe(0));
  });

  it("9는 마지막 탭이다", async () => {
    const { user } = await open3();
    await user.keyboard(press(1));
    await waitFor(() => expect(selected("left")).toBe(0));
    await user.keyboard(press(9));
    await waitFor(() => expect(selected("left")).toBe(2));
  });

  it("탭 수를 넘는 번호는 활성 탭을 바꾸지 않는다", async () => {
    const { user } = await open3();
    await user.keyboard(press(1));
    await waitFor(() => expect(selected("left")).toBe(0));
    await user.keyboard(press(5));
    expect(selected("left")).toBe(0);
    expect(tabs("left")).toHaveLength(3);
  });

  it("활성 패널의 탭만 옮기고 다른 패널은 그대로다", async () => {
    const { user } = await open3();
    await user.keyboard(press(1));
    await waitFor(() => expect(selected("left")).toBe(0));
    expect(selected("right")).toBe(0);
    expect(tabs("right")).toHaveLength(1);
  });
});

describe("표시 모드와 키가 겹치지 않는다", () => {
  it("windows에서 Ctrl+Alt+1은 여전히 열 1개 보기이고 탭을 바꾸지 않는다", async () => {
    const { user } = await renderApp(backend(), "windows");
    await user.keyboard("{Control>}t{/Control}");
    await waitFor(() => expect(tabs("left")).toHaveLength(2));
    expect(selected("left")).toBe(1);
    await user.keyboard("{Control>}{Alt>}1{/Alt}{/Control}");
    await waitFor(() => expect(list("left").getAttribute("data-view")).toBe("columns-1"));
    expect(selected("left")).toBe(1);
  });
});

describe("터미널 탭이 활성일 때", () => {
  it("windows Ctrl+Shift+1은 터미널 탭에서도 앱이 받아 첫 탭으로 간다", async () => {
    const { user } = await renderApp(backend(), "windows");
    await user.keyboard("{Control>}{Alt>}t{/Alt}{/Control}"); // 반대편(오른쪽) 패널에 터미널 탭
    await waitFor(() => expect(tabs("right")).toHaveLength(2));
    expect(selected("left")).toBe(0);
    await user.keyboard("{Tab}"); // 오른쪽 패널을 활성으로 — 터미널 탭이 활성인 패널이다
    expect(selected("right")).toBe(1);
    expect(tabs("right")[1].textContent).toContain("터미널");
    await user.keyboard(WIN(1)); // 터미널 탭에서 출발해 파일 탭으로
    await waitFor(() => expect(selected("right")).toBe(0));
    await user.keyboard(WIN(2)); // 다시 터미널 탭으로
    await waitFor(() => expect(selected("right")).toBe(1));
  });
});
