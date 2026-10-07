import type { OfficeFormat } from "./kinds";

/** 파일이 이보다 크면 읽지 않는다(메모리와 압축 해제 시간 제한). */
export const MAX_BYTES = 20 * 1024 * 1024;
/** docx에서 보여 줄 블록(문단·표·목록 등) 수. */
export const DOCX_BLOCKS = 100;
/** xlsx에서 보여 줄 행 수. */
export const XLSX_ROWS = 100;

export type OfficeContent =
  | { kind: "docx"; html: string; truncated: boolean }
  | { kind: "xlsx"; sheet: string; rows: string[][]; truncated: boolean }
  | { kind: "pptx"; paragraphs: string[] };

/** 형식별 라이브러리를 이때 불러와 앞부분만 읽는다. */
export async function readOffice(kind: OfficeFormat, data: ArrayBuffer): Promise<OfficeContent> {
  if (kind === "docx") return readDocx(data);
  if (kind === "xlsx") return readXlsx(data);
  return readPptx(data);
}

async function readDocx(data: ArrayBuffer): Promise<OfficeContent> {
  const mammoth = await import("mammoth/mammoth.browser");
  const { value } = await mammoth.convertToHtml({ arrayBuffer: data });
  const body = new DOMParser().parseFromString(value, "text/html").body;
  const blocks = Array.from(body.children);
  for (const b of blocks.slice(DOCX_BLOCKS)) b.remove();
  for (const a of Array.from(body.querySelectorAll("a"))) a.removeAttribute("href"); // 미리보기에서 링크가 이동하지 않게 한다
  return { kind: "docx", html: body.innerHTML, truncated: blocks.length > DOCX_BLOCKS };
}

async function readXlsx(data: ArrayBuffer): Promise<OfficeContent> {
  const XLSX = await import("xlsx");
  // sheetRows는 파싱을 앞쪽 행에서 멈춘다. 한 행 더 읽어 잘렸는지 알아낸다.
  const wb = XLSX.read(data, { type: "array", sheetRows: XLSX_ROWS + 1 });
  const sheet = wb.SheetNames[0] ?? "";
  const ws = wb.Sheets[sheet];
  const all = ws ? XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: "", blankrows: true }) : [];
  return { kind: "xlsx", sheet, rows: all.slice(0, XLSX_ROWS).map((r) => r.map(String)), truncated: all.length > XLSX_ROWS };
}

async function readPptx(data: ArrayBuffer): Promise<OfficeContent> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(data);
  const xml = await zip.file("ppt/slides/slide1.xml")?.async("string");
  if (xml === undefined) throw new Error("첫 슬라이드를 찾지 못했습니다");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const paragraphs: string[] = [];
  for (const p of Array.from(doc.getElementsByTagName("a:p"))) {
    const text = Array.from(p.getElementsByTagName("a:t"))
      .map((t) => t.textContent ?? "")
      .join("");
    if (text.trim()) paragraphs.push(text);
  }
  return { kind: "pptx", paragraphs };
}
