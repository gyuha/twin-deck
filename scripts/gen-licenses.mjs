// 설정 > 업데이트 탭의 "오픈소스 라이선스" 창이 보여 주는 고지 파일을 만든다.
//   apps/desktop/src/generated/licenses.md (창은 이 파일을 Markdown 뷰어로 그린다)
// 앱에 들어가는 Rust crate(`twin-deck-desktop`의 정상·빌드 의존 트리)와 npm 패키지(`apps/desktop`의 `dependencies` 트리)의
// 이름·버전·라이선스 표 뒤에 THIRD_PARTY_NOTICES.md를 그대로 붙인다. 작업공간 자체 패키지와 개발 전용 의존성은 넣지 않는다.
// 라이선스 원문은 넣지 않는다(표만 둔다).
// `task gen-types`가 실행하고, `--check`면 파일이 지금 의존성과 다를 때 실패한다(`task check`).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const OUT = join(ROOT, "apps/desktop/src/generated/licenses.md");
const APP_CRATE = "twin-deck-desktop";
const APP_PACKAGE = join(ROOT, "apps/desktop");

/** `cargo metadata`에서 앱 crate의 정상·빌드 의존 트리를 모은다(작업공간 crate는 따라가되 목록에는 넣지 않는다). */
export function rustCrates(meta) {
  const byId = new Map(meta.packages.map((p) => [p.id, p]));
  const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]));
  const members = new Set(meta.workspace_members);
  const root = meta.packages.find((p) => p.name === APP_CRATE && members.has(p.id));
  if (!root) throw new Error(`${APP_CRATE} crate를 찾지 못했습니다`);
  const seen = new Set([root.id]);
  const stack = [root.id];
  while (stack.length > 0) {
    for (const dep of nodes.get(stack.pop())?.deps ?? []) {
      if (!dep.dep_kinds.some((k) => k.kind !== "dev")) continue;
      if (seen.has(dep.pkg)) continue;
      seen.add(dep.pkg);
      stack.push(dep.pkg);
    }
  }
  return [...seen]
    .filter((id) => !members.has(id))
    .map((id) => byId.get(id))
    .map((p) => ({ name: p.name, version: p.version, license: p.license ?? (p.license_file ? "LICENSE 파일 참조" : "표기 없음") }));
}

/** package.json의 라이선스 표기(`license` 문자열·객체, 옛 `licenses` 배열). */
function npmLicense(pkg) {
  const l = pkg.license ?? pkg.licenses;
  if (typeof l === "string") return l;
  if (Array.isArray(l)) return l.map((x) => (typeof x === "string" ? x : x.type)).join(" OR ");
  if (l && typeof l === "object" && l.type) return l.type;
  return "표기 없음";
}

/** `dir`(실제 경로)에서 위로 올라가며 `node_modules/<name>`을 찾는다(Node 해석 순서, bun의 격리 설치도 같다). */
function resolvePackage(dir, name) {
  for (let d = dir; ; d = dirname(d)) {
    const candidate = join(d, "node_modules", name, "package.json");
    if (existsSync(candidate)) return dirname(realpathSync(candidate));
    if (dirname(d) === d) return null;
  }
}

/** `apps/desktop`의 `dependencies` 트리를 모은다. 작업공간 패키지(`workspace:`)는 따라가되 목록에는 넣지 않는다. */
export function npmPackages(appDir = APP_PACKAGE) {
  const found = new Map();
  const visited = new Set();
  const visit = (dir, workspace) => {
    if (visited.has(dir)) return;
    visited.add(dir);
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    if (!workspace) found.set(`${pkg.name}@${pkg.version}`, { name: pkg.name, version: pkg.version, license: npmLicense(pkg) });
    for (const [name, spec] of Object.entries(pkg.dependencies ?? {})) {
      const depDir = resolvePackage(dir, name);
      if (!depDir) throw new Error(`${pkg.name}의 의존성 ${name}을 node_modules에서 찾지 못했습니다(bun install 필요)`);
      visit(depDir, String(spec).startsWith("workspace:"));
    }
  };
  visit(realpathSync(appDir), true);
  return [...found.values()];
}

const byName = (a, b) => (a.name === b.name ? a.version.localeCompare(b.version) : a.name < b.name ? -1 : 1);
/** Markdown 표 칸에 넣을 값. `|`는 칸 구분자라 이스케이프한다. */
const cell = (v) => String(v).replace(/\|/g, "\\|");
const table = (list) =>
  ["| 이름 | 버전 | 라이선스 |", "|---|---|---|", ...list.sort(byName).map((p) => `| ${cell(p.name)} | ${cell(p.version)} | ${cell(p.license)} |`)].join("\n");

export function render(crates, packages, notices) {
  return [
    "# Twin Deck 오픈소스 라이선스 고지",
    "",
    "Twin Deck은 아래 오픈소스 소프트웨어를 사용합니다.",
    "",
    `## Rust crate (${crates.length}개)`,
    "",
    table(crates),
    "",
    `## npm 패키지 (${packages.length}개)`,
    "",
    table(packages),
    "",
    "---",
    "",
    notices.trimEnd(),
    "",
  ].join("\n");
}

export function generate() {
  const meta = JSON.parse(execFileSync("cargo", ["metadata", "--format-version", "1", "--locked"], { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }));
  return render(rustCrates(meta), npmPackages(), readFileSync(join(ROOT, "THIRD_PARTY_NOTICES.md"), "utf8"));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = generate();
  if (process.argv.includes("--check")) {
    const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
    if (current !== text) {
      console.error(`${OUT}가 지금 의존성과 다릅니다. \`node scripts/gen-licenses.mjs\`(또는 \`task gen-types\`)로 다시 만드세요.`);
      process.exit(1);
    }
  } else {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, text);
    console.log(`${OUT} 작성`);
  }
}
