import { useEffect, useState } from "react";
import type { OfficePreviewDto } from "@twin-deck/ts-client";
import { useAppStore, useT } from "../state/context";
import { MarkdownView } from "./MarkdownView";

const EXTS = ["docx", "xlsx", "pptx", "doc", "xls", "ppt", "docm", "xlsm", "pptm"];

/** 파일 이름의 확장자(대소문자 무시)가 미리 볼 수 있는 Office 형식인가. */
export function isOfficeFile(name: string): boolean {
  const base = name.slice(Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\")) + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 && EXTS.includes(base.slice(dot + 1).toLowerCase());
}

type State = { status: "loading" } | { status: "ready"; doc: OfficePreviewDto } | { status: "error"; message: string };

/**
 * Office 문서 미리보기. Rust가 office_oxide로 읽어 준 Markdown(글자·표)을 `MarkdownView`로 그린다.
 * 실제 문서 화면이 아니라 데이터 미리보기라는 안내를 맨 위에 항상 붙인다(스크롤해도 따라온다).
 */
export function OfficeMarkdownView({ path }: { path: string }) {
  const t = useT();
  const { api } = useAppStore();
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    setState({ status: "loading" });
    let disposed = false;
    void api.officePreview(path).then(
      (doc) => {
        if (!disposed) setState({ status: "ready", doc });
      },
      (e: unknown) => {
        if (!disposed) setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
      },
    );
    return () => {
      disposed = true; // 다른 파일로 넘어가면 이전 결과는 버린다
    };
  }, [api, path]);
  if (state.status === "loading") return <p className="text-ink-faint">{t("common.loading")}</p>;
  if (state.status === "error")
    return (
      <p role="alert" className="text-ink-faint">
        {state.message}
      </p>
    );
  return (
    <div aria-label={t("office.aria")}>
      <p role="note" className="sticky top-0 z-10 mb-2 rounded border border-status-warning/55 bg-status-warning/15 px-2 py-1 text-center text-sm font-semibold text-status-warning">
        {t("office.note")}
      </p>
      <MarkdownView text={state.doc.markdown} />
      {state.doc.truncated && <p className="mt-2 text-xs text-ink-faint">{t("office.truncated")}</p>}
    </div>
  );
}
