import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import type { PreviewRect } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";
import { defaultRect } from "../lib/previewRect";

// jsdom 화면은 1024×768, 기본 창은 너비 704·높이 614, 위치 (160, 77)
const VW = window.innerWidth;
const VH = window.innerHeight;
const BASE = defaultRect(VW, VH);

const seed = () => new FakeBackend().seed({ "/home/a/a.txt": "첫째", "/home/a/b.txt": "둘째", "/home/b": null });
const snapWith = (previewRect: PreviewRect | null) => ({
  version: 1,
  activePane: "left" as const,
  showHidden: false,
  paletteQuery: "",
  split: 500,
  previewRect,
  left: { tabs: [{ path: "/home/a", cursorName: null, selection: [], sort: null, view: { mode: "table" as const, count: 1 } }], active: 0 },
  right: { tabs: [{ path: "/home/b", cursorName: null, selection: [], sort: null, view: { mode: "table" as const, count: 1 } }], active: 0 },
});

async function open(previewRect: PreviewRect | null = null) {
  const r = await renderApp(seed(), undefined, undefined, { snapshot: snapWith(previewRect) });
  await r.user.keyboard("{ArrowRight}");
  const d = await screen.findByRole("dialog", { name: /미리보기/ });
  return { ...r, dialog: d };
}
const title = () => document.querySelector("[data-preview-title]") as HTMLElement;
const handle = (edge: string) => document.querySelector(`[data-resize="${edge}"]`) as HTMLElement;
const box = (d: HTMLElement): PreviewRect => ({
  x: parseInt(d.style.left),
  y: parseInt(d.style.top),
  w: parseInt(d.style.width),
  h: parseInt(d.style.height),
});
const drag = (el: HTMLElement, dx: number, dy: number, from = { x: 500, y: 300 }) => {
  fireEvent.mouseDown(el, { button: 0, clientX: from.x, clientY: from.y });
  fireEvent.mouseMove(window, { clientX: from.x + dx, clientY: from.y + dy });
  fireEvent.mouseUp(window, { button: 0 });
};
const current = () => screen.getByRole("dialog", { name: /미리보기/ });

describe("미리보기 창 이동", () => {
  it("제목 줄을 끌면 창이 그만큼 옮겨진다", async () => {
    await open();
    drag(title(), 40, -30);
    await waitFor(() => expect(box(current())).toEqual({ ...BASE, x: BASE.x + 40, y: BASE.y - 30 }));
  });

  it("끄는 동안에도 창이 따라온다", async () => {
    await open();
    fireEvent.mouseDown(title(), { button: 0, clientX: 500, clientY: 300 });
    fireEvent.mouseMove(window, { clientX: 520, clientY: 310 });
    await waitFor(() => expect(box(current()).x).toBe(BASE.x + 20));
    fireEvent.mouseUp(window, { button: 0 });
  });

  it("화면 밖으로 완전히 나가지 않고 제목 줄이 64px 이상 남는다", async () => {
    await open();
    drag(title(), 5000, 5000);
    await waitFor(() => expect(box(current()).x).toBe(VW - 64));
    expect(box(current()).y).toBeLessThan(VH);
    drag(title(), -9000, -9000, { x: 900, y: 700 });
    await waitFor(() => expect(box(current())).toMatchObject({ x: 0, y: 0 }));
  });

  it("끌기를 마치면 previewRect에 반영된다", async () => {
    const { backend } = await open();
    drag(title(), 10, 10);
    await waitFor(() => expect(backend.savedStates.at(-1)?.previewRect).toEqual({ ...BASE, x: BASE.x + 10, y: BASE.y + 10 }), { timeout: 3000 });
  });

  it("움직이지 않고 클릭만 하면 기본 배치 그대로다", async () => {
    await open();
    drag(title(), 0, 0);
    expect(current().style.left).toBe("");
  });
});

describe("미리보기 창 크기", () => {
  const saved: PreviewRect = { x: 200, y: 100, w: 600, h: 400 };

  it("오른쪽·아래 가장자리는 크기만, 왼쪽·위 가장자리는 위치도 바꾼다", async () => {
    await open(saved);
    drag(handle("e"), 50, 0);
    await waitFor(() => expect(box(current())).toEqual({ ...saved, w: 650 }));
    drag(handle("s"), 0, 20);
    await waitFor(() => expect(box(current())).toEqual({ ...saved, w: 650, h: 420 }));
    drag(handle("w"), -30, 0);
    await waitFor(() => expect(box(current())).toEqual({ x: 170, y: 100, w: 680, h: 420 }));
    drag(handle("n"), 0, -10);
    await waitFor(() => expect(box(current())).toEqual({ x: 170, y: 90, w: 680, h: 430 }));
  });

  it("모서리는 두 방향을 함께 바꾼다", async () => {
    await open(saved);
    drag(handle("se"), 20, 30);
    await waitFor(() => expect(box(current())).toEqual({ ...saved, w: 620, h: 430 }));
    drag(handle("nw"), 10, 10);
    await waitFor(() => expect(box(current())).toEqual({ x: 210, y: 110, w: 610, h: 420 }));
  });

  it("최소 크기보다 작아지지 않고 반대편 변은 제자리에 남는다", async () => {
    await open(saved);
    drag(handle("w"), 900, 0);
    await waitFor(() => expect(box(current())).toMatchObject({ w: 320, x: 480 }));
    drag(handle("s"), 0, -900);
    await waitFor(() => expect(box(current())).toMatchObject({ h: 200, y: 100 }));
  });

  it("화면보다 커지지 않는다", async () => {
    await open(saved);
    drag(handle("e"), 5000, 0);
    drag(handle("s"), 0, 5000);
    await waitFor(() => expect(box(current())).toMatchObject({ w: VW, h: VH }));
  });

  it("기본 배치에서 바로 크기를 바꿔도 기본 크기에서 이어진다", async () => {
    await open();
    drag(handle("e"), 16, 0);
    await waitFor(() => expect(box(current())).toEqual({ ...BASE, w: BASE.w + 16 }));
  });
});

describe("미리보기 창 기억", () => {
  const saved: PreviewRect = { x: 200, y: 100, w: 600, h: 400 };

  it("저장된 위치·크기로 열린다", async () => {
    await open(saved);
    expect(box(current())).toEqual(saved);
  });

  it("닫았다 다시 열거나 다른 파일로 넘겨도 유지된다", async () => {
    const { user } = await open();
    drag(title(), 30, 20);
    const moved = { ...BASE, x: BASE.x + 30, y: BASE.y + 20 };
    await waitFor(() => expect(box(current())).toEqual(moved));
    await user.keyboard("{ArrowDown}");
    await screen.findByRole("dialog", { name: "미리보기: b.txt" });
    expect(box(current())).toEqual(moved);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: /미리보기/ })).toBeNull();
    await user.keyboard("{ArrowRight}");
    await screen.findByRole("dialog", { name: /미리보기/ });
    expect(box(current())).toEqual(moved);
  });

  it("제목 줄을 더블클릭하면 기본 크기·가운데로 돌아간다", async () => {
    await open(saved);
    fireEvent.doubleClick(title());
    await waitFor(() => expect(current().style.left).toBe(""));
  });

  it("화면 밖에 걸린 저장 값은 열 때 화면 안으로 보정한다", async () => {
    await open({ x: 5000, y: 5000, w: 9000, h: 10 });
    expect(box(current())).toEqual({ x: VW - 64, y: VH - 32, w: VW, h: 200 });
  });
});
