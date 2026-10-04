import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { usePreviewFont } from "./fonts";

/** 마크다운 미리보기. 원시 HTML은 렌더링하지 않고, 링크는 이동하지 않으며, 이미지는 대체 텍스트만 보여 준다. */
export function MarkdownView({ text }: { text: string }) {
  const previewFont = usePreviewFont();
  return (
    <div aria-label="마크다운 미리보기" style={previewFont} className="markdown-preview text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children }) => <span className="text-accent underline">{children}</span>,
          img: ({ alt }) => <span className="text-ink-faint">{alt}</span>,
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
