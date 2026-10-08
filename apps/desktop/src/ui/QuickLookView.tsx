import { useEffect, useRef, useState } from "react";
import { useApp, useAppStore } from "../state/context";

/** 보여 줄 HTML 한 장. 문서는 한 장, 여러 시트 xlsx는 시트마다 한 장이다. */
type Page = { name: string; url: string };
type State = { status: "loading" } | { status: "ready"; pages: Page[] } | { status: "error"; message: string };

let lastSeq = 0;
/**
 * Quick Look 요청 순번. Rust는 명령을 스레드 풀에서 돌려 보낸 순서와 다르게 받을 수 있으니, 이 순번으로 최근 요청을 가린다.
 * 창마다 따로 세지만 시각에서 시작해 창끼리도 대략 맞고, 한 창 안에서는 늘 커진다.
 */
function nextSeq(): number {
  lastSeq = Math.max(lastSeq + 1, Math.floor((performance.timeOrigin + performance.now()) * 1000));
  return lastSeq;
}

/**
 * Quick Look HTML 안의 첨부 참조(`src`·`href` 속성 값과 CSS `url()`의 `AttachmentN.확장자`)를 첨부 폴더의 파일 주소로 바꾼다.
 * 본문 글자는 건드리지 않는다. `<base>`는 쓰지 않는다: 파일 주소가 경로의 `/`를 인코딩하면 상대 경로가 엉뚱하게 풀린다.
 */
export function resolveAttachments(html: string, dir: string, fileUrl: (path: string) => string): string {
  const url = (name: string) => fileUrl(`${dir}/${name}`);
  return html
    .replace(/(\s(?:src|href)=)(["'])(Attachment\d+\.[A-Za-z0-9]+)\2/g, (_, attr: string, q: string, name: string) => `${attr}${q}${url(name)}${q}`)
    .replace(/url\((["']?)(Attachment\d+\.[A-Za-z0-9]+)\1\)/g, (_, q: string, name: string) => `url(${q}${url(name)}${q})`);
}

/**
 * iframe을 문서 크기만큼 늘린다. `fit`이면(docx·pptx) 담는 곳보다 넓을 때 폭에 맞게 줄이고(100%보다 키우지는 않는다),
 * 아니면(xlsx) 원래 크기로 두어 가로로 스크롤한다. 스크롤은 iframe 안이 아니라 미리보기 본문이 한다.
 */
export function layout(outer: HTMLElement, box: HTMLElement, f: HTMLIFrameElement, fit: boolean) {
  const doc = f.contentDocument;
  const avail = outer.clientWidth;
  if (!doc?.documentElement || avail <= 0) return;
  f.style.width = `${avail}px`;
  f.style.height = "0px"; // 내용 높이를 재려고 잠깐 줄인다
  // 넘친 내용의 오른쪽 여백은 scrollWidth에 들어가지 않는다(pptx 슬라이드의 오른쪽 그림자가 잘린다). 본문 왼쪽 여백만큼 오른쪽에도 둔다.
  const left = doc.body ? parseFloat(getComputedStyle(doc.body).marginLeft) || 0 : 0;
  const w = Math.max(doc.documentElement.scrollWidth, doc.body?.scrollWidth ?? 0, avail - left) + left;
  const h = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0);
  const scale = fit && w > avail ? avail / w : 1;
  f.style.width = `${w}px`;
  f.style.height = `${h}px`;
  f.style.transform = scale < 1 ? `scale(${scale})` : "";
  box.style.width = `${w * scale}px`;
  box.style.height = `${h * scale}px`;
}

/**
 * macOS Office 문서 미리보기(ADR-0014). Quick Look이 만든 HTML을 스크립트 없는 격리 iframe(`sandbox="allow-same-origin"`)에 띄운다.
 * - srcdoc이 아니라 Blob URL로 띄운다: srcdoc 문서는 doctype이 없어도 표준 모드라 QL의 단위 없는 길이(`width: 720`)가 무시된다.
 * - 스크립트를 끈 문서에서는 앱이 단 리스너도 WebKit이 부르지 않는다. 그래서 iframe은 마우스·포커스를 받지 않고(키는 늘 앱에 남고 링크도 눌리지 않는다),
 *   문서 크기만큼 늘려 미리보기 본문이 스크롤한다. 대신 문서 안 글자는 선택할 수 없다.
 */
export function QuickLookView({ path, name, fit }: { path: string; name: string; fit: boolean }) {
  const { api } = useAppStore();
  const [state, setState] = useState<State>({ status: "loading" });
  const sheet = useApp((s) => (s.previewSheet?.path === path ? s.previewSheet.index : 0));
  const outer = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    setState({ status: "loading" });
    let disposed = false; // 다른 항목으로 넘어간 뒤 늦게 온 응답은 버린다
    let pages: Page[] = [];
    api.quickLookPreview(path, nextSeq()).then(
      (r) => {
        if (disposed) return;
        // 여러 시트 xlsx의 `html`은 JS로 탭을 바꾸는 껍데기라 쓰지 않고, 시트 탭은 앱이 그린다.
        const raw = r.sheets.length > 1 ? r.sheets : [{ name: "", html: r.html }];
        pages = raw.map((p) => ({ name: p.name, url: URL.createObjectURL(new Blob([resolveAttachments(p.html, r.dir, api.fileUrl)], { type: "text/html" })) }));
        api.previewSheetsLoaded(path, pages.length);
        setState({ status: "ready", pages });
      },
      (e: unknown) => !disposed && setState({ status: "error", message: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      disposed = true;
      for (const p of pages) URL.revokeObjectURL(p.url);
    };
  }, [api, path]);
  useEffect(() => {
    const o = outer.current;
    if (!o || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => box.current && frame.current && layout(o, box.current, frame.current, fit));
    ro.observe(o);
    return () => ro.disconnect();
  }, [state.status, fit]);
  if (state.status === "loading") return <p className="text-ink-faint">불러오는 중…</p>;
  if (state.status === "error")
    return (
      <p role="alert" className="text-ink-faint">
        {state.message}
      </p>
    );
  const pages = state.pages;
  const page = pages[Math.min(sheet, pages.length - 1)];
  return (
    <div ref={outer} className="w-full">
      {pages.length > 1 && (
        <div role="tablist" aria-label="시트" className="sticky left-0 top-0 z-10 mb-1 flex flex-wrap gap-1 bg-app-box pb-1 text-xs">
          {pages.map((p, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              tabIndex={-1}
              aria-selected={p === page}
              onClick={() => api.previewSheetSelect(i)}
              className={"rounded px-2 py-0.5 " + (p === page ? "bg-app-selected text-ink" : "text-ink-dull hover:bg-app-selected")}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
      <div ref={box} className="overflow-hidden">
        <iframe
          ref={frame}
          title={`Quick Look 미리보기: ${name}`}
          data-quicklook=""
          sandbox="allow-same-origin"
          src={page.url}
          tabIndex={-1}
          onLoad={() => outer.current && box.current && frame.current && layout(outer.current, box.current, frame.current, fit)}
          style={{ pointerEvents: "none", transformOrigin: "0 0" }}
          className="block border-0 bg-white"
        />
      </div>
    </div>
  );
}
