import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// 화면 소스에 한글 문자열이 남은 파일을 센다. 사전(`i18n/`)·테스트·생성 파일은 제외한다.
// `i18n/allowlist.json`은 아직 사전으로 옮기지 못한 파일 목록이고, 작업이 끝나면 빈 목록이어야 한다.
// 갱신: `UPDATE_I18N_ALLOWLIST=1 bunx vitest run src/__tests__/i18n-no-hardcoded.test.ts`
const SRC = join(__dirname, "..");
const ALLOWLIST = join(SRC, "i18n", "allowlist.json");
const HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;

const skip = (rel: string) => rel.startsWith("__tests__") || rel.startsWith("i18n/") || /\.generated\.ts$/.test(rel) || rel.endsWith(".d.ts");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

/** 주석을 지운 소스. 문자열 안의 `//`(주소 등)는 건드리지 않도록 줄 앞쪽 따옴표를 확인한다. */
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => {
      let quote = "";
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (quote) {
          if (c === "\\") i++;
          else if (c === quote) quote = "";
        } else if (c === '"' || c === "'" || c === "`") quote = c;
        else if (c === "/" && line[i + 1] === "/") return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
}

const found = () =>
  files(SRC)
    .map((p) => relative(SRC, p))
    .filter((rel) => !skip(rel))
    .filter((rel) => HANGUL.test(stripComments(readFileSync(join(SRC, rel), "utf8"))))
    .sort();

describe("화면 문구는 사전에 있다", () => {
  it("주석이 아닌 곳에 한글이 남은 파일 목록이 allowlist와 정확히 같다(남은 일을 숨기지도, 끝난 파일을 남기지도 않는다)", () => {
    const now = found();
    if (process.env.UPDATE_I18N_ALLOWLIST === "1") writeFileSync(ALLOWLIST, JSON.stringify(now, null, 2) + "\n");
    expect(JSON.parse(readFileSync(ALLOWLIST, "utf8"))).toEqual(now);
  });

  it("주석 제거가 문자열 안의 내용은 지우지 않는다", () => {
    expect(HANGUL.test(stripComments('const a = "한글"; // 주석'))).toBe(true);
    expect(HANGUL.test(stripComments("// 주석만\nconst b = 1; /* 블록 */"))).toBe(false);
    expect(HANGUL.test(stripComments('const u = "http://x/한글";'))).toBe(true);
  });
});
