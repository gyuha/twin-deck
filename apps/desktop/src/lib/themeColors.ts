/** Warp 테마(themes.generated.ts)의 색 몇 개에서 앱의 의미 토큰(`--color-*`) 전체를 계산한다. 화면과 무관한 순수 함수. */
import { THEMES } from "./themes.generated";
import type { WarpTheme } from "./themes.generated";

/** `system`일 때 OS 밝기에 따라 쓰는 기본 테마, `light`/`dark`가 가리키는 테마. */
export const DEFAULT_LIGHT = "catppuccin-latte";
export const DEFAULT_DARK = "catppuccin-mocha";

export const THEME_BY_ID = new Map(THEMES.map((t) => [t.id, t]));

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const hex = (c: Rgb) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

/** `a`에 `b`를 비율 `t`(0~1)만큼 섞는다. */
export function mix(a: string, b: string, t: number): string {
  const [x, y] = [rgb(a), rgb(b)];
  return hex(x.map((v, i) => v * (1 - t) + y[i] * t) as Rgb);
}

function luminance(color: string): number {
  const f = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = rgb(color).map(f);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 대비(1~21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * 글자색 `f`를 배경 `b` 쪽으로 최대 `cap`만큼 섞는다. 배경과의 대비가 `min` 아래로 떨어지면 덜 섞는다
 * (원래 대비가 낮은 테마에서도 흐린 글자가 읽히게). 0.02 간격으로 내려가며 처음 기준을 넘는 값을 쓴다.
 */
function dim(f: string, b: string, cap: number, min: number): string {
  for (let t = cap; t > 0; t -= 0.02) {
    const c = mix(f, b, t);
    if (contrast(c, b) >= min) return c;
  }
  return f;
}

/** 강조색 위에 올릴 글자색: 흰색과 검정 중 대비가 큰 쪽. */
export const inkOn = (color: string): string => (contrast(color, "#ffffff") >= contrast(color, "#000000") ? "#ffffff" : "#000000");

/**
 * 테마 하나가 정하는 `--color-*` 값 전부. 배경(`background`)·글자(`foreground`)·강조색(`accent`)과 터미널 4색만 쓰고,
 * 표면 단계는 배경에 글자색을 일정 비율 섞어 만든다(어두운 테마의 "더 깊은" 면은 검정 쪽, 밝은 테마는 글자색 쪽으로 조금).
 */
export function themeVars(t: WarpTheme): Record<string, string> {
  const { background: b, foreground: f, accent } = t;
  const lift = (r: number) => mix(b, f, r);
  const deep = (dark: number, light: number) => (t.dark ? mix(b, "#000000", dark) : mix(b, f, light));
  const dull = dim(f, b, 0.28, 4.5);
  const faint = dim(f, b, 0.4, 3.0);
  return {
    "--color-accent": accent,
    "--color-accent-faint": mix(accent, f, 0.15),
    "--color-accent-deep": mix(accent, b, 0.2),
    "--color-accent-ink": inkOn(accent),
    "--color-ink": f,
    "--color-ink-dull": dull,
    "--color-ink-faint": faint,
    "--color-sidebar": deep(0.2, 0.04),
    "--color-sidebar-box": lift(0.05),
    "--color-sidebar-line": lift(0.12),
    "--color-sidebar-ink": f,
    "--color-sidebar-ink-dull": dull,
    "--color-sidebar-ink-faint": faint,
    "--color-sidebar-divider": lift(0.08),
    "--color-sidebar-button": lift(0.08),
    "--color-sidebar-selected": lift(0.16),
    "--color-sidebar-shade": deep(0.5, 0.15),
    "--color-app": b,
    "--color-app-box": lift(0.06),
    "--color-app-dark-box": lift(0.03),
    "--color-app-darker-box": deep(0.25, 0.08),
    "--color-app-light-box": lift(0.2),
    "--color-app-overlay": lift(0.05),
    "--color-app-input": lift(0.08),
    "--color-app-focus": deep(0.3, 0.1),
    "--color-app-line": lift(0.14),
    "--color-app-divider": deep(0.4, 0.12),
    "--color-app-button": lift(0.1),
    "--color-app-hover": lift(0.12),
    "--color-app-selected": lift(0.16),
    "--color-app-selected-item": lift(0.06),
    "--color-app-active": lift(0.2),
    "--color-app-shade": deep(0.6, 0.2),
    "--color-app-frame": lift(0.14),
    "--color-app-slider": lift(0.08),
    "--color-app-explorer-scrollbar": lift(0.2),
    "--color-menu": deep(0.15, 0.03),
    "--color-menu-line": lift(0.1),
    "--color-menu-ink": f,
    "--color-menu-faint": dull,
    "--color-menu-hover": lift(0.14),
    "--color-menu-selected": lift(0.18),
    "--color-menu-shade": deep(0.5, 0.15),
    "--color-status-success": t.green,
    "--color-status-warning": t.yellow,
    "--color-status-error": t.red,
    "--color-status-info": t.blue,
  };
}

/**
 * `behavior.theme` 설정값을 테마로 푼다. `light`/`dark`는 기본 짝, `system`은 OS가 다크인지(`osDark`)에 따라 그 둘 중 하나,
 * 테마 파일 이름이면 그 테마, 그 밖의 값(옛 이름 포함)은 `system`처럼 다룬다.
 */
export function resolveTheme(setting: string, osDark: boolean): WarpTheme {
  const id = setting === "light" ? DEFAULT_LIGHT : setting === "dark" ? DEFAULT_DARK : THEME_BY_ID.has(setting) ? setting : osDark ? DEFAULT_DARK : DEFAULT_LIGHT;
  return THEME_BY_ID.get(id)!;
}

/** `behavior.random_themes`(쉼표로 이은 문자열)에서 실제로 있는 테마 이름만 순서대로, 중복 없이 뽑는다. */
export function parseThemeList(value: string): string[] {
  return [...new Set(value.split(",").map((s) => s.trim()).filter((s) => THEME_BY_ID.has(s)))];
}
