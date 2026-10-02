import { useEffect, useState } from "react";

/** PDF 미리보기. data URL을 Blob URL로 바꿔 웹뷰의 PDF 뷰어(iframe)에 맡긴다. */
export function PdfView({ dataUrl, name }: { dataUrl: string; name: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let alive = true;
    void fetch(dataUrl)
      .then((r) => r.blob())
      .then((b) => {
        if (!alive) return;
        url = URL.createObjectURL(b);
        setSrc(url);
      });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [dataUrl]);
  if (!src) return <p className="text-ink-faint">PDF를 여는 중…</p>;
  return <iframe title={`PDF 미리보기: ${name}`} src={src} className="h-[60vh] w-full border-0" />;
}
