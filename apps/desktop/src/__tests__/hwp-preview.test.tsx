import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";

// HWP 쪽 미리보기. wasm은 jsdom에서 돌지 않으므로 읽기 계층(`lib/hwp`)만 가짜로 바꾼다.
// 이름순: a.hwp(0, 3쪽), b.hwpx(1, 1쪽), c.hwp(2, 깨진 파일), d.HWP(3, 21MB), e.txt(4), x.zip(5)
const readHwp = vi.hoisted(() => vi.fn());
vi.mock("../lib/hwp", async (orig) => ({ ...(await orig<typeof import("../lib/hwp")>()), readHwp }));

const nul = "HWP\u0000";
const files = {
  "/home/a/a.hwp": nul,
  "/home/a/b.hwpx": "PK\u0003\u0004\u0000",
  "/home/a/c.hwp": nul,
  "/home/a/d.HWP": "x".repeat(21 * 1024 * 1024),
  "/home/a/e.txt": "글",
  "/home/a/x.zip": "",
  "/home/b": null,
};
const dlg = (name: string) => screen.findByRole("dialog", { name });
const open = (user: Awaited<ReturnType<typeof renderApp>>["user"], n: number) => user.keyboard("{ArrowDown}".repeat(n) + "{ArrowRight}");
const blobs = new Map<string, Blob>();
const revoked: string[] = [];
const img = (d: HTMLElement) => d.querySelector<HTMLImageElement>("img[data-hwp]");
const readBlob = (b: Blob) =>
  new Promise<string>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsText(b);
  });
const shown = async (d: HTMLElement) => {
  await waitFor(() => expect(img(d)).not.toBeNull());
  return readBlob(blobs.get(img(d)!.getAttribute("src")!)!);
};
const fakeDoc = (n: number) => ({ pageCount: n, renderPage: (i: number) => `<svg>쪽${i + 1}</svg>`, free: vi.fn() });

beforeEach(() => {
  blobs.clear();
  revoked.length = 0;
  URL.createObjectURL = vi.fn((b: Blob) => {
    const u = `blob:hwp-${blobs.size + 1}`;
    blobs.set(u, b);
    return u;
  });
  URL.revokeObjectURL = vi.fn((u: string) => void revoked.push(u));
  vi.stubGlobal("fetch", async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(4) }));
  readHwp.mockReset();
  readHwp.mockImplementation(async () => fakeDoc(3));
});
afterEach(() => vi.unstubAllGlobals());

describe("HWP 쪽 미리보기", () => {
  it(".hwp는 첫 쪽을 SVG 이미지로 그리고 쪽 번호를 보인다", async () => {
    const { user } = await renderApp(new FakeBackend().seed(files));
    await open(user, 0);
    const d = await dlg("미리보기: a.hwp");
    expect(await shown(d)).toBe("<svg>쪽1</svg>");
    expect(img(d)!.getAttribute("alt")).toBe("1쪽");
    expect(d.querySelector("[data-hwp-page]")?.textContent).toBe("1 / 3쪽");
  });

  it(".hwpx도 같은 뷰어로 그린다", async () => {
    readHwp.mockImplementation(async () => fakeDoc(1));
    const { user } = await renderApp(new FakeBackend().seed(files));
    await open(user, 1);
    const d = await dlg("미리보기: b.hwpx");
    expect(await shown(d)).toBe("<svg>쪽1</svg>");
    expect(d.querySelector("[data-hwp-page]")?.textContent).toBe("1 / 1쪽");
  });

  it("Ctrl+Tab이 다음 쪽, Ctrl+Shift+Tab이 이전 쪽이고 끝에서 처음으로 돌아가며 이전 Blob URL을 해제한다", async () => {
    const { user } = await renderApp(new FakeBackend().seed(files));
    await open(user, 0);
    const d = await dlg("미리보기: a.hwp");
    expect(await shown(d)).toContain("쪽1");
    const first = img(d)!.getAttribute("src")!;
    await user.keyboard("{Control>}{Tab}{/Control}");
    await waitFor(async () => expect(await shown(d)).toContain("쪽2"));
    expect(revoked).toContain(first);
    await user.keyboard("{Control>}{Tab}{/Control}{Control>}{Tab}{/Control}");
    await waitFor(async () => expect(await shown(d)).toContain("쪽1"));
    await user.keyboard("{Control>}{Shift>}{Tab}{/Shift}{/Control}");
    await waitFor(async () => expect(await shown(d)).toContain("쪽3"));
  });

  it("깨진 파일은 이유와 함께 안내 문구로 보인다", async () => {
    readHwp.mockRejectedValue(new Error("암호가 걸린 문서"));
    const { user } = await renderApp(new FakeBackend().seed(files));
    await open(user, 2);
    const d = await dlg("미리보기: c.hwp");
    expect(await within(d).findByText("한글 문서를 읽을 수 없습니다: 암호가 걸린 문서")).toBeInTheDocument();
  });

  it("20MB를 넘으면 읽지 않고 안내 문구를 보인다", async () => {
    const { user } = await renderApp(new FakeBackend().seed(files));
    await open(user, 3);
    const d = await dlg("미리보기: d.HWP");
    expect(await within(d).findByText(/한글 문서가 너무 커서 미리 볼 수 없습니다/)).toBeInTheDocument();
    expect(readHwp).not.toHaveBeenCalled();
  });
});
