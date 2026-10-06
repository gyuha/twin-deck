import type { PreviewRect } from "@twin-deck/ts-client";

/** 미리보기 창의 최소 크기(px). 화면이 이보다 작으면 화면 크기가 상한이다. */
export const MIN_W = 320;
export const MIN_H = 200;
/** 이동으로 창을 아무리 밀어도 화면 안에 남는 제목 줄의 너비·높이(px). */
const KEEP_W = 64;
const KEEP_H = 32;

export type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** 값이 없을 때의 기본 배치(너비 44rem, 높이 80vh, 가운데). 끌기를 시작할 때 기준이 된다. */
export function defaultRect(vw: number, vh: number): PreviewRect {
  const w = Math.min(44 * 16, vw);
  const h = Math.round(vh * 0.8);
  return { x: Math.round((vw - w) / 2), y: Math.round((vh - h) / 2), w, h };
}

/** 크기를 [최소, 화면] 안으로, 위치를 제목 줄 일부가 화면에 남는 범위로 되돌린다. 저장 형식이 u32라 위치는 0 이상이다. */
export function clampRect(r: PreviewRect, vw: number, vh: number): PreviewRect {
  const w = Math.round(clamp(r.w, Math.min(MIN_W, vw), vw));
  const h = Math.round(clamp(r.h, Math.min(MIN_H, vh), vh));
  return { x: Math.round(clamp(r.x, 0, vw - KEEP_W)), y: Math.round(clamp(r.y, 0, vh - KEEP_H)), w, h };
}

export function moveRect(r: PreviewRect, dx: number, dy: number, vw: number, vh: number): PreviewRect {
  return clampRect({ ...r, x: r.x + dx, y: r.y + dy }, vw, vh);
}

/** 가장자리·모서리를 (dx, dy)만큼 끌었을 때의 창. 왼쪽·위를 끌면 반대편 변이 제자리에 남는다. */
export function resizeRect(r: PreviewRect, edge: Edge, dx: number, dy: number, vw: number, vh: number): PreviewRect {
  const minW = Math.min(MIN_W, vw);
  const minH = Math.min(MIN_H, vh);
  let { x, y, w, h } = r;
  if (edge.includes("e")) w = clamp(r.w + dx, minW, vw);
  if (edge.includes("s")) h = clamp(r.h + dy, minH, vh);
  if (edge.includes("w")) {
    w = clamp(r.w - dx, minW, vw);
    x = r.x + r.w - w;
  }
  if (edge.includes("n")) {
    h = clamp(r.h - dy, minH, vh);
    y = r.y + r.h - h;
  }
  return clampRect({ x, y, w, h }, vw, vh);
}
