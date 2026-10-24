import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { createAppStore } from "../state/store";
import { renderApp, seedBackend } from "./helpers";

const NEW = { version: "9.9.9", notes: "첫째 줄", date: null };
const newStore = async (b: FakeBackend) => {
  const app = createAppStore(b, "/home/a", "/home/b");
  await app.api.init();
  return app;
};

describe("시작할 때 업데이트 자동 확인 (이슈 #115)", () => {
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

  it("이미 확인했거나 확인 중이면 다시 확인하지 않는다", async () => {
    const b = seedBackend();
    b.updateScenario = { info: NEW };
    const app = await newStore(b);
    await app.api.autoCheckUpdate();
    await app.api.autoCheckUpdate();
    expect(b.updateCalls.check).toBe(1);
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
    const sw = within(dlg).getByRole("switch", { name: "시작할 때 업데이트 자동 확인" });
    expect(sw).toBeChecked();
    await user.click(sw);
    await waitFor(async () => expect((await backend.getConfig()).config.environment.auto_update_check).toBe(false));
  });
});
