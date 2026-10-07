import { describe, expect, it } from "vitest";
import { officeKindOf } from "../lib/office/kinds";
import { DOCX_BLOCKS, XLSX_ROWS, readOffice } from "../lib/office";
import { makeDocx, makePptx, makeXlsx } from "./office-fixtures";

describe("officeKindOf", () => {
  it("docx·xlsx·pptx를 확장자(대소문자 무시)로 고른다", () => {
    expect(officeKindOf("a.docx")).toBe("docx");
    expect(officeKindOf("B.XLSX")).toBe("xlsx");
    expect(officeKindOf("c.PptX")).toBe("pptx");
    expect(officeKindOf("/home/a/보고서.docx")).toBe("docx");
    expect(officeKindOf("C:\\문서\\표.xlsx")).toBe("xlsx");
  });
  it("구형·OpenDocument·점 없는 이름은 null", () => {
    for (const n of ["a.doc", "a.xls", "a.ppt", "a.odt", "a.ods", "a.odp", "docx", ".docx", "a.docx.bak", "a.txt"]) expect(officeKindOf(n)).toBeNull();
  });
});

describe("readOffice", () => {
  it("docx: 앞 100개 블록만 남기고 잘렸다고 알린다", async () => {
    const r = await readOffice("docx", await makeDocx(DOCX_BLOCKS + 20));
    if (r.kind !== "docx") throw new Error();
    expect(r.truncated).toBe(true);
    expect(r.html).toContain("문단 1<");
    expect(r.html).toContain(`문단 ${DOCX_BLOCKS}<`);
    expect(r.html).not.toContain(`문단 ${DOCX_BLOCKS + 1}<`);
  });
  it("docx: 한도 이하면 잘리지 않는다", async () => {
    const r = await readOffice("docx", await makeDocx(3));
    expect(r).toMatchObject({ kind: "docx", truncated: false });
  });
  it("xlsx: 첫 시트의 앞 100행만 남긴다", async () => {
    const r = await readOffice("xlsx", makeXlsx(XLSX_ROWS + 30));
    if (r.kind !== "xlsx") throw new Error();
    expect(r.sheet).toBe("첫시트");
    expect(r.rows).toHaveLength(XLSX_ROWS);
    expect(r.rows[0]).toEqual(["행 1", "1"]);
    expect(r.truncated).toBe(true);
  });
  it("xlsx: 정확히 100행이면 잘리지 않는다", async () => {
    const r = await readOffice("xlsx", makeXlsx(XLSX_ROWS));
    expect(r).toMatchObject({ kind: "xlsx", truncated: false });
  });
  it("pptx: 첫 슬라이드의 텍스트만 읽는 순서대로 돌려준다", async () => {
    const r = await readOffice("pptx", await makePptx());
    expect(r).toEqual({ kind: "pptx", paragraphs: ["제목 슬라이드", "부제목"] });
  });
});
