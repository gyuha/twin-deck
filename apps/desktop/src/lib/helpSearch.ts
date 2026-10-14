import { disassemble } from "es-hangul";
import { t as translate } from "../i18n";
import type { Key } from "../i18n";

const CATEGORIES = ["File", "Navigation", "View", "Selection", "Tab", "Dialog"];

/** 도움말 화면의 분류 제목. 알려진 분류는 번역하고, 그 밖은 그대로 쓴다. */
export const categoryTitle = (c: string) => (CATEGORIES.includes(c) ? translate(`category.${c}` as Key) : c);

/**
 * 한글을 자소로 풀고 소문자로 맞춘다(이슈 #56). 겹모음·겹받침도 홑자소로 풀리므로 조합 중인 `닭`(달+ㄱ)과 완성된 `닭`이 같은 자소열이다.
 * `starts[i]`는 `folded`의 i번째 글자가 나온 곳의 `text.normalize("NFC")` 위치다. 자소 단위로 비교하면 `ㅂ`·`복ㅅ`처럼 조합 중인 글자도 `복사`에 일치한다.
 */
function fold(text: string): { shown: string; folded: string; starts: number[] } {
  const shown = text.normalize("NFC");
  let folded = "";
  const starts: number[] = [];
  let at = 0;
  for (const ch of shown) {
    const out = disassemble(ch.toLowerCase());
    folded += out;
    for (let k = 0; k < out.length; k++) starts.push(at);
    at += ch.length;
  }
  return { shown, folded, starts };
}

/** 도움말 검색어를 공백으로 나눈 낱말들(자소로 푼 것). 낱말마다 설명·키·분류 중 어딘가에 들어 있어야 일치한다(이슈 #56). */
export function helpTerms(query: string): string[] {
  return fold(query).folded.split(/\s+/).filter((w) => w !== "");
}

/** 도움말 한 줄이 검색 낱말을 모두 담고 있는가. 낱말이 없으면 모두 일치한다. */
export function helpMatches(terms: readonly string[], fields: readonly string[]): boolean {
  const texts = fields.map((f) => fold(f).folded);
  return terms.every((w) => texts.some((t) => t.includes(w)));
}

/** `text`(NFC로 맞춘 것)에서 검색 낱말이 나오는 [시작, 끝) 구간들. 자소가 걸친 글자는 통째로 잡는다. 겹치거나 붙은 구간은 합친다. */
export function highlightRanges(text: string, terms: readonly string[]): [number, number][] {
  const { shown, folded, starts } = fold(text);
  const ranges: [number, number][] = [];
  for (const w of terms) {
    for (let i = folded.indexOf(w); i >= 0; i = folded.indexOf(w, i + 1)) {
      const last = starts[i + w.length - 1];
      ranges.push([starts[i], last + (shown.codePointAt(last)! > 0xffff ? 2 : 1)]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}
