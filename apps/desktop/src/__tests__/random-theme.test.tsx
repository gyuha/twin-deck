import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { THEMES } from "../lib/themes.generated";
import { parseThemeList } from "../lib/themeColors";
import { renderApp, seedBackend } from "./helpers";

const applied = () => document.documentElement.dataset.colorTheme;
const open = (user: Awaited<ReturnType<typeof renderApp>>["user"]) => user.keyboard("{Control>},{/Control}");

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-color-theme");
  document.documentElement.className = "";
});

function seed(on: boolean, themes: string, theme = "dark") {
  const b = seedBackend();
  b.setConfig((l) => {
    l.config.behavior.theme = theme;
    l.config.behavior.random_theme = on;
    l.config.behavior.random_themes = themes;
  });
  return b;
}

describe("랜덤 테마 (이슈 #33)", () => {
  it("parseThemeList는 없는 이름과 중복을 버린다", () => {
    const [a, b] = [THEMES[0].id, THEMES[1].id];
    expect(parseThemeList(` ${a}, nope ,${b},${a},`)).toEqual([a, b]);
    expect(parseThemeList("")).toEqual([]);
  });

  it("켜면 목록의 테마 중 하나를 쓰고 기존 테마는 무시한다", async () => {
    const only = THEMES[5].id;
    await renderApp(seed(true, only));
    await waitFor(() => expect(applied()).toBe(only));
  });

  it("목록이 비었거나 꺼져 있으면 기존 테마를 쓴다", async () => {
    await renderApp(seed(true, ""));
    await waitFor(() => expect(applied()).toBe("catppuccin-mocha"));
  });

  it("꺼져 있으면 목록이 있어도 기존 테마를 쓴다", async () => {
    await renderApp(seed(false, THEMES[5].id));
    await waitFor(() => expect(applied()).toBe("catppuccin-mocha"));
  });

  it("설정에서 켜면 테마 상자가 비활성이 되고, 태그를 입력·삭제하면 저장된다", async () => {
    const { user, backend } = await renderApp(seed(false, ""));
    await open(user);
    await screen.findByRole("dialog", { name: "설정" });
    const tags = within(screen.getByRole("group", { name: "랜덤 테마 목록" }));
    expect(tags.getByRole("combobox", { name: "랜덤 테마 목록" })).toBeDisabled();
    await user.click(screen.getByRole("switch", { name: "랜덤 테마" }));
    await waitFor(async () => expect((await backend.getConfig()).config.behavior.random_theme).toBe(true));
    expect(within(screen.getByRole("group", { name: "테마" })).getByRole("combobox")).toBeDisabled();

    const target = THEMES.find((t) => t.id === "dracula-default")!;
    await user.click(tags.getByRole("combobox", { name: "랜덤 테마 목록" }));
    await user.type(await screen.findByRole("searchbox", { name: "랜덤 테마 목록 검색" }), "dracula-default{Enter}");
    await waitFor(async () => expect((await backend.getConfig()).config.behavior.random_themes).toBe(target.id));
    await waitFor(() => expect(applied()).toBe(target.id));
    expect(tags.getByRole("button", { name: `${target.name} · ${target.dark ? "어두움" : "밝음"} 삭제` })).toBeTruthy();

    await user.click(tags.getByRole("button", { name: `${target.name} · ${target.dark ? "어두움" : "밝음"} 삭제` }));
    await waitFor(async () => expect((await backend.getConfig()).config.behavior.random_themes).toBe(""));
  });

  it("후보 목록은 일부가 아니라 모든 테마를 보여 준다", async () => {
    const { user } = await renderApp(seed(true, ""));
    await open(user);
    await screen.findByRole("dialog", { name: "설정" });
    await user.click(within(screen.getByRole("group", { name: "랜덤 테마 목록" })).getByRole("combobox"));
    expect(within(screen.getByRole("listbox", { name: "랜덤 테마 목록" })).getAllByRole("option")).toHaveLength(THEMES.length);
  });

  it("목록에서 커서를 움직이면 저장 없이 색이 미리 바뀌고, 닫으면 돌아온다", async () => {
    const { user, backend } = await renderApp(seed(true, ""));
    await open(user);
    await screen.findByRole("dialog", { name: "설정" });
    const original = applied();
    await user.click(within(screen.getByRole("group", { name: "랜덤 테마 목록" })).getByRole("combobox"));
    await screen.findByRole("searchbox", { name: "랜덤 테마 목록 검색" });
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    await waitFor(() => expect(applied()).not.toBe(original));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(applied()).toBe(original));
    expect((await backend.getConfig()).config.behavior.random_themes).toBe("");
  });
});
