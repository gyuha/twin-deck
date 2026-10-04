import type { ReactNode } from "react";
import { usePreviewFont } from "./fonts";

const TOKEN = /("(?:\\.|[^"\\])*"|"(?:\\.|[^"\\])*$)(\s*:)?|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\btrue\b|\bfalse\b|\bnull\b/g;

/** JSON 미리보기. 잘린 JSON도 칠하도록 파싱하지 않고 토큰만 색칠한다. */
export function JsonView({ text }: { text: string }) {
  const previewFont = usePreviewFont();
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const [tok, str, colon] = m;
    if (m.index > last) parts.push(text.slice(last, m.index));
    const cls = str
      ? colon
        ? "text-accent"
        : "text-status-success"
      : /^(true|false)$/.test(tok)
        ? "text-status-warning"
        : tok === "null"
          ? "text-ink-faint"
          : "text-status-info";
    // 키는 따옴표 부분만 칠하고 콜론은 그대로 둔다.
    parts.push(
      <span key={m.index} className={cls} data-json={str ? (colon ? "key" : "string") : "literal"}>
        {colon ? str : tok}
      </span>,
    );
    if (colon) parts.push(colon);
    last = m.index + tok.length;
  }
  parts.push(text.slice(last));
  return (
    <pre aria-label="JSON 미리보기" style={previewFont} className="whitespace-pre-wrap break-words font-mono text-xs">
      {parts}
    </pre>
  );
}
