import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { createAppStore, UPDATE_CHECK_INTERVAL_MS } from "../state/store";
import { renderApp, seedBackend } from "./helpers";

const NEW = { version: "9.9.9", notes: "첫째 줄", date: null };
const newStore = async (b: FakeBackend) => {
  const app = createAppStore(b, "/home/a", "/home/b");
  await app.api.init();
  return app;
};

describe("업데이트 자동 확인 (이슈 #115·#122)", () => {
  it("설정이 켜져 있으면 새 버전을 조용히 확인해 available 상태로 둔다", async () => {
    const b = seedBackend();
    b.updateScenario = { info: NEW };
    const app = await newStore(b);
    await app.api.autoCheckUpdate();
    expect(app.store.getState().update).toEqual({ kind: "available", info: NEW });
    expect(b.updateCalls.check).toBe(1);
  });

  it("environment.auto_update_check를 끄면 확인하지 않는다", async () => {
    const b = seedBackend();
    b.updateScenario = { info: NEW };
    b.setConfig((l) => (l.config.environment.auto_update_check = false));
    const app = await newStore(b);
    await app.api.autoCheckUpdate();
    expect(app.store.getState().update.kind).toBe("idle");
    expect(b.updateCalls.check).toBe(0);
  });

  it("최신이거나 확인에 실패해도 알리지 않고 idle로 둔다(오프라인 등)", async () => {
    const latest = seedBackend();
    const a1 = await newStore(latest);
    await a1.api.autoCheckUpdate();
    expect(a1.store.getState().update.kind).toBe("idle");
    const offline = seedBackend();
    offline.updateScenario = { info: null, checkError: "network down" };
    const a2 = await newStore(offline);
    await a2.api.autoCheckUpdate();
    expect(a2.store.getState().update.kind).toBe("idle");
    expect(a2.store.getState().notice).toBeNull();
  });

  it("이미 새 버전을 찾았으면 다시 확인하지 않는다", async () => {
    const b = seedBackend();
    b.updateScenario = { info: NEW };
    const app = await newStore(b);
    await app.api.autoCheckUpdate();
    await app.api.autoCheckUpdate();
    expect(b.updateCalls.check).toBe(1);
  });
});

describe("하루에 한 번 자동 확인 (이슈 #122)", () => {
  afterEach(() => vi.useRealTimers());
  const DAY = UPDATE_CHECK_INTERVAL_MS;

  it("간격은 24시간이다", () => {
    expect(DAY).toBe(24 * 60 * 60 * 1000);
  });

  it("켜 둔 동안 하루가 지날 때마다 새 버전을 확인하고, 새 버전이 나오면 배지 상태가 된다", async () => {
    const b = seedBackend();
    const app = await newStore(b);
    vi.useFakeTimers();
    const stop = app.api.startUpdateCheckSchedule();
    await vi.advanceTimersByTimeAsync(DAY - 1);
    expect(b.updateCalls.check).toBe(0); // 아직 하루가 안 됐다
    await vi.advanceTimersByTimeAsync(1);
    expect(b.updateCalls.check).toBe(1);
    expect(app.store.getState().update.kind).toBe("idle"); // 최신이면 조용하다
    b.updateScenario = { info: NEW };
    await vi.advanceTimersByTimeAsync(DAY);
    expect(b.updateCalls.check).toBe(2);
    expect(app.store.getState().update).toEqual({ kind: "available", info: NEW });
    await vi.advanceTimersByTimeAsync(DAY * 3);
    expect(b.updateCalls.check).toBe(2); // 이미 새 버전을 찾았으면 다시 확인하지 않는다
    stop();
  });

  it("설정 화면에서 직접 확인해 '최신 버전'이나 오류가 떠 있어도 다음 날 다시 확인한다", async () => {
    const b = seedBackend();
    const app = await newStore(b);
    await app.api.checkForUpdate(); // 수동 확인: 최신 버전입니다
    expect(app.store.getState().update.kind).toBe("latest");
    vi.useFakeTimers();
    const stop = app.api.startUpdateCheckSchedule();
    b.updateScenario = { info: NEW };
    await vi.advanceTimersByTimeAsync(DAY);
    expect(app.store.getState().update.kind).toBe("available");
    stop();
  });

  it("environment.auto_update_check를 끄면 하루가 지나도 확인하지 않고, 다시 켜면 다음 때 확인한다", async () => {
    const b = seedBackend();
    b.setConfig((l) => (l.config.environment.auto_update_check = false));
    const app = await newStore(b);
    vi.useFakeTimers();
    const stop = app.api.startUpdateCheckSchedule();
    await vi.advanceTimersByTimeAsync(DAY * 2);
    expect(b.updateCalls.check).toBe(0);
    await app.api.setConfigValue("environment.auto_update_check", { kind: "bool", value: true });
    await vi.advanceTimersByTimeAsync(DAY);
    expect(b.updateCalls.check).toBe(1);
    stop();
  });

  it("멈추는 함수를 부르면 더는 확인하지 않는다", async () => {
    const b = seedBackend();
    const app = await newStore(b);
    vi.useFakeTimers();
    app.api.startUpdateCheckSchedule()();
    await vi.advanceTimersByTimeAsync(DAY * 3);
    expect(b.updateCalls.check).toBe(0);
  });
});

describe("상태 줄 업데이트 배지", () => {
  const withBinding = (b: FakeBackend) =>
    b.setConfig((l) => {
      l.bindings = [{ key: "F9", action: "core.app.check_update", args: {}, scope: null }];
    });

  it("새 버전이 확인되면 배지가 뜨고, 누르면 설정의 업데이트 탭이 열린다", async () => {
    const b = seedBackend();
    b.updateScenario = { info: NEW };
    withBinding(b);
    const { user } = await renderApp(b);
    expect(screen.queryByRole("button", { name: /새 버전 9.9.9/ })).not.toBeInTheDocument();
    await user.keyboard("{F9}");
    const dlg = await screen.findByRole("dialog", { name: "설정" });
    await waitFor(() => expect(within(dlg).getByRole("status")).toHaveTextContent("새 버전 9.9.9이 있습니다"));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "설정" })).not.toBeInTheDocument());
    const badge = screen.getByRole("button", { name: /새 버전 9.9.9/ });
    expect(badge).toHaveTextContent("업데이트 9.9.9");
    await user.click(badge);
    const again = await screen.findByRole("dialog", { name: "설정" });
    expect(within(again).getByRole("tab", { name: "업데이트" })).toHaveAttribute("aria-selected", "true");
    expect(within(again).getByRole("button", { name: "설치하고 다시 시작" })).toBeInTheDocument();
  });

  it("업데이트 탭의 스위치가 자동 확인 설정을 켜고 끈다", async () => {
    const { user, backend } = await renderApp();
    await user.keyboard("{Control>},{/Control}");
    const dlg = await screen.findByRole("dialog", { name: "설정" });
    await user.click(within(dlg).getByRole("tab", { name: "업데이트" }));
    const sw = within(dlg).getByRole("switch", { name: "업데이트 자동 확인" });
    expect(sw).toBeChecked();
    await user.click(sw);
    await waitFor(async () => expect((await backend.getConfig()).config.environment.auto_update_check).toBe(false));
  });
});
