import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mergeManifest } from "./update-manifest.mjs";

const mac = { version: "0.5.0", platform: "darwin-aarch64", url: "https://x/mac.tar.gz", signature: "SIGMAC\n", notes: "노트", pubDate: "2026-10-06T00:00:00Z" };
const win = { version: "0.5.0", platform: "windows-x86_64", url: "https://x/win-setup.exe", signature: "SIGWIN" };

describe("update-manifest", () => {
  test("한 OS만 올린 릴리스는 그 OS 항목만 담고 다른 OS 항목을 만들지 않는다", () => {
    const m = mergeManifest(null, mac);
    expect(Object.keys(m.platforms)).toEqual(["darwin-aarch64"]);
    expect(m.platforms["windows-x86_64"]).toBeUndefined();
    expect(m.platforms["darwin-aarch64"]).toEqual({ url: "https://x/mac.tar.gz", signature: "SIGMAC" });
  });

  test("다른 OS를 나중에 병합해도 앞의 항목은 그대로다", () => {
    const first = mergeManifest(null, mac);
    const both = mergeManifest(first, win);
    expect(Object.keys(both.platforms).sort()).toEqual(["darwin-aarch64", "windows-x86_64"]);
    expect(both.platforms["darwin-aarch64"]).toEqual(first.platforms["darwin-aarch64"]);
    expect(both.notes).toBe("노트");
    expect(both.pub_date).toBe("2026-10-06T00:00:00Z");
  });

  test("같은 플랫폼을 다시 병합하면 교체한다(중복 없음)", () => {
    const first = mergeManifest(null, mac);
    const again = mergeManifest(first, { ...mac, url: "https://x/mac2.tar.gz", signature: "NEW" });
    expect(Object.keys(again.platforms)).toEqual(["darwin-aarch64"]);
    expect(again.platforms["darwin-aarch64"]).toEqual({ url: "https://x/mac2.tar.gz", signature: "NEW" });
  });

  test("버전이 다른 기존 latest.json에는 병합하지 않는다", () => {
    const old = mergeManifest(null, { ...mac, version: "0.4.9" });
    expect(() => mergeManifest(old, win)).toThrow(/버전/);
  });

  test("서명이 비어 있으면 거부한다", () => {
    expect(() => mergeManifest(null, { ...mac, signature: "  \n" })).toThrow(/서명/);
    expect(() => mergeManifest(null, { ...mac, signature: undefined })).toThrow(/서명/);
  });

  test("출력이 Tauri updater가 읽는 형식이다", () => {
    const m = mergeManifest(null, mac);
    expect(Object.keys(m).sort()).toEqual(["notes", "platforms", "pub_date", "version"]);
    expect(m.version).toBe("0.5.0");
    expect(typeof m.pub_date).toBe("string");
    expect(Number.isNaN(Date.parse(m.pub_date))).toBe(false);
    for (const p of Object.values(m.platforms)) expect(Object.keys(p).sort()).toEqual(["signature", "url"]);
  });

  test("필수 값이 빠지면 거부한다", () => {
    expect(() => mergeManifest(null, { ...mac, version: "" })).toThrow();
    expect(() => mergeManifest(null, { ...mac, platform: "" })).toThrow();
    expect(() => mergeManifest(null, { ...mac, url: "" })).toThrow();
  });

  test("CLI: 가짜 산출물로 latest.json을 만들고, 두 번째 호출이 앞 항목을 보존한다", async () => {
    const dir = mkdtempSync(join(tmpdir(), "um-"));
    writeFileSync(join(dir, "mac.sig"), "SIGMAC\n");
    writeFileSync(join(dir, "win.sig"), "SIGWIN\n");
    const run = async (args) => {
      const p = Bun.spawn(["node", join(import.meta.dir, "update-manifest.mjs"), ...args], { stdout: "pipe", stderr: "pipe" });
      return { code: await p.exited };
    };
    const out = join(dir, "latest.json");
    expect((await run(["--version", "1.2.3", "--platform", "darwin-aarch64", "--url", "https://x/m", "--sig-file", join(dir, "mac.sig"), "--out", out])).code).toBe(0);
    expect(Object.keys(JSON.parse(readFileSync(out, "utf8")).platforms)).toEqual(["darwin-aarch64"]);
    expect((await run(["--version", "1.2.3", "--platform", "windows-x86_64", "--url", "https://x/w", "--sig-file", join(dir, "win.sig"), "--existing", out, "--out", out])).code).toBe(0);
    const merged = JSON.parse(readFileSync(out, "utf8"));
    expect(Object.keys(merged.platforms).sort()).toEqual(["darwin-aarch64", "windows-x86_64"]);
    expect(merged.platforms["windows-x86_64"].signature).toBe("SIGWIN");
    expect((await run(["--version", "9.9.9", "--platform", "windows-x86_64", "--url", "https://x/w", "--sig-file", join(dir, "win.sig"), "--existing", out, "--out", out])).code).toBe(1);
  });
});
