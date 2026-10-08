import { t as translate } from "../i18n";
/** 다중 이름 바꾸기: 새 이름 만들기, 충돌 검사, 실행 순서. 화면과 저장소가 같은 함수를 쓴다. */

export type CaseMode = "none" | "upper" | "lower" | "title";

export interface RenameOptions {
  /** 파일 이름(확장자 앞) 마스크. 쓸 수 있는 토큰은 `MASK_HELP`를 본다. */
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
  /** 전체 경로. `[A]`·`[P]` 토큰이 쓴다. */
  path?: string;
  /** 수정 시각(epoch 밀리초). 날짜·시간 토큰이 쓴다. */
  modifiedMs?: number | null;
}

/** 마스크 토큰 도움말(화면의 도움말 표). 위치 x, y는 1부터 센다. */
export const MASK_HELP: { token: string; description: string; example: string }[] = [
  { token: "[N]", get description() { return translate("rename.mask.0"); }, example: "photo.jpg → photo" },
  { token: "[Nx]", get description() { return translate("rename.mask.1"); }, example: "[N2] : photo → h" },
  { token: "[Nx:y]", get description() { return translate("rename.mask.2"); }, example: "[N1:3] : photo → pho" },
  { token: "[E]", get description() { return translate("rename.mask.3"); }, example: "photo.jpg → jpg" },
  { token: "[Ex]", get description() { return translate("rename.mask.4"); }, example: "[E1] : jpg → j" },
  { token: "[Ex:y]", get description() { return translate("rename.mask.5"); }, example: "[E1:2] : jpg → jp" },
  { token: "[A]", get description() { return translate("rename.mask.6"); }, example: "/home/a/photo.jpg" },
  { token: "[Ax:y]", get description() { return translate("rename.mask.7"); }, example: "[A9:13] : /home/a/photo.jpg → photo" },
  { token: "[P]", get description() { return translate("rename.mask.8"); }, example: "/home/a/photo.jpg → a" },
  { token: "[C]", get description() { return translate("rename.mask.9"); }, get example() { return translate("rename.mask.example_width"); } },
  { token: "[Y]", get description() { return translate("rename.mask.10"); }, example: "2024" },
  { token: "[M]", get description() { return translate("rename.mask.11"); }, example: "05" },
  { token: "[D]", get description() { return translate("rename.mask.12"); }, example: "06" },
  { token: "[h]", get description() { return translate("rename.mask.13"); }, example: "07" },
  { token: "[m]", get description() { return translate("rename.mask.14"); }, example: "08" },
  { token: "[s]", get description() { return translate("rename.mask.15"); }, example: "09" },
];

/** 이름을 확장자 앞뒤로 나눈다. 맨 앞의 점은 확장자가 아니다(`.gitignore`는 이름 전체). */
export function splitName(name: string, isDir: boolean): { stem: string; ext: string } {
  const dot = name.lastIndexOf(".");
  if (isDir || dot <= 0) return { stem: name, ext: "" };
  return { stem: name.slice(0, dot), ext: name.slice(dot + 1) };
}

const applyCase = (s: string, mode: CaseMode) =>
  mode === "upper" ? s.toUpperCase() : mode === "lower" ? s.toLowerCase() : mode === "title" ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;

/** 문자열의 x번째(1부터)부터 y번째까지. y가 없으면 x번째 한 글자, x도 없으면 전체. 범위를 벗어나면 있는 만큼만 돌려준다. */
function slice(text: string, x?: number, y?: number): string {
  if (x === undefined) return text;
  const chars = Array.from(text);
  const from = Math.max(x, 1) - 1;
  return y === undefined ? (chars[from] ?? "") : chars.slice(from, Math.max(y, 0)).join("");
}

const two = (n: number) => String(n).padStart(2, "0");

const parentName = (path: string) => {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : "";
};

/** 마스크의 토큰을 값으로 바꾼다. 알 수 없는 `[...]`는 그대로 둔다. */
function expand(mask: string, it: RenameItem, stem: string, ext: string, counter: string): string {
  const when = it.modifiedMs == null ? null : new Date(it.modifiedMs);
  return mask.replace(/\[([NEAPCYMDhms])(?:(\d+)(?::(\d+))?)?\]/g, (all, t: string, x?: string, y?: string) => {
    const from = x === undefined ? undefined : Number(x);
    const to = y === undefined ? undefined : Number(y);
    const ranged = t === "N" || t === "E" || t === "A";
    if (!ranged && x !== undefined) return all; // [C1] 같은 인수는 이 토큰에 없다
    switch (t) {
      case "N":
        return slice(stem, from, to);
      case "E":
        return slice(ext, from, to);
      case "A":
        return slice(it.path ?? it.name, from, to);
      case "P":
        return it.path ? parentName(it.path) : "";
      case "C":
        return counter;
      default: {
        if (!when) return "";
        return { Y: String(when.getFullYear()), M: two(when.getMonth() + 1), D: two(when.getDate()), h: two(when.getHours()), m: two(when.getMinutes()), s: two(when.getSeconds()) }[t] ?? all;
      }
    }
  });
}

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
    const newStem = applyCase(expand(o.nameMask, it, stem, ext, counter), o.nameCase);
    const newExt = it.isDir ? "" : applyCase(expand(o.extMask, it, stem, ext, counter), o.extCase);
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
    if (n.trim() === "") return translate("rename.err.empty");
    if (n === "." || n === "..") return translate("rename.err.invalid");
    if (/[/\0]/.test(n)) return translate("rename.err.chars");
    if ((count.get(nfc(n)) ?? 0) > 1) return translate("rename.err.dup");
    // 폴더에 이미 있어도, 그 파일이 이번에 이름이 바뀌어 비워지면 괜찮다(맞바꾸기·연쇄 변경).
    if (taken.has(nfc(n)) && !originals.has(nfc(n))) return translate("rename.err.exists");
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
