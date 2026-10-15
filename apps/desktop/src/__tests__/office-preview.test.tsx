import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";
import { isOfficeFile } from "../ui/OfficeMarkdownView";

const NOTE = "데이터 미리보기이며 실제 문서 화면과 다릅니다";
// 이름순: a.docx(0), b.pptx(1), c.xlsx(2), d.doc(3), e.xls(4), f.txt(5)
// 실제 Office 파일처럼 NUL이 들어 있어 서비스가 "기타"로 본다.
const files = {
  "/home/a/a.docx": "PK\u0003\u0004\u0000",
  "/home/a/b.pptx": "PK\u0003\u0004\u0000",
  "/home/a/c.xlsx": "PK\u0003\u0004\u0000",
  "/home/a/d.doc": "old\u0000",
  "/home/a/e.xls": "old\u0000",
  "/home/a/f.txt": "그냥 글",
  "/home/b": null,
};
const dlg = (name: string | RegExp) => screen.findByRole("dialog", { name });
const open = (user: Awaited<ReturnType<typeof renderApp>>["user"], n: number) => user.keyboard("{ArrowDown}".repeat(n) + "{ArrowRight}");

describe("Office 문서 미리보기 (office_oxide)", () => {
  it("모든 Office 확장자를 알아본다(대소문자 무시)", () => {
    for (const e of ["docx", "xlsx", "pptx", "doc", "xls", "ppt", "docm", "xlsm", "pptm", "DOCX"]) expect(isOfficeFile(`a.${e}`)).toBe(true);
    for (const n of ["a.txt", "docx", ".docx", "a.docx.bak"]) expect(isOfficeFile(n)).toBe(false);
  });

  it("docx: 읽어 온 Markdown 본문과 '실제 화면과 다름' 안내가 나온다", async () => {
    const b = new FakeBackend().seed(files);
    b.officeResponder = async () => ({ markdown: "# 제목\n\n본문 문단", truncated: false });
    const { user } = await renderApp(b);
    await open(user, 0);
    const d = await dlg("미리보기: a.docx");
    expect(await within(d).findByText("본문 문단")).toBeInTheDocument();
    expect(within(d).getByText(NOTE)).toBeInTheDocument();
    expect(within(d).queryByText("첫 부분만 표시합니다")).toBeNull();
    expect(b.officeCalls).toEqual(["/home/a/a.docx"]);
  });

  it("xlsx: 표가 그려진다", async () => {
    const b = new FakeBackend().seed(files);
    b.officeResponder = async () => ({ markdown: "## 첫시트\n\n| 값 | 수 |\n| --- | --- |\n| 행 2 | 2 |\n", truncated: false });
    const { user } = await renderApp(b);
    await open(user, 2);
    const d = await dlg("미리보기: c.xlsx");
    expect(await within(d).findByText("행 2")).toBeInTheDocument();
    expect(within(d).getByRole("table")).toBeInTheDocument();
  });

  it("pptx·doc·xls도 같은 뷰로 간다", async () => {
    const b = new FakeBackend().seed(files);
    b.officeResponder = async (p) => ({ markdown: `내용 ${p}`, truncated: false });
    const { user } = await renderApp(b);
    await open(user, 1);
    for (const n of ["b.pptx", "c.xlsx", "d.doc", "e.xls"]) {
      const d = await dlg(`미리보기: ${n}`);
      expect(await within(d).findByText(`내용 /home/a/${n}`)).toBeInTheDocument();
      await user.keyboard("{ArrowDown}");
    }
  });

  it("잘렸으면 '첫 부분만 표시합니다'가 나온다", async () => {
    const b = new FakeBackend().seed(files);
    b.officeResponder = async () => ({ markdown: "앞부분", truncated: true });
    const { user } = await renderApp(b);
    await open(user, 0);
    const d = await dlg("미리보기: a.docx");
    expect(await within(d).findByText("첫 부분만 표시합니다")).toBeInTheDocument();
  });

  it("읽기에 실패하면 안내 문구가 나온다", async () => {
    const b = new FakeBackend().seed(files);
    b.officeResponder = async () => {
      throw new Error("Office 문서를 읽을 수 없습니다: 깨짐");
    };
    const { user } = await renderApp(b);
    await open(user, 0);
    const d = await dlg("미리보기: a.docx");
    expect(await within(d).findByRole("alert")).toHaveTextContent("Office 문서를 읽을 수 없습니다");
  });

  it("설정과 관계없이 늘 보인다(기본 설정에서도)", async () => {
    const b = new FakeBackend().seed(files);
    const { user } = await renderApp(b);
    await open(user, 3); // d.doc — 기본 응답은 파일 내용을 그대로 Markdown으로 본다
    const d = await dlg("미리보기: d.doc");
    expect(d).not.toHaveTextContent("꺼져 있습니다");
  });
});
