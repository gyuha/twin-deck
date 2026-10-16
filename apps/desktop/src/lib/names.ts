import { getChoseong } from "es-hangul";

/** macOS는 한글을 NFD로 저장한다. 비교 전에 NFC로 맞추고 대소문자를 무시한다. */
export function normalizeName(name: string): string {
  return name.normalize("NFC").toLowerCase();
}

/**
 * Quick Select로 일치한 부분의 위치. 화면에 보이는 이름(NFC로 맞춘 것)에서의 [시작, 끝)이다.
 * 일치하지 않거나(대소문자 변환으로 길이가 달라지는 드문 글자는 정확한 위치를 알 수 없어) 찾지 못하면 null.
 */
export function quickMatchRange(name: string, input: string, prefixOnly = false): [number, number] | null {
  if (!input) return null;
  const shown = name.normalize("NFC");
  const lower = shown.toLowerCase();
  const needle = normalizeName(input);
  if (lower.length !== shown.length) return null;
  const start = findMatch(lower, needle, prefixOnly);
  return start < 0 ? null : [start, start + needle.length];
}

/** Quick Select 규칙: 기본은 부분 일치, `match_only_prefix`면 접두 일치 (docs/07 §4.4). */
export function quickMatch(name: string, input: string, prefixOnly = false): boolean {
  return findMatch(normalizeName(name), normalizeName(input), prefixOnly) >= 0;
}

/** 한글 호환 자음(`ㄱ`~`ㅎ`, U+3131~U+314E). 입력에 이게 있으면 그 글자는 이름 글자의 초성과 비교한다. 코드에 한글 글자를 남기지 않도록(i18n 점검) 코드 포인트로 쓴다. */
const CHOSEONG_INPUT = /[\u3131-\u314E]/;

/** 이름에서 입력이 일치하는 시작 위치(없으면 -1). 둘 다 `normalizeName`을 거친 값이다. */
function findMatch(name: string, input: string, prefixOnly: boolean): number {
  if (!CHOSEONG_INPUT.test(input)) return prefixOnly ? (name.startsWith(input) ? 0 : -1) : name.indexOf(input);
  // 초성 검색: 입력 글자마다 "이름의 같은 글자이거나, 입력이 자음이고 이름 글자의 초성과 같다"로 이름 위를 미끄러진다.
  if (input.length > name.length) return -1;
  const last = prefixOnly ? 0 : name.length - input.length;
  for (let start = 0; start <= last; start++) {
    let k = 0;
    while (k < input.length && (name[start + k] === input[k] || (CHOSEONG_INPUT.test(input[k]) && getChoseong(name[start + k]) === input[k]))) k++;
    if (k === input.length) return start;
  }
  return -1;
}
