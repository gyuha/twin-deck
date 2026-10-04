import { usePreviewFont } from "./fonts";
import { highlight, languageFor } from "../lib/highlight";

/** 프로그램 언어 파일의 미리보기. 언어를 알 수 없으면 null이라 호출하는 쪽이 일반 텍스트로 보여 준다. */
export function CodeView({ name, text }: { name: string; text: string }) {
  const previewFont = usePreviewFont();
  const language = languageFor(name);
  if (!language) return null;
  return (
    <pre aria-label="코드 미리보기" data-language={language} style={previewFont} className="whitespace-pre-wrap break-words font-mono text-xs">
      <code className="hljs" dangerouslySetInnerHTML={{ __html: highlight(text, language) }} />
    </pre>
  );
}
