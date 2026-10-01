import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import manifest from "../manifest.json";
import { iconNameFor, iconFileName } from "./index";

describe("iconNameFor", () => {
  it("파일명 전체가 확장자보다 우선한다", () => {
    expect(iconNameFor("package.json", "file")).toBe("nodejs");
    expect(iconNameFor("Dockerfile", "file")).toBe("docker");
  });

  it("점으로 시작하는 파일도 파일명으로 맞춘다", () => {
    expect(iconNameFor(".gitignore", "file")).toBe("git");
  });

  it("확장자로 맞춘다", () => {
    expect(iconNameFor("main.ts", "file")).toBe("typescript");
    expect(iconNameFor("lib.rs", "file")).toBe("rust");
  });

  it("복합 확장자는 긴 것부터 맞춘다", () => {
    expect(iconNameFor("a.test.ts", "file")).toBe("test-ts");
    expect(iconNameFor("types.d.ts", "file")).toBe("typescript-def");
  });

  it("복합 확장자가 없으면 짧은 확장자로 내려간다", () => {
    expect(iconNameFor("a.unknownpart.ts", "file")).toBe("typescript");
  });

  it("대소문자를 구분하지 않는다", () => {
    expect(iconNameFor("MAIN.TS", "file")).toBe("typescript");
    expect(iconNameFor("PACKAGE.JSON", "file")).toBe("nodejs");
  });

  it("알 수 없는 이름과 확장자는 기본 파일 아이콘", () => {
    expect(iconNameFor("x.zzzzz", "file")).toBe("file");
    expect(iconNameFor("README_without_ext_zzzz", "file")).toBe("file");
  });

  it("폴더는 폴더명으로 맞추고 대소문자를 구분하지 않는다", () => {
    expect(iconNameFor("src", "dir")).toBe("folder-src");
    expect(iconNameFor("SRC", "dir")).toBe("folder-src");
    expect(iconNameFor("node_modules", "dir")).toBe("folder-node");
  });

  it("알 수 없는 폴더는 기본 폴더 아이콘, 확장자는 폴더에 적용하지 않는다", () => {
    expect(iconNameFor("my-unknown-dir-zzz", "dir")).toBe("folder");
    expect(iconNameFor("archive.ts", "dir")).toBe("folder");
  });

  it("심볼릭 링크는 파일 규칙으로 해석하고 폴더명 규칙은 쓰지 않는다", () => {
    expect(iconNameFor("main.ts", "symlink")).toBe("typescript");
    expect(iconNameFor("src", "symlink")).toBe("file");
  });

  it("빈 이름은 기본 아이콘", () => {
    expect(iconNameFor("", "file")).toBe("file");
    expect(iconNameFor("", "dir")).toBe("folder");
  });
});

describe("복사한 에셋의 일관성", () => {
  const names = new Set<string>();
  for (const map of [manifest.fileNames, manifest.fileExtensions, manifest.folderNames]) {
    for (const v of Object.values(map)) names.add(v);
  }
  names.add(manifest.file);
  names.add(manifest.folder);

  it("매니페스트가 참조하는 모든 아이콘의 SVG가 있다", () => {
    const missing = [...names].filter((n) => {
      const url = new URL(`../icons/${iconFileName(n)}`, import.meta.url);
      return !existsSync(fileURLToPath(url));
    });
    expect(missing).toEqual([]);
  });

  it("라이트 변형 SVG는 복사하지 않았다", () => {
    for (const n of names) expect(iconFileName(n)).not.toMatch(/_light\.svg$/);
  });
});
