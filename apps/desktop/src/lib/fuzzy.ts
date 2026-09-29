import { normalizeName } from "./names";

const SEPARATORS = new Set([" ", ".", "_", "-", "/", ":"]);

/**
 * 퍼지 일치 점수. 클수록 좋고, 일치하지 않으면 null. 공백은 질의에서 무시하고 NFC/소문자로 맞춘다.
 * 1) 질의가 그대로 들어 있으면(연속 부분 문자열) 높은 점수: 문자열 맨 앞 +20, 단어 시작 +8, 앞쪽일수록 가산.
 * 2) 아니면 부분 수열: 글자마다 +1, 연속 +5, 단어 시작 +8, 간격이 벌어지면 감점.
 * 어느 쪽이든 짧은 문자열을 약간 선호한다.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = [...normalizeName(query)].filter((c) => c !== " ");
  const t = [...normalizeName(text)];
  if (q.length === 0) return 0;
  const shortness = -t.length * 0.01;

  // 1) 연속 부분 문자열 (첫 등장 위치)
  for (let i = 0; i + q.length <= t.length; i++) {
    if (q.every((c, k) => t[i + k] === c)) {
      const boundary = i === 0 ? 20 : SEPARATORS.has(t[i - 1]) ? 8 : 0;
      return 100 + q.length + boundary - i * 0.2 + shortness;
    }
  }

  // 2) 부분 수열
  let score = 0;
  let ti = 0;
  let prev = -2;
  for (const c of q) {
    let found = -1;
    for (let i = ti; i < t.length; i++) {
      if (t[i] === c) {
        found = i;
        break;
      }
    }
    if (found < 0) return null;
    score += 1;
    if (found === prev + 1) score += 5;
    if (found === 0 || SEPARATORS.has(t[found - 1])) score += 8;
    score -= Math.min(found - ti, 10) * 0.1;
    prev = found;
    ti = found + 1;
  }
  return score + shortness;
}

/** 항목을 질의에 대한 최고 점수(여러 문자열 중)로 걸러 정렬한다. 질의가 비면 원래 순서. */
export function rankBy<T>(items: readonly T[], query: string, texts: (item: T) => readonly string[]): T[] {
  if (query.trim() === "") return [...items];
  const scored: { item: T; score: number; order: number }[] = [];
  items.forEach((item, order) => {
    let best: number | null = null;
    for (const text of texts(item)) {
      const s = fuzzyScore(query, text);
      if (s !== null && (best === null || s > best)) best = s;
    }
    if (best !== null) scored.push({ item, score: best, order });
  });
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.map((s) => s.item);
}
