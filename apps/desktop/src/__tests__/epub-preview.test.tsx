import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";
import { setLanguage } from "../i18n";

// epub 미리보기: 머리말(표지·제목·저자), 목차 선택 상자, 스크립트 없는 격리 iframe의 챕터 본문, Ctrl+Tab 계열 챕터 이동.
// 이름순: a.epub(0, 챕터 3개), b.epub(1, 읽기 오류), c.txt(2)
const book = {
  title: "한 권의 책",
  author: "김저자",
  cover: "data:image/png;base64,AA",
  chapters: [
    { title: "첫 장", html: "<p>하나</p>" },
    { title: "둘째 장", html: "<p>둘</p>" },
    { title: "챕터 3", html: "<p>셋</p>" },
  ],
};
const seed = () =>
  new FakeBackend()
    .seed({ "/home/a/a.epub": "", "/home/a/b.epub": "", "/home/a/c.txt": "글", "/home/a/x.zip": "", "/home/b": null })
    .seedEpub("/home/a/a.epub", book)
    .seedEpub("/home/a/b.epub", { ...book, error: "암호화(DRM)된 epub은 미리 볼 수 없습니다" });
const dlg = (name: string) => screen.findByRole("dialog", { name });
const open = (user: Awaited<ReturnType<typeof renderApp>>["user"], n: number) => user.keyboard("{ArrowDown}".repeat(n) + "{ArrowRight}");

const blobs = new Map<string, Blob>();
const revoked: string[] = [];
const readBlob = (b: Blob) =>
  new Promise<string>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsText(b);
  });
const frame = (d: HTMLElement) => d.querySelector<HTMLIFrameElement>("iframe[data-epub]");
const shown = async (d: HTMLElement) => {
  await waitFor(() => expect(frame(d)).not.toBeNull());
  return readBlob(blobs.get(frame(d)!.getAttribute("src")!)!);
};
const toc = (d: HTMLElement) => within(d).getByRole("combobox", { name: "목차" }) as HTMLSelectElement;
beforeEach(() => {
  blobs.clear();
  revoked.length = 0;
  URL.createObjectURL = vi.fn((b: Blob) => {
    const u = `blob:epub-${blobs.size + 1}`;
    blobs.set(u, b);
    return u;
  });
  URL.revokeObjectURL = vi.fn((u: string) => void revoked.push(u));
});
afterEach(() => {
  vi.restoreAllMocks();
  setLanguage("ko");
});

describe("epub 미리보기", () => {
  it("머리말에 제목·저자·표지가 있고, 목차 상자는 챕터 순서이며, 본문 iframe은 첫 챕터를 스크립트 없이 그린다", async () => {
    const { user } = await renderApp(seed());
    await open(user, 0);
    const d = await dlg("미리보기: a.epub");
    expect(await shown(d)).toContain("<p>하나</p>");
    expect(d.querySelector("[data-epub-title]")?.textContent).toBe("한 권의 책");
    expect(d.querySelector("[data-epub-author]")?.textContent).toBe("김저자");
    expect(within(d).getByAltText("표지").getAttribute("src")).toBe("data:image/png;base64,AA");
    expect(within(toc(d)).getAllByRole("option").map((o) => o.textContent)).toEqual(["첫 장", "둘째 장", "챕터 3"]);
    expect(frame(d)!.getAttribute("sandbox")).toBe("allow-same-origin"); // allow-scripts가 없다
  });

  it("Ctrl+Tab이 다음 챕터, Ctrl+Shift+Tab이 이전 챕터이고 끝에서 처음으로 돌아간다(xlsx 시트 전환과 같다)", async () => {
    const { user } = await renderApp(seed());
    await open(user, 0);
    const d = await dlg("미리보기: a.epub");
    expect(await shown(d)).toContain("하나");
    await user.keyboard("{Control>}{Tab}{/Control}");
    await waitFor(async () => expect(await shown(d)).toContain("<p>둘</p>"));
    expect(toc(d).value).toBe("1");
    await user.keyboard("{Control>}{Tab}{/Control}");
    await waitFor(async () => expect(await shown(d)).toContain("<p>셋</p>"));
    await user.keyboard("{Control>}{Tab}{/Control}");
    await waitFor(async () => expect(await shown(d)).toContain("<p>하나</p>"));
    await user.keyboard("{Control>}{Shift>}{Tab}{/Shift}{/Control}");
    await waitFor(async () => expect(await shown(d)).toContain("<p>셋</p>"));
  });

  it("목차 상자로 챕터를 바로 고르고, 챕터를 바꾸면 본문이 맨 위로 돌아가며 이전 Blob URL을 해제한다", async () => {
    const { user } = await renderApp(seed());
    await open(user, 0);
    const d = await dlg("미리보기: a.epub");
    await shown(d);
    const body = d.querySelector<HTMLElement>("[data-preview-body]")!;
    const scrollTo = vi.fn();
    body.scrollTo = scrollTo as unknown as typeof body.scrollTo;
    const first = frame(d)!.getAttribute("src")!;
    fireEvent.change(toc(d), { target: { value: "2" } });
    await waitFor(async () => expect(await shown(d)).toContain("<p>셋</p>"));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
    expect(revoked).toContain(first);
  });

  it("읽기 오류(DRM)는 '미리 볼 수 없는 형식'과 이유를 보인다", async () => {
    const { user } = await renderApp(seed());
    await open(user, 1);
    const d = await dlg("미리보기: b.epub");
    const alert = await within(d).findByRole("alert");
    expect(alert.textContent).toContain("미리 볼 수 없는 형식입니다");
    expect(alert.textContent).toContain("DRM");
    expect(frame(d)).toBeNull();
  });

  it("압축 파일 안의 epub은 epubOpen을 부르지 않고 '미리 볼 수 없는 형식'이다", async () => {
    const b = seed();
    b.seed({ "/home/a/x.zip!/in.epub": "" });
    const { user } = await renderApp(b);
    await open(user, 3); // x.zip
    await user.keyboard("{Enter}"); // 압축 파일 안으로
    await waitFor(() => expect(within(screen.getAllByRole("listbox")[0]).queryAllByRole("option").length).toBeGreaterThan(0));
    await user.keyboard("{ArrowDown}");
    expect(b.epubOpenCalls.filter((p) => p.includes("!/"))).toEqual([]);
  });

  it("↑/↓는 그대로 이웃 파일로 넘어가고 epub을 벗어나면 iframe이 사라진다", async () => {
    const { user } = await renderApp(seed());
    await open(user, 0);
    const d = await dlg("미리보기: a.epub");
    await shown(d);
    await user.keyboard("{ArrowDown}{ArrowDown}");
    const d2 = await dlg("미리보기: c.txt");
    expect(frame(d2)).toBeNull();
  });

  it("영어 화면에서는 영어로 보인다", async () => {
    // 책 안의 제목은 사용자 데이터라 영어로 시드하고, 화면 문구만 검사한다.
    const { user, backend } = await renderApp(seed().seedEpub("/home/a/a.epub", { ...book, chapters: [{ title: "One", html: "<p>1</p>" }, { title: "Two", html: "<p>2</p>" }] }));
    await backend.setConfigValue("behavior.language", { kind: "str", value: "en" });
    await screen.findByRole("listbox", { name: "Left file list" });
    await user.keyboard("{ArrowRight}");
    const d = await screen.findByRole("dialog", { name: "Preview: a.epub" });
    await shown(d);
    expect(within(d).getByAltText("Cover")).toBeTruthy();
    expect(within(d).getByRole("combobox", { name: "Table of contents" })).toBeTruthy();
    expect(/[가-힣]/.test([...d.querySelectorAll("[aria-label],[title]")].map((e) => `${e.getAttribute("aria-label")} ${e.getAttribute("title")}`).join(" "))).toBe(false);
  });
});
