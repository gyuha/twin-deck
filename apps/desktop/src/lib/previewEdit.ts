import { isArchivePath } from "@twin-deck/ts-client";

export type Eol = "lf" | "crlf";

/**
 * 줄바꿈 종류. 줄바꿈이 없거나 LF만이면 "lf", CRLF만이면 "crlf", 섞였거나 단독 CR이 있으면 "mixed".
 * 브라우저의 편집 상자는 값을 읽을 때 CRLF를 LF로 바꾸므로, 저장할 때 원래 줄바꿈을 되돌리려면 먼저 이것을 알아야 한다.
 */
export function detectEol(text: string): Eol | "mixed" {
  const rest = text.replace(/\r\n/g, "");
  if (rest.includes("\r")) return "mixed";
  const hasCrlf = rest.length !== text.length;
  if (hasCrlf) return rest.includes("\n") ? "mixed" : "crlf";
  return "lf";
}

/** 편집 상자에 넣을 글자: CRLF를 LF로 바꾼다. */
export const toEditor = (text: string): string => text.replace(/\r\n/g, "\n");

/** 디스크에 쓸 글자: 원래 줄바꿈이 CRLF였으면 LF를 CRLF로 되돌린다. 마지막 줄 끝 줄바꿈 유무는 그대로 둔다. */
export const toDisk = (text: string, eol: Eol): string => (eol === "crlf" ? text.replace(/\n/g, "\r\n") : text);

export interface EditCandidate {
  path: string;
  /** 서비스가 돌려준 미리보기 종류(`text`만 편집한다). */
  kind: string | undefined;
  truncated: boolean;
  text: string | null | undefined;
}

/** 편집을 시작할 수 없는 이유(없으면 null). 파일을 덮어쓰는 기능이라 손실이 생길 수 있는 경우를 모두 거절한다. */
export function editBlockReason(c: EditCandidate): string | null {
  if (c.kind !== "text" || c.text === null || c.text === undefined) return "텍스트 파일이 아니라 편집할 수 없습니다";
  if (isArchivePath(c.path)) return "압축 파일 안의 파일은 편집할 수 없습니다";
  if (c.truncated) return "파일이 커서(64KB 초과) 일부만 보여 편집할 수 없습니다";
  if (detectEol(c.text) === "mixed") return "줄바꿈이 섞여 있어 편집할 수 없습니다";
  return null;
}
