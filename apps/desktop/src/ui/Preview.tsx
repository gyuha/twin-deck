import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { PreviewRect } from "@twin-deck/ts-client";
import { languageFor } from "../lib/highlight";
import { isArchiveName } from "@twin-deck/ts-client";
import { clampRect, defaultRect, moveRect, resizeRect } from "../lib/previewRect";
import type { Edge } from "../lib/previewRect";
import { useApp, useAppStore } from "../state/context";
import { CodeView } from "./CodeView";
import { usePreviewFont } from "./fonts";
import { JsonView } from "./JsonView";
import { MarkdownView } from "./MarkdownView";
import { AudioView } from "./AudioView";
import { VideoView } from "./VideoView";
import { PdfView } from "./PdfView";

const isMarkdown = (name: string) => /\.(md|markdown)$/i.test(name);

const isJson = (name: string) => /\.json$/i.test(name);

const KIND_LABEL = { text: "텍스트", image: "이미지", pdf: "PDF", directory: "폴더", other: "기타" } as const;

/** 크기 조절 손잡이: 가장자리 4개와 모서리 4개. 창 테두리 바깥쪽 반을 덮는다. */
const HANDLES: { edge: Edge; className: string }[] = [
  { edge: "n", className: "-top-1 left-2 right-2 h-2 cursor-ns-resize" },
  { edge: "s", className: "-bottom-1 left-2 right-2 h-2 cursor-ns-resize" },
  { edge: "w", className: "-left-1 top-2 bottom-2 w-2 cursor-ew-resize" },
  { edge: "e", className: "-right-1 top-2 bottom-2 w-2 cursor-ew-resize" },
  { edge: "nw", className: "-left-1 -top-1 h-3 w-3 cursor-nwse-resize" },
  { edge: "se", className: "-bottom-1 -right-1 h-3 w-3 cursor-nwse-resize" },
  { edge: "ne", className: "-right-1 -top-1 h-3 w-3 cursor-nesw-resize" },
  { edge: "sw", className: "-bottom-1 -left-1 h-3 w-3 cursor-nesw-resize" },
];

function size(n: number): string {
  return n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;
}

/** 미리보기 (VIEW-01): 텍스트는 앞부분, 이미지는 그림, 그 밖은 종류와 크기. 키 조작은 `preview` 스코프가 처리한다. */
export function Preview() {
  const p = useApp((s) => s.preview);
  const previewConfig = useApp((s) => s.loaded.config.preview);
  const zipExts = useApp((s) => s.loaded.config.file_systems.zip.additional_extensions);
  const previewFont = usePreviewFont();
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const saved = useApp((s) => s.previewRect);
  const { api } = useAppStore();
  // 끄는 동안의 창 모양. 놓을 때 한 번만 저장한다.
  const [live, setLive] = useState<PreviewRect | null>(null);
  const stopDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => stopDrag.current?.(), []);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rect = live ?? (saved ? clampRect(saved, vw, vh) : null);
  // 제목 줄(이동)과 손잡이(크기 조절)가 함께 쓰는 끌기. 움직이지 않고 놓으면 저장하지 않는다.
  const startDrag = (e: ReactMouseEvent, edge: Edge | null) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const base = rect ?? defaultRect(vw, vh);
    const x0 = e.clientX;
    const y0 = e.clientY;
    let last = base;
    const move = (m: MouseEvent) => {
      const dx = m.clientX - x0;
      const dy = m.clientY - y0;
      last = edge ? resizeRect(base, edge, dx, dy, vw, vh) : moveRect(base, dx, dy, vw, vh);
      setLive(last);
    };
    const end = () => {
      stopDrag.current?.();
      if (JSON.stringify(last) !== JSON.stringify(base)) api.setPreviewRect(last);
    };
    stopDrag.current = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", end);
      stopDrag.current = null;
      setLive(null);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
  };
  // 다른 파일로 넘어가면 스크롤을 맨 위로 되돌린다(이전 파일의 위치를 이어받지 않게).
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [p?.path]);
  if (!p) return null;
  const d = p.data;
  return (
    <div className={["fixed inset-0 bg-black/30", rect ? "" : "flex items-center justify-center"].join(" ")}>
      <div
        role="dialog"
        aria-label={`미리보기: ${p.name}`}
        style={rect ? { position: "absolute", left: rect.x, top: rect.y, width: rect.w, height: rect.h } : undefined}
        className={["relative flex flex-col rounded border border-app-line bg-app-box py-3 pl-3 pr-0 text-sm shadow-lg", rect ? "" : "h-[80vh] w-[44rem] max-w-full"].join(" ")}
      >
        {HANDLES.map((h) => (
          <div key={h.edge} data-resize={h.edge} aria-hidden="true" onMouseDown={(e) => startDrag(e, h.edge)} className={`absolute z-10 ${h.className}`} />
        ))}
        <h2
          data-preview-title
          title="끌어서 옮기고, 더블클릭하면 기본 크기로 돌아갑니다"
          onMouseDown={(e) => startDrag(e, null)}
          onDoubleClick={() => api.setPreviewRect(null)}
          className="mb-2 shrink-0 cursor-move select-none break-all pr-3 font-semibold"
        >
          {p.name}
        </h2>
        <div ref={bodyRef} data-preview-body className={`td-thin-scroll min-h-0 flex-1 overflow-auto pr-3 ${p.status === "loading" && d ? "opacity-60" : ""}`}>
          {p.status === "loading" && !d && <p className="text-ink-faint">불러오는 중…</p>}
          {p.status === "error" && (
            <p role="alert" className="text-status-error">
              {p.error}
            </p>
          )}
          {d?.kind === "text" && (
            <>
              {isMarkdown(p.name) ? (
                <MarkdownView text={d.text ?? ""} />
              ) : isJson(p.name) ? (
                <JsonView text={d.text ?? ""} />
              ) : languageFor(p.name) ? (
                <CodeView name={p.name} text={d.text ?? ""} />
              ) : (
                <pre aria-label="텍스트 미리보기" style={previewFont} className="whitespace-pre-wrap break-words font-mono text-xs">
                  {d.text}
                </pre>
              )}
              {d.truncated && <p className="mt-1 text-xs text-ink-faint">앞부분만 표시합니다 (전체 {size(d.size)})</p>}
            </>
          )}
          {d?.kind === "image" &&
            (d.dataUrl ? (
              <div className="flex h-full items-center justify-center">
                <img src={d.dataUrl} alt={p.name} className="max-h-full max-w-full object-contain" />
              </div>
            ) : (
              <p className="text-ink-faint">이미지가 너무 커서 미리 볼 수 없습니다 ({size(d.size)})</p>
            ))}
          {d?.kind === "audio" &&
            (d.dataUrl ? (
              <AudioView dataUrl={d.dataUrl} name={p.name} autoplay={previewConfig.audio_autoplay} />
            ) : (
              <p className="text-ink-faint">사운드 파일이 너무 커서 미리 들을 수 없습니다 ({size(d.size)})</p>
            ))}
          {d?.kind === "video" && <VideoView path={p.path} name={p.name} autoplay={previewConfig.video_autoplay} />}
          {d?.kind === "pdf" &&
            (d.dataUrl ? (
              <PdfView dataUrl={d.dataUrl} name={p.name} />
            ) : (
              <p className="text-ink-faint">PDF가 너무 커서 미리 볼 수 없습니다 ({size(d.size)})</p>
            ))}
          {(d?.kind === "directory" || d?.kind === "other") && (
            <p className="text-ink-faint">
              {KIND_LABEL[d.kind]} — 미리 볼 수 없는 형식입니다{d.kind === "other" ? ` (${size(d.size)})` : ""}
            </p>
          )}
        </div>
        <p className="mt-2 pr-3 text-xs text-ink-faint">↑↓ 이전/다음 항목 · PageUp/PageDown 스크롤 · Enter {isArchiveName(p.name, zipExts) ? "압축 풀기" : "열기"} · Delete 삭제 · Space/Esc 닫기</p>
      </div>
    </div>
  );
}
