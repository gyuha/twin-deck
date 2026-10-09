import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";

// (시험) preview.pdf_direct: 디스크 PDF를 파일 주소로 iframe이 직접 연다. Blob도 fetch도 쓰지 않는다.
const seed = (direct: boolean) => {
  const b = new FakeBackend().seed({ "/home/a/a.pdf": "%PDF-1.4", "/home/b": null });
  b.setConfig((l) => (l.config.preview.pdf_direct = direct));
  return b;
};
afterEach(() => vi.restoreAllMocks());

describe("PDF 파일 주소로 직접 열기(시험)", () => {
  it("켜면 iframe src가 파일 주소이고 Blob URL·fetch를 쓰지 않는다", async () => {
    const create = vi.fn(() => "blob:x");
    URL.createObjectURL = create;
    URL.revokeObjectURL = vi.fn();
    const fetched = vi.fn();
    vi.stubGlobal("fetch", fetched);
    const { user } = await renderApp(seed(true));
    await user.keyboard("{Shift>}{ArrowRight}{/Shift}");
    const d = await screen.findByRole("dialog", { name: /a\.pdf/ });
    await waitFor(() => expect(d.querySelector("iframe[data-direct]")).not.toBeNull());
    const frame = d.querySelector<HTMLIFrameElement>("iframe[data-direct]")!;
    expect(frame.getAttribute("src")).toBe("fake-asset://localhost/home/a/a.pdf");
    expect(create).not.toHaveBeenCalled();
    expect(fetched).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("꺼짐(기본)이면 지금 방식: Blob URL을 쓴다", async () => {
    URL.createObjectURL = vi.fn(() => "blob:pdf");
    URL.revokeObjectURL = vi.fn();
    vi.stubGlobal("fetch", async () => ({ blob: async () => new Blob(["x"]) }));
    const { user } = await renderApp(seed(false));
    await user.keyboard("{Shift>}{ArrowRight}{/Shift}");
    const d = await screen.findByRole("dialog", { name: /a\.pdf/ });
    await waitFor(() => expect(d.querySelector("iframe")?.getAttribute("src")).toBe("blob:pdf"));
    expect(d.querySelector("iframe[data-direct]")).toBeNull();
    vi.unstubAllGlobals();
  });

  it("설정 미리보기 탭에 스위치가 있고 영어에서 영어다", async () => {
    const { user, backend } = await renderApp(seed(false));
    await backend.setConfigValue("behavior.language", { kind: "str", value: "en" });
    await user.keyboard("{Control>},{/Control}");
    const dialog = await screen.findByRole("dialog", { name: "Settings" });
    await user.click(within(dialog).getByRole("tab", { name: "Preview" }));
    const row = within(dialog).getByRole("group", { name: "Open PDFs directly from the file (experimental)" });
    expect(row.textContent).not.toMatch(/[가-힣]/);
    await user.click(within(row).getByRole("switch"));
    await waitFor(async () => expect((await backend.getConfig()).config.preview.pdf_direct).toBe(true));
  });
});
