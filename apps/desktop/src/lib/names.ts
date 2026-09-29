/** macOS는 한글을 NFD로 저장한다. 비교 전에 NFC로 맞추고 대소문자를 무시한다. */
export function normalizeName(name: string): string {
  return name.normalize("NFC").toLowerCase();
}

/** Quick Select 규칙: 기본은 부분 일치, `match_only_prefix`면 접두 일치 (docs/07 §4.4). */
export function quickMatch(name: string, input: string, prefixOnly = false): boolean {
  const n = normalizeName(name);
  const i = normalizeName(input);
  return prefixOnly ? n.startsWith(i) : n.includes(i);
}
