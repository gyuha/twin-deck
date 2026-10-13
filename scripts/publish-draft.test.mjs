import { describe, expect, test } from "bun:test";
import { publishProblems } from "./publish-draft.mjs";

const SHA = "a".repeat(40);
const assets = (...names) => names.map((name) => ({ name }));
const ok = () => ({
  release: {
    draft: true,
    target_commitish: SHA,
    assets: assets("twin-deck-1.0.0-macos-arm64.zip", "twin-deck-1.0.0-windows-x64-setup.exe", "latest.json"),
  },
  sha: SHA,
  manifest: { platforms: { "darwin-aarch64": {}, "windows-x86_64": {} } },
  version: "1.0.0",
});

describe("publishProblems", () => {
  test("모든 조건이 맞으면 막는 이유가 없다", () => {
    expect(publishProblems(ok())).toEqual([]);
  });

  test("릴리스가 없으면 막는다", () => {
    expect(publishProblems({ ...ok(), release: undefined })).toEqual(["v1.0.0 릴리스가 없습니다"]);
  });

  test("이미 공개된 릴리스는 막는다", () => {
    const a = ok();
    a.release.draft = false;
    expect(publishProblems(a)).toEqual(["v1.0.0은 이미 공개된 릴리스입니다. 버전을 올리세요"]);
  });

  test("대상 커밋이 HEAD와 다르면 막는다", () => {
    const a = ok();
    a.release.target_commitish = "b".repeat(40);
    expect(publishProblems(a)).toEqual(["초안은 bbbbbbb 커밋 기준인데 지금은 aaaaaaa입니다"]);
  });

  test("macOS 또는 Windows 파일이 없으면 각각 알려 준다", () => {
    const a = ok();
    a.release.assets = assets("latest.json");
    expect(publishProblems(a)).toEqual(["macOS용 파일이 없습니다", "Windows용 파일이 없습니다"]);
  });

  test("latest.json에 플랫폼 항목이 빠졌으면 막는다", () => {
    const a = ok();
    a.manifest = { platforms: { "darwin-aarch64": {} } };
    expect(publishProblems(a)).toEqual(["latest.json에 windows-x86_64 항목이 없습니다"]);
  });

  test("latest.json이 없으면 두 항목 모두 없는 것으로 막는다", () => {
    const a = ok();
    a.manifest = null;
    expect(publishProblems(a)).toHaveLength(2);
  });
});
