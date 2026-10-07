import JSZip from "jszip";
import * as XLSX from "xlsx";

export async function makeDocx(paragraphs: number): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  const body = Array.from({ length: paragraphs }, (_, i) => `<w:p><w:r><w:t>문단 ${i + 1}</w:t></w:r></w:p>`).join("");
  zip.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`);
  return zip.generateAsync({ type: "arraybuffer" });
}

export function makeXlsx(rows: number): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(Array.from({ length: rows }, (_, i) => [`행 ${i + 1}`, i + 1])), "첫시트");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["둘째 시트"]]), "둘째");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}

export async function makePptx(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  const slide = (t: string[]) => `<?xml version="1.0"?><p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree>${t.map((x) => `<p:sp><p:txBody><a:p><a:r><a:t>${x}</a:t></a:r></a:p></p:txBody></p:sp>`).join("")}</p:spTree></p:cSld></p:sld>`;
  zip.file("ppt/slides/slide1.xml", slide(["제목 슬라이드", "부제목"]));
  zip.file("ppt/slides/slide2.xml", slide(["둘째 슬라이드"]));
  return zip.generateAsync({ type: "arraybuffer" });
}
