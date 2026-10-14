import { describe, expect, it } from "vitest";
import type { Config, EntryDto } from "@twin-deck/ts-client";
import { defaultLoaded } from "@twin-deck/ts-client";
import { parseColumn, parseColumns, withColumnWidth } from "../lib/columns";
import { cellText, formatDate, formatOctal, formatPermissions, formatSize, formatSpace, strftime } from "../lib/format";
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
  linkIsDir: false,
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

describe("심볼릭 링크 정렬 (이슈 #47)", () => {
  // 폴더를 가리키는 링크는 kind가 symlink이고 linkIsDir가 true다. 파일을 가리키거나 끊어진 링크는 linkIsDir가 false다.
  const dirLink = (name: string, o: Partial<EntryDto> = {}) => entry(name, { kind: "symlink", linkIsDir: true, ...o });
  const list = [
    entry("b.txt", { size: 5, modifiedMs: 300 }),
    dirLink("Mlink", { size: 1, modifiedMs: 50 }),
    entry("zdir", { kind: "dir", size: 0, modifiedMs: 400 }),
    entry("file-link", { kind: "symlink", size: 9, modifiedMs: 100 }), // 파일을 가리키는 링크
    entry("adir", { kind: "dir", size: 0, modifiedMs: 10 }),
    entry("broken", { kind: "symlink", size: 0, modifiedMs: 20 }), // 끊어진 링크
    dirLink("alink", { size: 3, modifiedMs: 500 }),
    entry("c.zip", { size: 7, modifiedMs: 200 }),
  ];
  const names = (es: EntryDto[]) => es.map((e) => e.name);
  const FOLDERS = ["adir", "alink", "Mlink", "zdir"]; // 이름 오름차순(대소문자 무시)으로 진짜 폴더와 링크가 섞인다

  it("이름 오름차순: 폴더 링크가 진짜 폴더와 섞여 위에 오고, 파일·파일 링크·끊어진 링크는 그 아래에 남는다", () => {
    expect(names(sortEntries(list, DEFAULT_SORT))).toEqual([...FOLDERS, "b.txt", "broken", "c.zip", "file-link"]);
  });
  it("이름 내림차순에서도 폴더 링크는 폴더 묶음 안에 있다", () => {
    expect(names(sortEntries(list, { key: "name", dir: "desc" }))).toEqual(["zdir", "Mlink", "alink", "adir", "file-link", "c.zip", "broken", "b.txt"]);
  });
  it("크기·수정일·확장자 정렬(오름·내림)에서도 폴더 링크가 모든 파일보다 앞이다", () => {
    for (const key of ["size", "modified", "extension"] as const) {
      for (const dir of ["asc", "desc"] as const) {
        const out = names(sortEntries(list, { key, dir }));
        const firstFile = out.findIndex((n) => !FOLDERS.includes(n));
        expect(firstFile, `${key} ${dir}: ${out.join()}`).toBe(4); // 앞의 4개가 폴더 묶음
        expect(out.slice(0, 4).sort()).toEqual([...FOLDERS].sort());
      }
    }
  });
  it("폴더 묶음 안에서는 선택한 기준으로 진짜 폴더와 링크가 함께 정렬된다(링크가 뒤로 몰리지 않는다)", () => {
    // 수정일 내림차순: alink(500) > zdir(400) > Mlink(50) > adir(10)
    expect(names(sortEntries(list, { key: "modified", dir: "desc" })).slice(0, 4)).toEqual(["alink", "zdir", "Mlink", "adir"]);
  });
  it("파일을 가리키는 링크와 끊어진 링크는 항상 파일 쪽에 있다", () => {
    for (const sort of [DEFAULT_SORT, { key: "size", dir: "desc" } as const]) {
      const out = names(sortEntries(list, sort));
      expect(out.indexOf("file-link")).toBeGreaterThanOrEqual(4);
      expect(out.indexOf("broken")).toBeGreaterThanOrEqual(4);
    }
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
  it("확장자 셀은 파일만 확장자를 보여 주고 폴더는 비운다", () => {
    const f = entry("Report.TXT", { size: 2048, mode: 0o644 });
    const dir = entry("d", { kind: "dir", mode: 0o755 });
    expect(cellText(f, "name", display())).toBe("Report.TXT");
    expect(cellText(f, "extension", display())).toBe("TXT");
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

describe("퍼지 검색 (ACT-01)", () => {
  it("부분 수열이면 일치하고 아니면 null", async () => {
    const { fuzzyScore } = await import("../lib/fuzzy");
    expect(fuzzyScore("cpy", "core.copy")).not.toBeNull();
    expect(fuzzyScore("복사", "복사")).not.toBeNull();
    expect(fuzzyScore("xyz", "core.copy")).toBeNull();
    expect(fuzzyScore("", "anything")).toBe(0);
    expect(fuzzyScore("c p y", "core.copy")).not.toBeNull(); // 공백 무시
    expect(fuzzyScore("COPY", "core.copy")).not.toBeNull(); // 대소문자 무시
  });
  it("연속 일치와 단어 시작, 짧은 문자열을 선호한다", async () => {
    const { fuzzyScore, rankBy } = await import("../lib/fuzzy");
    // 연속 일치가 흩어진 일치보다 낫다(탐욕적 매칭이 core의 c를 잡아도 core.copy의 연속 일치를 찾는다)
    expect(fuzzyScore("copy", "core.copy")!).toBeGreaterThan(fuzzyScore("copy", "core.c_o_p_y_x")!);
    expect(fuzzyScore("copy", "copy.x")!).toBeGreaterThan(fuzzyScore("copy", "x.copy")!); // 앞쪽/맨 앞
    expect(fuzzyScore("cp", "core.copy")!).toBeGreaterThan(0); // 흩어진 일치도 일치
    const ids = ["core.copy.to_inactive", "core.path.copy_folder", "core.path.copy_files", "core.copy", "core.recent.clear"];
    expect(rankBy(ids, "copy", (s) => [s])[0]).toBe("core.copy");
    expect(rankBy(ids, "copy", (s) => [s])).not.toContain("core.recent.clear");
    // 연속 일치가 부분 수열 일치보다 앞선다
    expect(rankBy(["c_o_p_y", "xcopyx"], "copy", (s) => [s])[0]).toBe("xcopyx");
    expect(rankBy(ids, "", (s) => [s])).toEqual(ids); // 빈 질의는 원래 순서
  });
});

describe("formatSpace (볼륨 용량)", () => {
  it("항상 소수 한 자리로, formatSize와 같은 단위 규칙을 쓴다", () => {
    expect(formatSpace(73.8e9, "adaptive")).toBe("73.8 GB");
    expect(formatSpace(500e9, "adaptive")).toBe("500.0 GB");
    expect(formatSpace(1.5e12, "adaptive")).toBe("1.5 TB");
    expect(formatSpace(2 * 1024 ** 3, "adaptive_kibi")).toBe("2.0 GiB");
    expect(formatSpace(73.8e9, "MB")).toBe("73800.0 MB");
    expect(formatSpace(512, "adaptive")).toBe("512 B");
    expect(formatSpace(1234, "bytes")).toBe("1234 B");
  });
});

describe("컬럼 너비 반영", () => {
  it("대상 컬럼의 너비만 바꾸고 순서와 다른 컬럼은 그대로 둔다", () => {
    expect(withColumnWidth(["name", "size", "modified:140"], "size", 110)).toEqual(["name", "size:110", "modified:140"]);
  });
  it("너비가 없던 컬럼에 너비를 더하고 기존 너비는 바꾼다", () => {
    expect(withColumnWidth(["name", "size:90"], "size", 120)).toEqual(["name", "size:120"]);
    expect(withColumnWidth(["name", "modified"], "modified", 150)).toEqual(["name", "modified:150"]);
  });
  it("정렬 표시를 보존한다", () => {
    expect(withColumnWidth(["name", ">size", "<modified:100"], "modified", 130)).toEqual(["name", ">size", "<modified:130"]);
    expect(withColumnWidth(["name", ">size"], "size", 80)).toEqual(["name", ">size:80"]);
  });
  it("최소 40, 최대 600으로 자른다", () => {
    expect(withColumnWidth(["name", "size"], "size", 5)).toEqual(["name", "size:40"]);
    expect(withColumnWidth(["name", "size"], "size", 9999)).toEqual(["name", "size:600"]);
  });
  it("정수로 반올림한다", () => {
    expect(withColumnWidth(["name", "size"], "size", 100.6)).toEqual(["name", "size:101"]);
  });
  it("목록에 없는 컬럼이면 그대로 돌려준다", () => {
    expect(withColumnWidth(["name", "size"], "created", 100)).toEqual(["name", "size"]);
  });
});
