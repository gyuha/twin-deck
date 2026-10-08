/** Office 문서 미리보기가 읽는 형식. */
export type OfficeFormat = "docx" | "xlsx" | "pptx";

const FORMATS: readonly string[] = ["docx", "xlsx", "pptx"];

/** 파일 이름의 확장자(대소문자 무시)로 Office 형식을 고른다. 지원하지 않으면 null. 라이브러리를 불러오지 않는 가벼운 함수다. */
export function officeKindOf(name: string): OfficeFormat | null {
  const base = name.slice(Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\")) + 1);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return null;
  const ext = base.slice(dot + 1).toLowerCase();
  return FORMATS.includes(ext) ? (ext as OfficeFormat) : null;
}

/** macOS Quick Look 미리보기로 보여 줄 형식(ADR-0014). 문서는 폭에 맞춰 줄이고, 시트는 원래 크기로 둔다. */
export type QuickLookKind = "document" | "sheet";

const QUICKLOOK_DOCUMENTS: readonly string[] = ["docx", "pptx", "doc", "ppt", "docm", "pptm"];
const QUICKLOOK_SHEETS: readonly string[] = ["xlsx", "xls", "xlsm"];

/** 파일 이름의 확장자(대소문자 무시)로 Quick Look 미리보기 형식을 고른다. 아니면 null. */
export function quickLookKindOf(name: string): QuickLookKind | null {
  const base = name.slice(Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\")) + 1);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return null;
  const ext = base.slice(dot + 1).toLowerCase();
  return QUICKLOOK_DOCUMENTS.includes(ext) ? "document" : QUICKLOOK_SHEETS.includes(ext) ? "sheet" : null;
}

/**
 * Windows 미리보기 처리기(ADR-0015)로 보여 줄 형식인가. 지금은 docx만이다.
 * xlsx·pptx는 처리기가 그려지지 않는 경우가 있어(pptx는 스크롤바만 보임) 지금까지의 미리보기(설정 `preview.office`)를 쓴다.
 */
export function usesPreviewHandler(name: string): boolean {
  const base = name.slice(Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\")) + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 && base.slice(dot + 1).toLowerCase() === "docx";
}
