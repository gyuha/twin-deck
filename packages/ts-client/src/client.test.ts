import { describe, expect, it, vi } from "vitest";
import { FakeBackend, baseName, joinPath, parentPath } from "./index";

const fs = () =>
  new FakeBackend().seed({
    "/a/x.txt": "x",
    "/a/.hidden": "h",
    "/a/dir/inner.txt": "i",
    "/b": null,
  });

describe("경로 유틸", () => {
  it("join/parent/baseName", () => {
    expect(joinPath("/a", "b")).toBe("/a/b");
    expect(joinPath("/", "b")).toBe("/b");
    expect(parentPath("/a/b")).toBe("/a");
    expect(parentPath("/a")).toBe("/");
    expect(parentPath("/")).toBeNull();
    expect(baseName("/a/b.txt")).toBe("b.txt");
  });
});

describe("FakeBackend는 Backend 포트를 만족하고 Rust 규칙을 따른다", () => {
  it("목록: 폴더 먼저 정렬, 숨김 필터", async () => {
    const b = fs();
    expect((await b.listDir("/a", false)).map((e) => e.name)).toEqual(["dir", "x.txt"]);
    expect((await b.listDir("/a", true)).map((e) => e.name)).toContain(".hidden");
  });

  it("충돌 3종", async () => {
    const b = fs().seed({ "/b/x.txt": "old", "/b/x (1).txt": "old1" });
    expect(await b.detectConflict("/a/x.txt", "/b")).toBe("/b/x.txt");
    expect(await b.copy("/a/x.txt", "/b", "skip")).toEqual({ type: "skipped" });
    expect(b.read("/b/x.txt")).toBe("old");
    expect(await b.copy("/a/x.txt", "/b", "rename")).toEqual({ type: "done", path: "/b/x (2).txt" });
    await b.copy("/a/x.txt", "/b", "overwrite");
    expect(b.read("/b/x.txt")).toBe("x");
  });

  it("폴더 복사/이동/이름 변경/삭제/휴지통", async () => {
    const b = fs();
    await b.copy("/a/dir", "/b", "skip");
    expect(b.read("/b/dir/inner.txt")).toBe("i");
    await b.move("/a/dir", "/b", "rename");
    expect(b.exists("/a/dir")).toBe(false);
    expect(await b.rename("/b/dir (1)/inner.txt", "z.txt")).toBe("/b/dir (1)/z.txt");
    await b.trash("/a/x.txt");
    expect(b.trashed).toEqual(["/a/x.txt"]);
    expect(b.exists("/a/x.txt")).toBe(false);
    await b.deletePermanent("/b/dir");
    expect(b.exists("/b/dir/inner.txt")).toBe(false);
  });

  it("오류: 하위로 복사, 잘못된 이름, 없는 경로", async () => {
    const b = fs();
    await expect(b.copy("/a/dir", "/a/dir", "rename")).rejects.toThrow();
    await expect(b.rename("/a/x.txt", "a/b")).rejects.toThrow();
    await expect(b.listDir("/nope", false)).rejects.toThrow();
  });

  it("감시 중인 디렉터리 변경만 알린다", async () => {
    const b = fs();
    const cb = vi.fn();
    const off = b.onDirChanged(cb);
    await b.watch("/b");
    await b.touch("/a/new");
    expect(cb).not.toHaveBeenCalled();
    await b.touch("/b/new");
    expect(cb).toHaveBeenCalledWith("/b");
    off();
    await b.touch("/b/other");
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
