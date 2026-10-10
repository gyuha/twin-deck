import { useEffect, useRef, useState } from "react";
import { createTerminalEngine } from "../lib/terminalEngine";
import type { TerminalEngine } from "../lib/terminalEngine";
import { useApp, useAppStore, useT } from "../state/context";

/**
 * 터미널 탭의 화면. 세션(pty)은 스토어가 열고, 이 화면은 입력·출력·크기만 이어 준다.
 * 탭을 옮겨도 화면(스크롤 내용)이 사라지지 않게 패널이 터미널 탭마다 하나씩 계속 그려 두고, 보이지 않는 탭은 숨기기만 한다.
 */
export function TerminalView({ id, shown, focused }: { id: number; shown: boolean; focused: boolean }) {
  const t = useT();
  const { backend } = useAppStore();
  // 글꼴은 미리보기 글꼴 설정(`behavior.preview_font`)을 따른다. 비우면 기본 글꼴이다.
  const font = useApp((s) => s.loaded.config.behavior.preview_font);
  const fontRef = useRef(font);
  fontRef.current = font;
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<TerminalEngine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!host.current) return;
    let disposed = false;
    // 엔진이 준비되기 전에 온 출력은 모아 두었다가 준비되면 쓴다.
    let pending: Uint8Array[] | null = [];
    const off = backend.onTerminalEvent((e) => {
      if (e.type !== "output" || e.id !== id) return;
      if (engine.current) engine.current.write(e.data);
      else pending?.push(e.data);
    });
    createTerminalEngine(fontRef.current).then(
      (eng) => {
        if (disposed || !host.current) return eng.dispose();
        engine.current = eng;
        eng.onData((data) => void backend.terminalWrite(id, data).catch(() => {}));
        eng.onResize(({ cols, rows }) => void backend.terminalResize(id, cols, rows).catch(() => {}));
        eng.open(host.current);
        // 열자마자 맞춘 크기를 셸에 알린다(처음 크기 80x24는 임시였다).
        void backend.terminalResize(id, eng.cols, eng.rows).catch(() => {});
        for (const chunk of pending ?? []) eng.write(chunk);
        pending = null;
        setReady(true);
      },
      (e) => !disposed && setError(String(e instanceof Error ? e.message : e)),
    );
    return () => {
      disposed = true;
      off();
      engine.current?.dispose();
      engine.current = null;
      setReady(false);
    };
  }, [backend, id]);

  // 설정에서 글꼴을 바꾸면 열려 있는 터미널에도 바로 반영한다.
  useEffect(() => {
    if (ready) engine.current?.setFontFamily(font);
  }, [font, ready]);

  useEffect(() => {
    if (shown && focused && ready) engine.current?.focus();
  }, [shown, focused, ready]);

  return (
    <div role="region" aria-label={t("terminal.aria")} data-terminal data-shown={shown} className={shown ? "relative min-h-0 flex-1 bg-black" : "hidden"}>
      <div ref={host} className="absolute inset-0" />
      {!ready && !error && <p className="absolute left-2 top-1 text-xs text-ink-faint">{t("terminal.starting")}</p>}
      {error && (
        <p role="alert" className="absolute left-2 top-1 text-status-error">
          {t("terminal.failed", { error })}
        </p>
      )}
    </div>
  );
}
