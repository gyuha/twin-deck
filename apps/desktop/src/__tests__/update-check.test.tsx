import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp, seedBackend } from "./helpers";

const setup = (scenario: FakeBackend["updateScenario"]) => {
  const b = seedBackend();
  b.updateScenario = scenario;
  b.setConfig((l) => {
    l.bindings = [{ key: "F9", action: "core.app.check_update", args: {}, scope: null }];
  });
  return b;
};
const NEW = { version: "9.9.9", notes: "첫째 줄\n\n둘째 줄", date: null };
const confirmDialog = () => screen.findByRole("dialog", { name: /새 버전 9\.9\.9/ });

describe("업데이트 확인", () => {
  it("새 버전이 있으면 버전과 릴리스 노트를 보여 주고, 설치하면 installUpdate를 한 번 부른다", async () => {
    const b = setup({ info: NEW });
    const { user } = await renderApp(b);
    await user.keyboard("{F9}");
    const d = await confirmDialog();
    expect(d).toHaveTextContent("첫째 줄");
    expect(d).toHaveTextContent("둘째 줄");
    expect(b.updateCalls).toEqual({ check: 1, install: 0 });
    await user.keyboard("{Enter}");
    await waitFor(() => expect(b.updateCalls).toEqual({ check: 1, install: 1 }));
  });

  it("설치를 취소하면 설치하지 않는다", async () => {
    const b = setup({ info: NEW });
    const { user } = await renderApp(b);
    await user.keyboard("{F9}");
    await confirmDialog();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(b.updateCalls).toEqual({ check: 1, install: 0 });
  });

  it("새 버전이 없으면 '최신 버전입니다'를 알리고 설치하지 않는다", async () => {
    const b = setup({ info: null });
    const { user } = await renderApp(b);
    await user.keyboard("{F9}");
    expect(await screen.findByText("최신 버전입니다")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(b.updateCalls).toEqual({ check: 1, install: 0 });
  });

  it("확인에 실패하면 오류를 알린다", async () => {
    const b = setup({ info: null, checkError: "네트워크에 연결할 수 없습니다" });
    const { user } = await renderApp(b);
    await user.keyboard("{F9}");
    expect(await screen.findByText(/네트워크에 연결할 수 없습니다/)).toBeInTheDocument();
    expect(b.updateCalls).toEqual({ check: 1, install: 0 });
  });

  it("설치에 실패하면 오류를 알린다", async () => {
    const b = setup({ info: NEW, installError: "서명이 맞지 않습니다" });
    const { user } = await renderApp(b);
    await user.keyboard("{F9}");
    await confirmDialog();
    await user.keyboard("{Enter}");
    expect(await screen.findByText(/서명이 맞지 않습니다/)).toBeInTheDocument();
    expect(b.updateCalls).toEqual({ check: 1, install: 1 });
  });

  it("확인이 끝나기 전에 다시 실행해도 확인은 한 번만 한다", async () => {
    const b = setup({ info: null });
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const original = b.checkUpdate.bind(b);
    b.checkUpdate = async () => {
      await gate;
      return original();
    };
    const { user } = await renderApp(b);
    await user.keyboard("{F9}{F9}");
    release();
    await screen.findByText("최신 버전입니다");
    expect(b.updateCalls.check).toBe(1);
  });

  it("앱을 켜는 것만으로는 업데이트를 확인하지 않는다(수동 확인만)", async () => {
    const b = setup({ info: NEW });
    await renderApp(b);
    expect(b.updateCalls).toEqual({ check: 0, install: 0 });
  });
});
