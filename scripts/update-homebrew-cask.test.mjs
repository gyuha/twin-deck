import { describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "update-homebrew-cask.mjs");

// 실제 앱 ZIP 대신 최상위가 `Twin Deck.app`뿐인 작은 ZIP을 만든다.
function makeZip(root, version) {
  const app = join(root, "z", "Twin Deck.app", "Contents");
  mkdirSync(app, { recursive: true });
  writeFileSync(join(app, "Info.plist"), "plist");
  const zip = join(root, `twin-deck-${version}-macos-arm64.zip`);
  execFileSync("zip", ["-qr", zip, "Twin Deck.app"], { cwd: join(root, "z") });
  return zip;
}

function run(version = "0.6.4") {
  const root = mkdtempSync(join(tmpdir(), "cask-test-"));
  const zip = makeZip(root, version);
  const out = join(root, "Casks", "twin-deck.rb");
  const r = spawnSync("node", [SCRIPT, "--version", version, "--zip", zip, "--out", out], { encoding: "utf8" });
  return { root, zip, out, r, cask: r.status === 0 ? readFileSync(out, "utf8") : null };
}

const BINARY = 'binary "#{appdir}/Twin Deck.app/Contents/MacOS/twin-deck-desktop", target: "td"';

describe("update-homebrew-cask: td 명령 링크", () => {
  test("Cask에 `td`로 링크하는 binary 줄이 정확히 한 번 있다", () => {
    const { cask } = run();
    expect(cask.split("\n").filter((l) => l.trim().startsWith("binary "))).toEqual([`  ${BINARY}`]);
  });

  test("binary 줄은 app 줄 뒤에 놓이고 둘 사이에는 주석뿐이다", () => {
    const lines = run().cask.split("\n");
    const i = lines.indexOf('  app "Twin Deck.app"');
    const j = lines.indexOf(`  ${BINARY}`);
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
    expect(lines.slice(i + 1, j).every((l) => l.trim().startsWith("#"))).toBe(true);
  });

  test("기존 줄(버전·url·app·postflight)은 그대로다", () => {
    const { cask } = run("0.6.4");
    expect(cask).toContain('version "0.6.4"');
    expect(cask).toContain('url "https://github.com/gyuha/twin-deck/releases/download/v#{version}/twin-deck-#{version}-macos-arm64.zip"');
    expect(cask).toContain("depends_on arch: :arm64");
    expect(cask).toContain("postflight_steps do");
    expect(cask).toContain('"{{appdir}}/Twin Deck.app"');
    expect(cask.endsWith("end\n")).toBe(true);
  });

  test("같은 입력으로 두 번 만들면 출력이 같다", () => {
    const root = mkdtempSync(join(tmpdir(), "cask-test-"));
    const zip = makeZip(root, "0.6.4");
    const outs = [join(root, "a", "twin-deck.rb"), join(root, "b", "twin-deck.rb")];
    for (const out of outs) {
      const r = spawnSync("node", [SCRIPT, "--version", "0.6.4", "--zip", zip, "--out", out], { encoding: "utf8" });
      expect(r.status).toBe(0);
    }
    expect(readFileSync(outs[0], "utf8")).toBe(readFileSync(outs[1], "utf8"));
  });

  test("잘못된 버전은 거부한다(기존 동작)", () => {
    const root = mkdtempSync(join(tmpdir(), "cask-test-"));
    const zip = makeZip(root, "0.6.4");
    const r = spawnSync("node", [SCRIPT, "--version", "x.y", "--zip", zip, "--out", join(root, "Casks", "twin-deck.rb")], { encoding: "utf8" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/잘못된 버전/);
  });
});
