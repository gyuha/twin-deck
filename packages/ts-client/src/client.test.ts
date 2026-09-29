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

  it("큐: instant 모드는 즉시 실행하고 오류를 요약한다", async () => {
    const b = fs();
    const seen: string[] = [];
    b.onQueueChanged((jobs) => seen.push(jobs.map((j) => j.status).join(",")));
    const id = await b.enqueue("copy", [
      { src: "/a/x.txt", destDir: "/b", policy: "skip" },
      { src: "/a/none", destDir: "/b", policy: "skip" },
    ]);
    const [job] = await b.queueJobs();
    expect(job).toMatchObject({ id, status: "failed", total: 2, completed: 2 });
    expect(job.errors).toHaveLength(1);
    expect(b.exists("/b/x.txt")).toBe(true);
    await b.queueClearFinished();
    expect(await b.queueJobs()).toEqual([]);
    expect(seen.length).toBeGreaterThan(1);
  });

  it("큐: manual 모드는 advance마다 하나씩, 일시정지/재개/중단을 따른다", async () => {
    const b = fs().seed({ "/a/y.txt": "y", "/a/z.txt": "z" });
    b.queueMode = "manual";
    const id = await b.enqueue("copy", ["x", "y", "z"].map((n) => ({ src: `/a/${n}.txt`, destDir: "/b", policy: "skip" as const })));
    expect(b.exists("/b/x.txt")).toBe(false);
    await b.advance();
    expect(b.exists("/b/x.txt")).toBe(true);
    await b.queuePause(id);
    expect(await b.advance()).toBe(false);
    expect(b.exists("/b/y.txt")).toBe(false);
    await b.queueResume(id);
    await b.advance();
    expect(b.exists("/b/y.txt")).toBe(true);
    await b.queueAbort(id);
    expect(await b.advance()).toBe(false);
    expect(b.exists("/b/z.txt")).toBe(false);
    expect((await b.queueJobs())[0].status).toBe("aborted");
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
