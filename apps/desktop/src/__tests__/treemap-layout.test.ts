import { describe, expect, it } from "vitest";
import { groupSmall, layoutTreemap, neighborTile, SMALL_RATIO } from "../lib/treemap";

const W = 400;
const H = 300;
const items = (...values: number[]) => values.map((value, i) => ({ id: `i${i}`, value }));
const area = (t: { w: number; h: number }) => t.w * t.h;

describe("layoutTreemap (squarified)", () => {
  it("모든 타일이 영역 안에 있고 서로 겹치지 않는다", () => {
    const tiles = layoutTreemap(items(60, 30, 20, 10, 5, 5, 3, 2, 1), W, H);
    const eps = 1e-6;
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(-eps);
      expect(t.y).toBeGreaterThanOrEqual(-eps);
      expect(t.x + t.w).toBeLessThanOrEqual(W + eps);
      expect(t.y + t.h).toBeLessThanOrEqual(H + eps);
    }
    for (let i = 0; i < tiles.length; i++) {
      for (let j = i + 1; j < tiles.length; j++) {
        const a = tiles[i];
        const b = tiles[j];
        const overlapW = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapH = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        expect(overlapW > eps && overlapH > eps).toBe(false);
      }
    }
  });

  it("면적의 합이 영역 전체이고 각 면적은 값에 비례한다", () => {
    const input = items(60, 30, 20, 10, 5);
    const tiles = layoutTreemap(input, W, H);
    const total = input.reduce((s, x) => s + x.value, 0);
    expect(tiles.reduce((s, t) => s + area(t), 0)).toBeCloseTo(W * H, 6);
    for (const x of input) expect(area(tiles.find((t) => t.id === x.id)!)).toBeCloseTo((x.value / total) * W * H, 6);
  });

  it("값이 0 이하인 항목은 타일이 없다", () => {
    const tiles = layoutTreemap([...items(10, 5), { id: "zero", value: 0 }, { id: "neg", value: -3 }], W, H);
    expect(tiles.map((t) => t.id).sort()).toEqual(["i0", "i1"]);
    expect(tiles.reduce((s, t) => s + area(t), 0)).toBeCloseTo(W * H, 6);
  });

  it("같은 입력은 같은 결과이고, 값이 큰 항목이 먼저(위쪽·왼쪽에 가깝게) 놓인다", () => {
    const a = layoutTreemap(items(5, 50, 20), W, H);
    const b = layoutTreemap(items(5, 50, 20), W, H);
    expect(a).toEqual(b);
    expect(a[0].id).toBe("i1"); // 가장 큰 항목이 첫 타일
    expect(a.map((t) => t.id)).toEqual(["i1", "i2", "i0"]);
  });

  it("항목 하나는 영역 전체를 채우고, 빈 입력은 빈 배열이다", () => {
    expect(layoutTreemap(items(7), W, H)).toEqual([{ id: "i0", x: 0, y: 0, w: W, h: H }]);
    expect(layoutTreemap([], W, H)).toEqual([]);
    expect(layoutTreemap(items(0, 0), W, H)).toEqual([]);
  });

  it("영역이 0이면 타일이 없다", () => {
    expect(layoutTreemap(items(1, 2), 0, H)).toEqual([]);
    expect(layoutTreemap(items(1, 2), W, 0)).toEqual([]);
  });

  it("타일이 지나치게 길쭉하지 않다(squarified): 같은 값 4개는 2×2에 가까운 정사각형", () => {
    const tiles = layoutTreemap(items(10, 10, 10, 10), 200, 200);
    for (const t of tiles) expect(Math.max(t.w / t.h, t.h / t.w)).toBeLessThan(1.5);
  });
});

describe("groupSmall", () => {
  const withNames = (...values: number[]) => values.map((value, i) => ({ id: `f${i}`, value }));

  it("전체의 임계 비율 미만인 항목을 하나의 other로 묶는다(개수와 합계)", () => {
    const list = withNames(900, 90, 4, 3, 3); // 합계 1000: 4·3·3은 각 0.4%·0.3%·0.3% (< 0.5%)
    const { kept, other } = groupSmall(list);
    expect(SMALL_RATIO).toBe(0.005);
    expect(kept.map((x) => x.id)).toEqual(["f0", "f1"]);
    expect(other).toEqual({ ids: ["f2", "f3", "f4"], count: 3, value: 10 });
  });

  it("임계 미만이 하나뿐이면 묶지 않는다", () => {
    const { kept, other } = groupSmall(withNames(900, 99, 1));
    expect(kept).toHaveLength(3);
    expect(other).toBeNull();
  });

  it("임계 미만이 없으면 그대로다", () => {
    const { kept, other } = groupSmall(withNames(50, 30, 20));
    expect(kept.map((x) => x.id)).toEqual(["f0", "f1", "f2"]);
    expect(other).toBeNull();
  });

  it("합계가 0이면 아무것도 묶지 않는다", () => {
    const { kept, other } = groupSmall(withNames(0, 0));
    expect(kept).toHaveLength(2);
    expect(other).toBeNull();
  });
});

describe("neighborTile (인접 타일)", () => {
  // big이 왼쪽 절반, 오른쪽에 위(a)·아래(b) 두 타일.
  const grid = [
    { id: "big", x: 0, y: 0, w: 200, h: 100 },
    { id: "a", x: 200, y: 0, w: 100, h: 70 },
    { id: "b", x: 200, y: 70, w: 100, h: 30 },
  ];

  it("인접: 네 방향에서 화면에 보이는 이웃을 고른다", () => {
    expect(neighborTile(grid, "a", "left")).toBe("big");
    expect(neighborTile(grid, "a", "down")).toBe("b");
    expect(neighborTile(grid, "b", "up")).toBe("a");
    expect(neighborTile(grid, "big", "right")).toBe("a"); // a와 맞닿는 길이(70)가 b(30)보다 길다
  });

  it("인접: 가장자리에서는 null이다", () => {
    expect(neighborTile(grid, "big", "left")).toBeNull();
    expect(neighborTile(grid, "big", "up")).toBeNull();
    expect(neighborTile(grid, "a", "right")).toBeNull();
    expect(neighborTile(grid, "b", "down")).toBeNull();
  });

  it("인접: 타일이 하나뿐이거나 없는 id면 null이다", () => {
    expect(neighborTile([{ id: "x", x: 0, y: 0, w: 10, h: 10 }], "x", "right")).toBeNull();
    expect(neighborTile(grid, "nope", "right")).toBeNull();
  });

  it("인접: 맞닿는 길이가 같으면 중심이 가까운 쪽이고, 같은 입력은 같은 결과다", () => {
    const t = [
      { id: "c", x: 0, y: 0, w: 100, h: 100 },
      { id: "u", x: 100, y: 0, w: 50, h: 50 },
      { id: "d", x: 100, y: 50, w: 50, h: 50 },
    ];
    expect(neighborTile(t, "c", "right")).toBe(neighborTile(t, "c", "right"));
    expect(["u", "d"]).toContain(neighborTile(t, "c", "right"));
  });

  it("인접: 실제 squarified 배치에서도 왼쪽 이웃의 오른쪽 이웃이 자기 자신이다", () => {
    const tiles = layoutTreemap(items(60, 30, 20, 10, 5, 5, 3, 2, 1), W, H);
    for (const t of tiles) {
      const r = neighborTile(tiles, t.id, "right");
      if (r === null) continue;
      expect(neighborTile(tiles, r, "left")).not.toBeNull();
    }
  });
});
