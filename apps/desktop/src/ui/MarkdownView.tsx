import { useRef, type ReactNode } from "react";
import { useAppStore, useT } from "../state/context";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { isArchivePath, joinPath, parentPath } from "@twin-deck/ts-client";
import { usePreviewFont } from "./fonts";

/**
 * 마크다운 안 상대경로 이미지(`img/a.png`, `./a.png`, `../pics/b.png`, `%20`)를 마크다운 파일이 있는 폴더 기준의 파일 주소로 바꾼다.
 * 바깥 주소·`data:`·`javascript:`(스킴이 있는 것)·절대경로, 압축 파일 안의 마크다운은 `null`이다(그림 대신 대체 텍스트만 보여 준다).
 */
/** `rel`(상대 경로, `%20`·`../` 포함)을 마크다운 파일이 있는 폴더 기준의 경로로 푼다. 풀 수 없으면 `null`이다. */
function resolveRelative(rel: string, mdPath: string): string | null {
  let dir = parentPath(mdPath);
  if (dir === null) return null;
  for (const seg of rel.split(/[\\/]/)) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      dir = parentPath(dir);
      if (dir === null) return null;
    } else dir = joinPath(dir, seg);
  }
  return dir;
}

export function resolveMarkdownImage(src: string | undefined, mdPath: string, fileUrl: (path: string) => string): string | null {
  if (!src || isArchivePath(mdPath)) return null;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(src) || /^[\\/]/.test(src)) return null;
  let rel = src.replace(/[?#].*$/, "");
  try {
    rel = decodeURIComponent(rel);
  } catch {
    return null;
  }
  const dir = resolveRelative(rel, mdPath);
  return dir === null || dir === parentPath(mdPath) ? null : fileUrl(dir);
}

/** 링크가 가리키는 곳: 외부 주소, 같은 문서의 제목, 마크다운 파일 기준 상대 경로, 또는 처리하지 않는 것(`javascript:`·`file:` 등). */
export type MarkdownLink = { kind: "external"; url: string } | { kind: "anchor"; id: string } | { kind: "path"; path: string } | { kind: "none" };

export function classifyLink(href: string | undefined, mdPath: string | undefined): MarkdownLink {
  if (!href) return { kind: "none" };
  if (/^(https?:\/\/|mailto:)/i.test(href)) return { kind: "external", url: href };
  if (href.startsWith("#")) {
    try {
      return { kind: "anchor", id: decodeURIComponent(href.slice(1)) };
    } catch {
      return { kind: "none" };
    }
  }
  // 그 밖의 스킴(`javascript:`·`file:`·`data:`…)과 `/`로 시작하는 값은 처리하지 않는다. 안전하게 아무 일도 하지 않는 쪽이다.
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(href) || /^[\\/]/.test(href) || !mdPath) return { kind: "none" };
  let rel = href.replace(/#.*$/, "").replace(/\?.*$/, "");
  if (rel === "") return { kind: "none" };
  try {
    rel = decodeURIComponent(rel);
  } catch {
    return { kind: "none" };
  }
  const path = resolveRelative(rel, mdPath);
  return path === null ? { kind: "none" } : { kind: "path", path };
}

/** 제목 글자에서 GitHub 방식의 이동용 id를 만든다(소문자, 글자·숫자·`_`·`-`만 남기고 공백은 `-`). 같은 제목이 둘이면 id도 같고 첫 번째로 간다. */
export function headingId(text: string): string {
  return text.trim().toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\- ]/gu, "").replace(/ /g, "-");
}

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && "props" in node) return textOf((node as { props: { children?: ReactNode } }).props.children);
  return "";
}

/** 마크다운 미리보기. 원시 HTML은 렌더링하지 않고, 링크는 이동하지 않는다. 이미지는 `resolveImage`가 주소를 주면 그리고, 아니면 대체 텍스트만 보여 준다. */
export function MarkdownView({ text, resolveImage, docPath }: { text: string; resolveImage?: (src: string | undefined) => string | null; docPath?: string }) {
  const t = useT();
  const { api } = useAppStore();
  const previewFont = usePreviewFont();
  const root = useRef<HTMLDivElement>(null);
  const follow = (href: string | undefined) => {
    const link = classifyLink(href, docPath);
    if (link.kind === "external") void api.openExternalUrl(link.url);
    else if (link.kind === "path") void api.previewLink(link.path);
    else if (link.kind === "anchor") {
      const wanted = link.id.toLowerCase();
      const target = Array.from(root.current?.querySelectorAll<HTMLElement>("[id]") ?? []).find((e) => e.id.toLowerCase() === wanted);
      target?.scrollIntoView?.({ block: "start" });
    }
  };
  // 제목마다 이동용 id를 단다. 글자만으로 정하는 순수한 값이라 다시 그려도 같다.
  const heading = (Tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6", className: string) =>
    ({ children }: { children?: ReactNode }) => (
      <Tag id={headingId(textOf(children))} className={className}>
        {children}
      </Tag>
    );
  return (
    <div ref={root} aria-label={t("preview.markdown_aria")} style={previewFont} className="markdown-preview text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              role="link"
              onClick={(e) => {
                e.preventDefault(); // 웹뷰가 앱 화면을 링크 주소로 바꾸지 않게 한다. 열기는 앱이 정한 방식으로만 한다.
                follow(href);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  e.stopPropagation(); // Enter가 앱의 "열기"로 새지 않게 한다
                  follow(href);
                }
              }}
              className="cursor-pointer text-accent underline"
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) => {
            const url = resolveImage?.(typeof src === "string" ? src : undefined);
            return url ? <img src={url} alt={alt} className="my-2 max-w-full" /> : <span className="text-ink-faint">{alt}</span>;
          },
          h1: heading("h1", "mb-2 mt-3 text-xl font-bold"),
          h2: heading("h2", "mb-2 mt-3 text-lg font-bold"),
          h3: heading("h3", "mb-1 mt-2 text-base font-semibold"),
          h4: heading("h4", "mb-1 mt-2 font-semibold"),
          h5: heading("h5", "mb-1 mt-2 font-semibold"),
          h6: heading("h6", "mb-1 mt-2 font-semibold text-ink-faint"),
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
