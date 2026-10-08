import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { THEME_BY_ID, themeVars } from "../lib/themeColors";
import { renderApp, seedBackend } from "./helpers";

const theme = () => document.documentElement.getAttribute("data-theme");

function seed(t: string) {
  const b = seedBackend();
  b.setConfig((l) => (l.config.behavior.theme = t));
  return b;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.className = "";
});

describe("CFG-03 라이트/다크 테마", () => {
  it("기본은 라이트", async () => {
    await renderApp();
    expect(theme()).toBe("light");
  });

  it("theme = dark 이면 시작할 때 다크", async () => {
    await renderApp(seed("dark"));
    await waitFor(() => expect(theme()).toBe("dark"));
  });

  it("설정을 바꾸면 즉시 반영된다", async () => {
    const b = seed("light");
    await renderApp(b);
    expect(theme()).toBe("light");
    await act(async () => b.setConfig((l) => (l.config.behavior.theme = "dark")));
    await waitFor(() => expect(theme()).toBe("dark"));
    await act(async () => b.setConfig((l) => (l.config.behavior.theme = "light")));
    await waitFor(() => expect(theme()).toBe("light"));
  });

  it("system은 OS 색상 설정을 따르고 OS 설정이 바뀌면 따라간다", async () => {
    let dark = true;
    const listeners = new Set<() => void>();
    vi.stubGlobal("matchMedia", (q: string) => ({
      media: q,
      get matches() {
        return dark;
      },
      addEventListener: (_: string, l: () => void) => listeners.add(l),
      removeEventListener: (_: string, l: () => void) => listeners.delete(l),
    }));
    await renderApp(seed("system"));
    await waitFor(() => expect(theme()).toBe("dark"));
    dark = false;
    await act(async () => listeners.forEach((l) => l()));
    await waitFor(() => expect(theme()).toBe("light"));
  });

  it("system인데 matchMedia가 없으면 라이트", async () => {
    await renderApp(seed("system"));
    expect(theme()).toBe("light");
  });
});

describe("Warp 테마 적용", () => {
  const root = () => document.documentElement;
  const colorTheme = () => root().dataset.colorTheme;
  const v = (name: string) => root().style.getPropertyValue(name);

  it.each([
    ["light", "catppuccin-latte", "light"],
    ["dark", "catppuccin-mocha", "dark"],
    ["dracula-default", "dracula-default", "dark"],
    ["solarized-light", "solarized-light", "light"],
  ])("설정 %s는 %s 테마이고 밝기는 %s다(data-theme·클래스·color-scheme 기준)", async (setting, id, mode) => {
    await renderApp(seed(setting));
    await waitFor(() => expect(colorTheme()).toBe(id));
    expect(theme()).toBe(mode);
    expect(root().className).toBe(mode);
  });

  it("<html>에 해당 테마의 --color-* 인라인 값이 걸린다", async () => {
    await renderApp(seed("dark"));
    await waitFor(() => expect(colorTheme()).toBe("catppuccin-mocha"));
    const expected = themeVars(THEME_BY_ID.get("catppuccin-mocha")!);
    for (const [name, value] of Object.entries(expected)) expect(v(name), name).toBe(value);
    expect(v("--color-app")).toBe("#1e1e2e");
  });

  it("테마를 바꾸면 이전 테마의 값이 남지 않는다", async () => {
    const b = seed("dracula-default");
    await renderApp(b);
    await waitFor(() => expect(colorTheme()).toBe("dracula-default"));
    await act(async () => b.setConfig((l) => (l.config.behavior.theme = "catppuccin-latte")));
    await waitFor(() => expect(colorTheme()).toBe("catppuccin-latte"));
    for (const [name, value] of Object.entries(themeVars(THEME_BY_ID.get("catppuccin-latte")!))) expect(v(name), name).toBe(value);
    expect(root().className).toBe("light");
  });

  it("system은 OS 다크 모드면 Mocha, 아니면 Latte이고 OS 설정이 바뀌면 따라간다", async () => {
    let dark = true;
    const listeners = new Set<() => void>();
    vi.stubGlobal("matchMedia", (q: string) => ({
      media: q,
      get matches() {
        return dark;
      },
      addEventListener: (_: string, l: () => void) => listeners.add(l),
      removeEventListener: (_: string, l: () => void) => listeners.delete(l),
    }));
    await renderApp(seed("system"));
    await waitFor(() => expect(colorTheme()).toBe("catppuccin-mocha"));
    dark = false;
    await act(async () => listeners.forEach((l) => l()));
    await waitFor(() => expect(colorTheme()).toBe("catppuccin-latte"));
  });

  it.each(["midnight", "noir", "slate", "nord", "mocha", "sakura"])("옛 이름·알 수 없는 값 %s는 system처럼 동작한다", async (old) => {
    vi.stubGlobal("matchMedia", (q: string) => ({ media: q, matches: true, addEventListener() {}, removeEventListener() {} }));
    await renderApp(seed(old));
    await waitFor(() => expect(colorTheme()).toBe("catppuccin-mocha"));
  });
});

describe("spaceui 토큰 가드", () => {
  const src = join(__dirname, "..");
  // ui/의 컴포넌트와 src 최상위의 .tsx(App, bootstrap 등)를 모두 본다. 테스트 폴더는 제외.
  const files = [...readdirSync(join(src, "ui")).map((f) => join(src, "ui", f)), ...readdirSync(src).map((f) => join(src, f))].filter((f) =>
    f.endsWith(".tsx"),
  );
  const code = files.map((f) => readFileSync(f, "utf8")).join("\n");

  it("spaceui: index.css가 tokens와 기본값용 dark·light만 불러온다(실제 색은 Warp 테마에서 계산한다)", () => {
    const css = readFileSync(join(src, "index.css"), "utf8");
    expect(css).toContain("@spacedrive/tokens/theme");
    for (const t of ["dark", "light"]) expect(css).toContain(`@spacedrive/tokens/css/themes/${t}`);
    for (const t of ["midnight", "noir", "slate", "nord", "mocha"]) expect(css).not.toContain(`@spacedrive/tokens/css/themes/${t}`);
  });

  it("spaceui: 컴포넌트가 Tailwind 기본 팔레트(숫자 붙은 색)를 쓰지 않는다", () => {
    // @spacedrive/tokens/theme이 기본 팔레트를 지우므로(--color-*: initial) 이런 클래스는 색이 없어진다.
    // white/black은 tokens가 정의하는 고정 색이라 허용한다(accent 위 글자, 모달 뒤 어둡게).
    const palette =
      /\b(?:bg|text|border|outline|ring|divide|fill|stroke|from|to|via)-(?:neutral|gray|slate|zinc|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]+\b/g;
    const found = [...new Set([...code.matchAll(palette)].map((m) => m[0]))];
    expect(found, `남은 기본 팔레트 클래스: ${found.join(", ")}`).toEqual([]);
    expect(code).toMatch(/\b(?:bg|text|border)-(?:app|ink|accent)/); // 정규식이 아무것도 못 잡아서 통과하는 일이 없게
  });

  it("spaceui: 예전 표면 변수(--td-surface)를 쓰지 않는다", () => {
    expect(code).not.toMatch(/--td-surface|--td-fg/);
  });

  it("spaceui: primitives가 쓰는 radix 변형이 index.css에 모두 정의돼 있다", () => {
    // Tailwind v4는 radix-state-checked: 같은 변형을 모른다. 정의하지 않으면 스위치가 켜져도 색이 안 바뀐다.
    const dist = readFileSync(join(src, "..", "..", "..", "node_modules", "@spacedrive", "primitives", "dist", "index.js"), "utf8");
    const used = [...new Set([...dist.matchAll(/(?:group-)?radix-[a-z-]+(?=:)/g)].map((m) => m[0]))];
    expect(used.length).toBeGreaterThan(5); // 정규식이 아무것도 못 잡아서 통과하는 일이 없게
    const css = readFileSync(join(src, "index.css"), "utf8");
    const missing = used.filter((v) => !css.includes(`@custom-variant ${v} `));
    expect(missing, `index.css에 없는 변형: ${missing.join(", ")}`).toEqual([]);
  });
});
