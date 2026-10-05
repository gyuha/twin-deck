import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { cursorName, list, renderApp } from "./helpers";

const N = 100_000;
const name = (i: number) => `f${String(i).padStart(6, "0")}`;

function big() {
  const b = new FakeBackend();
  b.seed({ "/big": null, "/other": null });
  for (let i = 0; i < N; i++) b.seed({ [`/big/${name(i)}`]: "" });
  return b;
}
const rendered = () => within(list("left")).queryAllByRole("option").length;
const status = () => screen.getByRole("status", { name: "상태 표시줄" });

describe("가상 스크롤 (10만 항목)", () => {
  it("보이는 행만 그리고, 끝/처음/페이지 이동해도 커서 행이 렌더된다", async () => {
    const { user } = await renderApp(big(), "linux", { left: "/big", right: "/other" });
    await waitFor(() => expect(list("left").getAttribute("aria-rowcount")).toBe(String(N)), { timeout: 20_000 });

    expect(rendered()).toBeGreaterThan(0);
    expect(rendered()).toBeLessThanOrEqual(200);
    expect(cursorName("left")).toBe(name(0));

    await user.keyboard("{End}");
    await waitFor(() => expect(cursorName("left")).toBe(name(N - 1)));
    expect(rendered()).toBeLessThanOrEqual(200);
    expect(list("left").getAttribute("aria-activedescendant")).toBeTruthy();
    expect(document.getElementById(list("left").getAttribute("aria-activedescendant")!)).not.toBeNull();

    await user.keyboard("{Home}");
    await waitFor(() => expect(cursorName("left")).toBe(name(0)));
    await user.keyboard("{PageDown}{PageDown}");
    await waitFor(() => expect(cursorName("left")).toBe(name(20)));
    expect(rendered()).toBeLessThanOrEqual(200);
  }, 60_000);

  it("전체 선택과 3열 모드에서도 렌더 행 수가 제한된다", async () => {
    const { user } = await renderApp(big(), "linux", { left: "/big", right: "/other" });
    await waitFor(() => expect(list("left").getAttribute("aria-rowcount")).toBe(String(N)), { timeout: 20_000 });

    await user.keyboard("{Control>}a{/Control}");
    await waitFor(() => expect(status()).toHaveTextContent(`파일: ${N}/${N}, 폴더: 0/0`));

    await user.keyboard("{Control>}{Alt>}3{/Alt}{/Control}");
    await waitFor(() => expect(list("left").getAttribute("data-view")).toBe("columns-3"));
    expect(rendered()).toBeLessThanOrEqual(600); // 행 200 × 열 3
    await user.keyboard("{End}");
    await waitFor(() => expect(cursorName("left")).toBe(name(N - 1)));
    expect(rendered()).toBeLessThanOrEqual(600);
    await user.keyboard("{ArrowLeft}");
    await waitFor(() => expect(cursorName("left")).toBe(name(N - 1 - Math.ceil(N / 3))));
  }, 60_000);

  it("100000개를 이름 외 기준으로 정렬해도 화면 행 수는 그대로다", async () => {
    const b = big();
    b.setConfig((l) => l.bindings.push({ key: "F9", action: "core.view.order", args: { by: "size", dir: "desc" }, scope: null }));
    const { user } = await renderApp(b, "linux", { left: "/big", right: "/other" });
    await waitFor(() => expect(list("left").getAttribute("aria-rowcount")).toBe(String(N)), { timeout: 20_000 });
    await user.keyboard("{F9}");
    await waitFor(() => expect(list("left").getAttribute("aria-rowcount")).toBe(String(N)));
    expect(rendered()).toBeLessThanOrEqual(200);
    expect(cursorName("left")).toBe(name(0)); // 크기가 모두 같으면 이름순 유지
  }, 60_000);
});
