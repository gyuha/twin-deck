import { parseAnsi } from "../lib/ansi";
import { resolveTheme, terminalTheme } from "../lib/themeColors";
import { useApp } from "../state/context";
import { useUi } from "./uiContext";

// ANSI 16색 번호(0–15) → terminalTheme 키.
const COLOR_KEYS = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white", "brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue", "brightMagenta", "brightCyan", "brightWhite"];

/** 명령 출력의 ANSI 색을 내장 터미널과 같은 테마 색으로 그린다(이슈 #157). 글은 React가 escape한다. */
export function AnsiText({ text }: { text: string }) {
  const { theme: appTheme } = useUi();
  const terminalThemeId = useApp((s) => s.loaded.config.behavior.terminal_theme);
  const theme = terminalThemeId ? resolveTheme(terminalThemeId, false) : appTheme;
  const colors = theme ? terminalTheme(theme) : undefined;
  return (
    <>
      {parseAnsi(text).map((s, i) => {
        const color = s.fg !== undefined ? colors?.[COLOR_KEYS[s.fg]] : undefined;
        if (!color && !s.bold && !s.dim) return s.text;
        return (
          <span key={i} style={{ color, fontWeight: s.bold ? 600 : undefined, opacity: s.dim ? 0.6 : undefined }}>
            {s.text}
          </span>
        );
      })}
    </>
  );
}
