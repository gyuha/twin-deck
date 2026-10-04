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

/** PDF 미리보기. data URL을 Blob URL로 바꿔 웹뷰의 PDF 뷰어(iframe)에 맡긴다. */
export function PdfView({ dataUrl, name }: { dataUrl: string; name: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [pages, setPages] = useState(0);
  useEffect(() => {
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
  }, [dataUrl]);
  if (!src) return <p className="text-ink-faint">PDF를 여는 중…</p>;
  return <iframe title={`PDF 미리보기: ${name}`} src={src} data-page-count={pages || undefined} className="block h-full w-full border-0" />;
}
