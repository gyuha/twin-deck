import { languageFor } from "../lib/highlight";
import { useApp } from "../state/context";
import { CodeView } from "./CodeView";
import { JsonView } from "./JsonView";
import { MarkdownView } from "./MarkdownView";
import { PdfView } from "./PdfView";

const isMarkdown = (name: string) => /\.(md|markdown)$/i.test(name);

const isJson = (name: string) => /\.json$/i.test(name);

const KIND_LABEL = { text: "텍스트", image: "이미지", pdf: "PDF", directory: "폴더", other: "기타" } as const;

function size(n: number): string {
  return n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;
}

/** 미리보기 (VIEW-01): 텍스트는 앞부분, 이미지는 그림, 그 밖은 종류와 크기. 키 조작은 `preview` 스코프가 처리한다. */
export function Preview() {
  const p = useApp((s) => s.preview);
  if (!p) return null;
  const d = p.data;
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/30">
      <div
        role="dialog"
        aria-label={`미리보기: ${p.name}`}
        className="flex h-[80vh] w-[44rem] max-w-full flex-col rounded border border-app-line bg-app-box py-3 pl-3 pr-0 text-sm shadow-lg"
      >
        <h2 className="mb-2 shrink-0 break-all pr-3 font-semibold">{p.name}</h2>
        <div className={`td-thin-scroll min-h-0 flex-1 overflow-auto pr-3 ${p.status === "loading" && d ? "opacity-60" : ""}`}>
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
                <pre aria-label="텍스트 미리보기" className="whitespace-pre-wrap break-words font-mono text-xs">
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
        <p className="mt-2 pr-3 text-xs text-ink-faint">↑↓ 이전/다음 항목 · Enter 열기 · Space/Esc 닫기</p>
      </div>
    </div>
  );
}
