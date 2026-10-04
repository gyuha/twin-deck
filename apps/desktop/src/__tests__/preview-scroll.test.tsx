import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";

// 이름순: a.pdf, b.ts, c.txt
const seed = () =>
  new FakeBackend().seed({
    "/home/a/a.pdf": "%PDF-1.4 x",
    "/home/a/b.ts": "const x = 1;\n".repeat(200),
    "/home/a/c.txt": "line\n".repeat(200),
    "/home/b": null,
  });
type User = Awaited<ReturnType<typeof renderApp>>["user"];
const open = (user: User, downs: number) => user.keyboard("{ArrowDown}".repeat(downs) + "{ArrowRight}");
const dlg = (name: string) => screen.findByRole("dialog", { name });

describe("미리보기: PageUp/PageDown 스크롤", () => {
  let scrollBy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    // jsdom에는 레이아웃이 없다: 한 화면 높이를 정해 두고 scrollBy 호출을 가로챈다.
    scrollBy = vi.fn();
    Element.prototype.scrollBy = scrollBy as unknown as typeof Element.prototype.scrollBy;
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 400 });
    URL.createObjectURL = vi.fn(() => "blob:pdf");
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => vi.restoreAllMocks());

  it("텍스트: PageDown은 본문을 한 화면 아래로, PageUp은 위로 스크롤한다", async () => {
    const { user } = await renderApp(seed());
    await open(user, 2); // c.txt
    const d = within(await dlg("미리보기: c.txt"));
    await d.findByLabelText("텍스트 미리보기");
    await user.keyboard("{PageDown}");
    expect(scrollBy).toHaveBeenLastCalledWith({ top: 360 }); // 400 × 0.9
    await user.keyboard("{PageUp}");
    expect(scrollBy).toHaveBeenLastCalledWith({ top: -360 });
    expect(scrollBy.mock.instances.every((el) => (el as HTMLElement).hasAttribute("data-preview-body"))).toBe(true);
  });

  it("코드도 같다", async () => {
    const { user } = await renderApp(seed());
    await open(user, 1); // b.ts
    await within(await dlg("미리보기: b.ts")).findByLabelText("코드 미리보기");
    await user.keyboard("{PageDown}");
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy).toHaveBeenLastCalledWith({ top: 360 });
  });

  it("PDF: PageDown/PageUp은 한 쪽씩 넘긴다(#page=N), 첫 쪽 위로는 가지 않는다", async () => {
    const { user } = await renderApp(seed());
    await open(user, 0); // a.pdf
    const d = within(await dlg("미리보기: a.pdf"));
    const frame = (await d.findByTitle("PDF 미리보기: a.pdf")) as HTMLIFrameElement;
    expect(frame.getAttribute("src")).toBe("blob:pdf");
    await user.keyboard("{PageDown}");
    expect(frame.getAttribute("src")).toBe("blob:pdf#page=2");
    await user.keyboard("{PageDown}");
    expect(frame.getAttribute("src")).toBe("blob:pdf#page=3");
    await user.keyboard("{PageUp}");
    expect(frame.getAttribute("src")).toBe("blob:pdf#page=2");
    await user.keyboard("{PageUp}{PageUp}{PageUp}");
    expect(frame.getAttribute("src")).toBe("blob:pdf#page=1");
    expect(scrollBy).not.toHaveBeenCalled(); // 바깥 본문은 움직이지 않는다
  });

  it("PDF: 쪽 수를 알면 마지막 쪽을 넘어가지 않는다", async () => {
    const b = new FakeBackend().seed({
      "/home/a/a.pdf": "%PDF-1.4 << /Type /Page >> << /Type /Pages >> << /Type /Page >> << /Type /Page >>",
      "/home/b": null,
    });
    const { user } = await renderApp(b);
    await user.keyboard("{ArrowRight}");
    const frame = (await within(await dlg("미리보기: a.pdf")).findByTitle("PDF 미리보기: a.pdf")) as HTMLIFrameElement;
    await waitFor(() => expect(frame.getAttribute("data-page-count")).toBe("3")); // /Pages는 세지 않는다
    await user.keyboard("{PageDown}{PageDown}{PageDown}{PageDown}");
    expect(frame.getAttribute("src")).toBe("blob:pdf#page=3");
    await user.keyboard("{PageUp}");
    expect(frame.getAttribute("src")).toBe("blob:pdf#page=2"); // 넘친 만큼 되돌아오지 않는다
  });

  it("다른 파일로 넘어가면 스크롤이 맨 위로 돌아간다", async () => {
    const { user } = await renderApp(seed());
    await open(user, 1); // b.ts
    const d = within(await dlg("미리보기: b.ts"));
    await d.findByLabelText("코드 미리보기");
    const body = document.querySelector("[data-preview-body]") as HTMLElement;
    body.scrollTop = 250; // 읽던 위치
    expect(body.scrollTop).toBe(250);
    await user.keyboard("{ArrowDown}"); // c.txt
    await within(await dlg("미리보기: c.txt")).findByLabelText("텍스트 미리보기");
    expect(body.scrollTop).toBe(0);
    body.scrollTop = 90;
    await user.keyboard("{ArrowUp}"); // 다시 b.ts
    await within(await dlg("미리보기: b.ts")).findByLabelText("코드 미리보기");
    expect(body.scrollTop).toBe(0);
  });

  it("미리보기가 닫혀 있으면 PageDown은 목록을 움직이고 미리보기 스크롤은 하지 않는다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{PageDown}");
    expect(scrollBy).not.toHaveBeenCalledWith({ top: 360 });
  });

  it("도움말에 PageUp/PageDown이 보인다", async () => {
    const { user } = await renderApp(seed());
    await open(user, 2);
    expect(await dlg("미리보기: c.txt")).toHaveTextContent("PageUp/PageDown 스크롤");
  });
});
