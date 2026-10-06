import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FakeBackend } from "@twin-deck/ts-client";
import { cursorName, renderApp, seedBackend } from "./helpers";

const buttons = () => within(screen.getByRole("toolbar", { name: "액션 바" })).getAllByRole("button").map((b) => b.textContent);
const BASE = ["F4편집", "F5복사", "F6이동", "F7새 폴더", "F8휴지통", "Shift+F8삭제"];
const seed = (fkeys: Record<string, string>, bar: Record<string, boolean>, apps: Record<string, string> = {}) => {
  const b = seedBackend();
  b.setConfig((l) => {
    Object.assign(l.config.fkeys, fkeys);
    Object.assign(l.config.fkey_bar, bar);
    Object.assign(l.config.fkey_apps, apps);
  });
  return b;
};

describe("F키 설정의 Action Bar 노출", () => {
  it("기본값에서는 바가 기존 구성 그대로다", async () => {
    await renderApp(seed({ F2: "core.rename" }, {}));
    expect(buttons()).toEqual(BASE);
  });

  it("체크한 줄만 기존 구성 뒤에 F키 순서로, 조합키는 그 뒤에 붙는다", async () => {
    await renderApp(seed({ F9: "core.duplicate", F2: "core.rename", "Ctrl+F1": "core.file.info", F3: "core.copy" }, { F9: true, F2: true, "Ctrl+F1": true }));
    expect(buttons()).toEqual([...BASE, "F2이름 변경", "F9복제", "Ctrl+F1파일 정보"]);
  });

  it("동작을 기본값으로 둔 줄은 내장 바인딩의 액션으로 나타나고, 해제한 줄은 빠진다", async () => {
    await renderApp(seed({ F8: "none" }, { F2: true, F8: true, F9: true }));
    // F2 기본값 = 이름 변경. F8은 해제(휴지통 버튼의 키 표기도 사라진다), F9은 내장 바인딩이 없다
    expect(buttons()).toEqual(["F4편집", "F5복사", "F6이동", "F7새 폴더", "휴지통", "Shift+F8삭제", "F2이름 변경"]);
  });

  it("버튼을 누르면 그 줄의 액션이 실행된다", async () => {
    const { user } = await renderApp(seed({ F2: "core.rename" }, { F2: true }));
    await user.keyboard("{ArrowDown}{ArrowDown}"); // a.txt
    expect(cursorName("left")).toBe("a.txt");
    await user.click(within(screen.getByRole("toolbar", { name: "액션 바" })).getByRole("button", { name: /이름 변경/ }));
    expect(await screen.findByRole("textbox", { name: "이름" })).toHaveValue("a.txt");
  });

  it("앱 실행 줄은 그 줄의 앱 경로를 인수로 실행한다", async () => {
    const backend: FakeBackend = seed({ "Ctrl+F3": "core.app.launch" }, { "Ctrl+F3": true }, { "Ctrl+F3": "/Applications/Foo.app" });
    const { user } = await renderApp(backend);
    await user.keyboard("{ArrowDown}{ArrowDown}");
    await user.click(within(screen.getByRole("toolbar", { name: "액션 바" })).getByTitle("core.app.launch"));
    await waitFor(() => expect(backend.launched).toEqual([{ app: "/Applications/Foo.app", paths: ["/home/a/a.txt"] }]));
  });

  it("설정 화면의 'Action Bar에 표시' 스위치가 fkey_bar에 저장되고 바에 나타난다", async () => {
    const backend = seedBackend();
    const { user } = await renderApp(backend);
    await user.keyboard("{Control>},{/Control}");
    await user.click(await screen.findByRole("tab", { name: "F키" }));
    await user.click(await screen.findByRole("switch", { name: "F2 Action Bar에 표시" }));
    await waitFor(async () => expect((await backend.getConfig()).config.fkey_bar.F2).toBe(true));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(buttons()).toEqual([...BASE, "F2이름 변경"]));
  });
});
