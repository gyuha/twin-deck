import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";
import { quickLookKindOf } from "../lib/office/kinds";
import { layout } from "../ui/QuickLookView";

// macOS의 xlsx 계열은 Quick Look 미리보기로 보이고, 시트가 여럿이면 앱이 그린 시트 탭으로 바꾼다(ADR-0014).
// 이름순: a.xlsx(0, 시트 2개), b.xls(1, 시트 1개), c.xlsm(2)
const files = { "/home/a/a.xlsx": "x", "/home/a/b.xls": "<table><tr><td>한 시트 값</td></tr></table>", "/home/a/c.xlsm": "<p>매크로 시트</p>", "/home/b": null };
const seed = () => {
  const b = new FakeBackend().seed(files);
  b.quickLookResponder = async (path) =>
    path.endsWith("a.xlsx")
      ? {
          html: `<script src="Attachment7.js"></script>`,
          dir: "/tmp/ql/a",
          sheets: [
            { name: "첫시트", html: `<link href="Attachment3.css" rel="stylesheet"><table><tr><td>첫 값</td></tr></table>` },
            { name: "둘째 & 셋", html: "<p>둘째 값</p>" },
          ],
        }
      : { html: files[path as keyof typeof files] ?? "", dir: `/tmp/ql${path}`, sheets: [] };
  return b;
};
const dlg = (name: string) => screen.findByRole("dialog", { name });
const open = (user: Awaited<ReturnType<typeof renderApp>>["user"], n: number) => user.keyboard("{ArrowDown}".repeat(n) + "{ArrowRight}");

const blobs = new Map<string, Blob>();
const readBlob = (b: Blob) =>
  new Promise<string>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsText(b);
  });
const shown = async (d: HTMLElement) => {
  await waitFor(() => expect(d.querySelector("iframe[data-quicklook]")).not.toBeNull());
  return readBlob(blobs.get(d.querySelector("iframe[data-quicklook]")!.getAttribute("src")!)!);
};
const sheetTabs = (d: HTMLElement) => within(within(d).getByRole("tablist", { name: "시트" })).getAllByRole("tab");
const selected = (d: HTMLElement) => sheetTabs(d).find((t) => t.getAttribute("aria-selected") === "true")?.textContent;
beforeEach(() => {
  blobs.clear();
  URL.createObjectURL = vi.fn((b: Blob) => {
    const u = `blob:sheet-${blobs.size + 1}`;
    blobs.set(u, b);
    return u;
  });
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe("Quick Look 시트 탭 (macOS xlsx)", () => {
  it("시트가 둘이면 탭 2개가 보이고, 탭을 누르면 그 시트를 보여 준다", async () => {
    const { user } = await renderApp(seed(), "mac");
    await open(user, 0);
    const d = await dlg("미리보기: a.xlsx");
    expect(await shown(d)).toContain("첫 값");
    expect(sheetTabs(d).map((t) => t.textContent)).toEqual(["첫시트", "둘째 & 셋"]);
    expect(selected(d)).toBe("첫시트");
    expect(await shown(d)).toContain(`href="fake-asset://localhost/tmp/ql/a/Attachment3.css"`);
    await user.click(within(d).getByRole("tab", { name: "둘째 & 셋" }));
    await waitFor(async () => expect(await shown(d)).toContain("둘째 값"));
    expect(selected(d)).toBe("둘째 & 셋");
  });

  it("Ctrl+Tab/Ctrl+Shift+Tab이 시트를 바꾸고 끝에서 처음으로 돌아가며, 그동안 패널 탭은 그대로다", async () => {
    const { user } = await renderApp(seed(), "mac");
    await user.keyboard("{Meta>}t{/Meta}"); // 왼쪽 패널에 탭 2개(두 번째가 활성)
    const paneTab = () => within(screen.getAllByRole("tablist")[0]).getAllByRole("tab").findIndex((t) => t.getAttribute("aria-selected") === "true");
    await waitFor(() => expect(paneTab()).toBe(1));
    await open(user, 0);
    const d = await dlg("미리보기: a.xlsx");
    await shown(d);
    await user.keyboard("{Control>}{Tab}{/Control}");
    await waitFor(() => expect(selected(d)).toBe("둘째 & 셋"));
    expect(await shown(d)).toContain("둘째 값");
    await user.keyboard("{Control>}{Tab}{/Control}");
    await waitFor(() => expect(selected(d)).toBe("첫시트"));
    await user.keyboard("{Control>}{Shift>}{Tab}{/Shift}{/Control}");
    await waitFor(() => expect(selected(d)).toBe("둘째 & 셋"));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "미리보기: a.xlsx" })).toBeNull());
    expect(paneTab()).toBe(1);
  });

  it("시트가 하나면 탭 줄이 없다. xls·xlsm도 Quick Look으로 간다", async () => {
    const b = seed();
    const { user } = await renderApp(b, "mac");
    await open(user, 1);
    const d = await dlg("미리보기: b.xls");
    expect(await shown(d)).toContain("한 시트 값");
    expect(within(d).queryByRole("tablist", { name: "시트" })).toBeNull();
    await user.keyboard("{ArrowDown}");
    const d2 = await dlg("미리보기: c.xlsm");
    expect(await shown(d2)).toContain("매크로 시트");
    expect(b.quickLookCalls).toEqual(["/home/a/b.xls", "/home/a/c.xlsm"]);
  });

  it("다른 항목으로 넘어갔다 돌아오면 첫 시트부터 보인다", async () => {
    const { user } = await renderApp(seed(), "mac");
    await open(user, 0);
    const d = await dlg("미리보기: a.xlsx");
    await shown(d);
    await user.keyboard("{Control>}{Tab}{/Control}");
    await waitFor(() => expect(selected(d)).toBe("둘째 & 셋"));
    await user.keyboard("{ArrowDown}");
    await dlg("미리보기: b.xls");
    await user.keyboard("{ArrowUp}");
    const back = await dlg("미리보기: a.xlsx");
    await shown(back);
    await waitFor(() => expect(selected(back)).toBe("첫시트"));
  });
});

describe("Quick Look 배치", () => {
  // jsdom에는 레이아웃이 없어 크기를 직접 정한다: 담는 곳 300px, 문서 600×900px.
  const setup = () => {
    const outer = document.createElement("div");
    const box = document.createElement("div");
    const frame = document.createElement("iframe");
    box.appendChild(frame);
    outer.appendChild(box);
    document.body.appendChild(outer);
    Object.defineProperty(outer, "clientWidth", { configurable: true, value: 300 });
    frame.contentDocument!.body.style.margin = "0"; // 본문 여백 보정(왼쪽 여백만큼 오른쪽에도 둔다)은 여기서 빼고 본다
    const root = frame.contentDocument!.documentElement;
    Object.defineProperty(root, "scrollWidth", { configurable: true, value: 600 });
    Object.defineProperty(root, "scrollHeight", { configurable: true, value: 900 });
    return { outer, box, frame };
  };
  it("문서(docx·pptx)는 담는 곳보다 넓으면 폭에 맞게 줄인다", () => {
    const { outer, box, frame } = setup();
    layout(outer, box, frame, true);
    expect(frame.style.transform).toBe("scale(0.5)");
    expect(box.style.width).toBe("300px");
    expect(box.style.height).toBe("450px");
  });
  it("시트(xlsx)는 줄이지 않고 원래 크기로 두어 가로로 스크롤한다", () => {
    const { outer, box, frame } = setup();
    layout(outer, box, frame, false);
    expect(frame.style.transform).toBe("");
    expect(box.style.width).toBe("600px");
    expect(box.style.height).toBe("900px");
  });
});

describe("Quick Look 형식 판별 (시트)", () => {
  it("xlsx·xls·xlsm은 시트 계열이고 문서 계열은 그대로다", () => {
    for (const n of ["a.xlsx", "a.xls", "a.xlsm", "A.XLSX"]) expect(quickLookKindOf(n)).toBe("sheet");
    for (const n of ["a.docx", "a.pptx", "a.doc"]) expect(quickLookKindOf(n)).toBe("document");
    for (const n of ["a.ods", "a.numbers", "a.csv"]) expect(quickLookKindOf(n)).toBeNull();
  });
});
