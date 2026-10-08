import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { THEME_DIR, RS_OUT, TS_OUT, generate, loadThemes, parseTheme } from "./gen-themes.mjs";

describe("gen-themes", () => {
  const themes = loadThemes();

  test("생성 파일이 지금 YAML에서 다시 만든 결과와 같다 (최신이 아니면 `task gen-types`)", () => {
    const { ts, rs } = generate(themes);
    expect(readFileSync(TS_OUT, "utf8")).toBe(ts);
    expect(readFileSync(RS_OUT, "utf8")).toBe(rs);
  });

  test("테마가 112개이고 id가 파일 이름과 같다", () => {
    const files = readdirSync(THEME_DIR).filter((f) => f.endsWith(".yaml"));
    expect(themes.length).toBe(112);
    expect(themes.map((t) => t.id)).toEqual(files.map((f) => f.slice(0, -5)).sort());
  });

  test("catppuccin-mocha는 어둡고 latte는 밝다, 값이 YAML 그대로다", () => {
    const mocha = themes.find((t) => t.id === "catppuccin-mocha");
    expect(mocha).toMatchObject({ dark: true, background: "#1e1e2e", foreground: "#cdd6f4", accent: "#b4befe" });
    expect(themes.find((t) => t.id === "catppuccin-latte").dark).toBe(false);
  });

  test("normal 색을 bright와 헷갈리지 않는다", () => {
    const dracula = themes.find((t) => t.id === "dracula-default");
    expect(dracula).toMatchObject({ red: "#ff5555", green: "#50fa7b", yellow: "#f1fa8c", blue: "#bd93f9" });
  });

  test("잘못된 색이나 details는 오류다", () => {
    expect(() => parseTheme("x", 'name: X\ndetails: darker\nbackground: "red"\n')).toThrow();
    expect(() => parseTheme("x", "name: X\ndetails: medium\n")).toThrow();
  });
});
