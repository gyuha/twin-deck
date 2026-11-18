import { describe, expect, it } from "vitest";
import { FakeBackend } from "./fake";
import type { PreviewTargetDto } from "./generated/bindings";

const target = (path: string): PreviewTargetDto => ({ path, name: path.slice(path.lastIndexOf("/") + 1), is_dir: false, sheet: null });

describe("FakeBackend 미리보기 별도 창 (이슈 #160)", () => {
  it("보이기는 기록하고 미리보기 창 구독자에게 대상을 전달한다", async () => {
    const b = new FakeBackend();
    const got: PreviewTargetDto[] = [];
    b.onPreviewWindowTarget((t) => got.push(t));
    await b.previewWindowShow(target("/a.txt"));
    expect(got).toEqual([target("/a.txt")]);
    expect(b.previewWindowCalls).toEqual([{ type: "show", target: target("/a.txt") }]);
    expect(b.previewWindowVisible).toBe(true);
    expect(await b.previewWindowTarget()).toEqual(target("/a.txt"));
  });

  it("숨기기는 대상을 비우고 닫힘을 알리지 않는다", async () => {
    const b = new FakeBackend();
    let closed = 0;
    b.onPreviewWindowClosed(() => closed++);
    await b.previewWindowShow(target("/a.txt"));
    await b.previewWindowHide();
    expect(b.previewWindowVisible).toBe(false);
    expect(await b.previewWindowTarget()).toBeNull();
    expect(closed).toBe(0);
  });

  it("미리보기 창에서 닫으면 소유자에게 한 번만 알린다", async () => {
    const b = new FakeBackend();
    let closed = 0;
    const off = b.onPreviewWindowClosed(() => closed++);
    await b.previewWindowShow(target("/a.txt"));
    await b.previewWindowClose();
    await b.previewWindowClose();
    expect(closed).toBe(1);
    expect(b.previewWindowVisible).toBe(false);
    off();
    await b.previewWindowShow(target("/b.txt"));
    await b.previewWindowClose();
    expect(closed).toBe(1);
  });

  it("미리보기 창인지는 previewWindowMode를 따른다", () => {
    const b = new FakeBackend();
    expect(b.isPreviewWindow()).toBe(false);
    b.previewWindowMode = true;
    expect(b.isPreviewWindow()).toBe(true);
  });
});
