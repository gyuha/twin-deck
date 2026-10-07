import { useEffect } from "react";
import type { CSSProperties } from "react";
import { useApp } from "../state/context";

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

/**
 * 설정 `behavior.text_color`(`#rgb`/`#rrggbb`)를 앱 기본 글자색으로 쓴다. 비었거나 색이 아니면 테마 그대로다.
 * 흐린 글자색(`dull`·`faint`)은 고른 색을 배경색(`--color-app`) 쪽으로 섞어 만든다. `<body>`에 덧써서 모든 테마에서 작동한다.
 */
export function useTextColor(color: string) {
  useEffect(() => {
    const c = color.trim();
    if (!HEX_COLOR.test(c)) return;
    const { style } = document.body;
    style.setProperty("--color-ink", c);
    style.setProperty("--color-ink-dull", `color-mix(in srgb, ${c} 70%, var(--color-app))`);
    style.setProperty("--color-ink-faint", `color-mix(in srgb, ${c} 45%, var(--color-app))`);
    return () => ["--color-ink", "--color-ink-dull", "--color-ink-faint"].forEach((v) => style.removeProperty(v));
  }, [color]);
}

/**
 * 미리보기 본문에 줄 글꼴 스타일. 비우면 undefined라 기본 글꼴(`font-mono` 등)을 그대로 쓴다.
 * 본문의 `font-mono` 클래스가 상속을 막으므로 본문 요소마다 직접 준다.
 */
export function usePreviewFont(): CSSProperties | undefined {
  const font = useApp((s) => s.loaded.config.behavior.preview_font).trim();
  return font ? { fontFamily: font } : undefined;
}
