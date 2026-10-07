import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";
import { makeDocx, makePptx, makeXlsx } from "./office-fixtures";

const NOTE = "데이터 미리보기이며 실제 문서 화면과 다릅니다";
// 이름순: a.docx(0), b.pptx(1), c.xlsx(2), d.doc(3), e.DOCX(4, 21MB)
const seed = () =>
  new FakeBackend().seed({
    "/home/a/a.docx": "zip",
    "/home/a/b.pptx": "zip",
    "/home/a/c.xlsx": "zip",
    "/home/a/d.doc": "old",
    "/home/a/e.DOCX": "x".repeat(21 * 1024 * 1024),
    "/home/b": null,
  });
const dlg = (name: string | RegExp) => screen.findByRole("dialog", { name });
const open = (user: Awaited<ReturnType<typeof renderApp>>["user"], n: number) => user.keyboard("{ArrowDown}".repeat(n) + "{ArrowRight}");
const serve = (files: Record<string, ArrayBuffer | (() => ArrayBuffer)>) =>
  vi.stubGlobal("fetch", async (url: string) => {
    const f = files[decodeURIComponent(new URL(url).pathname)];
    return f ? { ok: true, status: 200, arrayBuffer: async () => (typeof f === "function" ? f() : f) } : { ok: false, status: 404 };
  });

afterEach(() => vi.unstubAllGlobals());

describe("Office 문서 미리보기", () => {
  it("docx: 본문과 '실제 화면과 다름' 안내가 나온다", async () => {
    serve({ "/home/a/a.docx": await makeDocx(3) });
    const { user } = await renderApp(seed());
    await open(user, 0);
    const d = await dlg("미리보기: a.docx");
    expect(await within(d).findByText("문단 2")).toBeInTheDocument();
    expect(within(d).getByText(NOTE)).toBeInTheDocument();
    expect(within(d).queryByText("첫 부분만 표시합니다")).toBeNull();
  });

  it("docx: 100블록을 넘으면 '첫 부분만 표시합니다'도 나온다", async () => {
    serve({ "/home/a/a.docx": await makeDocx(120) });
    const { user } = await renderApp(seed());
    await open(user, 0);
    const d = await dlg("미리보기: a.docx");
    expect(await within(d).findByText("문단 100")).toBeInTheDocument();
    expect(within(d).queryByText("문단 101")).toBeNull();
    expect(within(d).getByText("첫 부분만 표시합니다")).toBeInTheDocument();
    expect(within(d).getByText(NOTE)).toBeInTheDocument();
  });

  it("pptx: 첫 슬라이드 텍스트와 안내가 나온다", async () => {
    serve({ "/home/a/b.pptx": await makePptx() });
    const { user } = await renderApp(seed());
    await open(user, 1);
    const d = await dlg("미리보기: b.pptx");
    expect(await within(d).findByText("제목 슬라이드")).toBeInTheDocument();
    expect(within(d).queryByText("둘째 슬라이드")).toBeNull();
    expect(within(d).getByText(NOTE)).toBeInTheDocument();
  });

  it("xlsx: 첫 시트 표와 안내가 나온다", async () => {
    serve({ "/home/a/c.xlsx": makeXlsx(3) });
    const { user } = await renderApp(seed());
    await open(user, 2);
    const d = await dlg("미리보기: c.xlsx");
    expect(await within(d).findByText("행 2")).toBeInTheDocument();
    expect(within(d).getByText(/첫시트/)).toBeInTheDocument();
    expect(within(d).getByText(NOTE)).toBeInTheDocument();
  });

  it("20MB를 넘으면 읽지 않고 '너무 커서' 안내만 나온다", async () => {
    const fetched = vi.fn();
    vi.stubGlobal("fetch", fetched);
    const { user } = await renderApp(seed());
    await open(user, 4); // e.DOCX
    const d = await dlg("미리보기: e.DOCX");
    expect(await within(d).findByText(/너무 커서 미리 볼 수 없습니다/)).toBeInTheDocument();
    expect(fetched).not.toHaveBeenCalled();
  });

  it("읽기에 실패하면 안내 문구가 나온다", async () => {
    serve({});
    const { user } = await renderApp(seed());
    await open(user, 0);
    const d = await dlg("미리보기: a.docx");
    expect(await within(d).findByRole("alert")).toHaveTextContent("파일을 읽지 못했습니다");
  });

  it("지원하지 않는 .doc는 기존처럼 미리 볼 수 없다", async () => {
    const { user } = await renderApp(seed());
    await open(user, 3);
    const d = await dlg("미리보기: d.doc");
    expect(d).not.toHaveTextContent(NOTE);
  });
});
