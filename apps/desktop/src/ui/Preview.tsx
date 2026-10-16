import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { PreviewRect } from "@twin-deck/ts-client";
import { languageFor } from "../lib/highlight";
import { isArchiveName, isArchivePath, isRemotePath } from "@twin-deck/ts-client";
import { clampRect, defaultRect, moveRect, resizeRect } from "../lib/previewRect";
import type { Edge } from "../lib/previewRect";
import { rustText, t as translate } from "../i18n";
import { useApp, useAppStore, useT } from "../state/context";
import { CodeView } from "./CodeView";
import { usePreviewFont } from "./fonts";
import { JsonView } from "./JsonView";
import { MarkdownView, resolveMarkdownImage } from "./MarkdownView";
import { AudioView } from "./AudioView";
import { VideoView } from "./VideoView";
import { PdfView } from "./PdfView";
import { ModelView } from "./ModelView";
import { modelKindOf } from "../lib/model/kinds";
import { OfficeMarkdownView, isOfficeFile } from "./OfficeMarkdownView";
import { EpubView } from "./EpubView";
import { HwpView } from "./HwpView";

const isMarkdown = (name: string) => /\.(md|markdown)$/i.test(name);

const isJson = (name: string) => /\.json$/i.test(name);

const kindLabel = (kind: "text" | "image" | "pdf" | "directory" | "other" | "audio" | "video") =>
  ({ text: translate("preview.kind.text"), image: translate("preview.kind.image"), pdf: "PDF", directory: translate("preview.kind.directory"), other: translate("preview.kind.other"), audio: translate("preview.kind.audio"), video: translate("preview.kind.video") })[kind];

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
  const t = useT();
  const p = useApp((s) => s.preview);
  const previewConfig = useApp((s) => s.loaded.config.preview);
  const zipExts = useApp((s) => s.loaded.config.file_systems.zip.additional_extensions);
  const previewFont = usePreviewFont();
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const saved = useApp((s) => s.previewRect);
  const { api } = useAppStore();
  const edit = useApp((s) => s.previewEdit);
  const [copied, setCopied] = useState(false); // 복사 버튼이 잠깐 "복사됨"을 보이는 동안
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    setCopied(false);
    clearTimeout(copiedTimer.current);
    return () => clearTimeout(copiedTimer.current);
  }, [p?.path]);
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
  // 항목을 넘기는 동안 `data`는 이전 파일의 것이다. 크기·내용으로 파일을 읽는 뷰어(3D·Office)는 새 항목의 데이터가 온 뒤에만 띄운다.
  const fresh = p.status === "ready";
  // 디스크 위 로컬 파일만 앱이 직접 읽는 뷰어(3D·Office·epub·HWP)를 쓴다. 압축 파일 안과 원격(sftp://·ftp://) 파일은 쓰지 않는다.
  const onDisk = !isArchivePath(p.path) && !isRemotePath(p.path);
  const model = p.isDir || !onDisk ? null : modelKindOf(p.name); // 3D 모델이면 서비스가 돌려준 kind와 무관하게 3D 뷰어로 보여 준다(압축 파일 안은 asset 프로토콜로 읽을 수 없어 제외)
  // Office 문서는 디스크 위 파일만 Rust가 office_oxide로 읽은 글자·표(Markdown)로 보여 준다. 압축 안은 "미리 볼 수 없는 형식"이다.
  const office = !p.isDir && !model && onDisk && isOfficeFile(p.name);
  // epub은 디스크 위 파일만 앱이 읽어 보여 준다(압축 안은 읽지 않고 "미리 볼 수 없는 형식"). 3D·Office와 겹치지 않는다.
  const epub = !p.isDir && !model && onDisk && /\.epub$/i.test(p.name);
  // HWP·HWPX도 디스크 위 파일만 앱이 쪽 단위로 그려 보여 준다(압축 안은 "미리 볼 수 없는 형식").
  const hwp = !p.isDir && !model && onDisk && /\.hwpx?$/i.test(p.name);
  // 텍스트 본문. 3D 뷰어가 모델을 읽지 못하면 텍스트 형식은 이것으로 돌아간다.
  // 텍스트 계열(텍스트·코드·마크다운·JSON)이 3D·Office 뷰어 없이 그려질 때만 복사 버튼을 보인다.
  const showCopy = fresh && d?.kind === "text" && !model && !office;
  // 이미지가 실제로 보일 때만(너무 커서 표시하지 못한 이미지는 제외) 이미지 복사 버튼을 보인다.
  const showCopyImage = fresh && d?.kind === "image" && !!d.dataUrl && !model && !office;
  const editing = !!edit && edit.path === p.path && d?.kind === "text" && !model && !office;
  const textBody = d?.kind === "text" ? (
    <>
              {isMarkdown(p.name) ? (
                <MarkdownView text={d.text ?? ""} docPath={p.path} resolveImage={(src) => resolveMarkdownImage(src, p.path, api.fileUrl)} />
              ) : isJson(p.name) ? (
                <JsonView text={d.text ?? ""} />
              ) : languageFor(p.name) ? (
                <CodeView name={p.name} text={d.text ?? ""} />
              ) : (
                <pre aria-label={t("preview.text_aria")} style={previewFont} className="whitespace-pre-wrap break-words font-mono text-xs">
                  {p.isDir ? rustText(d.text ?? "") : d.text}
                </pre>
              )}
              {d.truncated && <p className="mt-1 text-xs text-ink-faint">{t("preview.truncated", { size: size(d.size) })}</p>}
            </>
  ) : null;
  return (
    <div
      onMouseDown={(e) => {
        if (previewConfig.close_on_outside_click && e.button === 0 && e.target === e.currentTarget) api.previewClose();
      }}
      className={["fixed inset-0 bg-black/30", rect ? "" : "flex items-center justify-center"].join(" ")}
    >
      <div
        role="dialog"
        aria-label={t("preview.aria", { name: p.name })}
        style={rect ? { position: "absolute", left: rect.x, top: rect.y, width: rect.w, height: rect.h } : undefined}
        className={["relative flex flex-col overflow-hidden rounded border border-app-line bg-app-box text-sm shadow-lg", rect ? "" : "h-[80vh] w-[44rem] max-w-full"].join(" ")}
      >
        {HANDLES.map((h) => (
          <div key={h.edge} data-resize={h.edge} aria-hidden="true" onMouseDown={(e) => startDrag(e, h.edge)} className={`absolute z-10 ${h.className}`} />
        ))}
        <div className="flex shrink-0 items-center border-b border-app-line bg-app-dark-box">
          <h2
          data-preview-title
          title={t("preview.drag_hint")}
          onMouseDown={(e) => startDrag(e, null)}
          onDoubleClick={() => api.setPreviewRect(null)}
          className="min-w-0 flex-1 shrink-0 cursor-move select-none break-all py-2 pl-3 font-semibold"
        >
          {p.name}
        </h2>
          {editing && (
            <span data-preview-edit-state className="mr-2 shrink-0 text-xs text-ink-dull">
              {edit.saved ? t("preview.saved") : edit.text !== edit.base ? t("preview.editing_dirty") : t("preview.editing")}
            </span>
          )}
          {(showCopy || showCopyImage) && (
            <button
              type="button"
              aria-label={showCopyImage ? t("preview.copy_image") : t("preview.copy")}
              title={showCopyImage ? t("preview.copy_image") : d?.truncated ? t("preview.copy_truncated", { size: size(d.size) }) : t("preview.copy")}
              onClick={() => {
                const done = () => {
                  setCopied(true);
                  clearTimeout(copiedTimer.current);
                  copiedTimer.current = setTimeout(() => setCopied(false), 1500);
                };
                if (showCopyImage) void api.previewCopyImage().then((ok) => ok && done());
                else {
                  void api.previewCopyText();
                  done();
                }
              }}
              data-copied={copied ? "true" : undefined}
              className="mr-1 flex size-6 shrink-0 items-center justify-center rounded text-ink-dull hover:bg-app-selected hover:text-ink"
            >
              {/* 글자 대신 아이콘: 복사 직후 잠깐 체크 표시로 바뀐다. */}
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {copied ? (
                  <path d="M3 8.5l3.2 3.2L13 4.8" />
                ) : (
                  <>
                    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
                    <path d="M10.5 5.5v-2a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3.5V9A1.5 1.5 0 0 0 4 10.5h1.5" />
                  </>
                )}
              </svg>
            </button>
          )}
          <button type="button" aria-label={t("common.close")} title={t("preview.close_title")} onClick={() => api.previewClose()} className="mx-2 flex size-6 shrink-0 items-center justify-center rounded text-ink-dull hover:bg-app-selected hover:text-ink">
            ✕
          </button>
        </div>
        <div ref={bodyRef} data-preview-body className={`td-thin-scroll min-h-0 flex-1 select-text overflow-auto py-2 pl-3 pr-3 ${p.status === "loading" && d ? "opacity-60" : ""}`}>
          {p.status === "loading" && (!d || model || office) && <p className="text-ink-faint">{t("common.loading")}</p>}
          {p.status === "error" && (
            <p role="alert" className="text-status-error">
              {p.error}
            </p>
          )}
          {d && model && fresh && <ModelView path={p.path} name={p.name} size={d.size} fallback={d.kind === "text" ? textBody : undefined} />}
          {office && <OfficeMarkdownView key={p.path} path={p.path} />}
          {epub && <EpubView key={p.path} path={p.path} name={p.name} />}
          {hwp && d && fresh && <HwpView path={p.path} fileSize={d.size} sizeText={size(d.size)} />}
          {d?.kind === "text" && !model && !office &&
            (editing ? (
              <textarea
                data-preview-edit
                aria-label={t("preview.edit_aria")}
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                spellCheck={false}
                value={edit.text}
                onChange={(e) => api.previewEditChange(e.target.value)}
                onKeyDown={(e) => {
                  // Esc는 미리보기 닫기가 아니라 편집 종료다(한글 조합 중의 Esc는 조합 취소에 쓰인다).
                  if (e.key === "Escape" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    e.stopPropagation();
                    void api.previewEditEnd();
                  }
                }}
                style={previewFont}
                className="block h-full min-h-48 w-full resize-none bg-transparent font-mono text-xs outline-none"
              />
            ) : (
              <div onDoubleClick={() => void api.previewEditStart()}>{textBody}</div>
            ))}
          {d?.kind === "image" && !model && !office &&
            (d.dataUrl ? (
              <div className="flex h-full items-center justify-center">
                <img src={d.dataUrl} alt={p.name} className="max-h-full max-w-full object-contain" />
              </div>
            ) : (
              <p className="text-ink-faint">{t("preview.image_too_big", { size: size(d.size) })}</p>
            ))}
          {d?.kind === "audio" &&
            (d.dataUrl ? (
              <AudioView dataUrl={d.dataUrl} name={p.name} autoplay={previewConfig.audio_autoplay} />
            ) : (
              <p className="text-ink-faint">{t("preview.sound_too_big", { size: size(d.size) })}</p>
            ))}
          {d?.kind === "video" && <VideoView path={p.path} name={p.name} autoplay={previewConfig.video_autoplay} />}
          {d?.kind === "pdf" &&
            (d.dataUrl ? (
              <PdfView dataUrl={d.dataUrl} name={p.name} />
            ) : !d.truncated && fresh ? (
              <PdfView fileSrc={api.fileUrl(p.path)} name={p.name} />
            ) : (
              <p className="text-ink-faint">{t("preview.pdf_too_big", { size: size(d.size) })}</p>
            ))}
          {(d?.kind === "directory" || (d?.kind === "other" && !model && !office && !epub && !hwp)) && (
            <p className="text-ink-faint">
              {kindLabel(d.kind)} — {t("preview.unsupported")}
              {d.kind === "other" ? ` (${size(d.size)})` : ""}
            </p>
          )}
        </div>
        <p className="shrink-0 border-t border-app-line bg-app-dark-box px-3 py-2 text-xs text-ink-faint">
          {editing ? t("preview.hint_editing") : t("preview.hint", { enter: isArchiveName(p.name, zipExts) ? t("preview.hint_extract") : t("preview.hint_open") })}
        </p>
      </div>
    </div>
  );
}
