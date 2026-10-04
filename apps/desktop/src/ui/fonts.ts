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

/**
 * 미리보기 본문에 줄 글꼴 스타일. 비우면 undefined라 기본 글꼴(`font-mono` 등)을 그대로 쓴다.
 * 본문의 `font-mono` 클래스가 상속을 막으므로 본문 요소마다 직접 준다.
 */
export function usePreviewFont(): CSSProperties | undefined {
  const font = useApp((s) => s.loaded.config.behavior.preview_font).trim();
  return font ? { fontFamily: font } : undefined;
}
