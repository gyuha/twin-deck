import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractSection, plainNotes, previousTag, releaseBody } from "./release-notes.mjs";

const LOG = `# 변경 사항

## 0.5.1 (2026-10-07)

### 추가
- 파일 목록 모양 옵션 (#12)

### 수정
- 새 파일을 만들면 커서가 이동한다 (#18)

## 0.5.0 (2026-10-06)

### 추가
- 앱 안 업데이트 (#10)

## 0.4.3 (2026-10-06)

## 0.4.2
- 옛날 항목
`;

describe("extractSection", () => {
  test("그 버전 제목 아래 다음 ## 제목 전까지를 돌려준다", () => {
    expect(extractSection(LOG, "0.5.1")).toBe("### 추가\n- 파일 목록 모양 옵션 (#12)\n\n### 수정\n- 새 파일을 만들면 커서가 이동한다 (#18)");
    expect(extractSection(LOG, "0.5.0")).toBe("### 추가\n- 앱 안 업데이트 (#10)");
  });
  test("제목에 날짜가 없어도, 맨 아래 버전도 찾는다", () => {
    expect(extractSection(LOG, "0.4.2")).toBe("- 옛날 항목");
  });
  test("항목이 없거나 본문이 비어 있으면 null이다", () => {
    expect(extractSection(LOG, "9.9.9")).toBeNull();
    expect(extractSection(LOG, "0.4.3")).toBeNull();
  });
  test("버전 문자열이 정규식으로 해석되지 않는다(0.5.1이 0x5y1을 잡지 않는다)", () => {
    expect(extractSection("## 0x5y1\n- 가짜\n", "0.5.1")).toBeNull();
    expect(extractSection("## 0.5.10\n- 다른 버전\n", "0.5.1")).toBeNull();
  });
});

describe("previousTag", () => {
  const tags = ["v0.4.2", "v0.5.1", "v0.4.3", "v0.5.0", "v0.10.0", "latest", "v1.0.0-rc1"];
  test("이 버전보다 낮은 가장 높은 vX.Y.Z 태그를 숫자 순서로 고른다", () => {
    expect(previousTag(tags, "0.5.1")).toBe("v0.5.0");
    expect(previousTag(tags, "0.5.2")).toBe("v0.5.1");
    expect(previousTag(tags, "0.10.1")).toBe("v0.10.0");
  });
  test("이전 태그가 없으면 null이다", () => {
    expect(previousTag(tags, "0.4.2")).toBeNull();
  });
});

describe("본문 만들기", () => {
  test("plainNotes는 ### 소제목 표시만 빼고 줄은 그대로 둔다", () => {
    expect(plainNotes("### 추가\n- 가\n\n### 수정\n- 나")).toBe("추가\n- 가\n\n수정\n- 나");
  });
  test("릴리스 본문에 변경 사항, 전체 비교 링크, 설치 안내가 순서대로 들어간다", () => {
    const body = releaseBody("### 추가\n- 가", { version: "0.5.1", prev: "v0.5.0", repo: "gyuha/twin-deck" });
    expect(body.indexOf("### 추가")).toBeLessThan(body.indexOf("compare/v0.5.0...v0.5.1"));
    expect(body.indexOf("compare/v0.5.0...v0.5.1")).toBeLessThan(body.indexOf("brew install --cask gyuha/tap/twin-deck"));
  });
  test("이전 태그나 저장소를 모르면 비교 링크만 뺀다", () => {
    const body = releaseBody("- 가", { version: "0.1.0", prev: null, repo: undefined });
    expect(body).not.toContain("compare/");
    expect(body).toContain("brew install");
  });
});

describe("CLI", () => {
  const run = async (args, file) => {
    const p = Bun.spawn(["node", join(import.meta.dir, "release-notes.mjs"), ...args], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, CHANGELOG_FILE: file },
    });
    return { code: await p.exited, out: await new Response(p.stdout).text(), err: await new Response(p.stderr).text() };
  };
  const logFile = () => {
    const f = join(mkdtempSync(join(tmpdir(), "rn-")), "CHANGELOG.md");
    writeFileSync(f, LOG);
    return f;
  };
  test("--plain은 변경 사항만 출력한다", async () => {
    const r = await run(["0.5.0", "--plain"], logFile());
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe("추가\n- 앱 안 업데이트 (#10)");
  });
  test("항목이 없는 버전은 종료 코드 1이고 어디를 고칠지 알려 준다", async () => {
    const r = await run(["9.9.9"], logFile());
    expect(r.code).toBe(1);
    expect(r.err).toContain("CHANGELOG.md에 9.9.9 항목이 없");
    expect(r.out).toBe("");
  });
  test("--check는 tauri.conf.json의 버전(또는 VERSION_OVERRIDE) 항목을 확인한다", async () => {
    const f = logFile();
    const ok = Bun.spawn(["node", join(import.meta.dir, "release-notes.mjs"), "--check"], { stdout: "pipe", stderr: "pipe", env: { ...process.env, CHANGELOG_FILE: f, VERSION_OVERRIDE: "0.5.1" } });
    expect(await ok.exited).toBe(0);
    const bad = Bun.spawn(["node", join(import.meta.dir, "release-notes.mjs"), "--check"], { stdout: "pipe", stderr: "pipe", env: { ...process.env, CHANGELOG_FILE: f, VERSION_OVERRIDE: "7.7.7" } });
    expect(await bad.exited).toBe(1);
  });
});
