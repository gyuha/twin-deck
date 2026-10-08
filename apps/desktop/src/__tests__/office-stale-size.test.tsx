import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";
import { makeDocx } from "./office-fixtures";

const binary = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => String.fromCharCode(b)).join("");
const calls: string[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  calls.length = 0;
});
/** 파일 주소별로 읽은 횟수를 모으는 가짜 fetch. 본문은 주소 끝 이름에 맞는 docx다. */
function stubFetch(bodies: Record<string, ArrayBuffer>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      const name = url.slice(url.lastIndexOf("/") + 1);
      return { ok: true, status: 200, arrayBuffer: async () => bodies[name] ?? new ArrayBuffer(4) };
    }),
  );
}
const readsOf = (name: string) => calls.filter((u) => u.endsWith(`/${name}`)).length;

describe("Office 미리보기: 항목을 넘기는 동안의 크기", () => {
  it("작은 파일에서 20MB 넘는 문서로 넘어가도 새 데이터가 오기 전에는 그 문서를 읽지 않고, 크기 초과를 알린다", async () => {
    stubFetch({});
    const backend = new FakeBackend().seed({ "/home/a/a.txt": "작은 파일", "/home/a/b.docx": "x".repeat(21 * 1024 * 1024), "/home/b": null });
    backend.setConfig((l) => (l.config.preview.office = true));
    const { user } = await renderApp(backend);
    await user.keyboard("{ArrowRight}"); // a.txt 미리보기
    await screen.findByRole("dialog", { name: "미리보기: a.txt" });
    await user.keyboard("{ArrowDown}"); // b.docx로 넘긴다
    const d = await screen.findByRole("dialog", { name: "미리보기: b.docx" });
    await waitFor(() => expect(within(d).getByRole("alert")).toHaveTextContent("너무 커"));
    expect(readsOf("b.docx")).toBe(0);
  });

  it("크기가 다른 작은 docx 둘을 오가도 각 파일을 정확히 한 번씩만 읽는다", async () => {
    const a = await makeDocx(1);
    const b = await makeDocx(3);
    expect(a.byteLength).not.toBe(b.byteLength);
    stubFetch({ "a.docx": a, "b.docx": b });
    const backend = new FakeBackend().seed({ "/home/a/a.docx": binary(a), "/home/a/b.docx": binary(b), "/home/b": null });
    backend.setConfig((l) => (l.config.preview.office = true));
    const { user } = await renderApp(backend);
    await user.keyboard("{ArrowRight}");
    const first = await screen.findByRole("dialog", { name: "미리보기: a.docx" });
    await waitFor(() => expect(within(first).getByLabelText("문서 본문")).toHaveTextContent("문단 1"));
    await user.keyboard("{ArrowDown}");
    const second = await screen.findByRole("dialog", { name: "미리보기: b.docx" });
    await waitFor(() => expect(within(second).getByLabelText("문서 본문")).toHaveTextContent("문단 3"));
    expect(readsOf("a.docx")).toBe(1);
    expect(readsOf("b.docx")).toBe(1);
  });
});
