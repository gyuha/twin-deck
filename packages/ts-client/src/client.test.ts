import { describe, expect, it, vi } from "vitest";
import { FakeBackend, archiveFileName, archiveRoot, baseName, expandPath, globMatch, isArchiveName, isArchivePath, joinPath, parentPath } from "./index";

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
    expect(job).toMatchObject({ id, status: "failed", total: 2, completed: 2, filesTotal: 2, filesDone: 2 });
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

describe("expandPath", () => {
  const dirs = { home: "/home/me", downloads: "/home/me/Downloads", documents: null, desktop: null, pictures: null, music: null, movies: null };
  it("~ 와 ${user.*} 를 확장한다", () => {
    expect(expandPath("~", dirs)).toBe("/home/me");
    expect(expandPath("~/work", dirs)).toBe("/home/me/work");
    expect(expandPath("${user.downloads}", dirs)).toBe("/home/me/Downloads");
    expect(expandPath("${user.downloads}/x", dirs)).toBe("/home/me/Downloads/x");
    expect(expandPath("/abs/path", dirs)).toBe("/abs/path");
  });
  it("알 수 없는 폴더는 null", () => {
    expect(expandPath("${user.documents}", dirs)).toBeNull();
    expect(expandPath("~/x", { ...dirs, home: null })).toBeNull();
  });
});

describe("FakeBackend 볼륨", () => {
  it("루트와 목록 밖은 거부하고 성공하면 목록에서 빠진다", async () => {
    const b = fs();
    await expect(b.unmountVolume("/")).rejects.toThrow();
    await expect(b.ejectVolume("/nope")).rejects.toThrow();
    await b.unmountVolume("/Volumes/USB");
    expect(b.unmounted).toEqual(["/Volumes/USB"]);
    expect((await b.listVolumes()).map((v) => v.mountPoint)).toEqual(["/"]);
  });
});

// Rust `glob_group_match`(crates/td-vfs/tests/info_glob.rs)와 같은 케이스 표. 한쪽을 고치면 다른 쪽도 고친다.
const GLOB_CASES: [string, string, boolean][] = [
  ["*", "anything", true],
  ["*", "", true],
  ["*.txt", "a.txt", true],
  ["*.txt", "A.TXT", true],
  ["*.txt", "a.txt.bak", false],
  ["a?c", "abc", true],
  ["a?c", "ac", false],
  ["a?c", "abbc", false],
  ["[abc].md", "b.md", true],
  ["[abc].md", "d.md", false],
  ["[a-c]*", "beta", true],
  ["[a-c]*", "delta", false],
  ["[!a-c]*", "delta", true],
  ["[^a-c]*", "beta", false],
  ["file[0-9][0-9]", "file07", true],
  ["file[0-9][0-9]", "file7", false],
  ["*a*b*", "xxaxxbxx", true],
  ["*a*b*", "xxbxxaxx", false],
  ["**", "x", true],
  ["a*", "a", true],
  ["[abc", "[abc", true],
  ["[]a]x", "]x", true],
  ["", "", true],
  ["", "a", false],
  ["*.tar.gz", "backup.tar.gz", true],
  ["한*", "한글.txt", true],
];

describe("globMatch는 Rust와 같은 결과를 낸다", () => {
  it.each(GLOB_CASES)("%j vs %j → %s", (pattern, name, want) => {
    expect(globMatch(pattern, name)).toBe(want);
  });
  it("NFD 이름과 병적인 패턴", () => {
    expect(globMatch("한*", "한글.txt".normalize("NFD"))).toBe(true);
    expect(globMatch("a*".repeat(50) + "b", "a".repeat(5000))).toBe(false);
  });
});

describe("FakeBackend 복제/정보/열기", () => {
  it("복제는 Rust와 같은 이름 규칙을 쓴다", async () => {
    const b = fs().seed({ "/a/.env": "e", "/a/z.tar.gz": "z" });
    await b.enqueue("duplicate", ["x.txt", "x.txt", "dir", ".env", "z.tar.gz"].map((n) => ({ src: `/a/${n}`, destDir: null, policy: "skip" as const })));
    for (const want of ["x copy.txt", "x copy 2.txt", "dir copy", ".env copy", "z.tar copy.gz"]) {
      expect(b.exists(`/a/${want}`), want).toBe(true);
    }
    expect(b.exists("/a/dir copy/inner.txt")).toBe(true);
  });
  it("정보/클립보드/열기", async () => {
    const b = fs();
    expect(await b.fileInfo("/a/dir")).toMatchObject({ kind: "dir", childCount: 1 });
    expect(await b.fileInfo("/a/x.txt")).toMatchObject({ kind: "file", size: 1, childCount: null });
    await b.copyText("hello");
    expect(b.clipboard).toEqual(["hello"]);
    await b.revealPath("/a/x.txt");
    expect(b.revealed).toEqual(["/a/x.txt"]);
    await expect(b.editPaths(["/a/x.txt"])).rejects.toThrow(/text_editor/);
    b.setConfig((l) => (l.config.environment.text_editor = "code"));
    await b.editPaths(["/a/x.txt"]);
    expect(b.edited).toEqual([["/a/x.txt"]]);
    expect(await b.globFilter("*.txt", ["x.txt", "y.md"])).toEqual([0]);
  });
});

describe("archive helpers", () => {
  it("isArchiveName: 기본 확장자, tar 계열, 추가 확장자, 대소문자", () => {
    for (const n of ["a.zip", "A.ZIP", "x.jar", "x.war", "x.aar", "x.apk", "x.nupkg", "x.klib", "x.sublime-package", "a.tar", "a.tar.gz", "a.tgz", "a.tar.bz2", "a.tbz2", "a.tbz"]) {
      expect(isArchiveName(n), n).toBe(true);
    }
    for (const n of ["zip", ".zip", "a.txt", "a.gz", "a.bz2", "notes", "tar", "a.docx"]) {
      expect(isArchiveName(n), n).toBe(false);
    }
    expect(isArchiveName("m.docx", ["docx"])).toBe(true);
    expect(isArchiveName("m.DOCX", [".docx"])).toBe(true);
    expect(isArchiveName("m.odt", ["docx"])).toBe(false);
  });

  it("아카이브 경로: 루트, 판별, 상위 이동", () => {
    expect(archiveRoot("/a/x.zip")).toBe("/a/x.zip!");
    expect(isArchivePath("/a/x.zip!")).toBe(true);
    expect(isArchivePath("/a/x.zip!/d/f")).toBe(true);
    expect(isArchivePath("/a/x.zip")).toBe(false);
    expect(isArchivePath("/a/hello!world")).toBe(false);
    expect(parentPath("/a/x.zip!")).toBe("/a");
    expect(parentPath("/a/x.zip!/d")).toBe("/a/x.zip!");
    expect(parentPath("/a/x.zip!/inner.zip!")).toBe("/a/x.zip!");
    expect(joinPath("/a/x.zip!", "d")).toBe("/a/x.zip!/d");
    expect(archiveFileName(baseName("/a/x.zip!"))).toBe("x.zip");
    expect(archiveFileName(baseName("/a/plain"))).toBe("plain");
  });

  it("설정 쓰기: 키를 쓰면 병합된 설정을 돌려주고 구독자에게도 알리며, 지우면 기본값으로 돌아간다", async () => {
    const b = fs();
    const seen: string[] = [];
    b.onConfigChanged((l) => seen.push(l.config.behavior.theme));
    const set = await b.setConfigValue("behavior.theme", { kind: "str", value: "nord" });
    expect(set.config.behavior.theme).toBe("nord");
    expect((await b.getConfig()).config.behavior.theme).toBe("nord");
    const size = await b.setConfigValue("behavior.table.icon_size", { kind: "int", value: 24 });
    expect(size.config.behavior.table.icon_size).toBe(24);
    const off = await b.setConfigValue("core.confirm.delete", { kind: "bool", value: false });
    expect(off.config.core.confirm.delete).toBe(false);
    const reset = await b.resetConfigValue("behavior.theme");
    expect(reset.config.behavior.theme).toBe("system");
    expect(seen).toEqual(["nord", "nord", "nord", "system"]);
  });

  it("설정 폴더 열기를 기록한다", async () => {
    const b = fs();
    await b.revealConfigDir();
    expect(b.configDirRevealed).toBe(1);
  });

  it("diskSpace: 경로가 속한 볼륨(가장 긴 마운트 경로)의 용량을 돌려주고 값이 없으면 거부한다", async () => {
    const b = new FakeBackend();
    b.diskSpaces = { "/": { free: 10, total: 100 }, "/Volumes/USB": { free: 1, total: 8 } };
    expect(await b.diskSpace("/Volumes/USB/a")).toEqual({ free: 1, total: 8 });
    expect(await b.diskSpace("/Volumes/USB")).toEqual({ free: 1, total: 8 });
    expect(await b.diskSpace("/home")).toEqual({ free: 10, total: 100 });
    expect(await b.diskSpace("/Volumes/USB2/x")).toEqual({ free: 10, total: 100 }); // 접두 문자열이 아니라 경로 경계
    b.diskSpaces = { "/Volumes/USB": { free: 1, total: 8 } };
    await expect(b.diskSpace("/home")).rejects.toThrow();
  });
});
