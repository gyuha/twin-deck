/** PageUp/PageDown 한 번에 움직이는 비율(화면 높이 대비). 한 줄쯤 겹쳐서 읽던 곳을 잃지 않게 한다. */
const PAGE_RATIO = 0.9;

/**
 * 열려 있는 미리보기 본문을 한 화면만큼 위(-1)/아래(1)로 스크롤한다.
 * 텍스트·코드·JSON·Markdown은 본문 영역을 움직인다.
 * PDF는 웹뷰의 PDF 뷰어가 안쪽 스크롤을 밖에서 움직일 수 없게 하므로, 한 쪽씩 넘긴다(`#page=N`).
 * Quick Look 미리보기(`data-quicklook`)는 iframe을 문서 높이만큼 늘려 두므로 본문 영역을 움직인다.
 */
export function scrollPreview(dir: 1 | -1) {
  const body = document.querySelector<HTMLElement>("[data-preview-body]");
  if (!body) return;
  const frame = body.querySelector<HTMLIFrameElement>("iframe:not([data-quicklook])");
  if (frame) {
    const base = frame.src.split("#")[0];
    const current = Number(/#page=(\d+)/.exec(frame.src)?.[1] ?? "1");
    const count = Number(frame.dataset.pageCount ?? "0"); // 모르면(0) 위쪽은 막지 않는다
    const next = Math.max(1, count > 0 ? Math.min(count, current + dir) : current + dir);
    if (next !== current) frame.src = `${base}#page=${next}`;
    return;
  }
  body.scrollBy({ top: dir * body.clientHeight * PAGE_RATIO });
}
