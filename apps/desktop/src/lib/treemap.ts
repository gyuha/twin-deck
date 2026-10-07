/** Disk Usage treemap의 순수 계산: 타일 배치(squarified), 작은 항목 묶기. 화면과 무관하다. */

export interface TreemapItem {
  id: string;
  value: number;
}

export interface Tile {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 전체 합계의 이 비율 미만인 항목은 "기타 N개" 타일 하나로 묶는다(설정이 아니라 상수). */
export const SMALL_RATIO = 0.005;

/** 행에 놓인 타일 중 가장 길쭉한 것의 가로세로비(1에 가까울수록 정사각형). `s`는 행의 면적 합, `side`는 행이 놓이는 변의 길이. */
function worst(s: number, min: number, max: number, side: number): number {
  return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
}

/**
 * 값에 비례하는 면적으로 `w`×`h` 영역을 채운다(squarified treemap, Bruls 외). 값이 0 이하인 항목은 타일이 없다.
 * 큰 항목이 먼저 놓이고(같은 값이면 입력 순서), 같은 입력은 항상 같은 결과다.
 */
export function layoutTreemap(items: TreemapItem[], w: number, h: number): Tile[] {
  const list = items.filter((i) => Number.isFinite(i.value) && i.value > 0).sort((a, b) => b.value - a.value);
  if (list.length === 0 || !(w > 0) || !(h > 0)) return [];
  const total = list.reduce((s, i) => s + i.value, 0);
  const areas = list.map((i) => (i.value / total) * w * h);
  const tiles: Tile[] = [];
  let [x, y, rw, rh] = [0, 0, w, h];
  let i = 0;
  while (i < list.length) {
    const side = Math.min(rw, rh);
    let sum = areas[i];
    let [lo, hi] = [areas[i], areas[i]];
    let best = worst(sum, lo, hi, side);
    let j = i + 1;
    while (j < list.length) {
      const next = sum + areas[j];
      const [nlo, nhi] = [Math.min(lo, areas[j]), Math.max(hi, areas[j])];
      const r = worst(next, nlo, nhi, side);
      if (r > best) break; // 더하면 더 길쭉해진다 — 여기서 행을 닫는다
      [sum, lo, hi, best] = [next, nlo, nhi, r];
      j++;
    }
    const thickness = sum / side;
    if (rw >= rh) {
      // 가로가 더 길다: 왼쪽에 세로 띠를 만든다
      let cy = y;
      for (let k = i; k < j; k++) {
        const th = areas[k] / thickness;
        tiles.push({ id: list[k].id, x, y: cy, w: thickness, h: th });
        cy += th;
      }
      x += thickness;
      rw -= thickness;
    } else {
      let cx = x;
      for (let k = i; k < j; k++) {
        const tw = areas[k] / thickness;
        tiles.push({ id: list[k].id, x: cx, y, w: tw, h: thickness });
        cx += tw;
      }
      y += thickness;
      rh -= thickness;
    }
    i = j;
  }
  return tiles;
}

/** "기타 N개" 타일의 id. 실제 경로와 겹치지 않는다. */
export const OTHER = "\0other";

export type Dir = "left" | "right" | "up" | "down";

/**
 * `id` 타일에서 `dir` 방향으로 화면에 인접한 타일의 id. 그 방향에서 변이 가장 가까운 타일 중 맞닿는 길이가 가장 긴 것,
 * 그래도 같으면 중심이 가까운 것을 고른다. 그 방향에 타일이 없거나(가장자리) `id`가 없으면 `null`이다.
 */
export function neighborTile(tiles: Tile[], id: string, dir: Dir): string | null {
  const cur = tiles.find((t) => t.id === id);
  if (!cur) return null;
  const eps = 1e-6;
  const horizontal = dir === "left" || dir === "right";
  const lo = (t: Tile) => (horizontal ? t.y : t.x);
  const len = (t: Tile) => (horizontal ? t.h : t.w);
  const gapOf = (t: Tile) =>
    dir === "right" ? t.x - (cur.x + cur.w) : dir === "left" ? cur.x - (t.x + t.w) : dir === "down" ? t.y - (cur.y + cur.h) : cur.y - (t.y + t.h);
  const overlapOf = (t: Tile) => Math.min(lo(cur) + len(cur), lo(t) + len(t)) - Math.max(lo(cur), lo(t));
  const centerDist = (t: Tile) => Math.hypot(t.x + t.w / 2 - (cur.x + cur.w / 2), t.y + t.h / 2 - (cur.y + cur.h / 2));
  const cands = tiles.filter((t) => t.id !== id && gapOf(t) >= -eps && overlapOf(t) > eps);
  if (cands.length === 0) return null;
  const near = Math.min(...cands.map(gapOf));
  const best = cands
    .filter((t) => gapOf(t) - near <= eps)
    .sort((a, b) => overlapOf(b) - overlapOf(a) || centerDist(a) - centerDist(b));
  return best[0].id;
}

export interface Other {
  /** 묶인 항목들의 id. */
  ids: string[];
  count: number;
  value: number;
}

/**
 * 합계의 `ratio` 미만인 항목을 하나의 `other`로 묶는다. 묶을 만한 항목이 둘 이상일 때만 묶는다(하나뿐이면 그대로 둔다).
 * `kept`는 묶이지 않은 항목이고 입력 순서를 지킨다.
 */
export function groupSmall<T extends TreemapItem>(items: T[], ratio = SMALL_RATIO): { kept: T[]; other: Other | null } {
  const total = items.reduce((s, i) => s + (i.value > 0 ? i.value : 0), 0);
  if (!(total > 0)) return { kept: items, other: null };
  const small = items.filter((i) => i.value > 0 && i.value / total < ratio);
  if (small.length < 2) return { kept: items, other: null };
  const ids = new Set(small.map((i) => i.id));
  return {
    kept: items.filter((i) => !ids.has(i.id)),
    other: { ids: small.map((i) => i.id), count: small.length, value: small.reduce((s, i) => s + i.value, 0) },
  };
}
