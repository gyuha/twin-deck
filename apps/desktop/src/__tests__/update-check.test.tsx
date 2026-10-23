import { screen, waitFor, within } from "@testing-library/react";
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
const settings = () => screen.findByRole("dialog", { name: "설정" });
const status = async () => within(await settings()).getByRole("status");
/** 설정을 열고 업데이트 탭으로 간다. */
const openUpdateTab = async (user: Awaited<ReturnType<typeof renderApp>>["user"]) => {
  await user.keyboard("{Control>},{/Control}");
  await user.click(within(await settings()).getByRole("tab", { name: "업데이트" }));
};

describe("업데이트 확인 액션", () => {
  it("설정의 업데이트 탭을 열고 바로 확인한다", async () => {
    const b = setup({ info: null });
    const { user } = await renderApp(b);
    await user.keyboard("{F9}");
    const d = await settings();
    expect(within(d).getByRole("tab", { name: "업데이트" })).toHaveAttribute("aria-selected", "true");
    await waitFor(async () => expect(await status()).toHaveTextContent("최신 버전입니다"));
    expect(b.updateCalls).toEqual({ check: 1, install: 0 });
  });

  it("새 버전이 있으면 탭 안에 버전과 릴리스 노트, 설치 버튼을 보여 준다", async () => {
    const b = setup({ info: NEW });
    const { user } = await renderApp(b);
    await user.keyboard("{F9}");
    await waitFor(async () => expect(await status()).toHaveTextContent("새 버전 9.9.9이 있습니다"));
    const d = await settings();
    expect(d).toHaveTextContent("첫째 줄");
    expect(d).toHaveTextContent("둘째 줄");
    expect(within(d).getByRole("button", { name: "설치하고 다시 시작" })).toBeInTheDocument();
    expect(b.updateCalls).toEqual({ check: 1, install: 0 });
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
    await user.keyboard("{F9}");
    expect(await status()).toHaveTextContent("확인하는 중…");
    // 설정이 열린 동안 F9는 패널 키가 아니라 탭의 버튼으로 다시 누른다(확인 중에는 꺼져 있다).
    expect(within(await settings()).getByRole("button", { name: "지금 확인" })).toBeDisabled();
    release();
    await waitFor(async () => expect(await status()).toHaveTextContent("최신 버전입니다"));
    expect(b.updateCalls.check).toBe(1);
  });

  it("앱을 켜는 것만으로는 업데이트를 확인하지 않는다(수동 확인만)", async () => {
    const b = setup({ info: NEW });
    await renderApp(b);
    expect(b.updateCalls).toEqual({ check: 0, install: 0 });
  });
});

describe("설정 > 업데이트 탭", () => {
  it("현재 버전을 보이고, 처음에는 아직 확인하지 않은 상태다", async () => {
    const b = setup({ info: null });
    const { user } = await renderApp(b);
    await openUpdateTab(user);
    const d = await settings();
    await waitFor(() => expect(within(d).getByTestId("app-version")).toHaveTextContent("1.2.3"));
    expect(await status()).toHaveTextContent("아직 확인하지 않음");
    expect(b.updateCalls).toEqual({ check: 0, install: 0 });
  });

  it("지금 확인을 누르면 설정을 닫지 않고 결과를 탭 안에 보인다", async () => {
    const b = setup({ info: null });
    const { user } = await renderApp(b);
    await openUpdateTab(user);
    await user.click(within(await settings()).getByRole("button", { name: "지금 확인" }));
    await waitFor(async () => expect(await status()).toHaveTextContent("최신 버전입니다"));
    expect(screen.getByRole("dialog", { name: "설정" })).toBeInTheDocument();
  });

  it("확인에 실패하면 상태 줄에 오류를 보인다", async () => {
    const b = setup({ info: null, checkError: "네트워크에 연결할 수 없습니다" });
    const { user } = await renderApp(b);
    await openUpdateTab(user);
    await user.click(within(await settings()).getByRole("button", { name: "지금 확인" }));
    await waitFor(async () => expect(await status()).toHaveTextContent("네트워크에 연결할 수 없습니다"));
    expect(b.updateCalls).toEqual({ check: 1, install: 0 });
  });

  it("설치 버튼은 확인 창을 띄우고, 설치를 눌러야 installUpdate를 부른다", async () => {
    const b = setup({ info: NEW });
    const { user } = await renderApp(b);
    await user.keyboard("{F9}");
    const d = await settings();
    await user.click(await within(d).findByRole("button", { name: "설치하고 다시 시작" }));
    const confirm = await screen.findByRole("dialog", { name: /새 버전 9\.9\.9을 설치하고/ });
    expect(b.updateCalls.install).toBe(0);
    await user.click(within(confirm).getByRole("button", { name: "설치" }));
    await waitFor(() => expect(b.updateCalls).toEqual({ check: 1, install: 1 }));
    expect(await status()).toHaveTextContent("설치하는 중…");
  });

  it("확인 창에서 취소하거나 Esc를 누르면 설치하지 않고 설정은 그대로 남는다", async () => {
    const b = setup({ info: NEW });
    const { user } = await renderApp(b);
    await user.keyboard("{F9}");
    const d = await settings();
    const install = await within(d).findByRole("button", { name: "설치하고 다시 시작" });
    await user.click(install);
    await user.click(within(await screen.findByRole("dialog", { name: /을 설치하고/ })).getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("dialog", { name: /을 설치하고/ })).toBeNull();
    await user.click(install);
    await screen.findByRole("dialog", { name: /을 설치하고/ });
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: /을 설치하고/ })).toBeNull();
    expect(screen.getByRole("dialog", { name: "설정" })).toBeInTheDocument();
    expect(b.updateCalls.install).toBe(0);
  });

  it("설치에 실패하면 상태 줄에 오류를 보인다", async () => {
    const b = setup({ info: NEW, installError: "서명이 맞지 않습니다" });
    const { user } = await renderApp(b);
    await user.keyboard("{F9}");
    await user.click(await within(await settings()).findByRole("button", { name: "설치하고 다시 시작" }));
    await user.click(within(await screen.findByRole("dialog", { name: /을 설치하고/ })).getByRole("button", { name: "설치" }));
    await waitFor(async () => expect(await status()).toHaveTextContent("서명이 맞지 않습니다"));
    expect(b.updateCalls).toEqual({ check: 1, install: 1 });
  });

  it("오픈소스 라이선스 창은 의존성 목록을 보여 주고, Esc로 창만 닫히고 설정은 남는다", async () => {
    const b = setup({ info: null });
    const { user } = await renderApp(b);
    await openUpdateTab(user);
    await user.click(within(await settings()).getByRole("button", { name: "오픈소스 라이선스…" }));
    const modal = await screen.findByRole("dialog", { name: "오픈소스 라이선스" });
    // Markdown 뷰어가 의존성 목록을 표로, 뒤에 붙인 THIRD_PARTY_NOTICES를 제목으로 그린다.
    const row = within(modal).getByRole("cell", { name: "zustand" }).closest("tr")!;
    expect(row).toHaveTextContent(/zustand\d+\.\d+\.\d+MIT/);
    expect(within(modal).getByRole("heading", { name: "Third-party notices" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "오픈소스 라이선스" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "설정" })).toBeInTheDocument();
  });
});
