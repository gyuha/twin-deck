import { useEffect, useRef, useState } from "react";
import type { EpubInfoDto } from "@twin-deck/ts-client";
import { useApp, useAppStore, useT } from "../state/context";
import { rustText } from "../i18n";

type Info = { status: "loading" } | { status: "ready"; info: EpubInfoDto } | { status: "error"; message: string };

let lastSeq = 0;
/** 요청 순번. 챕터를 빨리 넘길 때 늦게 온 응답을 버리는 데 쓴다. */
const nextSeq = () => ++lastSeq;

/**
 * epub 미리보기: 표지·제목·저자 머리말, 목차 선택 상자, 현재 챕터 본문.
 * 본문은 스크립트 없는 격리 iframe(Blob URL)에 그리고, iframe은 마우스·포커스를 받지 않으며 문서 크기만큼 늘어나 미리보기 본문이 스크롤한다.
 * 챕터 이동은 시트 전환과 같은 액션(`Ctrl+Tab`/`Ctrl+Shift+Tab`)과 `previewSheet` 상태를 쓴다.
 */
/**
 * iframe을 문서 크기만큼 늘린다. `fit`이면 담는 곳보다 넓을 때 폭에 맞게 줄이고(100%보다 키우지는 않는다),
 * 아니면 원래 크기로 두어 가로로 스크롤한다. 스크롤은 iframe 안이 아니라 미리보기 본문이 한다.
 */
export function layout(outer: HTMLElement, box: HTMLElement, f: HTMLIFrameElement, fit: boolean) {
  const doc = f.contentDocument;
  const avail = outer.clientWidth;
  if (!doc?.documentElement || avail <= 0) return;
  f.style.width = `${avail}px`;
  f.style.height = "0px"; // 내용 높이를 재려고 잠깐 줄인다
  // 넘친 내용의 오른쪽 여백은 scrollWidth에 들어가지 않는다(pptx 슬라이드의 오른쪽 그림자가 잘린다). 본문 왼쪽 여백만큼 오른쪽에도 둔다.
  const left = doc.body ? parseFloat(getComputedStyle(doc.body).marginLeft) || 0 : 0;
  const w = Math.max(doc.documentElement.scrollWidth, doc.body?.scrollWidth ?? 0, avail - left) + left;
  const h = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0);
  const scale = fit && w > avail ? avail / w : 1;
  f.style.width = `${w}px`;
  f.style.height = `${h}px`;
  f.style.transform = scale < 1 ? `scale(${scale})` : "";
  box.style.width = `${w * scale}px`;
  box.style.height = `${h * scale}px`;
}

export function EpubView({ path, name }: { path: string; name: string }) {
  const t = useT();
  const { api } = useAppStore();
  const [state, setState] = useState<Info>({ status: "loading" });
  const [chapter, setChapter] = useState<{ url: string } | { error: string } | null>(null);
  const chapterIndex = useApp((s) => (s.previewSheet?.path === path ? s.previewSheet.index : 0));
  const outer = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setState({ status: "loading" });
    setChapter(null);
    let disposed = false; // 다른 항목으로 넘어간 뒤 늦게 온 응답은 버린다
    api.epubOpen(path).then(
      (info) => {
        if (disposed) return;
        api.previewSheetsLoaded(path, info.chapters.length);
        setState({ status: "ready", info });
      },
      (e: unknown) => !disposed && setState({ status: "error", message: rustText(e instanceof Error ? e.message : String(e)) }),
    );
    return () => {
      disposed = true;
    };
  }, [api, path]);

  const ready = state.status === "ready";
  useEffect(() => {
    if (!ready) return;
    let disposed = false;
    let url: string | null = null;
    const seq = nextSeq();
    api.epubChapter(path, chapterIndex).then(
      (html) => {
        if (disposed || seq !== lastSeq) return;
        url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
        setChapter({ url });
      },
      (e: unknown) => !disposed && setChapter({ error: rustText(e instanceof Error ? e.message : String(e)) }),
    );
    // 챕터를 바꾸면 본문을 맨 위로 되돌린다.
    outer.current?.closest<HTMLElement>("[data-preview-body]")?.scrollTo?.({ top: 0 });
    return () => {
      disposed = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [api, path, ready, chapterIndex]);

  useEffect(() => {
    const o = outer.current;
    if (!o || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => box.current && frame.current && layout(o, box.current, frame.current, true));
    ro.observe(o);
    return () => ro.disconnect();
  }, [ready, chapter]);

  if (state.status === "loading") return <p className="text-ink-faint">{t("common.loading")}</p>;
  if (state.status === "error")
    return (
      <p role="alert" className="text-ink-faint">
        {t("epub.unreadable", { reason: state.message })}
      </p>
    );
  const { info } = state;
  const index = Math.min(chapterIndex, info.chapters.length - 1);
  return (
    <div ref={outer} className="w-full">
      <div className="mb-2 flex items-start gap-3 border-b border-app-line pb-2">
        {info.cover && <img src={info.cover} alt={t("epub.cover")} className="max-h-32 w-auto shrink-0 rounded border border-app-line" />}
        <div className="min-w-0 flex-1">
          <p data-epub-title className="truncate text-base font-semibold">
            {info.title ?? name}
          </p>
          {info.author && <p data-epub-author className="truncate text-xs text-ink-dull">{info.author}</p>}
          <select
            aria-label={t("epub.toc")}
            tabIndex={-1}
            value={index}
            onChange={(e) => api.previewSheetSelect(Number(e.target.value))}
            className="mt-2 max-w-full rounded border border-app-line bg-app-box px-1 py-0.5 text-xs text-ink"
          >
            {info.chapters.map((c, i) => (
              <option key={i} value={i}>
                {rustText(c.title)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {chapter && "error" in chapter && (
        <p role="alert" className="text-ink-faint">
          {t("epub.unreadable", { reason: chapter.error })}
        </p>
      )}
      {chapter && "url" in chapter && (
        <div ref={box} className="overflow-hidden">
          <iframe
            ref={frame}
            title={t("epub.chapter_title", { name, chapter: rustText(info.chapters[index].title) })}
            data-epub=""
            sandbox="allow-same-origin"
            src={chapter.url}
            tabIndex={-1}
            onLoad={() => outer.current && box.current && frame.current && layout(outer.current, box.current, frame.current, true)}
            style={{ pointerEvents: "none", transformOrigin: "0 0" }}
            className="block border-0 bg-white"
          />
        </div>
      )}
    </div>
  );
}
