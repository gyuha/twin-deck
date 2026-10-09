import { useT } from "../state/context";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { isArchivePath, joinPath, parentPath } from "@twin-deck/ts-client";
import { usePreviewFont } from "./fonts";

/**
 * 마크다운 안 상대경로 이미지(`img/a.png`, `./a.png`, `../pics/b.png`, `%20`)를 마크다운 파일이 있는 폴더 기준의 파일 주소로 바꾼다.
 * 바깥 주소·`data:`·`javascript:`(스킴이 있는 것)·절대경로, 압축 파일 안의 마크다운은 `null`이다(그림 대신 대체 텍스트만 보여 준다).
 */
export function resolveMarkdownImage(src: string | undefined, mdPath: string, fileUrl: (path: string) => string): string | null {
  if (!src || isArchivePath(mdPath)) return null;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(src) || /^[\\/]/.test(src)) return null;
  let rel = src.replace(/[?#].*$/, "");
  try {
    rel = decodeURIComponent(rel);
  } catch {
    return null;
  }
  let dir = parentPath(mdPath);
  if (dir === null) return null;
  for (const seg of rel.split(/[\\/]/)) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      dir = parentPath(dir);
      if (dir === null) return null;
    } else dir = joinPath(dir, seg);
  }
  return dir === parentPath(mdPath) ? null : fileUrl(dir);
}

/** 마크다운 미리보기. 원시 HTML은 렌더링하지 않고, 링크는 이동하지 않는다. 이미지는 `resolveImage`가 주소를 주면 그리고, 아니면 대체 텍스트만 보여 준다. */
export function MarkdownView({ text, resolveImage }: { text: string; resolveImage?: (src: string | undefined) => string | null }) {
  const t = useT();
  const previewFont = usePreviewFont();
  return (
    <div aria-label={t("preview.markdown_aria")} style={previewFont} className="markdown-preview text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children }) => <span className="text-accent underline">{children}</span>,
          img: ({ src, alt }) => {
            const url = resolveImage?.(typeof src === "string" ? src : undefined);
            return url ? <img src={url} alt={alt} className="my-2 max-w-full" /> : <span className="text-ink-faint">{alt}</span>;
          },
          h1: ({ children }) => <h1 className="mb-2 mt-3 text-xl font-bold">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-3 text-lg font-bold">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-1 mt-2 text-base font-semibold">{children}</h3>,
          p: ({ children }) => <p className="my-2">{children}</p>,
          ul: ({ children }) => <ul className="my-2 list-disc pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal pl-5">{children}</ol>,
          pre: ({ children }) => (
            <pre style={previewFont} className="td-thin-scroll my-2 overflow-auto rounded bg-app-line/30 p-2 font-mono text-xs">{children}</pre>
          ),
          code: ({ children }) => (
            <code style={previewFont} className="font-mono text-xs">
              {children}
            </code>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-app-line pl-3 text-ink-faint">{children}</blockquote>
          ),
          table: ({ children }) => <table className="my-2 border-collapse text-xs">{children}</table>,
          th: ({ children }) => <th className="border border-app-line px-2 py-1 text-left">{children}</th>,
          td: ({ children }) => <td className="border border-app-line px-2 py-1">{children}</td>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
