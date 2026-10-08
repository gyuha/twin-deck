import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackendError, FakeBackend } from "@twin-deck/ts-client";
import type { QuickLookDto } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";
import { quickLookKindOf } from "../lib/office/kinds";

// macOS는 Office 문서를 Quick Look 미리보기로 보여 준다(ADR-0014). 가짜 백엔드는 파일 내용을 Quick Look이 만든 HTML로 본다.
// 이름순: a.docx(0), b.pptx(1), c.xlsx(2), d.doc(3)
const files = {
  "/home/a/a.docx": `<html><body><p>문서 본문</p><img src="Attachment1.png"><link href='Attachment2.css' rel="stylesheet"><div style="background:url(Attachment3.png)"></div><p>Attachment9.png는 글자</p></body></html>`,
  "/home/a/b.pptx": "<p>슬라이드 본문</p>",
  "/home/a/c.xlsx": "PK\u0003\u0004\u0000",
  "/home/a/d.doc": "<p>구형 문서</p>",
  "/home/b": null,
};
const seed = () => new FakeBackend().seed(files); // `preview.office`는 기본(꺼짐) 그대로다
const dlg = (name: string) => screen.findByRole("dialog", { name });
const open = (user: Awaited<ReturnType<typeof renderApp>>["user"], n: number) => user.keyboard("{ArrowDown}".repeat(n) + "{ArrowRight}");
const frameIn = async (d: HTMLElement) => {
  await waitFor(() => expect(d.querySelector("iframe[data-quicklook]")).not.toBeNull());
  return d.querySelector<HTMLIFrameElement>("iframe[data-quicklook]")!;
};

// WebKit에서 srcdoc 문서는 doctype이 없어도 표준 모드라 QL의 단위 없는 길이가 무시된다. Blob URL 문서는 quirks 모드가 된다.
// jsdom에는 Blob URL이 없으니 만든 Blob을 가로채 내용을 읽는다(jsdom Blob에는 text()가 없어 FileReader를 쓴다).
const blobs = new Map<string, Blob>();
const revoked: string[] = [];
const readBlob = (b: Blob) =>
  new Promise<string>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsText(b);
  });
const htmlOf = async (f: HTMLIFrameElement) => {
  const src = f.getAttribute("src") ?? "";
  expect(src).toMatch(/^blob:/);
  return readBlob(blobs.get(src)!);
};
beforeEach(() => {
  blobs.clear();
  revoked.length = 0;
  URL.createObjectURL = vi.fn((b: Blob) => {
    const u = `blob:ql-${blobs.size + 1}`;
    blobs.set(u, b);
    return u;
  });
  URL.revokeObjectURL = vi.fn((u: string) => void revoked.push(u));
});
afterEach(() => vi.restoreAllMocks());

describe("Quick Look 미리보기 (macOS)", () => {
  it("docx·pptx·doc은 스크립트 없는 격리 iframe(Blob URL, srcdoc 아님)에 Quick Look HTML로 보인다", async () => {
    const { user } = await renderApp(seed(), "mac");
    for (const [n, name, text] of [
      [0, "a.docx", "문서 본문"],
      [1, "b.pptx", "슬라이드 본문"],
      [3, "d.doc", "구형 문서"],
    ] as const) {
      await open(user, n);
      const d = await dlg(`미리보기: ${name}`);
      const f = await frameIn(d);
      expect(f.getAttribute("sandbox")).toBe("allow-same-origin");
      expect(f.hasAttribute("srcdoc")).toBe(false);
      expect(await htmlOf(f)).toContain(text);
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog", { name: `미리보기: ${name}` })).toBeNull());
      await user.keyboard("{Home}");
    }
  });

  it("preview.office가 꺼져 있어도 보이고, 데이터 미리보기 안내·텍스트 본문은 없다", async () => {
    const { user } = await renderApp(seed(), "mac");
    await open(user, 0);
    const d = await dlg("미리보기: a.docx");
    await frameIn(d);
    expect(within(d).queryByText(/데이터 미리보기이며/)).toBeNull();
    expect(within(d).queryByText(/Office 문서 미리보기가 꺼져 있습니다/)).toBeNull();
    expect(within(d).queryByLabelText("텍스트 미리보기")).toBeNull();
    expect(within(d).queryByRole("button", { name: "텍스트 복사" })).toBeNull();
  });

  it("첨부 참조(src·href·url())는 첨부 폴더의 파일 주소로 바뀌고 본문 글자는 그대로다", async () => {
    const { user } = await renderApp(seed(), "mac");
    await open(user, 0);
    const f = await frameIn(await dlg("미리보기: a.docx"));
    const html = await htmlOf(f);
    const dir = "fake-asset://localhost/tmp/ql/home/a/a.docx.qlpreview";
    expect(html).toContain(`src="${dir}/Attachment1.png"`);
    expect(html).toContain(`href='${dir}/Attachment2.css'`);
    expect(html).toContain(`url(${dir}/Attachment3.png)`);
    expect(html).toContain("<p>Attachment9.png는 글자</p>");
  });

  it("Quick Look이 실패하면 오류 문구가 보인다", async () => {
    const b = seed();
    b.quickLookResponder = async () => {
      throw new BackendError("Quick Look으로 미리 볼 수 없습니다 (시간 초과)");
    };
    const { user } = await renderApp(b, "mac");
    await open(user, 0);
    const d = await dlg("미리보기: a.docx");
    expect(await within(d).findByRole("alert")).toHaveTextContent("Quick Look으로 미리 볼 수 없습니다 (시간 초과)");
    expect(d.querySelector("iframe[data-quicklook]")).toBeNull();
  });

  it("빠르게 다음 항목으로 넘기면 늦게 온 이전 응답은 버린다", async () => {
    const b = seed();
    let releaseA: (r: QuickLookDto) => void = () => {};
    b.quickLookResponder = (path) =>
      path.endsWith("a.docx") ? new Promise((r) => (releaseA = r)) : Promise.resolve({ html: "<p>둘째 결과</p>", dir: "/tmp/b", sheets: [] });
    const { user } = await renderApp(b, "mac");
    await open(user, 0);
    await dlg("미리보기: a.docx");
    await user.keyboard("{ArrowDown}");
    const d = await dlg("미리보기: b.pptx");
    const f = await frameIn(d);
    expect(await htmlOf(f)).toContain("둘째 결과");
    releaseA({ html: "<p>늦은 첫째</p>", dir: "/tmp/a", sheets: [] });
    await new Promise((r) => setTimeout(r, 30));
    expect(await htmlOf(d.querySelector<HTMLIFrameElement>("iframe[data-quicklook]")!)).toContain("둘째 결과");
    expect(blobs.size).toBe(1); // 늦게 온 첫째 응답으로는 문서를 만들지 않는다
  });

  it("요청마다 순번이 커진다(같은 파일을 다시 열어도) — Rust는 들어온 순서가 아니라 이 순번으로 최근 요청을 가린다", async () => {
    const b = seed();
    const { user } = await renderApp(b, "mac");
    await open(user, 0);
    await frameIn(await dlg("미리보기: a.docx"));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "미리보기: a.docx" })).toBeNull());
    await user.keyboard("{ArrowRight}");
    await frameIn(await dlg("미리보기: a.docx"));
    await user.keyboard("{ArrowDown}");
    await frameIn(await dlg("미리보기: b.pptx"));
    expect(b.quickLookCalls).toEqual(["/home/a/a.docx", "/home/a/a.docx", "/home/a/b.pptx"]);
    for (let i = 1; i < b.quickLookSeqs.length; i++) expect(b.quickLookSeqs[i]).toBeGreaterThan(b.quickLookSeqs[i - 1]);
  });

  it("linux에서는 docx도 Quick Look을 부르지 않는다", async () => {
    const linux = seed();
    const { user } = await renderApp(linux, "linux");
    await open(user, 0);
    const d = await dlg("미리보기: a.docx");
    await waitFor(() => expect(within(d).queryByText("불러오는 중…")).toBeNull());
    expect(d.querySelector("iframe[data-quicklook]")).toBeNull();
    expect(linux.quickLookCalls).toEqual([]);
  });

  it("PageDown은 PDF처럼 #page를 붙이지 않고 미리보기 본문(문서 높이만큼 늘어난 iframe을 담은 곳)을 스크롤한다", async () => {
    const scrollBy = vi.fn();
    Element.prototype.scrollBy = scrollBy as unknown as typeof Element.prototype.scrollBy;
    const { user } = await renderApp(seed(), "mac");
    await open(user, 0);
    const f = await frameIn(await dlg("미리보기: a.docx"));
    const src = f.getAttribute("src");
    await user.keyboard("{PageDown}");
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect((scrollBy.mock.instances[0] as HTMLElement).hasAttribute("data-preview-body")).toBe(true);
    expect(f.getAttribute("src")).toBe(src);
  });

  it("iframe은 마우스·포커스를 받지 않아(키는 늘 앱에 남고 링크도 눌리지 않는다) 닫으면 Blob URL을 해제한다", async () => {
    const { user } = await renderApp(seed(), "mac");
    await open(user, 0);
    const f = await frameIn(await dlg("미리보기: a.docx"));
    expect(f.style.pointerEvents).toBe("none");
    expect(f.tabIndex).toBe(-1);
    const src = f.getAttribute("src")!;
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "미리보기: a.docx" })).toBeNull());
    expect(revoked).toContain(src);
  });
});

describe("Quick Look 형식 판별", () => {
  it("문서 계열(docx·pptx·doc·ppt·docm·pptm)만 고르고 대소문자는 무시한다", () => {
    for (const n of ["a.docx", "a.pptx", "a.doc", "a.ppt", "a.docm", "a.pptm", "A.DOCX", "/x/y/b.PpT"]) expect(quickLookKindOf(n)).toBe("document");
    for (const n of ["a.odt", "a.pages", "a.txt", "docx", ".docx"]) expect(quickLookKindOf(n)).toBeNull();
  });
});
