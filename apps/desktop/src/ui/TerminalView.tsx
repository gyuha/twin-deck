import { useEffect, useRef, useState } from "react";
import { createTerminalEngine } from "../lib/terminalEngine";
import type { TerminalEngine } from "../lib/terminalEngine";
import { useApp, useAppStore, useT } from "../state/context";

/** 패널을 대체해서 보이는 내장 터미널. 세션(pty)은 스토어가 열고, 이 화면은 입력·출력·크기만 이어 준다. */
export function TerminalView() {
  const t = useT();
  const { backend } = useAppStore();
  const id = useApp((s) => s.terminal?.id);
  const focused = useApp((s) => !!s.terminal?.focused);
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<TerminalEngine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (id === undefined || !host.current) return;
    let disposed = false;
    // 엔진이 준비되기 전에 온 출력은 모아 두었다가 준비되면 쓴다.
    let pending: Uint8Array[] | null = [];
    const off = backend.onTerminalEvent((e) => {
      if (e.type !== "output" || e.id !== id) return;
      if (engine.current) engine.current.write(e.data);
      else pending?.push(e.data);
    });
    createTerminalEngine().then(
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

  useEffect(() => {
    if (focused && ready) engine.current?.focus();
  }, [focused, ready]);

  return (
    <div role="region" aria-label={t("terminal.aria")} data-terminal className="relative min-h-0 flex-1 bg-black">
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
