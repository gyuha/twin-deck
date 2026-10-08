import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderApp } from "./helpers";

const open = (user: Awaited<ReturnType<typeof renderApp>>["user"]) => user.keyboard("{Control>},{/Control}");
const applied = () => document.documentElement.dataset.colorTheme;

// 기본 테마 system은 라이트로 풀려 Catppuccin Latte다. 목록은 system·light·dark 순이라 ↓ 한 번(light)은 같은 색이므로 두 번(dark)부터 달라진다.
const TWO_DOWN = "{ArrowDown}{ArrowDown}";

// 설정 화면의 테마 목록을 연 상태로 만든다. 백엔드 저장 호출을 세기 위해 setConfigValue를 감시한다.
async function openThemeList() {
  const { user, backend } = await renderApp();
  const saved = vi.spyOn(backend, "setConfigValue");
  const original = applied();
  await open(user);
  await screen.findByRole("dialog", { name: "설정" });
  await user.click(within(screen.getByRole("group", { name: "테마" })).getByRole("combobox"));
  await screen.findByRole("searchbox", { name: "테마 검색" });
  return { user, backend, saved, original };
}

describe("설정의 테마 임시 미리보기", () => {
  it("목록을 열기만 해서는 바뀌지 않고, ↓로 이동하면 강조된 테마가 저장 없이 화면에 적용된다", async () => {
    const { user, saved, original } = await openThemeList();
    expect(applied()).toBe(original);
    await user.keyboard(TWO_DOWN);
    await waitFor(() => expect(applied()).not.toBe(original));
    const highlighted = screen.getAllByRole("option").find((o) => o.className.includes("bg-accent"));
    expect(highlighted).toBeTruthy();
    const first = applied();
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(applied()).not.toBe(first));
    expect(saved).not.toHaveBeenCalled();
  });

  it("Esc로 닫으면 원래 테마로 돌아오고 저장하지 않는다", async () => {
    const { user, backend, saved, original } = await openThemeList();
    await user.keyboard(TWO_DOWN);
    await waitFor(() => expect(applied()).not.toBe(original));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(applied()).toBe(original));
    expect(saved).not.toHaveBeenCalled();
    expect((await backend.getConfig()).config.behavior.theme).toBe("system");
    expect(screen.queryByRole("listbox", { name: "테마" })).toBeNull();
  });

  it("바깥을 눌러 닫아도 원래 테마로 돌아온다", async () => {
    const { user, saved, original } = await openThemeList();
    await user.keyboard(TWO_DOWN);
    await waitFor(() => expect(applied()).not.toBe(original));
    const overlay = screen.getByRole("listbox", { name: "테마" }).closest(".fixed.inset-0") as HTMLElement;
    await user.pointer({ keys: "[MouseLeft]", target: overlay });
    await waitFor(() => expect(applied()).toBe(original));
    expect(saved).not.toHaveBeenCalled();
  });

  it("Enter로 확정하면 저장되고 그 테마가 유지된다", async () => {
    const { user, backend, saved, original } = await openThemeList();
    await user.keyboard(TWO_DOWN);
    await waitFor(() => expect(applied()).not.toBe(original));
    const previewed = applied();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    await waitFor(async () => expect((await backend.getConfig()).config.behavior.theme).toBeTruthy());
    expect(saved.mock.calls[0][0]).toBe("behavior.theme");
    await waitFor(() => expect(applied()).toBe(previewed));
    expect(applied()).not.toBe(original);
  });
});
