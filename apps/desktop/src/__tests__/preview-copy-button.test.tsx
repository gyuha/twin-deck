import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";

// 목록은 이름순이며 파일 하나뿐이라 ArrowRight가 그 파일의 미리보기를 연다(폴더 /home/b는 오른쪽 패널).
async function open(files: Record<string, string>, name: string) {
  const backend = new FakeBackend().seed({ ...files, "/home/b": null });
  const { user } = await renderApp(backend);
  await user.keyboard("{ArrowRight}");
  const dlg = await screen.findByRole("dialog", { name: `미리보기: ${name}` });
  return { user, backend, dlg: within(dlg), el: dlg };
}
const copyButton = (d: ReturnType<typeof within>) => d.queryByRole("button", { name: "텍스트 복사" });

describe("텍스트 미리보기 복사 버튼", () => {
  it.each([
    ["notes.txt", "그냥 텍스트\n둘째 줄"],
    ["readme.md", "# 제목\n\n- **굵게**"],
    ["data.json", '{"a": 1}'],
    ["main.rs", "fn main() {}\n"],
  ])("%s: 제목 줄(✕와 같은 줄)에 복사 버튼이 있다", async (name, content) => {
    const { dlg } = await open({ [`/home/a/${name}`]: content }, name);
    const b = copyButton(dlg)!;
    expect(b).toBeInTheDocument();
    // 제목 줄: 닫기 버튼과 같은 부모 안에 있고 ✕보다 앞이다.
    const close = dlg.getByRole("button", { name: "닫기" });
    expect(b.parentElement).toBe(close.parentElement);
    expect(Boolean(b.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it("이미지·바이너리·폴더 미리보기에는 버튼이 없다", async () => {
    const bin = await open({ "/home/a/x.bin": "bin\u0000data" }, "x.bin");
    expect(copyButton(bin.dlg)).toBeNull();
  });

  it("글자가 아니라 아이콘(svg)이다", async () => {
    const { dlg } = await open({ "/home/a/s.txt": "짧다" }, "s.txt");
    const b = copyButton(dlg)!;
    expect(b.textContent).toBe("");
    expect(b.querySelector("svg")).not.toBeNull();
  });

  it("누르면 파일 원문이 클립보드로 가고(마크다운도 원문), 버튼이 잠깐 복사됨 표시(data-copied)가 된다", async () => {
    const md = "# 제목\n\n- **굵게**\n";
    const { user, backend, dlg } = await open({ "/home/a/readme.md": md }, "readme.md");
    await user.click(copyButton(dlg)!);
    await waitFor(() => expect(backend.clipboard).toEqual([md]));
    expect(dlg.getByRole("button", { name: "텍스트 복사" })).toHaveAttribute("data-copied", "true");
    await waitFor(() => expect(dlg.getByRole("button", { name: "텍스트 복사" })).not.toHaveAttribute("data-copied"), { timeout: 3000 });
  });

  it("64KB를 넘는 파일은 title에 앞부분만 복사된다고 안내하고 보이는 앞부분만 복사한다", async () => {
    const big = "가".repeat(70 * 1024);
    const { user, backend, dlg } = await open({ "/home/a/big.txt": big }, "big.txt");
    const b = copyButton(dlg)!;
    expect(b.getAttribute("title")).toContain("앞부분만 복사됩니다");
    await user.click(b);
    await waitFor(() => expect(backend.clipboard).toHaveLength(1));
    expect(backend.clipboard[0].length).toBeLessThan(big.length);
    expect(big.startsWith(backend.clipboard[0])).toBe(true);
  });

  it("작은 파일의 title에는 앞부분 안내가 없다", async () => {
    const { dlg } = await open({ "/home/a/s.txt": "짧다" }, "s.txt");
    expect(copyButton(dlg)!.getAttribute("title") ?? "").not.toContain("앞부분만");
  });

  it("본문은 선택할 수 있다(select-text, select-none 아님)", async () => {
    const { el } = await open({ "/home/a/s.txt": "짧다" }, "s.txt");
    const body = el.querySelector("[data-preview-body]")!;
    expect(body.className).toContain("select-text");
    expect(body.className).not.toContain("select-none");
  });
});
