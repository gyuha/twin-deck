import { t as translate } from "../i18n";
import type { Key } from "../i18n";
import { normalizeName } from "./names";

const CATEGORIES = ["File", "Navigation", "View", "Selection", "Tab", "Dialog"];

/** 도움말 화면의 분류 제목. 알려진 분류는 번역하고, 그 밖은 그대로 쓴다. */
export const categoryTitle = (c: string) => (CATEGORIES.includes(c) ? translate(`category.${c}` as Key) : c);

/** 도움말 검색어를 공백으로 나눈 낱말들(NFC·소문자). 낱말마다 설명·키·분류 중 어딘가에 들어 있어야 일치한다(이슈 #56). */
export function helpTerms(query: string): string[] {
  return normalizeName(query).split(/\s+/).filter((w) => w !== "");
}

/** 도움말 한 줄이 검색 낱말을 모두 담고 있는가. 낱말이 없으면 모두 일치한다. */
export function helpMatches(terms: readonly string[], fields: readonly string[]): boolean {
  const texts = fields.map(normalizeName);
  return terms.every((w) => texts.some((t) => t.includes(w)));
}

/** `text`(NFC로 맞춘 것)에서 검색 낱말이 나오는 [시작, 끝) 구간들. 겹치거나 붙은 구간은 합친다. */
export function highlightRanges(text: string, terms: readonly string[]): [number, number][] {
  const shown = text.normalize("NFC");
  const lower = shown.toLowerCase();
  if (lower.length !== shown.length) return [];
  const ranges: [number, number][] = [];
  for (const w of terms) {
    for (let i = lower.indexOf(w); i >= 0; i = lower.indexOf(w, i + 1)) ranges.push([i, i + w.length]);
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
