#!/usr/bin/env node
// 공개된 릴리스를 자체 Homebrew tap(gyuha/homebrew-tap)의 Cask에 반영한다. task release가 공개한 직후 부르고,
// 실패했을 때는 직접 `node scripts/update-tap.mjs <버전>`으로 다시 실행해도 된다(이미 반영돼 있으면 아무것도 바꾸지 않는다).
//
// 순서: 릴리스가 공개 상태이고 이 저장소의 "최신"인지 확인 → 공개 URL에서 macOS ZIP을 내려받아 GitHub가 준 sha256과 대조 →
//       tap 저장소를 새로 받아 Cask를 갱신(scripts/update-homebrew-cask.mjs) → 바뀐 게 있으면 커밋·push.
// 환경 변수: DRY_RUN=1 이면 push만 건너뛴다(읽기와 로컬 계산은 한다). SOURCE_REPO(기본 gyuha/twin-deck), TAP_URL(기본 gyuha/homebrew-tap의 https 주소).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));

/** 릴리스 JSON에서 이 버전의 macOS ZIP 에셋과 sha256을 고른다. 공개 상태가 아니거나 digest가 없으면 이유와 함께 던진다. */
export function findZipAsset(release, version) {
  if (release.draft) throw new Error(`v${version}은 아직 공개되지 않은 초안입니다`);
  const name = `twin-deck-${version}-macos-arm64.zip`;
  const asset = (release.assets ?? []).find((a) => a.name === name);
  if (!asset) return null;
  const m = /^sha256:([0-9a-f]{64})$/.exec(asset.digest ?? "");
  if (!m) throw new Error(`${name}에 GitHub sha256 digest가 없어 검증할 수 없습니다`);
  return { name, url: asset.browser_download_url, sha256: m[1] };
}

export const sha256Of = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/**
 * tap 저장소를 새로 받아 Cask를 갱신하고, 바뀌었으면 커밋해서 push한다(dry면 push는 하지 않는다).
 * 돌려주는 값: "unchanged"(이미 최신) | "dry"(커밋까지 하고 push는 안 함) | "pushed".
 */
export function updateTap({ tapUrl, zipPath, version, dry, workDir }) {
  const tap = join(workDir, "tap");
  execFileSync("git", ["clone", "--quiet", "--depth", "1", tapUrl, tap], { stdio: ["ignore", "pipe", "pipe"] });
  const out = join(tap, "Casks", "twin-deck.rb");
  execFileSync("node", [join(here, "update-homebrew-cask.mjs"), "--version", version, "--zip", zipPath, "--out", out], { stdio: ["ignore", "inherit", "inherit"] });
  git(tap, "add", "Casks/twin-deck.rb");
  if (git(tap, "status", "--porcelain") === "") return "unchanged";
  git(tap, "commit", "--quiet", "-m", `Twin Deck ${version} Homebrew Cask 갱신`);
  if (dry) {
    console.log(`[DRY_RUN] git push (${tapUrl})\n${git(tap, "show", "--stat", "--format=%s", "HEAD")}`);
    return "dry";
  }
  git(tap, "push", "--quiet");
  return "pushed";
}

const gh = (...args) => JSON.parse(execFileSync("gh", ["api", ...args], { encoding: "utf8" }));

/** 공개 직후에는 GitHub가 에셋·digest를 반영하기까지 잠깐 걸릴 수 있어서 몇 번 다시 시도한다. */
async function retry(label, fn, tries = 4, waitMs = 3000) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries) throw e;
      console.error(`${label} 실패(${i}/${tries}): ${e.message.split("\n")[0]} — ${waitMs / 1000}초 뒤 다시 시도`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

async function main() {
  const version = process.argv[2];
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version ?? "")) throw new Error("사용: node scripts/update-tap.mjs <버전>  (예: 0.5.1)");
  const source = process.env.SOURCE_REPO ?? "gyuha/twin-deck";
  const tapUrl = process.env.TAP_URL ?? "https://github.com/gyuha/homebrew-tap.git";
  const dry = process.env.DRY_RUN === "1";

  // 공개 직후엔 digest가 늦게 붙을 수 있어 조회와 검증을 함께 재시도한다. 초안·없는 릴리스 같은 진짜 오류도 재시도 뒤에 그대로 드러난다.
  const asset = await retry("릴리스 조회", () => findZipAsset(gh(`repos/${source}/releases/tags/v${version}`), version));
  if (!asset) {
    console.log(`tap 갱신을 건너뜁니다: v${version}에 macOS ZIP이 없습니다 (Windows만 공개한 경우)`);
    return;
  }
  // 옛 버전을 나중에 공개하면 tap이 거꾸로 가지 않게, 이 저장소의 최신 릴리스일 때만 갱신한다.
  const latest = gh(`repos/${source}/releases/latest`).tag_name;
  if (latest !== `v${version}`) {
    console.log(`tap 갱신을 건너뜁니다: 이 저장소의 최신 릴리스는 ${latest}입니다 (v${version} 아님)`);
    return;
  }

  const workDir = mkdtempSync(join(tmpdir(), "update-tap-"));
  try {
    // 로그인 없이 받는다 = 정말 공개돼 있는지도 확인한다
    const body = await retry("다운로드", async () => {
      const res = await fetch(asset.url);
      if (!res.ok) throw new Error(`공개 URL에서 내려받지 못했습니다: ${res.status} ${asset.url}`);
      return Buffer.from(await res.arrayBuffer());
    });
    const zipPath = join(workDir, asset.name);
    writeFileSync(zipPath, body);
    const got = sha256Of(zipPath);
    if (got !== asset.sha256) throw new Error(`sha256이 다릅니다. GitHub ${asset.sha256} / 내려받은 파일 ${got}. tap을 바꾸지 않았습니다`);
    const result = updateTap({ tapUrl, zipPath, version, dry, workDir });
    console.log(
      { unchanged: `tap이 이미 ${version}입니다. 바꾼 것이 없습니다`, dry: "DRY_RUN: push하지 않았습니다", pushed: `tap에 ${version}을 push했습니다` }[result],
    );
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`update-tap: ${e.message}`);
    process.exit(1);
  });
}
