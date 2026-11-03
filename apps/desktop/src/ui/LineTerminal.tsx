import { useEffect, useRef, useState } from "react";
import { acquireTerminal } from "../lib/terminalSessions";
import type { TerminalHandle } from "../lib/terminalSessions";
import { resolveTheme, terminalTheme } from "../lib/themeColors";
import { useApp, useAppStore, useT } from "../state/context";
import { useUi } from "./uiContext";

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "NumLock"]);

/**
 * 명령어 줄을 터미널 팝업으로 실행할 때(`behavior.command_line_terminal`, 이슈 #157)의 모달.
 * 세션(pty)은 스토어가 열고, 화면은 내장 터미널과 같은 엔진·테마를 쓴다. 실행 중에는 모든 키(Esc 포함)가 pty로 가고,
 * 명령이 끝나면 종료 안내를 쓴 뒤 아무 키나 누르면 닫고 명령어 줄로 포커스를 돌려준다.
 */
export function LineTerminal() {
  const lt = useApp((s) => s.lineTerminal);
  return lt ? <Popup key={lt.id} /> : null;
}

function Popup() {
  const t = useT();
  const { backend, api } = useAppStore();
  const lt = useApp((s) => s.lineTerminal)!;
  const font = useApp((s) => s.loaded.config.behavior.terminal_font);
  const { theme: appTheme } = useUi();
  const terminalThemeId = useApp((s) => s.loaded.config.behavior.terminal_theme);
  const theme = terminalThemeId ? resolveTheme(terminalThemeId, false) : appTheme;
  const colors = theme ? terminalTheme(theme) : undefined;
  const colorsRef = useRef(colors);
  colorsRef.current = colors;
  const fontRef = useRef(font);
  fontRef.current = font;
  const root = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<TerminalHandle | null>(null);
  const [ready, setReady] = useState(false);
  const exit = lt.exit;

  useEffect(() => {
    if (!host.current) return;
    // 세션이 열리는 동안 온 출력을 받아 와 맨 앞에 쓴다(바로 끝나는 명령의 출력을 잃지 않게). 받자마자 구독하므로 사이에 빠지는 출력이 없다.
    const h = acquireTerminal(backend, lt.id, fontRef.current, (s) => setReady(s.ready), colorsRef.current, api.takeLineTerminalOutput());
    handle.current = h;
    h.attach(host.current);
    return () => {
      h.release();
      handle.current = null;
    };
  }, [backend, api, lt.id]);

  useEffect(() => {
    if (theme) handle.current?.setTheme(terminalTheme(theme));
  }, [theme?.id]);

  // 엔진이 준비되면 키보드 포커스를 터미널로(아직 없으면 팝업 자신이 키를 받는다).
  useEffect(() => {
    if (ready) handle.current?.engine()?.focus();
    else root.current?.focus();
  }, [ready]);

  // 명령이 끝나면 종료 안내를 화면에 쓴다.
  useEffect(() => {
    if (exit && ready) handle.current?.engine()?.write(`\r\n\x1b[2m${t("commandline.terminal.exited", { code: String(exit.code ?? "?") })}\x1b[0m\r\n`);
  }, [exit, ready]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onMouseDown={() => handle.current?.engine()?.focus()}>
      <div
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-label={t("commandline.terminal.aria")}
        title={lt.command}
        tabIndex={-1}
        data-line-terminal
        // 끝난 뒤에는 아무 키(조합 중·수식키만 누른 것은 제외)나 닫는다. 실행 중에는 건드리지 않아 모든 키가 pty로 간다.
        onKeyDownCapture={(e) => {
          if (!exit || e.nativeEvent.isComposing || MODIFIER_KEYS.has(e.key)) return;
          e.preventDefault();
          e.stopPropagation();
          void api.closeLineTerminal();
        }}
        className="relative h-[80vh] w-[80vw] overflow-hidden rounded border border-app-line bg-app shadow-xl outline-none"
      >
        {/* 실행 중에도 누를 수 있는 중단(키는 모두 pty로 가므로 Ctrl+C를 무시하는 명령에서 빠져나올 길). 마우스 전용이다. */}
        <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 border-b border-app-line bg-app px-2 py-0.5 text-xs">
          <span className="min-w-0 flex-1 truncate font-mono text-ink-dull">{lt.command}</span>
          <button type="button" tabIndex={-1} className="shrink-0 rounded border border-app-line px-2 hover:bg-app-selected" onMouseDown={(e) => e.stopPropagation()} onClick={() => void api.closeLineTerminal()}>
            {t("commandline.terminal.stop")}
          </button>
        </div>
        <div ref={host} className="absolute inset-x-0 bottom-0 top-6" />
      </div>
    </div>
  );
}
