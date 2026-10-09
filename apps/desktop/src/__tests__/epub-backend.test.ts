import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";

// FakeBackend의 epub 응답: 시드한 책을 돌려주고 없는 경로·범위 밖·읽기 오류는 거부한다.
const book = {
  title: "책",
  author: "저자",
  cover: "data:image/png;base64,AA",
  chapters: [
    { title: "첫 장", html: "<p>하나</p>" },
    { title: "둘째 장", html: "<p>둘</p>" },
  ],
};
const make = () => new FakeBackend().seed({ "/home/a/b.epub": "", "/home/a/c.txt": "x" }).seedEpub("/home/a/b.epub", book);

describe("FakeBackend epub", () => {
  it("epubOpen은 제목·저자·표지·챕터 제목을 돌려준다", async () => {
    const b = make();
    expect(await b.epubOpen("/home/a/b.epub")).toEqual({ title: "책", author: "저자", cover: "data:image/png;base64,AA", chapters: [{ title: "첫 장" }, { title: "둘째 장" }] });
    expect(b.epubOpenCalls).toEqual(["/home/a/b.epub"]);
  });

  it("epubChapter는 그 챕터 HTML을 돌려주고 범위 밖은 거부한다", async () => {
    const b = make();
    expect(await b.epubChapter("/home/a/b.epub", 1)).toBe("<p>둘</p>");
    await expect(b.epubChapter("/home/a/b.epub", 2)).rejects.toThrow("범위");
  });

  it("시드하지 않은 파일·없는 경로·압축 안 경로는 거부한다", async () => {
    const b = make();
    await expect(b.epubOpen("/home/a/c.txt")).rejects.toThrow("epub");
    await expect(b.epubOpen("/home/a/none.epub")).rejects.toThrow("찾을 수 없음");
    await expect(b.epubOpen("/home/a/x.zip!/b.epub")).rejects.toThrow("압축");
  });

  it("error를 시드하면 그 오류로 거부한다(DRM 흉내)", async () => {
    const b = make().seedEpub("/home/a/b.epub", { ...book, error: "암호화(DRM)된 epub은 미리 볼 수 없습니다" });
    await expect(b.epubOpen("/home/a/b.epub")).rejects.toThrow("DRM");
  });
});
