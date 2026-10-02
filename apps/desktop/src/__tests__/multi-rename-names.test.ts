import { describe, expect, it } from "vitest";
import { buildNewNames, DEFAULT_RENAME_OPTIONS, needsTempStep, splitName, validateNames } from "../lib/multiRename";
import type { RenameItem, RenameOptions } from "../lib/multiRename";

const file = (name: string): RenameItem => ({ name, isDir: false });
const dir = (name: string): RenameItem => ({ name, isDir: true });
const opts = (o: Partial<RenameOptions> = {}): RenameOptions => ({ ...DEFAULT_RENAME_OPTIONS, ...o });
const names = (items: RenameItem[], o: Partial<RenameOptions> = {}) => buildNewNames(items, opts(o));

describe("splitName", () => {
  it("맨 앞의 점은 확장자가 아니다", () => {
    expect(splitName(".gitignore", false)).toEqual({ stem: ".gitignore", ext: "" });
    expect(splitName("Cargo.lock", false)).toEqual({ stem: "Cargo", ext: "lock" });
    expect(splitName("a.tar.gz", false)).toEqual({ stem: "a.tar", ext: "gz" });
    expect(splitName("noext", false)).toEqual({ stem: "noext", ext: "" });
    expect(splitName("my.folder", true)).toEqual({ stem: "my.folder", ext: "" });
  });
});

describe("buildNewNames", () => {
  it("기본 마스크는 이름을 바꾸지 않는다", () => {
    const items = [file("a.txt"), file(".nvmrc"), dir("d.x")];
    expect(names(items)).toEqual(["a.txt", ".nvmrc", "d.x"]);
  });

  it("스크린샷 예시: 확장자 마스크 ts", () => {
    const items = ["Cargo.lock", ".gitignore", "icon.png", "justfile", "README.md", "rust-toolchain.toml", "bun.lock"].map(file);
    expect(names(items, { extMask: "ts" })).toEqual(["Cargo.ts", ".gitignore.ts", "icon.ts", "justfile.ts", "README.ts", "rust-toolchain.ts", "bun.ts"]);
  });

  it("[N]·[E]·[C] 조합과 카운터(시작·간격·너비)", () => {
    const items = [file("a.jpg"), file("b.jpg"), file("c.png")];
    expect(names(items, { nameMask: "photo_[C]", start: 1, step: 1, width: 3 })).toEqual(["photo_001.jpg", "photo_002.jpg", "photo_003.png"]);
    expect(names(items, { nameMask: "[N]-[C]", start: 10, step: 5, width: 1 })).toEqual(["a-10.jpg", "b-15.jpg", "c-20.png"]);
    expect(names(items, { nameMask: "[E]_[N]", extMask: "[E]" })).toEqual(["jpg_a.jpg", "jpg_b.jpg", "png_c.png"]);
  });

  it("폴더는 확장자를 붙이지 않고 확장자 마스크가 비면 확장자를 뺀다", () => {
    expect(names([dir("v1.2")], { extMask: "ts" })).toEqual(["v1.2"]);
    expect(names([file("a.txt")], { extMask: "" })).toEqual(["a"]);
  });

  it("대소문자 변환은 이름과 확장자에 따로 적용된다", () => {
    expect(names([file("Hello World.TXT")], { nameCase: "upper", extCase: "lower" })).toEqual(["HELLO WORLD.txt"]);
    expect(names([file("hELLO.TXT")], { nameCase: "title", extCase: "title" })).toEqual(["Hello.Txt"]);
    expect(names([file("ABC.DEF")], { nameCase: "lower" })).toEqual(["abc.DEF"]);
  });

  it("찾기·바꾸기: 일반 문자열은 정규식 문자를 그대로 찾는다", () => {
    expect(names([file("a.b.txt")], { find: ".", replace: "_" })).toEqual(["a_b_txt"]);
    expect(names([file("x(1).txt")], { find: "(1)", replace: "" })).toEqual(["x.txt"]);
  });

  it("찾기·바꾸기: 대소문자 구분, 1x(첫 번째만), 정규식", () => {
    expect(names([file("aAa.txt")], { find: "a", replace: "-" })).toEqual(["---.txt"]);
    expect(names([file("aAa.txt")], { find: "a", replace: "-", caseSensitive: true })).toEqual(["-A-.txt"]);
    expect(names([file("aaa.txt")], { find: "a", replace: "-", firstOnly: true })).toEqual(["-aa.txt"]);
    expect(names([file("img_2024_05.png")], { find: "(\\d+)_(\\d+)", replace: "$2-$1", regex: true })).toEqual(["img_05-2024.png"]);
  });

  it("잘못된 정규식은 이름을 바꾸지 않는다", () => {
    expect(names([file("a.txt")], { find: "(", replace: "x", regex: true })).toEqual(["a.txt"]);
  });

  it("마스크 → 대소문자 → 찾기 순서로 적용된다", () => {
    expect(names([file("a.txt")], { nameMask: "[N]_x", nameCase: "upper", find: "_X", replace: "!" })).toEqual(["A!.txt"]);
  });
});

describe("validateNames", () => {
  const items = [file("a.txt"), file("b.txt")];
  const ok = (n: string[], existing = ["a.txt", "b.txt", "z.txt"]) => validateNames(items, n, existing);

  it("문제가 없거나 바뀌지 않은 행은 null이다", () => {
    expect(ok(["a.txt", "c.txt"])).toEqual([null, null]);
  });

  it("새 이름 중복", () => {
    expect(ok(["x.txt", "x.txt"])).toEqual(["새 이름이 겹칩니다", "새 이름이 겹칩니다"]);
  });

  it("폴더 안 기존 파일과 충돌", () => {
    expect(ok(["z.txt", "c.txt"])).toEqual(["같은 이름의 파일이 이미 있습니다", null]);
  });

  it("빈 이름·.·..·/ 포함", () => {
    expect(ok(["", "c.txt"])[0]).toBe("이름이 비었습니다");
    expect(ok(["..", "c.txt"])[0]).toBe("사용할 수 없는 이름입니다");
    expect(ok(["a/b", "c.txt"])[0]).toBe("이름에 사용할 수 없는 문자가 있습니다");
  });

  it("선택 안의 맞바꾸기와 연쇄 변경은 오류가 아니다", () => {
    expect(ok(["b.txt", "a.txt"])).toEqual([null, null]); // 맞바꾸기
    const chain = [file("1.txt"), file("2.txt")];
    expect(validateNames(chain, ["2.txt", "3.txt"], ["1.txt", "2.txt"])).toEqual([null, null]); // 1→2, 2→3
  });

  it("선택하지 않은 파일이 쓰는 이름과는 충돌한다", () => {
    expect(validateNames([file("a.txt")], ["z.txt"], ["a.txt", "z.txt"])).toEqual(["같은 이름의 파일이 이미 있습니다"]);
  });

  it("NFC/NFD 차이는 같은 이름으로 본다", () => {
    const nfd = "한글".normalize("NFD");
    expect(validateNames([file("a.txt")], [nfd], ["한글".normalize("NFC")])).toEqual(["같은 이름의 파일이 이미 있습니다"]);
  });
});

describe("needsTempStep", () => {
  it("새 이름이 다른 바뀌는 행의 옛 이름이면 임시 이름이 필요하다", () => {
    expect(needsTempStep([file("a"), file("b")], ["b", "a"])).toBe(true);
    expect(needsTempStep([file("1"), file("2")], ["2", "3"])).toBe(true);
    expect(needsTempStep([file("a"), file("b")], ["x", "y"])).toBe(false);
    expect(needsTempStep([file("a"), file("b")], ["a", "y"])).toBe(false);
  });
});
