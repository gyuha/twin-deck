import { describe, expect, it } from "vitest";
import { THEMES } from "../lib/themes.generated";
import { autoTabColor, contrast, deltaE, fromOklch, tabColor, toOklch } from "../lib/themeColors";
import { TAB_KINDS } from "../lib/connections";

describe("특수 탭 색 (이슈 #92)", () => {
  it("OKLCH 변환은 되돌리면 같은 색이다", () => {
    for (const c of ["#1e1e2e", "#cdd6f4", "#ff79c6", "#000000", "#ffffff"]) expect(fromOklch(toOklch(c))).toBe(c);
  });

  it("모든 내장 테마에서 자동 색은 글자와 대비 4.5 이상이고 배경·서로와 구분된다", () => {
    const bad: string[] = [];
    for (const t of THEMES) {
      const colors = TAB_KINDS.map((k) => autoTabColor(k, t.background, t.foreground, t.accent));
      colors.forEach((c, i) => {
        const k = TAB_KINDS[i];
        if (contrast(c.fill, c.ink) < 4.5) bad.push(`${t.id}/${k}: 글자 대비 ${contrast(c.fill, c.ink).toFixed(2)}`);
        if (deltaE(c.fill, t.background) < 0.05) bad.push(`${t.id}/${k}: 배경과 ΔE ${deltaE(c.fill, t.background).toFixed(3)}`);
        if (contrast(c.mark, t.background) < 3) bad.push(`${t.id}/${k}: 밑줄 대비 ${contrast(c.mark, t.background).toFixed(2)}`);
      });
      for (let i = 0; i < colors.length; i++)
        for (let j = i + 1; j < colors.length; j++)
          if (deltaE(colors[i].mark, colors[j].mark) < 0.08) bad.push(`${t.id}: ${TAB_KINDS[i]}·${TAB_KINDS[j]} 밑줄 ΔE ${deltaE(colors[i].mark, colors[j].mark).toFixed(3)}`);
    }
    expect(bad).toEqual([]);
  });

  it("설정값: auto는 계산하고 off는 null, 직접 지정은 그 색에 읽히는 글자색을 고른다", () => {
    const theme = { background: "#1e1e2e", accent: "#b4befe" };
    expect(tabColor("terminal", "off", theme, "#cdd6f4")).toBeNull();
    expect(tabColor("terminal", "auto", theme, "#cdd6f4")).toEqual(autoTabColor("terminal", "#1e1e2e", "#cdd6f4", "#b4befe"));
    expect(tabColor("smb", "#FFF", theme, "#cdd6f4")).toEqual({ fill: "#ffffff", ink: "#000000", mark: "#ffffff" });
    expect(tabColor("smb", "#202020", theme, "#cdd6f4")).toEqual({ fill: "#202020", ink: "#cdd6f4", mark: "#202020" });
  });
});
