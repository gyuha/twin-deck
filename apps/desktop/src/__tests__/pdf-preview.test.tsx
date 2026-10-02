import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";

describe("PDF 미리보기", () => {
  const created: Blob[] = [];
  const revoked: string[] = [];
  beforeEach(() => {
    created.length = 0;
    revoked.length = 0;
    URL.createObjectURL = vi.fn((b: Blob) => {
      created.push(b);
      return `blob:pdf-${created.length}`;
    });
    URL.revokeObjectURL = vi.fn((u: string) => void revoked.push(u));
  });
  afterEach(() => vi.restoreAllMocks());

  it(".pdf는 Blob URL로 iframe에 보여 주고 닫으면 URL을 해제한다", async () => {
    const { user } = await renderApp(new FakeBackend().seed({ "/home/a/d.pdf": "%PDF-1.4 hello", "/home/b": null }));
    await user.keyboard("{ArrowRight}");
    const dlg = within(await screen.findByRole("dialog", { name: "미리보기: d.pdf" }));
    const frame = await dlg.findByTitle("PDF 미리보기: d.pdf");
    expect(frame.getAttribute("src")).toBe("blob:pdf-1");
    expect(created[0].type).toBe("application/pdf");
    expect(await created[0].text()).toBe("%PDF-1.4 hello");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(revoked).toEqual(["blob:pdf-1"]));
  });

  it("텍스트 같은 다른 파일은 PDF 경로를 타지 않는다", async () => {
    const { user } = await renderApp(new FakeBackend().seed({ "/home/a/d.txt": "hi", "/home/b": null }));
    await user.keyboard("{ArrowRight}");
    const dlg = within(await screen.findByRole("dialog", { name: "미리보기: d.txt" }));
    expect(dlg.queryByTitle(/PDF 미리보기/)).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
