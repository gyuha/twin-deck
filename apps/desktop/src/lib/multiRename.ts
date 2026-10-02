/** 다중 이름 바꾸기: 새 이름 만들기, 충돌 검사, 실행 순서. 화면과 저장소가 같은 함수를 쓴다. */

export type CaseMode = "none" | "upper" | "lower" | "title";

export interface RenameOptions {
  /** 파일 이름(확장자 앞) 마스크. `[N]` 원래 이름, `[E]` 원래 확장자, `[C]` 카운터. */
  nameMask: string;
  /** 확장자 마스크. 같은 토큰을 쓴다. 결과가 비면 확장자를 붙이지 않는다. */
  extMask: string;
  nameCase: CaseMode;
  extCase: CaseMode;
  find: string;
  replace: string;
  regex: boolean;
  caseSensitive: boolean;
  /** 첫 번째 일치만 바꾼다(1x). */
  firstOnly: boolean;
  start: number;
  step: number;
  /** 카운터 자릿수(0으로 채운다). */
  width: number;
}

export const DEFAULT_RENAME_OPTIONS: RenameOptions = {
  nameMask: "[N]",
  extMask: "[E]",
  nameCase: "none",
  extCase: "none",
  find: "",
  replace: "",
  regex: false,
  caseSensitive: false,
  firstOnly: false,
  start: 1,
  step: 1,
  width: 1,
};

export interface RenameItem {
  name: string;
  /** 폴더는 확장자를 나누지 않는다. */
  isDir: boolean;
}

/** 이름을 확장자 앞뒤로 나눈다. 맨 앞의 점은 확장자가 아니다(`.gitignore`는 이름 전체). */
export function splitName(name: string, isDir: boolean): { stem: string; ext: string } {
  const dot = name.lastIndexOf(".");
  if (isDir || dot <= 0) return { stem: name, ext: "" };
  return { stem: name.slice(0, dot), ext: name.slice(dot + 1) };
}

const applyCase = (s: string, mode: CaseMode) =>
  mode === "upper" ? s.toUpperCase() : mode === "lower" ? s.toLowerCase() : mode === "title" ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;

const expand = (mask: string, stem: string, ext: string, counter: string) =>
  mask.replace(/\[(N|E|C)\]/g, (_, t: string) => (t === "N" ? stem : t === "E" ? ext : counter));

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 찾기 패턴을 정규식으로 만든다. 비어 있으면 null, 정규식이 잘못되면 오류 문구를 돌려준다. */
export function findPattern(o: RenameOptions): { re: RegExp | null; error: string | null } {
  if (o.find === "") return { re: null, error: null };
  try {
    const flags = (o.caseSensitive ? "" : "i") + (o.firstOnly ? "" : "g");
    return { re: new RegExp(o.regex ? o.find : escapeRegExp(o.find), flags), error: null };
  } catch (e) {
    return { re: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 항목마다 새 이름을 만든다(순서 = 입력 순서가 카운터 순서). */
export function buildNewNames(items: readonly RenameItem[], o: RenameOptions): string[] {
  const { re } = findPattern(o);
  return items.map((it, i) => {
    const { stem, ext } = splitName(it.name, it.isDir);
    const counter = String(o.start + i * o.step).padStart(Math.max(o.width, 1), "0");
    const newStem = applyCase(expand(o.nameMask, stem, ext, counter), o.nameCase);
    const newExt = it.isDir ? "" : applyCase(expand(o.extMask, stem, ext, counter), o.extCase);
    let full = newExt ? `${newStem}.${newExt}` : newStem;
    if (re) full = full.replace(re, o.replace);
    return full;
  });
}

/** 행별 오류 문구(문제가 없거나 바뀌지 않은 행은 null). `existing`은 그 폴더에 이미 있는 이름들이다. */
export function validateNames(items: readonly RenameItem[], newNames: readonly string[], existing: Iterable<string>): (string | null)[] {
  const nfc = (s: string) => s.normalize("NFC");
  const changed = items.map((it, i) => nfc(it.name) !== nfc(newNames[i]));
  const originals = new Set(items.filter((_, i) => changed[i]).map((it) => nfc(it.name)));
  const taken = new Set([...existing].map(nfc));
  const count = new Map<string, number>();
  for (const n of newNames) count.set(nfc(n), (count.get(nfc(n)) ?? 0) + 1);
  return newNames.map((n, i) => {
    if (!changed[i]) return null;
    if (n.trim() === "") return "이름이 비었습니다";
    if (n === "." || n === "..") return "사용할 수 없는 이름입니다";
    if (/[/\0]/.test(n)) return "이름에 사용할 수 없는 문자가 있습니다";
    if ((count.get(nfc(n)) ?? 0) > 1) return "새 이름이 겹칩니다";
    // 폴더에 이미 있어도, 그 파일이 이번에 이름이 바뀌어 비워지면 괜찮다(맞바꾸기·연쇄 변경).
    if (taken.has(nfc(n)) && !originals.has(nfc(n))) return "같은 이름의 파일이 이미 있습니다";
    return null;
  });
}

/** 바뀌는 행 중 새 이름이 다른 바뀌는 행의 옛 이름과 겹치면 임시 이름을 거쳐야 한다. */
export function needsTempStep(items: readonly RenameItem[], newNames: readonly string[]): boolean {
  const nfc = (s: string) => s.normalize("NFC");
  const changed = items.map((it, i) => nfc(it.name) !== nfc(newNames[i]));
  const originals = new Set(items.filter((_, i) => changed[i]).map((it) => nfc(it.name)));
  return newNames.some((n, i) => changed[i] && originals.has(nfc(n)));
}
