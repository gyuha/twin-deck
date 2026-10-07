import { useEffect, useState } from "react";
import { useAppStore } from "../state/context";
import { MAX_BYTES, readOffice, type OfficeContent } from "../lib/office";
import type { OfficeFormat } from "../lib/office/kinds";

type State = { status: "loading" } | { status: "ready"; content: OfficeContent } | { status: "error"; message: string };

/**
 * Office 문서(docx·xlsx·pptx) 미리보기. 파일을 앱이 여는 주소(`backend.fileUrl`)로 읽어 앞부분만 보여 준다.
 * 라이브러리는 이 파일을 열 때 동적으로 불러온다. 실제 문서 화면이 아니라 데이터 미리보기라는 안내를 맨 위 가운데에 항상 눈에 띄게 붙인다(스크롤해도 따라온다).
 */
export function OfficeView({ path, kind, fileSize, sizeText }: { path: string; kind: OfficeFormat; fileSize: number; sizeText: string }) {
  const { api } = useAppStore();
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    if (fileSize > MAX_BYTES) {
      setState({ status: "error", message: `문서가 너무 커서 미리 볼 수 없습니다 (${sizeText})` });
      return;
    }
    setState({ status: "loading" });
    let disposed = false;
    void (async () => {
      try {
        const res = await fetch(api.fileUrl(path));
        if (!res.ok) throw new Error(`파일을 읽지 못했습니다 (${res.status})`);
        const content = await readOffice(kind, await res.arrayBuffer());
        if (!disposed) setState({ status: "ready", content });
      } catch (e) {
        if (!disposed) setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      disposed = true;
    };
  }, [api, path, kind, fileSize, sizeText]);
  if (state.status === "loading") return <p className="text-ink-faint">불러오는 중…</p>;
  if (state.status === "error")
    return (
      <p role="alert" className="text-ink-faint">
        {state.message}
      </p>
    );
  const c = state.content;
  const truncated = (c.kind === "docx" || c.kind === "xlsx") && c.truncated;
  return (
    <div aria-label="Office 문서 미리보기">
      <p role="note" className="sticky top-0 z-10 mb-2 rounded border border-status-warning/55 bg-status-warning/15 px-2 py-1 text-center text-sm font-semibold text-status-warning">
        데이터 미리보기이며 실제 문서 화면과 다릅니다
      </p>
      {c.kind === "docx" && <div aria-label="문서 본문" className="space-y-2 break-words [&_table]:border-collapse [&_td]:border [&_td]:border-app-line [&_td]:px-1" dangerouslySetInnerHTML={{ __html: c.html }} />}
      {c.kind === "xlsx" && (
        <>
          <p className="mb-1 text-xs text-ink-faint">시트: {c.sheet}</p>
          <table aria-label="시트 본문" className="border-collapse text-xs">
            <tbody>
              {c.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((v, j) => (
                    <td key={j} className="border border-app-line px-1">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {c.kind === "pptx" && (
        <div aria-label="슬라이드 본문" className="space-y-1">
          {c.paragraphs.length ? c.paragraphs.map((t, i) => <p key={i}>{t}</p>) : <p className="text-ink-faint">첫 슬라이드에 텍스트가 없습니다</p>}
        </div>
      )}
      {truncated && <p className="mt-2 text-xs text-ink-faint">첫 부분만 표시합니다</p>}
    </div>
  );
}
