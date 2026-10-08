// apps/desktop/themes/*.yaml(Warp 테마 원본)에서 앱이 쓰는 생성 파일 두 개를 만든다.
//   apps/desktop/src/lib/themes.generated.ts   — 테마 색 표(앱의 색 계산이 읽는다)
//   crates/td-config/src/themes.rs             — 허용하는 테마 이름 목록(설정 검증)
// `task gen-types`가 실행한다. 생성 파일이 지금 YAML과 다르면 scripts/gen-themes.test.mjs가 실패한다.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const THEME_DIR = join(ROOT, "apps/desktop/themes");
export const TS_OUT = join(ROOT, "apps/desktop/src/lib/themes.generated.ts");
export const RS_OUT = join(ROOT, "crates/td-config/src/themes.rs");

const HEX = /^#[0-9a-fA-F]{6}$/;

/** 테마 YAML 한 개에서 필요한 값만 읽는다. 형식이 단순해서(최상위 키 + terminal_colors.normal) 줄 단위로 읽는다. */
export function parseTheme(id, text) {
  const top = {};
  const normal = {};
  let section = "";
  let sub = "";
  for (const raw of text.split(/\r?\n/)) {
    const m = /^(\s*)([A-Za-z_]+):\s*(.*)$/.exec(raw);
    if (!m) continue;
    const [, indent, key, rest] = m;
    const value = rest.replace(/^"(.*)"$/, "$1").trim();
    if (indent === "") {
      section = key;
      sub = "";
      top[key] = value;
    } else if (indent.length === 2 && section === "terminal_colors") {
      sub = key;
    } else if (indent.length === 4 && section === "terminal_colors" && sub === "normal") {
      normal[key] = value;
    }
  }
  const need = (v, what) => {
    if (!HEX.test(v ?? "")) throw new Error(`${id}: ${what} 색이 #rrggbb가 아니다: ${v}`);
    return v.toLowerCase();
  };
  if (top.details !== "darker" && top.details !== "lighter") throw new Error(`${id}: details가 darker/lighter가 아니다: ${top.details}`);
  return {
    id,
    name: top.name,
    dark: top.details === "darker",
    background: need(top.background, "background"),
    foreground: need(top.foreground, "foreground"),
    accent: need(top.accent, "accent"),
    red: need(normal.red, "normal.red"),
    green: need(normal.green, "normal.green"),
    yellow: need(normal.yellow, "normal.yellow"),
    blue: need(normal.blue, "normal.blue"),
  };
}

export function loadThemes(dir = THEME_DIR) {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => parseTheme(f.slice(0, -5), readFileSync(join(dir, f), "utf8")))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)); // 파일 이름이 아니라 id 순서(확장자 때문에 순서가 달라지지 않게)
}

export function generate(themes = loadThemes()) {
  const rows = themes.map((t) => `  ${JSON.stringify(t)},`).join("\n");
  const ts = `// 자동 생성: scripts/gen-themes.mjs (task gen-types). apps/desktop/themes/*.yaml에서 만든다. 직접 고치지 마세요.

export interface WarpTheme {
  id: string;
  name: string;
  /** YAML의 details가 darker면 true. */
  dark: boolean;
  background: string;
  foreground: string;
  accent: string;
  /** terminal_colors.normal의 색. 앱의 상태색(오류·경고·성공·정보)이 된다. */
  red: string;
  green: string;
  yellow: string;
  blue: string;
}

export const THEMES: WarpTheme[] = [
${rows}
];
`;
  const ids = themes.map((t) => `    ${JSON.stringify(t.id)},`).join("\n");
  const rs = `//! 자동 생성: scripts/gen-themes.mjs (task gen-types). apps/desktop/themes/*.yaml의 파일 이름에서 만든다. 직접 고치지 마세요.

/// \`behavior.theme\`에 쓸 수 있는 테마 이름(\`system\`·\`light\`·\`dark\`는 별도다).
#[rustfmt::skip]
pub const THEME_IDS: &[&str] = &[
${ids}
];
`;
  return { ts, rs };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { ts, rs } = generate();
  writeFileSync(TS_OUT, ts);
  writeFileSync(RS_OUT, rs);
  console.log(`테마 ${loadThemes().length}개 → ${TS_OUT}, ${RS_OUT}`);
}
