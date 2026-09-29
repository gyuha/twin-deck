/** macOS는 한글을 NFD로 저장한다. 비교 전에 NFC로 맞추고 대소문자를 무시한다. */
export function normalizeName(name: string): string {
  return name.normalize("NFC").toLowerCase();
}

/** Quick Select 기본 규칙: 부분 일치 (docs/07 §4.4). */
export function quickMatch(name: string, input: string): boolean {
  return normalizeName(name).includes(normalizeName(input));
}
