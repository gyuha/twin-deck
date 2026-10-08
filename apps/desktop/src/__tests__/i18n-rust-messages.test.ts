import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RUST_INTERNAL, RUST_MESSAGES, rustText, setLanguage } from "../i18n";
import { translateRust } from "../i18n/rust";

// Rust가 만들어 화면까지 오는 한국어 문구가 영어 대응표(또는 내부용 목록)에 빠짐없이 있는지 소스를 읽어 확인한다(이슈 #32).
const ROOT = join(__dirname, "..", "..", "..", "..");
const HANGUL = /[가-힣]/;

/** crates의 각 크레이트 src와 데스크톱 앱의 `src-tauri/src`만 읽는다(통합 테스트 디렉터리 `tests/`는 제외). */
function rustFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === "target" || n === "node_modules" || n === "tests") return [];
    return statSync(p).isDirectory() ? rustFiles(p) : n.endsWith(".rs") ? [p] : [];
  });
}

/** 테스트 모듈과 주석을 뺀 한국어 문자열 리터럴. */
function koreanLiterals(): string[] {
  const out = new Set<string>();
  for (const p of [...rustFiles(join(ROOT, "crates")), ...rustFiles(join(ROOT, "apps/desktop/src-tauri/src"))]) {
    let s = readFileSync(p, "utf8");
    const m = /#\[cfg\((?:all\()?test[^\n]*\n(?:\s*#\[[^\n]*\n)*\s*mod tests/.exec(s);
    if (m) s = s.slice(0, m.index);
    for (const line of s.split("\n")) {
      if (line.trim().startsWith("//") || !HANGUL.test(line)) continue;
      for (const lit of line.matchAll(/"((?:[^"\\]|\\.)*)"/g)) if (HANGUL.test(lit[1])) out.add(lit[1]);
    }
  }
  return [...out];
}

describe("Rust 문구 대응표", () => {
  const known = new Set([...RUST_MESSAGES.map(([ko]) => ko), ...RUST_INTERNAL]);

  it("Rust 소스의 모든 한국어 문자열 리터럴이 대응표나 내부용 목록에 있다(새 문구를 빠뜨리지 않는다)", () => {
    const missing = koreanLiterals().filter((l) => !known.has(l));
    expect(missing).toEqual([]);
  });

  it("대응표·내부 목록에 소스에 없는 낡은 항목이 없다(더 큰 리터럴의 조각이면 있는 것으로 본다)", () => {
    // 조각을 끼워 만드는 문구는 가능한 조각으로 펼쳐서 본다(Rust: `아카이브 자체는 {what} 수 없습니다`, `{var}에는 크기 비교 연산자…`).
    const lits = koreanLiterals();
    const now = [
      ...lits,
      ...["만들", "옮길", "덮어쓸", "지울"].map((v) => `아카이브 자체는 ${v} 수 없습니다`),
      ...["이름", "내용"].map((v) => `${v}에는 크기 비교 연산자(<, >)를 쓸 수 없습니다`),
    ];
    expect(lits).toContain("아카이브 자체는 {what} 수 없습니다");
    expect(lits).toContain("{var}에는 크기 비교 연산자(<, >)를 쓸 수 없습니다");
    expect([...known].filter((k) => !now.some((l) => l.includes(k))).sort()).toEqual([]);
  });

  it("영어 문구에 한글이 없다", () => {
    for (const [ko, en] of RUST_MESSAGES) expect(HANGUL.test(en), `${ko} → ${en}`).toBe(false);
  });

  it("자리표시자 개수가 한국어와 같다", () => {
    const count = (s: string) => (s.match(/\{[^{}]*\}/g) ?? []).length;
    for (const [ko, en] of RUST_MESSAGES) expect(count(en), ko).toBe(count(ko));
  });
});

describe("translateRust", () => {
  it("값이 들어간 문구와 오류 안의 오류를 영어로 바꾼다", () => {
    expect(translateRust("폴더가 아닙니다: /a/b")).toBe("Not a folder: /a/b");
    expect(translateRust("입출력 오류: 찾을 수 없음: /x")).toBe("I/O error: Not found: /x");
    expect(translateRust("{0}개 항목을 복사하지 못해 원본을 지우지 않았습니다".replace("{0}", "3"))).toBe("3 items could not be copied, so the originals were not deleted");
    expect(translateRust("Quick Look으로 미리 볼 수 없습니다 (시간 초과)")).toBe("Cannot preview with Quick Look (timed out)");
  });

  it("모르는 문구는 그대로 둔다. 한국어 모드에서는 바꾸지 않는다", () => {
    expect(translateRust("알 수 없는 문구")).toBe("알 수 없는 문구");
    setLanguage("ko");
    expect(rustText("폴더가 아닙니다: /a")).toBe("폴더가 아닙니다: /a");
    setLanguage("en");
    expect(rustText("폴더가 아닙니다: /a")).toBe("Not a folder: /a");
    setLanguage("ko");
  });
});
