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
  const start = prefixOnly ? (lower.startsWith(needle) ? 0 : -1) : lower.indexOf(needle);
  return start < 0 ? null : [start, start + needle.length];
}

/** Quick Select 규칙: 기본은 부분 일치, `match_only_prefix`면 접두 일치 (docs/07 §4.4). */
export function quickMatch(name: string, input: string, prefixOnly = false): boolean {
  const n = normalizeName(name);
  const i = normalizeName(input);
  return prefixOnly ? n.startsWith(i) : n.includes(i);
}
