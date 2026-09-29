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

describe("테마 토큰 가드", () => {
  const src = join(__dirname, "..");
  const css = readFileSync(join(src, "theme.css"), "utf8");
  const dark = /html\[data-theme="dark"\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  const files = [...readdirSync(join(src, "ui")).map((f) => join(src, "ui", f)), join(src, "App.tsx")].filter((f) => f.endsWith(".tsx"));
  const code = files.map((f) => readFileSync(f, "utf8")).join("\n");

  it("다크 블록이 있다", () => {
    expect(dark).toContain("--td-surface");
    expect(css).toMatch(/:root\s*\{[^}]*--td-surface/);
  });

  it("컴포넌트가 쓰는 모든 색 유틸리티가 다크에서 덮어써져 있다", () => {
    const used = new Set(
      [
        ...code.matchAll(
          /\b(?:bg|text|border|outline|ring|divide|fill|stroke)-((?:neutral|gray|slate|zinc|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]+)(?:\/[0-9]+)?\b/g,
        ),
      ].map((m) => m[1]),
    );
    expect(used.size).toBeGreaterThan(5); // 정규식이 아무것도 못 잡아서 통과하는 일이 없게
    const missing = [...used].filter((c) => !dark.includes(`--color-${c}:`));
    expect(missing, `theme.css의 다크 블록에 없는 색: ${missing.join(", ")}`).toEqual([]);
  });

  it("흰색/검정 유틸리티를 직접 쓰지 않는다 (표면은 --td-surface)", () => {
    // text-white(파란 커서 행 위의 글자)와 반투명 검정 오버레이(bg-black/NN)는 테마와 무관하게 같다.
    expect(code).not.toMatch(/\bbg-white\b/);
    expect(code).not.toMatch(/\btext-black\b/);
    expect(code).toMatch(/bg-\(--td-surface\)/);
  });
});
