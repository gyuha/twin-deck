import { describe, expect, it } from "vitest";
import type { OpenPathsDto } from "./generated/bindings";
import { FakeBackend } from "./fake";

const req = (folder: string): OpenPathsDto => ({ left: { folder, focus: null }, right: null, error: null });

describe("td 명령: 시작 경로 계약 (FakeBackend)", () => {
  it("시작 경로는 한 번만 가져갈 수 있고 가져가면 비운다", async () => {
    const b = new FakeBackend();
    expect(await b.takeLaunchPaths()).toBeNull(); // 인수 없이 시작
    b.launchPaths = req("/home/a");
    expect(await b.takeLaunchPaths()).toEqual(req("/home/a"));
    expect(await b.takeLaunchPaths()).toBeNull(); // 두 번 적용되지 않는다
  });

  it("실행 중인 앱에 넘어온 경로가 구독자에게 오고, 해제하면 더는 오지 않는다", () => {
    const b = new FakeBackend();
    const got: OpenPathsDto[] = [];
    const off = b.onOpenPaths((r) => got.push(r));
    b.emitOpenPaths(req("/home/b"));
    expect(got).toEqual([req("/home/b")]);
    off();
    b.emitOpenPaths(req("/home/c"));
    expect(got).toHaveLength(1);
  });

  it("오류 요청도 그대로 전달된다", () => {
    const b = new FakeBackend();
    const got: OpenPathsDto[] = [];
    b.onOpenPaths((r) => got.push(r));
    b.emitOpenPaths({ left: null, right: null, error: "경로를 찾을 수 없습니다: x" });
    expect(got[0].error).toContain("x");
  });
});
