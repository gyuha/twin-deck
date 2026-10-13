#!/usr/bin/env node
// 두 OS의 파일이 모인 비공개 초안(v<버전>)을 공개하고 Homebrew tap을 갱신한다. GitHub Actions의 공개 job이 부른다.
// release.sh/release.ps1의 publish는 빌드한 번들이 있는 OS에서만 돌아서, 번들 없이 Ubuntu에서 공개만 하는 용도로 따로 둔다.
//
// 공개 조건: 초안이 있고 · 아직 초안이며 · 대상 커밋이 지금 HEAD이고 · macOS·Windows 파일이 모두 있고 ·
//           latest.json에 darwin-aarch64와 windows-x86_64 항목이 모두 있다. 하나라도 어긋나면 공개하지 않고 종료 코드 1로 끝낸다.
// 환경 변수: DRY_RUN=1 이면 공개와 tap push를 출력만 한다. VERSION_OVERRIDE=<버전> 이면 그 버전을 쓴다. tap 갱신은 update-tap.mjs의 환경 변수(TAP_URL 등)를 따른다.
// 종료 코드: 0 공개 완료 · 1 공개하지 않음 · 4 공개는 됐지만 tap 갱신 실패
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const PLATFORMS = ["darwin-aarch64", "windows-x86_64"];

/** 공개해도 되는지 판단한다. 막는 이유(한글)의 배열을 돌려주고, 빈 배열이면 공개해도 된다. */
export function publishProblems({ release, sha, manifest, version }) {
  if (!release) return [`v${version} 릴리스가 없습니다`];
  if (!release.draft) return [`v${version}은 이미 공개된 릴리스입니다. 버전을 올리세요`];
  const problems = [];
  if (release.target_commitish !== sha) {
    problems.push(`초안은 ${String(release.target_commitish).slice(0, 7)} 커밋 기준인데 지금은 ${sha.slice(0, 7)}입니다`);
  }
  const names = (release.assets ?? []).map((a) => a.name);
  if (!names.some((n) => n.includes("-macos-"))) problems.push("macOS용 파일이 없습니다");
  if (!names.some((n) => n.endsWith("-setup.exe"))) problems.push("Windows용 파일이 없습니다");
  for (const p of PLATFORMS) {
    if (!manifest?.platforms?.[p]) problems.push(`latest.json에 ${p} 항목이 없습니다`);
  }
  return problems;
}

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], ...opts });

function main() {
  const dry = process.env.DRY_RUN === "1";
  const conf = JSON.parse(readFileSync(join(here, "../apps/desktop/src-tauri/tauri.conf.json"), "utf8"));
  const version = process.env.VERSION_OVERRIDE ?? conf.version;
  const tag = `v${version}`;
  const sha = run("git", ["rev-parse", "HEAD"]).trim();

  // 초안은 태그가 없어도 목록에는 나온다
  const releases = JSON.parse(run("gh", ["api", "repos/{owner}/{repo}/releases?per_page=100"]));
  const release = releases.find((r) => r.tag_name === tag);

  let manifest = null;
  const work = mkdtempSync(join(tmpdir(), "publish-draft-"));
  try {
    if (release) {
      try {
        run("gh", ["release", "download", tag, "-p", "latest.json", "-D", work]);
        manifest = JSON.parse(readFileSync(join(work, "latest.json"), "utf8"));
      } catch {
        // latest.json이 없으면 아래 판단에서 플랫폼 항목 없음으로 막힌다
      }
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  const problems = publishProblems({ release, sha, manifest, version });
  if (problems.length > 0) {
    console.error(`공개하지 않았습니다 (${tag}):\n${problems.map((p) => `- ${p}`).join("\n")}`);
    process.exit(1);
  }

  if (dry) {
    console.log(`[DRY_RUN] gh api -X PATCH repos/{owner}/{repo}/releases/${release.id} -F draft=false`);
    console.log(`[DRY_RUN] node scripts/update-tap.mjs ${version}   (tap에 push)`);
    return;
  }
  console.log(run("gh", ["api", "-X", "PATCH", `repos/{owner}/{repo}/releases/${release.id}`, "-F", "draft=false", "--jq", ".html_url"]).trim());
  console.log(`배포 완료: ${tag}`);

  // 릴리스는 이미 공개됐으므로 tap 갱신이 실패해도 되돌리지 않는다
  try {
    execFileSync("node", [join(here, "update-tap.mjs"), version], { stdio: "inherit" });
  } catch {
    console.error(`릴리스는 공개됐지만 Homebrew tap 갱신에 실패했습니다. 확인 후 다시: node scripts/update-tap.mjs ${version}`);
    process.exit(4);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
