import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findZipAsset, sha256Of, updateTap } from "./update-tap.mjs";

const SHA = "a".repeat(64);
const release = (over = {}) => ({
  draft: false,
  assets: [{ name: "twin-deck-0.5.1-macos-arm64.zip", digest: `sha256:${SHA}`, browser_download_url: "https://x/z.zip" }],
  ...over,
});

describe("findZipAsset", () => {
  test("공개된 릴리스에서 ZIP의 이름·URL·sha256을 고른다", () => {
    expect(findZipAsset(release(), "0.5.1")).toEqual({ name: "twin-deck-0.5.1-macos-arm64.zip", url: "https://x/z.zip", sha256: SHA });
  });
  test("초안이면 거부한다", () => {
    expect(() => findZipAsset(release({ draft: true }), "0.5.1")).toThrow(/초안/);
  });
  test("macOS ZIP이 없으면(Windows만 공개) null", () => {
    expect(findZipAsset(release({ assets: [{ name: "twin-deck-0.5.1-windows-x64-setup.exe" }] }), "0.5.1")).toBeNull();
  });
  test("digest가 없거나 형식이 다르면 거부한다", () => {
    expect(() => findZipAsset(release({ assets: [{ name: "twin-deck-0.5.1-macos-arm64.zip", browser_download_url: "u" }] }), "0.5.1")).toThrow(/digest/);
    expect(() => findZipAsset(release({ assets: [{ name: "twin-deck-0.5.1-macos-arm64.zip", digest: "md5:zz", browser_download_url: "u" }] }), "0.5.1")).toThrow(/digest/);
  });
});

// 로컬 bare 저장소를 tap으로 쓴다. GitHub는 건드리지 않는다.
function makeTap() {
  const root = mkdtempSync(join(tmpdir(), "tap-test-"));
  const bare = join(root, "tap.git");
  execFileSync("git", ["init", "--bare", "--quiet", "-b", "main", bare]);
  const seed = join(root, "seed");
  execFileSync("git", ["clone", "--quiet", bare, seed], { stdio: "ignore" });
  const g = (...a) => execFileSync("git", ["-C", seed, "-c", "user.name=t", "-c", "user.email=t@t", ...a], { stdio: "ignore" });
  mkdirSync(join(seed, "Casks"));
  writeFileSync(join(seed, "Casks", "twin-deck.rb"), "# placeholder\n");
  g("add", "."); g("commit", "-q", "-m", "init"); g("push", "-q", "origin", "HEAD:main");
  return { root, bare };
}
function makeZip(root, version) {
  const app = join(root, "z", "Twin Deck.app", "Contents");
  mkdirSync(app, { recursive: true });
  writeFileSync(join(app, "Info.plist"), "plist");
  const zip = join(root, `twin-deck-${version}-macos-arm64.zip`);
  execFileSync("zip", ["-qr", zip, "Twin Deck.app"], { cwd: join(root, "z") });
  return zip;
}
const caskOf = (bare, root) => {
  const c = join(root, "check");
  execFileSync("git", ["clone", "--quiet", bare, c], { stdio: "ignore" });
  return readFileSync(join(c, "Casks", "twin-deck.rb"), "utf8");
};
const env = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
const envKeys = [...Object.keys(env), "GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM"];
let savedEnv;
beforeEach(() => {
  savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
});
afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

// 개발자의 전역 git 설정과 작성자 환경 변수에 기대지 않고 GitHub 러너 환경을 재현한다.
function isolateGitIdentity(root, config = "") {
  for (const key of Object.keys(env)) delete process.env[key];
  process.env.GIT_CONFIG_NOSYSTEM = "1";
  process.env.GIT_CONFIG_GLOBAL = join(root, "gitconfig");
  writeFileSync(process.env.GIT_CONFIG_GLOBAL, config);
}
const authorOf = (bare) => execFileSync("git", ["--git-dir", bare, "log", "-1", "--format=%an <%ae>|%cn <%ce>"], { encoding: "utf8" }).trim();

describe("updateTap (로컬 bare tap)", () => {
  test("작성자 없는 러너에서도 봇 작성자로 커밋·push하고 전역 설정은 건드리지 않는다", () => {
    const { root, bare } = makeTap();
    isolateGitIdentity(root);
    const zip = makeZip(root, "0.5.1");
    expect(updateTap({ tapUrl: bare, zipPath: zip, version: "0.5.1", dry: false, workDir: mkdtempSync(join(tmpdir(), "w-")) })).toBe("pushed");
    const bot = "github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>";
    expect(authorOf(bare)).toBe(`${bot}|${bot}`);
    expect(readFileSync(process.env.GIT_CONFIG_GLOBAL, "utf8")).toBe("");
  });
  test("기존 git 작성자 설정을 보존한다", () => {
    const { root, bare } = makeTap();
    const config = "[user]\n\tname = 기존 작성자\n\temail = existing@example.com\n";
    isolateGitIdentity(root, config);
    const zip = makeZip(root, "0.5.1");
    expect(updateTap({ tapUrl: bare, zipPath: zip, version: "0.5.1", dry: false, workDir: mkdtempSync(join(tmpdir(), "w-")) })).toBe("pushed");
    expect(authorOf(bare)).toBe("기존 작성자 <existing@example.com>|기존 작성자 <existing@example.com>");
    expect(readFileSync(process.env.GIT_CONFIG_GLOBAL, "utf8")).toBe(config);
  });
  test("비어 있는 이름만 보완하고 기존 이메일은 유지한다", () => {
    const { root, bare } = makeTap();
    const config = "[user]\n\tname =\n\temail = existing@example.com\n";
    isolateGitIdentity(root, config);
    const zip = makeZip(root, "0.5.1");
    expect(updateTap({ tapUrl: bare, zipPath: zip, version: "0.5.1", dry: false, workDir: mkdtempSync(join(tmpdir(), "w-")) })).toBe("pushed");
    expect(authorOf(bare)).toBe("github-actions[bot] <existing@example.com>|github-actions[bot] <existing@example.com>");
    expect(readFileSync(process.env.GIT_CONFIG_GLOBAL, "utf8")).toBe(config);
  });
  test("Cask의 버전과 sha256을 바꿔 커밋·push한다", () => {
    Object.assign(process.env, env);
    const { root, bare } = makeTap();
    const zip = makeZip(root, "0.5.1");
    const work = mkdtempSync(join(tmpdir(), "w-"));
    expect(updateTap({ tapUrl: bare, zipPath: zip, version: "0.5.1", dry: false, workDir: work })).toBe("pushed");
    const cask = caskOf(bare, root);
    expect(cask).toContain('version "0.5.1"');
    expect(cask).toContain(`sha256 "${sha256Of(zip)}"`);
  });
  test("이미 같은 내용이면 아무것도 바꾸지 않는다", () => {
    Object.assign(process.env, env);
    const { root, bare } = makeTap();
    const zip = makeZip(root, "0.5.1");
    updateTap({ tapUrl: bare, zipPath: zip, version: "0.5.1", dry: false, workDir: mkdtempSync(join(tmpdir(), "w-")) });
    expect(updateTap({ tapUrl: bare, zipPath: zip, version: "0.5.1", dry: false, workDir: mkdtempSync(join(tmpdir(), "w-")) })).toBe("unchanged");
  });
  test("DRY_RUN은 커밋까지만 하고 push하지 않는다", () => {
    Object.assign(process.env, env);
    const { root, bare } = makeTap();
    const zip = makeZip(root, "0.5.1");
    expect(updateTap({ tapUrl: bare, zipPath: zip, version: "0.5.1", dry: true, workDir: mkdtempSync(join(tmpdir(), "w-")) })).toBe("dry");
    expect(caskOf(bare, root)).toBe("# placeholder\n");
  });
  test("ZIP 이름과 버전이 다르면 Cask 스크립트가 거부하고 tap은 그대로다", () => {
    Object.assign(process.env, env);
    const { root, bare } = makeTap();
    const zip = makeZip(root, "0.5.1");
    expect(() => updateTap({ tapUrl: bare, zipPath: zip, version: "0.5.2", dry: false, workDir: mkdtempSync(join(tmpdir(), "w-")) })).toThrow();
    expect(caskOf(bare, root)).toBe("# placeholder\n");
  });
});
