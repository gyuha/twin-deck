import { useT } from "../state/context";
import { useEffect, useState } from "react";

/** Blob의 내용을 문자열로 읽는다(jsdom의 Blob에는 text()가 없어 FileReader를 쓴다). */
function readText(b: Blob): Promise<string> {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => resolve("");
    r.readAsText(b, "latin1");
  });
}

/**
 * PDF 미리보기. `fileSrc`(파일 주소, 시험 기능 `preview.pdf_direct`)가 있으면 웹뷰의 PDF 뷰어(iframe)가 파일을 직접 읽는다:
 * 데이터로 싣지 않고 Blob도 만들지 않아 큰 파일도 빨리 열린다(쪽 수는 모르므로 PageDown의 위쪽 제한이 없다).
 * 없으면 data URL을 Blob URL로 바꿔 iframe에 맡긴다.
 */
export function PdfView({ dataUrl, fileSrc, name }: { dataUrl?: string; fileSrc?: string; name: string }) {
  const t = useT();
  const [src, setSrc] = useState<string | null>(null);
  const [pages, setPages] = useState(0);
  useEffect(() => {
    if (fileSrc || !dataUrl) return;
    let url: string | null = null;
    let alive = true;
    void fetch(dataUrl)
      .then((r) => r.blob())
      .then((b) => {
        if (!alive) return;
        url = URL.createObjectURL(b);
        setSrc(url);
        // PageUp/PageDown으로 한 쪽씩 넘길 때 끝을 넘지 않게 쪽 수를 어림한다(압축된 객체 안에 있으면 못 세므로 0 = 모름).
        void readText(b).then((t) => alive && setPages(t.match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0));
      });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [dataUrl, fileSrc]);
  if (fileSrc) return <iframe title={t("media.pdf_title", { name })} src={fileSrc} data-direct className="block h-full w-full border-0" />;
  if (!src) return <p className="text-ink-faint">{t("media.pdf_opening")}</p>;
  return <iframe title={t("media.pdf_title", { name })} src={src} data-page-count={pages || undefined} className="block h-full w-full border-0" />;
}
