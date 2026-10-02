import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("spaceui 테마", () => {
  const cls = () => document.documentElement.className;

  it.each([
    ["dark", "dark"],
    ["light", "light"],
    ["midnight", "midnight-theme"],
    ["noir", "noir-theme"],
    ["slate", "slate-theme"],
    ["nord", "nord-theme"],
    ["mocha", "mocha-theme"],
  ])("spaceui: %s 테마는 <html>에 %s 클래스를 건다", async (name, className) => {
    await renderApp(seed(name));
    await waitFor(() => expect(theme()).toBe(name));
    expect(cls()).toBe(className);
  });

  it("spaceui: 테마를 바꾸면 이전 테마 클래스가 남지 않는다", async () => {
    const b = seed("midnight");
    await renderApp(b);
    await waitFor(() => expect(cls()).toBe("midnight-theme"));
    await act(async () => b.setConfig((l) => (l.config.behavior.theme = "nord")));
    await waitFor(() => expect(cls()).toBe("nord-theme"));
  });

  it("spaceui: system은 OS 다크 모드면 dark 클래스", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ media: q, matches: true, addEventListener() {}, removeEventListener() {} }));
    await renderApp(seed("system"));
    await waitFor(() => expect(cls()).toBe("dark"));
  });
});

describe("spaceui 토큰 가드", () => {
  const src = join(__dirname, "..");
  // ui/의 컴포넌트와 src 최상위의 .tsx(App, bootstrap 등)를 모두 본다. 테스트 폴더는 제외.
  const files = [...readdirSync(join(src, "ui")).map((f) => join(src, "ui", f)), ...readdirSync(src).map((f) => join(src, f))].filter((f) =>
    f.endsWith(".tsx"),
  );
  const code = files.map((f) => readFileSync(f, "utf8")).join("\n");

  it("spaceui: index.css가 tokens와 테마 7종을 불러온다", () => {
    const css = readFileSync(join(src, "index.css"), "utf8");
    expect(css).toContain("@spacedrive/tokens/theme");
    for (const t of ["dark", "light", "midnight", "noir", "slate", "nord", "mocha"]) {
      expect(css).toContain(`@spacedrive/tokens/css/themes/${t}`);
    }
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
