import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";

// 이슈 #89: Markdown 미리보기의 링크. 외부는 기본 브라우저로, `#제목`은 스크롤, 상대 경로는 그 항목으로 간다.
const DOC = [
  "# 소개",
  "",
  "[웹](https://example.com/a?b=1) · [메일](mailto:me@example.com) · [위험](javascript:alert(1)) · [파일](file:///etc/passwd)",
  "",
  "[아래 절로](#두번째-절) · [다른 문서](./other.md) · [폴더](./sub) · [없는 곳](./missing.md)",
  "",
  "## 두번째 절",
  "",
  "본문 끝",
].join("\n");
// 이름순(폴더 먼저): sub(폴더), doc.md, other.md. 폴더가 앞이라 doc.md는 둘째다.
const files = { "/home/a/doc.md": DOC, "/home/a/other.md": "# 다른 문서 제목\n\n다른 본문", "/home/a/sub/in.txt": "x", "/home/b": null };

async function openDoc() {
  const backend = new FakeBackend().seed(files);
  const { user } = await renderApp(backend);
  await user.keyboard("{ArrowDown}{ArrowRight}"); // sub(0) → doc.md(1), 미리보기 열기
  const el = await screen.findByRole("dialog", { name: "미리보기: doc.md" });
  const d = within(el);
  await d.findByText("본문 끝");
  return { user, backend, d, el };
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe("Markdown 미리보기 링크 (이슈 #89)", () => {
  it("링크는 눌리는 요소이고 제목에는 이동용 id가 있다", async () => {
    const { d, el } = await openDoc();
    expect(d.getByRole("link", { name: "웹" })).toBeInTheDocument();
    expect(el.querySelector(".markdown-preview h2")!.id).toBe("두번째-절");
    expect(el.querySelector(".markdown-preview h1")!.id).toBe("소개");
  });

  it("https 링크를 누르면 기본 브라우저로 열고 미리보기는 그대로다", async () => {
    const { user, backend, d } = await openDoc();
    await user.click(d.getByRole("link", { name: "웹" }));
    await waitFor(() => expect(backend.openedUrls).toEqual(["https://example.com/a?b=1"]));
    expect(screen.getByRole("dialog", { name: "미리보기: doc.md" })).toBeInTheDocument();
  });

  it("mailto 링크도 연다", async () => {
    const { user, backend, d } = await openDoc();
    await user.click(d.getByRole("link", { name: "메일" }));
    await waitFor(() => expect(backend.openedUrls).toEqual(["mailto:me@example.com"]));
  });

  it("javascript:·file: 링크는 눌러도 아무것도 열거나 이동하지 않는다", async () => {
    const { user, backend, d } = await openDoc();
    await user.click(d.getByRole("link", { name: "위험" }));
    await user.click(d.getByRole("link", { name: "파일" }));
    await new Promise((r) => setTimeout(r, 50));
    expect(backend.openedUrls).toEqual([]);
    expect(backend.opened).toEqual([]);
    expect(screen.getByRole("dialog", { name: "미리보기: doc.md" })).toBeInTheDocument();
  });

  it("#제목 링크는 같은 문서의 그 제목으로 스크롤하고 외부로 열지 않는다", async () => {
    const { user, backend, d, el } = await openDoc();
    await user.click(d.getByRole("link", { name: "아래 절로" }));
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    const target = (Element.prototype.scrollIntoView as unknown as { mock: { contexts: Element[] } }).mock.contexts.at(-1)!;
    expect(target).toBe(el.querySelector(".markdown-preview h2"));
    expect(backend.openedUrls).toEqual([]);
  });

  it("상대 경로 파일 링크는 그 파일을 미리보기로 연다", async () => {
    const { user } = await openDoc();
    await user.click(within(screen.getByRole("dialog", { name: "미리보기: doc.md" })).getByRole("link", { name: "다른 문서" }));
    const el = await screen.findByRole("dialog", { name: "미리보기: other.md" });
    expect(await within(el).findByText("다른 본문")).toBeInTheDocument();
  });

  it("폴더 링크는 그 폴더로 패널을 이동하고 미리보기를 닫는다", async () => {
    const { user, d } = await openDoc();
    await user.click(d.getByRole("link", { name: "폴더" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "미리보기: doc.md" })).toBeNull());
    const nav = screen.getAllByRole("navigation", { name: "경로" })[0];
    await waitFor(() => expect(nav.textContent).toContain("sub"));
  });

  it("없는 항목 링크는 안내만 띄우고 아무것도 열지 않는다", async () => {
    const { user, backend, d } = await openDoc();
    await user.click(d.getByRole("link", { name: "없는 곳" }));
    expect(await screen.findByText(/링크한 항목을 찾을 수 없습니다/)).toBeInTheDocument();
    expect(backend.openedUrls).toEqual([]);
  });

  it("키보드: 링크에 포커스를 두고 Enter를 누르면 눌린다", async () => {
    const { user, backend, d } = await openDoc();
    const link = d.getByRole("link", { name: "웹" });
    link.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(backend.openedUrls).toEqual(["https://example.com/a?b=1"]));
    expect(screen.getByRole("dialog", { name: "미리보기: doc.md" })).toBeInTheDocument(); // Enter가 앱의 "열기"로 새지 않는다
  });
});
