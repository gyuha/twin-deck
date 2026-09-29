import { describe, expect, it } from "vitest";
import type { Config, EntryDto } from "@twin-deck/ts-client";
import { defaultLoaded } from "@twin-deck/ts-client";
import { parseColumn, parseColumns } from "../lib/columns";
import { cellText, formatDate, formatOctal, formatPermissions, formatSize, strftime } from "../lib/format";
import { DEFAULT_SORT, sortEntries, sortFromColumns } from "../lib/sort";

const display = (over: Partial<Config["display"]> = {}): Config["display"] => ({ ...defaultLoaded().config.display, ...over });

const entry = (name: string, o: Partial<EntryDto> = {}): EntryDto => ({
  name,
  path: `/x/${name}`,
  kind: "file",
  size: 0,
  modifiedMs: null,
  createdMs: null,
  mode: null,
  hidden: false,
  ...o,
});

describe("columns_spec_parse (TS)", () => {
  it("Rust와 같은 규칙으로 해석한다", () => {
    expect(parseColumn("name")).toEqual({ name: "name", sort: null, width: null });
    expect(parseColumn(">extension:50")).toEqual({ name: "extension", sort: "desc", width: 50 });
    expect(parseColumn("<modified")).toEqual({ name: "modified", sort: "asc", width: null });
    for (const bad of ["", "<", "colour", "size:abc", "size:0", "size:-3", "size:", ":5", "<>name", "Name"]) {
      expect(parseColumn(bad), bad).toBeNull();
    }
  });
  it("잘못된 항목은 빼고 name을 앞에 보장한다", () => {
    expect(parseColumns(["size", "colour", ">extension:50"]).map((c) => c.name)).toEqual(["name", "size", "extension"]);
    expect(parseColumns([]).map((c) => c.name)).toEqual(["name"]);
    expect(sortFromColumns(parseColumns(["name", ">extension"]))).toEqual({ key: "extension", dir: "desc" });
    expect(sortFromColumns(parseColumns(["name", "size"]))).toBeNull();
  });
});

describe("크기 포맷 (CFG-05)", () => {
  it.each([
    [0, "adaptive", "0 B"],
    [999, "adaptive", "999 B"],
    [1500, "adaptive", "1.5 KB"],
    [15_000, "adaptive", "15 KB"],
    [2_500_000, "adaptive", "2.5 MB"],
    [1536, "adaptive_kibi", "1.5 KiB"],
    [1536, "bytes", "1536 B"],
    [1_500_000, "MB", "1.5 MB"],
    [1_048_576, "MiB", "1.0 MiB"],
    [5, "KB", "0.0 KB"],
  ])("%d B / %s → %s", (n, fmt, out) => {
    expect(formatSize(n, fmt)).toBe(out);
  });
});

describe("날짜 포맷 (CFG-05)", () => {
  const d = new Date(2026, 8, 3, 7, 5, 9); // 2026-09-03 07:05:09 (Thu), 로컬 시간
  it("strftime 부분집합", () => {
    expect(strftime("%Y-%m-%d %H:%M:%S", d)).toBe("2026-09-03 07:05:09");
    expect(strftime("%-d %b %Y", d)).toBe("3 Sep 2026");
    expect(strftime("%e|%y|%B|%a|%A", d)).toBe(" 3|26|September|Thu|Thursday");
    expect(strftime("%I:%M %p", d)).toBe("07:05 AM");
    expect(strftime("%-m/%-d %%", d)).toBe("9/3 %");
    expect(strftime("%Q", d)).toBe("%Q"); // 모르는 지시자는 그대로
  });
  it("상대 날짜: 오늘/어제, 그 밖은 절대 표기", () => {
    const now = new Date(2026, 8, 3, 18, 0).getTime();
    const cfg = display({ relative_date: true, date_format: "%Y-%m-%d", time_format: "%H:%M" });
    expect(formatDate(d.getTime(), cfg, now)).toBe("오늘 07:05");
    expect(formatDate(new Date(2026, 8, 2, 23, 59).getTime(), cfg, now)).toBe("어제 23:59");
    expect(formatDate(new Date(2026, 7, 1).getTime(), cfg, now)).toBe("2026-08-01");
    expect(formatDate(d.getTime(), { ...cfg, relative_date: false }, now)).toBe("2026-09-03");
    expect(formatDate(null, cfg, now)).toBe("");
  });
});

describe("권한 표시", () => {
  it("rwx와 8진", () => {
    expect(formatPermissions(0o755)).toBe("rwxr-xr-x");
    expect(formatPermissions(0o640)).toBe("rw-r-----");
    expect(formatPermissions(null)).toBe("");
    expect(formatOctal(0o644)).toBe("644");
    expect(formatOctal(0o4755)).toBe("755");
    expect(formatOctal(0o7)).toBe("007");
  });
  it("cellText", () => {
    const f = entry("Report.TXT", { size: 2048, mode: 0o644 });
    const dir = entry("d", { kind: "dir", mode: 0o755 });
    expect(cellText(f, "extension", display())).toBe("txt");
    expect(cellText(dir, "extension", display())).toBe("");
    expect(cellText(dir, "size", display())).toBe("");
    expect(cellText(f, "size", display())).toBe("2.0 KB");
    expect(cellText(f, "permissions_octal", display())).toBe("644");
    expect(cellText(f, "added", display())).toBe("—");
  });
});

describe("정렬", () => {
  const list = [
    entry("b.txt", { size: 5, modifiedMs: 300 }),
    entry("A.md", { size: 50, modifiedMs: null }),
    entry("zdir", { kind: "dir" }),
    entry("c.zip", { size: 5, modifiedMs: 100 }),
    entry("adir", { kind: "dir" }),
    entry(`${"한".normalize("NFD")}.txt`, { size: 1, modifiedMs: 200 }),
  ];
  const names = (es: EntryDto[]) => es.map((e) => e.name.normalize("NFC"));

  it("이름: 폴더 먼저, 대소문자 무시, NFD/NFC 통합", () => {
    expect(names(sortEntries(list, DEFAULT_SORT))).toEqual(["adir", "zdir", "A.md", "b.txt", "c.zip", "한.txt"]);
    // 내림차순에서도 폴더가 먼저 (폴더끼리는 역순)
    expect(names(sortEntries(list, { key: "name", dir: "desc" }))).toEqual(["zdir", "adir", "한.txt", "c.zip", "b.txt", "A.md"]);
  });
  it("크기: 같은 크기는 이름순, 내림차순에서도 폴더가 먼저", () => {
    expect(names(sortEntries(list, { key: "size", dir: "asc" }))).toEqual(["adir", "zdir", "한.txt", "b.txt", "c.zip", "A.md"]);
    expect(names(sortEntries(list, { key: "size", dir: "desc" }))).toEqual(["adir", "zdir", "A.md", "b.txt", "c.zip", "한.txt"]);
  });
  it("수정 시각: 값이 없는 항목은 정렬 방향과 상관없이 끝", () => {
    expect(names(sortEntries(list, { key: "modified", dir: "asc" }))).toEqual(["adir", "zdir", "c.zip", "한.txt", "b.txt", "A.md"]);
    expect(names(sortEntries(list, { key: "modified", dir: "desc" }))).toEqual(["adir", "zdir", "b.txt", "한.txt", "c.zip", "A.md"]);
  });
  it("확장자", () => {
    expect(names(sortEntries(list, { key: "extension", dir: "asc" })).slice(2)).toEqual(["A.md", "b.txt", "한.txt", "c.zip"]);
  });
  it("원본을 바꾸지 않는다", () => {
    const before = list.map((e) => e.name);
    sortEntries(list, { key: "size", dir: "desc" });
    expect(list.map((e) => e.name)).toEqual(before);
  });
});
