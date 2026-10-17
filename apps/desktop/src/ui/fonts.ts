import { useEffect, useMemo } from "react";
import type { CSSProperties } from "react";
import { useApp } from "../state/context";
import { TAB_KINDS } from "../lib/connections";
import type { TabKind } from "../lib/connections";
import { freshnessShades, tabColor } from "../lib/themeColors";
import type { WarpTheme } from "../lib/themes.generated";

/** 설정 `behavior.ui_font`를 앱 전체(`<body>`)에 반영한다. 비우면 기본 글꼴로 돌아간다. */
export function useUiFont(font: string) {
  useEffect(() => {
    document.body.style.fontFamily = font.trim();
    return () => {
      document.body.style.fontFamily = "";
    };
  }, [font]);
}

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

interface TextColors {
  text_color: string;
  text_color_dark: string;
  text_color_light: string;
}

/**
 * 지금 테마(`dark`)에 맞는 글자색 설정(`#rgb`/`#rrggbb`)을 앱 기본 글자색으로 쓴다. 다크 테마는 `text_color_dark`, 라이트 테마는 `text_color_light`이고,
 * 그 값이 비면 이전 버전의 공통 값 `text_color`를 쓴다(이슈 #58). 모두 비었거나 색이 아니면 테마 그대로다.
 * 흐린 글자색(`dull`·`faint`)은 고른 색을 배경색(`--color-app`) 쪽으로 섞어 만든다. `<body>`에 덧써서 모든 테마에서 작동한다.
 */
export function useTextColor(colors: TextColors, dark: boolean) {
  const color = textColorFor(colors, dark);
  useEffect(() => {
    const c = color;
    if (!c) return;
    const { style } = document.body;
    style.setProperty("--color-ink", c);
    style.setProperty("--color-ink-dull", `color-mix(in srgb, ${c} 70%, var(--color-app))`);
    style.setProperty("--color-ink-faint", `color-mix(in srgb, ${c} 45%, var(--color-app))`);
    return () => ["--color-ink", "--color-ink-dull", "--color-ink-faint"].forEach((v) => style.removeProperty(v));
  }, [color]);
}

/** 지금 테마에 쓰는 글자색 설정값(`useTextColor`의 규칙). 비었거나 색이 아니면 빈 문자열(테마 그대로)이다. */
export function textColorFor(colors: TextColors, dark: boolean): string {
  const c = ((dark ? colors.text_color_dark : colors.text_color_light).trim() || colors.text_color).trim();
  return HEX_COLOR.test(c) ? c : "";
}

type TabColorSettings = Record<`tab_color_${TabKind}`, string>;

/**
 * 특수 탭 색(이슈 #92)을 `<html>`의 `--tab-<종류>-fill`(칸형 배경)·`-ink`(그 위 글자)·`-mark`(밑줄형의 밑줄·점)로 건다.
 * `off`인 종류는 변수를 지운다. 자동 색은 지금 테마와 글자색(`ink`, 비면 테마 글자색)에서 계산한다.
 */
export function useTabColors(layout: TabColorSettings, theme: WarpTheme | null, ink: string) {
  const key = TAB_KINDS.map((k) => layout[`tab_color_${k}`]).join("|"); // 효과가 설정 객체가 아니라 값이 바뀔 때만 돌게 한다
  useEffect(() => {
    if (!theme) return;
    const { style } = document.documentElement;
    const names: string[] = [];
    TAB_KINDS.forEach((k, i) => {
      const c = tabColor(k, key.split("|")[i], theme, ink || theme.foreground);
      if (!c) return;
      for (const [part, value] of [["fill", c.fill], ["ink", c.ink], ["mark", c.mark]] as const) {
        style.setProperty(`--tab-${k}-${part}`, value);
        names.push(`--tab-${k}-${part}`);
      }
    });
    return () => names.forEach((n) => style.removeProperty(n));
  }, [key, theme, ink]);
}

/**
 * 파일 신선도(이슈 #91): 켜져 있고 지금 테마·글자색(`ink`, 비면 테마 글자색)으로 단계를 나눌 수 있으면 `<html>`에 `--fresh-0`~`--fresh-3`을 건다.
 * 단계를 나눌 수 있는지 돌려준다(설정 화면이 켰지만 쓸 수 없는 이유를 보인다). 테마를 아직 모르면 true로 본다.
 */
export function useFreshness(on: boolean, theme: WarpTheme | null, ink: string): boolean {
  const shades = useMemo(() => (theme ? freshnessShades(theme, ink) : null), [theme, ink]);
  useEffect(() => {
    if (!on || !shades) return;
    const { style } = document.documentElement;
    shades.forEach((c, i) => style.setProperty(`--fresh-${i}`, c));
    return () => shades.forEach((_, i) => style.removeProperty(`--fresh-${i}`));
  }, [on, shades]);
  return !theme || shades !== null;
}

/**
 * 미리보기 본문에 줄 글꼴 스타일. 비우면 undefined라 기본 글꼴(`font-mono` 등)을 그대로 쓴다.
 * 본문의 `font-mono` 클래스가 상속을 막으므로 본문 요소마다 직접 준다.
 */
export function usePreviewFont(): CSSProperties | undefined {
  const font = useApp((s) => s.loaded.config.behavior.preview_font).trim();
  return font ? { fontFamily: font } : undefined;
}
