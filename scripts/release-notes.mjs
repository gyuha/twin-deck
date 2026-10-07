#!/usr/bin/env node
// CHANGELOG.md에서 이 버전의 변경 사항을 뽑아 릴리스 본문을 만든다. 릴리스 스크립트(release.sh/ps1)가 부르고,
// 앱의 "업데이트 확인" 창에 보이는 latest.json의 notes에도 같은 내용이 들어간다. 항목이 없으면 실패해서 배포를 막는다.
//
// 사용:
//   node scripts/release-notes.mjs <버전> [--repo owner/name]   릴리스 본문(변경 사항 + 전체 비교 링크 + 설치 안내)
//   node scripts/release-notes.mjs <버전> --plain               변경 사항만(제목 표시 없이). latest.json의 notes용
//   --out <파일>을 더하면 표준출력 대신 그 파일에 UTF-8로 쓴다(PowerShell이 표준출력을 콘솔 코드페이지로 읽어 한글이 깨지는 것을 피한다)
//   node scripts/release-notes.mjs --check                      tauri.conf.json의 버전(또는 VERSION_OVERRIDE) 항목이 있는지만 확인
// 환경 변수: CHANGELOG_FILE(기본 CHANGELOG.md, 시험용), VERSION_OVERRIDE
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** `## 0.5.1 (2026-10-07)` 같은 제목 아래 다음 `## ` 제목 전까지의 본문. 없거나 비어 있으면 null. */
export function extractSection(changelog, version) {
  const lines = changelog.split(/\r?\n/);
  const head = new RegExp(`^##\\s+v?${version.replace(/\./g, "\\.")}(\\s|\\(|$)`);
  const start = lines.findIndex((l) => head.test(l));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  const body = lines.slice(start + 1, end).join("\n").trim();
  return body === "" ? null : body;
}

const parse = (v) => v.split(".").map(Number);
const less = (a, b) => {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
};

/** 이 버전보다 낮은 가장 높은 `vX.Y.Z` 태그. 없으면 null. */
export function previousTag(tags, version) {
  const cur = parse(version);
  const lower = tags
    .filter((t) => /^v\d+\.\d+\.\d+$/.test(t))
    .map((t) => ({ t, v: parse(t.slice(1)) }))
    .filter((x) => less(x.v, cur));
  lower.sort((a, b) => (less(a.v, b.v) ? 1 : less(b.v, a.v) ? -1 : 0));
  return lower[0]?.t ?? null;
}

/** 앱 업데이트 창과 latest.json용: `### ` 소제목 표시를 빼고 줄만 남긴다. */
export function plainNotes(section) {
  return section.replace(/^###\s+/gm, "").trim();
}

const INSTALL = (repo) =>
  `---\n**설치** (macOS Apple Silicon): \`brew install --cask gyuha/tap/twin-deck\`. 서명하지 않은 빌드라 직접 내려받아 처음 열 때 막히면 \`xattr -dr com.apple.quarantine "/Applications/Twin Deck.app"\`를 실행하세요. 설치된 앱은 "업데이트 확인"으로 업데이트합니다.${repo ? ` 자세한 안내: https://github.com/${repo}#설치-macos` : ""}`;

export function releaseBody(section, { version, prev, repo }) {
  const compare = prev && repo ? `\n\n**전체 변경 내역**: https://github.com/${repo}/compare/${prev}...v${version}` : "";
  return `${section}${compare}\n\n${INSTALL(repo)}\n`;
}

function currentVersion() {
  if (process.env.VERSION_OVERRIDE) return process.env.VERSION_OVERRIDE;
  const conf = JSON.parse(readFileSync(new URL("../apps/desktop/src-tauri/tauri.conf.json", import.meta.url), "utf8"));
  return conf.version;
}

function main() {
  const args = process.argv.slice(2);
  const flag = (n) => args.includes(n);
  const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const check = flag("--check");
  const version = check ? currentVersion() : args.find((a) => /^\d+\.\d+\.\d+/.test(a));
  if (!version) throw new Error("사용: node scripts/release-notes.mjs <버전> [--plain|--repo owner/name] | --check");
  const file = process.env.CHANGELOG_FILE ?? fileURLToPath(new URL("../CHANGELOG.md", import.meta.url));
  const section = extractSection(readFileSync(file, "utf8"), version);
  if (!section) {
    throw new Error(
      `CHANGELOG.md에 ${version} 항목이 없거나 비어 있습니다. "## ${version} (YYYY-MM-DD)" 아래에 변경 사항을 적은 뒤 다시 하세요 (절차는 AGENTS.md의 "릴리스 노트").`,
    );
  }
  if (check) {
    console.log(`CHANGELOG.md에 ${version} 항목이 있습니다`);
    return;
  }
  const emit = (text) => (opt("--out") ? writeFileSync(opt("--out"), text, "utf8") : process.stdout.write(text));
  if (flag("--plain")) {
    emit(`${plainNotes(section)}\n`);
    return;
  }
  let prev = null;
  try {
    prev = previousTag(execFileSync("git", ["tag", "--list", "v*"], { encoding: "utf8" }).split("\n").filter(Boolean), version);
  } catch {
    /* git이 없으면 비교 링크만 뺀다 */
  }
  emit(releaseBody(section, { version, prev, repo: opt("--repo") }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(`release-notes: ${e.message}`);
    process.exit(1);
  }
}
