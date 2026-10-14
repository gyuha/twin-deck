import { useEffect, useState } from "react";
import { useApp, useAppStore, useT } from "../state/context";
import { MAX_BYTES, readHwp, type HwpDoc } from "../lib/hwp";

type State = { status: "loading" } | { status: "ready"; doc: HwpDoc } | { status: "error"; message: string };

/**
 * HWP·HWPX 쪽 미리보기. 파일을 앱이 여는 주소(`backend.fileUrl`)로 읽어 한 번에 한 쪽씩 실제 조판대로 그린다.
 * 쪽은 SVG를 Blob URL로 `<img>`에 넣어 문서 안 스크립트가 실행되지 않게 하고, 쪽 이동은 epub 챕터와 같은 `previewSheet` 상태(`Ctrl+Tab`/`Ctrl+Shift+Tab`)를 쓴다.
 * 라이브러리는 이 파일을 열 때 동적으로 불러온다.
 */
export function HwpView({ path, fileSize, sizeText }: { path: string; fileSize: number; sizeText: string }) {
  const t = useT();
  const { api } = useAppStore();
  const [state, setState] = useState<State>({ status: "loading" });
  const [page, setPage] = useState<{ url: string } | { error: string } | null>(null);
  const pageIndex = useApp((s) => (s.previewSheet?.path === path ? s.previewSheet.index : 0));

  useEffect(() => {
    if (fileSize > MAX_BYTES) {
      setState({ status: "error", message: t("hwp.too_big", { size: sizeText }) });
      return;
    }
    setState({ status: "loading" });
    setPage(null);
    let disposed = false;
    let doc: HwpDoc | null = null;
    const abort = new AbortController();
    void (async () => {
      try {
        const res = await fetch(api.fileUrl(path), { signal: abort.signal });
        if (!res.ok) throw new Error(t("common.read_failed", { status: res.status }));
        doc = await readHwp(await res.arrayBuffer());
        if (disposed) return;
        api.previewSheetsLoaded(path, doc.pageCount);
        setState({ status: "ready", doc });
      } catch (e) {
        if (!disposed) setState({ status: "error", message: t("hwp.unreadable", { reason: e instanceof Error ? e.message : String(e) }) });
      }
    })();
    return () => {
      disposed = true;
      abort.abort(); // 다른 파일로 넘어가면 읽던 것을 멈춘다
      doc?.free();
    };
  }, [api, path, fileSize, sizeText]);

  const ready = state.status === "ready" ? state.doc : null;
  useEffect(() => {
    if (!ready) return;
    let url: string | null = null;
    try {
      const svg = ready.renderPage(Math.min(pageIndex, ready.pageCount - 1));
      url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      setPage({ url });
    } catch (e) {
      setPage({ error: t("hwp.unreadable", { reason: e instanceof Error ? e.message : String(e) }) });
    }
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [ready, pageIndex]);

  if (state.status === "loading") return <p className="text-ink-faint">{t("common.loading")}</p>;
  if (state.status === "error")
    return (
      <p role="alert" className="text-ink-faint">
        {state.message}
      </p>
    );
  const { doc } = state;
  const index = Math.min(pageIndex, doc.pageCount - 1);
  return (
    <div aria-label={t("hwp.aria")} className="w-full">
      <p data-hwp-page className="mb-2 text-xs text-ink-dull">
        {t("hwp.page", { page: index + 1, count: doc.pageCount })}
      </p>
      {page && "error" in page && (
        <p role="alert" className="text-ink-faint">
          {page.error}
        </p>
      )}
      {page && "url" in page && <img data-hwp="" src={page.url} alt={t("hwp.page_alt", { page: index + 1 })} className="block h-auto w-full border border-app-line bg-white" />}
    </div>
  );
}
