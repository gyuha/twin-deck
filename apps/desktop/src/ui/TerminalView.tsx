import { useEffect, useRef, useState } from "react";
import { acquireTerminal } from "../lib/terminalSessions";
import type { TerminalHandle, TerminalState } from "../lib/terminalSessions";
import { Button } from "@spacedrive/primitives";
import { terminalTheme } from "../lib/themeColors";
import { useApp, useAppStore, useT } from "../state/context";
import { useUi } from "./uiContext";
import type { PaneId } from "../state/store";

/**
 * 터미널 탭의 화면. 세션(pty)은 스토어가 열고, 이 화면은 입력·출력·크기만 이어 준다.
 * 탭을 옮겨도 화면(스크롤 내용)이 사라지지 않게 패널이 터미널 탭마다 하나씩 계속 그려 두고, 보이지 않는 탭은 숨기기만 한다.
 * 탭을 다른 패널로 옮기면 이 뷰는 사라지고 새 패널에 새 뷰가 생기지만, 엔진(화면)과 출력 구독은 세션이 들고 있어
 * (`lib/terminalSessions.ts`) 새 뷰가 같은 화면을 이어 받는다(이슈 #96).
 */
export function TerminalView({ pane, tabId, id, lost, shown, focused }: { pane: PaneId; tabId: number; id: number; lost: boolean; shown: boolean; focused: boolean }) {
  const t = useT();
  const { backend, api } = useAppStore();
  // 끊긴 원격 셸을 다시 연결하는 중이면(같은 서버로 연결 중) 버튼을 막는다.
  const reconnecting = useApp((s) => s.remoteConnecting.length > 0);
  // 글꼴은 터미널 글꼴 설정(`behavior.terminal_font`)을 따른다(미리보기 글꼴과 따로). 비우면 기본 글꼴이다.
  const font = useApp((s) => s.loaded.config.behavior.terminal_font);
  const fontRef = useRef(font);
  fontRef.current = font;
  // 터미널 색은 앱 테마를 따른다(이슈 #118). 미리보기·랜덤 테마도 같은 테마 값이라 함께 바뀐다.
  const { theme } = useUi();
  const colors = theme ? terminalTheme(theme) : undefined;
  const colorsRef = useRef(colors);
  colorsRef.current = colors;
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<TerminalHandle | null>(null);
  const [state, setState] = useState<TerminalState>({ ready: false, error: null });
  const { ready, error } = state;

  useEffect(() => {
    if (!host.current) return;
    const h = acquireTerminal(backend, id, fontRef.current, setState, colorsRef.current);
    handle.current = h;
    h.attach(host.current);
    return () => {
      h.release();
      handle.current = null;
    };
  }, [backend, id]);

  // 테마를 바꾸면 열려 있는 터미널에도 바로 반영한다.
  useEffect(() => {
    if (theme) handle.current?.setTheme(terminalTheme(theme));
  }, [theme]);

  // 설정에서 글꼴을 바꾸면 열려 있는 터미널에도 바로 반영한다.
  useEffect(() => {
    if (ready) handle.current?.engine()?.setFontFamily(font);
  }, [font, ready]);

  useEffect(() => {
    if (shown && focused && ready) handle.current?.engine()?.focus();
  }, [shown, focused, ready]);

  return (
    <div role="region" aria-label={t("terminal.aria")} data-terminal data-shown={shown} className={shown ? "relative min-h-0 flex-1 bg-app" : "hidden"}>
      <div ref={host} className="absolute inset-0" />
      {lost && (
        <div data-terminal-disconnected role="alert" className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/70 p-4 text-center text-white">
          <div className="font-semibold">{t("terminal.lost_title")}</div>
          <Button type="button" size="sm" variant="accent" disabled={reconnecting} onClick={() => void api.reconnectTerminal(pane, tabId)}>
            {reconnecting ? t("table.remote_reconnecting") : t("table.remote_reconnect")}
          </Button>
        </div>
      )}
      {!ready && !error && <p className="absolute left-2 top-1 text-xs text-ink-faint">{t("terminal.starting")}</p>}
      {error && (
        <p role="alert" className="absolute left-2 top-1 text-status-error">
          {t("terminal.failed", { error })}
        </p>
      )}
    </div>
  );
}
