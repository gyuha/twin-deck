import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { THEMES } from "../lib/themes.generated";
import { contrast, DEFAULT_DARK, DEFAULT_LIGHT, inkOn, mix, resolveTheme, THEME_BY_ID, themeVars } from "../lib/themeColors";

const mocha = THEME_BY_ID.get("catppuccin-mocha")!;

describe("themeVars (Warp 테마 → 앱 색 토큰)", () => {
  it("spaceui 토큰이 정의하는 --color-* 이름이 모두 있다(빠진 토큰 없음)", () => {
    const css = readFileSync(join(__dirname, "../../../../node_modules/@spacedrive/tokens/src/css/theme.css"), "utf8");
    const names = [...new Set([...css.matchAll(/--color-[a-z-]+(?=:)/g)].map((m) => m[0]))].filter((n) => n !== "--color-black" && n !== "--color-white");
    expect(names.length).toBeGreaterThan(40); // 정규식이 아무것도 못 잡아서 통과하는 일이 없게
    const vars = Object.keys(themeVars(mocha));
    expect(names.filter((n) => !vars.includes(n))).toEqual([]);
  });

  it("Mocha: 배경·글자·강조색과 상태색이 YAML 값 그대로다", () => {
    const v = themeVars(mocha);
    expect(v["--color-app"]).toBe("#1e1e2e");
    expect(v["--color-ink"]).toBe("#cdd6f4");
    expect(v["--color-accent"]).toBe("#b4befe");
    expect(v["--color-status-error"]).toBe(mocha.red);
    expect(v["--color-status-success"]).toBe(mocha.green);
    expect(v["--color-status-warning"]).toBe(mocha.yellow);
    expect(v["--color-status-info"]).toBe(mocha.blue);
  });

  it("112개 테마 모두 글자·흐린 글자·강조색 위 글자의 대비가 기준 이상이다", () => {
    expect(THEMES.length).toBe(112);
    const low: string[] = [];
    for (const t of THEMES) {
      const v = themeVars(t);
      const ink = contrast(v["--color-ink"], v["--color-app"]);
      const faint = contrast(v["--color-ink-faint"], v["--color-app"]);
      const onAccent = contrast(v["--color-accent-ink"], v["--color-accent"]);
      // solarized-light는 원 팔레트의 글자 대비가 4.1이라 4.0까지 허용한다.
      if (ink < 4.0 || faint < 3.0 || onAccent < 4.5) low.push(`${t.id} ink=${ink.toFixed(1)} faint=${faint.toFixed(1)} onAccent=${onAccent.toFixed(1)}`);
    }
    expect(low).toEqual([]);
  });

  it("모든 값이 #rrggbb이고 같은 입력은 같은 결과다", () => {
    for (const t of THEMES) {
      for (const [k, val] of Object.entries(themeVars(t))) expect(val, `${t.id} ${k}`).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(themeVars(mocha)).toEqual(themeVars(mocha));
  });

  it("어두운 테마의 깊은 면은 배경보다 어둡고, 밝은 테마의 위에 뜬 면은 글자색 쪽으로 간다", () => {
    const dark = themeVars(mocha);
    expect(contrast(dark["--color-app-darker-box"], "#000000")).toBeLessThan(contrast(dark["--color-app"], "#000000"));
    const latte = THEME_BY_ID.get("catppuccin-latte")!;
    const light = themeVars(latte);
    expect(contrast(light["--color-app-box"], latte.foreground)).toBeLessThan(contrast(latte.background, latte.foreground));
  });
});

describe("색 계산 도구", () => {
  it("mix는 양 끝에서 원래 색이고 중간에서 평균이다", () => {
    expect(mix("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mix("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  it("inkOn은 어두운 강조색에는 흰색, 밝은 강조색에는 검정을 고른다", () => {
    expect(inkOn("#1e1e2e")).toBe("#ffffff");
    expect(inkOn("#b4befe")).toBe("#000000");
  });
});

describe("resolveTheme (behavior.theme → 테마)", () => {
  it("light/dark는 기본 짝, system은 OS 밝기에 따라 둘 중 하나", () => {
    expect(resolveTheme("light", true).id).toBe(DEFAULT_LIGHT);
    expect(resolveTheme("dark", false).id).toBe(DEFAULT_DARK);
    expect(resolveTheme("system", true).id).toBe("catppuccin-mocha");
    expect(resolveTheme("system", false).id).toBe("catppuccin-latte");
  });

  it("테마 이름은 그 테마이고, 알 수 없는 값(옛 이름 포함)은 system처럼 동작한다", () => {
    expect(resolveTheme("dracula-default", false).id).toBe("dracula-default");
    for (const old of ["midnight", "noir", "slate", "nord", "mocha", "sakura", ""]) {
      expect(resolveTheme(old, true).id).toBe("catppuccin-mocha");
      expect(resolveTheme(old, false).id).toBe("catppuccin-latte");
    }
  });
});
