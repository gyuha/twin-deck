import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { readOffice, sanitizeDocxHtml } from "../lib/office";
import { makeDocx } from "./office-fixtures";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

/** 본문을 `document.xml`로 바꾼 docx. `styleMap`이 있으면 문서 안에 내장 스타일 맵 파트로 넣는다. */
async function docxWith(bodyXml: string, styleMap?: string): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(await makeDocx(1));
  zip.file("word/document.xml", `<?xml version="1.0"?><w:document ${W}><w:body>${bodyXml}</w:body></w:document>`);
  if (styleMap) zip.file("mammoth/style-map", styleMap);
  return zip.generateAsync({ type: "arraybuffer" });
}

const html = async (buf: ArrayBuffer) => {
  const r = await readOffice("docx", buf);
  if (r.kind !== "docx") throw new Error();
  return r.html;
};

/** 위험 요소가 하나도 없어야 한다. */
function expectSafe(out: string) {
  expect(out).not.toMatch(/\son\w+\s*=/i);
  expect(out).not.toMatch(/<\s*(script|iframe|svg|style|link|form|object|embed)/i);
  expect(out).not.toMatch(/javascript:/i);
  const doc = new DOMParser().parseFromString(out, "text/html");
  for (const img of Array.from(doc.querySelectorAll("img"))) if (img.hasAttribute("src")) expect(img.getAttribute("src")).toMatch(/^data:image\//); // src가 지워진 img는 안전하다
}

describe("docx 미리보기 정화", () => {
  it("문서에 내장된 스타일 맵이 만드는 onerror 속성은 렌더 결과에 남지 않는다", async () => {
    const out = await html(await docxWith(`<w:p><w:r><w:t>안녕</w:t></w:r></w:p>`, "p => img[src='x'][onerror='alert(1)']"));
    expectSafe(out);
  });

  it("스타일 맵으로 만든 script·a[href=javascript:]도 남지 않는다", async () => {
    const out = await html(await docxWith(`<w:p><w:r><w:t>안녕</w:t></w:r></w:p>`, "p => a[href='javascript:alert(1)']"));
    expectSafe(out);
  });

  it("정상 문서의 문단 텍스트·굵게·표는 그대로 보존된다", async () => {
    const out = await html(
      await docxWith(
        `<w:p><w:r><w:t>첫 문단</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>굵은 글</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>셀A</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`,
      ),
    );
    expect(out).toContain("첫 문단");
    expect(out).toMatch(/<p>.*첫 문단.*<\/p>/);
    expect(out).toMatch(/<strong>\s*굵은 글\s*<\/strong>/);
    expect(out).toContain("<table");
    expect(out).toContain("셀A");
  });

  it("정화 함수는 직접 넣은 위험한 HTML에서 위험 요소만 지우고 나머지는 남긴다", () => {
    const dirty =
      '<p>본문</p><img src=x onerror=1><a href="javascript:1">링크</a><svg onload=1></svg><p style="background:url(//x)">스타일</p><script>1</script><iframe src="//x"></iframe><img src="data:image/png;base64,AAAA" alt="그림">';
    const out = sanitizeDocxHtml(dirty);
    expectSafe(out);
    expect(out).toContain("본문");
    expect(out).toContain("링크");
    expect(out).toContain("스타일");
    expect(out).toContain('src="data:image/png;base64,AAAA"');
  });
});
