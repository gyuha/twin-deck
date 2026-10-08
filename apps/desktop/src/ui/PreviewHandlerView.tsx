import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PreviewRectDto } from "@twin-deck/ts-client";
import { useApp, useAppStore } from "../state/context";
import type { AppState } from "../state/store";

/** 화면 위에 뭔가 떠 있나. 그동안 네이티브 처리기 창은 웹 화면 위에 그려지므로 숨겨야 한다. */
const covered = (s: AppState) =>
  !!(s.dialog || s.menu || s.ctxMenu || s.palette || s.find || s.settingsOpen || s.helpOpen || s.queueOpen || s.drag || s.tabDropTarget);

/** 항목을 빠르게 넘길 때 문서를 하나하나 읽지 않도록, 이 시간 동안 항목이 그대로일 때만 처리기를 띄운다. */
const SETTLE_MS = 150;

/**
 * Windows Office 문서 미리보기 (ADR-0015). Windows 미리보기 처리기(탐색기 미리보기 창이 쓰는 것)가 앱 창 위 이 자리에 문서를 그린다.
 * 처리기 창은 웹 화면과 따로 노는 네이티브 창이라, 이 컴포넌트는 자리(웹뷰 기준 CSS 픽셀)를 계속 알려 주고
 * 대화상자·메뉴 같은 것이 위에 뜨거나 미리보기 창을 끄는 동안(`suspended`)에는 숨긴다.
 * 처리기가 없거나 문서를 못 그리면 `onUnavailable`로 알려, 부르는 쪽이 다른 미리보기로 돌아간다.
 */
/** 처리기를 쓸 수 없는 까닭. `blocked`는 인터넷에서 받은 파일이라 Office가 막는 경우(차단을 풀면 보인다), `reason`은 처리기가 낸 오류다. */
export type HandlerUnavailable = { blocked?: boolean; reason?: string };

export function PreviewHandlerView({ path, suspended, onUnavailable }: { path: string; suspended: boolean; onUnavailable: (why: HandlerUnavailable) => void }) {
  const { api } = useAppStore();
  const box = useRef<HTMLDivElement>(null);
  const sent = useRef("");
  const [ready, setReady] = useState(false);
  const hidden = useApp(covered) || suspended;
  const rectOf = (): PreviewRectDto => {
    const r = box.current?.getBoundingClientRect();
    return { x: r?.left ?? 0, y: r?.top ?? 0, width: r?.width ?? 0, height: r?.height ?? 0 };
  };
  const sync = () => {
    if (!ready) return;
    const r = rectOf();
    const key = JSON.stringify(r);
    if (key === sent.current) return;
    sent.current = key;
    void api.previewHandlerSetRect(r);
  };
  const syncRef = useRef(sync);
  syncRef.current = sync;

  // 띄운다. 항목이 바뀌면 이전 창을 먼저 내린다.
  useEffect(() => {
    setReady(false);
    let disposed = false; // 다른 항목으로 넘어간 뒤 늦게 온 응답은 버린다
    const timer = setTimeout(() => {
      const r = rectOf();
      sent.current = JSON.stringify(r);
      api.previewHandlerShow(path, r).then(
        (outcome) => {
          if (disposed) return;
          if (outcome === "shown") setReady(true);
          else onUnavailable(outcome === "blocked" ? { blocked: true } : {});
        },
        (e: unknown) => !disposed && onUnavailable({ reason: e instanceof Error ? e.message : String(e) }),
      );
    }, SETTLE_MS);
    return () => {
      disposed = true;
      clearTimeout(timer);
      void api.previewHandlerClose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, path]);

  // 미리보기 창이 움직이거나 크기가 바뀌면(렌더마다), 창·스크롤이 바뀌면 자리를 다시 알린다.
  useLayoutEffect(() => sync());
  useEffect(() => {
    if (!ready) return;
    const run = () => syncRef.current();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(run);
    if (box.current) ro?.observe(box.current);
    window.addEventListener("resize", run);
    window.addEventListener("scroll", run, true);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", run);
      window.removeEventListener("scroll", run, true);
    };
  }, [ready]);

  useEffect(() => {
    if (ready) void api.previewHandlerSetVisible(!hidden);
  }, [api, ready, hidden]);

  return <div ref={box} data-preview-handler aria-label="문서 미리보기" className="h-full min-h-[240px] w-full" />;
}
