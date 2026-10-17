/** Warp 테마(themes.generated.ts)의 색 몇 개에서 앱의 의미 토큰(`--color-*`) 전체를 계산한다. 화면과 무관한 순수 함수. */
import { THEMES } from "./themes.generated";
import type { WarpTheme } from "./themes.generated";
import type { TabKind } from "./connections";

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

// ---- 특수 탭 색(이슈 #92): OKLCH에서 강조색의 hue를 돌려 종류마다 다른 색을 만든다 ----

type Oklch = { l: number; c: number; h: number };

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLinear = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

function oklab(color: string): [number, number, number] {
  const [r, g, b] = rgb(color).map((v) => toLinear(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function toOklch(color: string): Oklch {
  const [l, a, b] = oklab(color);
  return { l, c: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}

/** OKLCH → sRGB(0~255). 색역 밖이면 null. */
function oklchRgb({ l, c, h }: Oklch): Rgb | null {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l3 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m3 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const out = [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ];
  if (!out.every((v) => v >= -1e-4 && v <= 1 + 1e-4)) return null;
  return out.map((v) => fromLinear(Math.max(0, Math.min(1, v))) * 255) as Rgb;
}

/** OKLCH → `#rrggbb`. 색역을 벗어나면 채도를 줄여 맞춘다. */
export function fromOklch(o: Oklch): string {
  for (let c = o.c; c > 0; c -= 0.005) {
    const v = oklchRgb({ ...o, c });
    if (v) return hex(v);
  }
  return hex(oklchRgb({ ...o, c: 0 })!);
}

/** OKLab 거리(ΔE). 0.02쯤이면 겨우 구분되고 0.1이면 뚜렷하다. */
export function deltaE(x: string, y: string): number {
  const [a, b] = [oklab(x), oklab(y)];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** 종류마다 강조색에서 돌리는 hue. 강조색 자체(0°)는 피해서 선택·커서 강조와 겹치지 않게 한다. */
const HUE_OFFSET: Record<TabKind, number> = { terminal: 45, smb: 135, remote: 225, twindeck: 315 };

/**
 * 밝기를 0.01 간격으로 훑어 `ok`를 만족하는 색 중 밝기가 `target`에 가장 가까운 것.
 * 없으면 `must`를 만족하는 것 중 `score`가 가장 큰 것, 그것도 없으면 전체에서 `score`가 가장 큰 것.
 */
function pickLightness(base: Oklch, target: number, must: (c: string) => boolean, ok: (c: string) => boolean, score: (c: string) => number): string {
  const all = Array.from({ length: 101 }, (_, i) => ({ c: fromOklch({ ...base, l: i / 100 }), d: Math.abs(i / 100 - target) }));
  const pass = all.filter((x) => must(x.c) && ok(x.c));
  if (pass.length > 0) return pass.reduce((p, q) => (q.d < p.d ? q : p)).c;
  const best = (xs: typeof all) => xs.reduce((p, q) => (score(q.c) > score(p.c) ? q : p)).c;
  const musts = all.filter((x) => must(x.c));
  return best(musts.length > 0 ? musts : all);
}

export interface TabColor {
  /** 칸형 탭의 배경. */
  fill: string;
  /** `fill` 위의 글자색. */
  ink: string;
  /** 밑줄형의 밑줄과 이름 앞 점(앱 배경 위에 그린다). */
  mark: string;
}

/** 배경 `fill` 위의 글자색: 앱 글자색이 대비 4.5 이상이면 그대로, 아니면 흰색·검정 중 대비가 큰 쪽. */
const inkFor = (fill: string, ink: string) => (contrast(fill, ink) >= 4.5 ? ink : inkOn(fill));

/**
 * 테마의 배경 `bg`·글자 `ink`·강조색 `accent`에서 종류별 탭 색을 계산한다.
 * hue는 강조색에서 종류마다 돌리고 채도는 강조색의 채도를 범위(배경 0.06~0.14, 밑줄·점 0.1~0.18)로 제한해 쓴다.
 * 칸형 배경은 글자와 대비 4.5 이상이면서 앱 배경과 ΔE 0.06 이상 떨어진 밝기 중 선택 탭 배경(`--color-app-selected`)의 밝기에
 * 가장 가까운 것이다(ΔE를 채울 수 없는 테마는 대비 4.5를 지키는 것 중 배경과 가장 먼 것).
 * 밑줄·점은 앱 배경과 대비 3 이상인 밝기 중 강조색의 밝기(0.6~0.8로 제한)에 가장 가까운 것이다.
 */
export function autoTabColor(kind: TabKind, bg: string, ink: string, accent: string): TabColor {
  const a = toOklch(accent);
  const h = (a.h + HUE_OFFSET[kind]) % 360;
  const clamp = (lo: number, hi: number) => Math.min(hi, Math.max(lo, a.c));
  const fill = pickLightness(
    { l: a.l, c: clamp(0.06, 0.14), h },
    toOklch(mix(bg, ink, 0.16)).l,
    (c) => contrast(c, ink) >= 4.5,
    (c) => deltaE(c, bg) >= 0.06,
    (c) => deltaE(c, bg),
  );
  // 강조색이 거의 흰색·검정인 테마는 그 밝기에서 채도를 낼 수 없어 종류끼리 구분되지 않으므로 목표 밝기를 0.6~0.8로 제한한다.
  const mark = pickLightness({ l: a.l, c: clamp(0.1, 0.18), h }, Math.min(0.8, Math.max(0.6, a.l)), () => true, (c) => contrast(c, bg) >= 3, (c) => contrast(c, bg));
  return { fill, ink: inkFor(fill, ink), mark };
}

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const fullHex = (c: string) => (c.length === 4 ? "#" + [...c.slice(1)].map((x) => x + x).join("") : c).toLowerCase();

/**
 * `behavior.layout.tab_color_<종류>` 값(`auto` | `off` | `#rrggbb`)을 색으로 푼다. `off`(또는 알 수 없는 값)면 null이다.
 * 직접 지정한 색은 칸형 배경·밑줄·점에 그대로 쓰고, 글자만 읽히는 색으로 고른다. `ink`는 지금 쓰는 앱 글자색이다(글자색 설정 반영).
 */
export function tabColor(kind: TabKind, setting: string, theme: { background: string; accent: string }, ink: string): TabColor | null {
  const text = fullHex(ink);
  if (setting === "auto") return autoTabColor(kind, theme.background, text, theme.accent);
  if (!HEX.test(setting)) return null;
  const c = fullHex(setting);
  return { fill: c, ink: inkFor(c, text), mark: c };
}
