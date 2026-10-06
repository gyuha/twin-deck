import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";

describe("FakeBackend 폴더 용량", () => {
  const seed = () =>
    new FakeBackend().seed({
      "/home/a/proj/a.txt": "x".repeat(100),
      "/home/a/proj/.hidden": "y".repeat(7),
      "/home/a/proj/sub/b.bin": "z".repeat(2000),
      "/home/a/proj/sub/deep/c": "w".repeat(30),
      "/home/a/empty": null,
      "/home/a/f.txt": "abc",
    });

  it("하위 파일 크기를 모두 더한다(숨김 파일 포함)", async () => {
    const b = seed();
    expect(await b.dirSize("/home/a/proj")).toBe(2137);
    expect(await b.dirSize("/home/a/empty")).toBe(0);
  });

  it("호출한 경로를 기록한다", async () => {
    const b = seed();
    await b.dirSize("/home/a/proj");
    await b.dirSize("/home/a/empty");
    expect(b.dirSizeCalls).toEqual(["/home/a/proj", "/home/a/empty"]);
  });

  it("없는 경로와 파일은 오류다", async () => {
    const b = seed();
    await expect(b.dirSize("/home/a/nope")).rejects.toThrow();
    await expect(b.dirSize("/home/a/f.txt")).rejects.toThrow();
  });

  it("계산 중에 취소하면 null이다", async () => {
    const b = seed();
    b.dirSizeDelayMs = 60;
    const p = b.dirSize("/home/a/proj");
    await b.cancelDirSize("/home/a/proj");
    expect(await p).toBeNull();
  });
});
