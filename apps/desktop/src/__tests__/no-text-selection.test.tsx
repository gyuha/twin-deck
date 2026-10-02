import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "..", "theme.css"), "utf8");
/** 같은 선택자를 쓰는 모든 `selector { ... }` 블록의 본문을 이어 붙인다. */
const block = (selector: string) =>
  [...css.matchAll(new RegExp(`(?:^|\\n)${selector}\\s*\\{([^}]*)\\}`, "g"))].map((m) => m[1]).join("\n");

describe("텍스트 선택 방지", () => {
  it("body는 글자를 선택할 수 없다(WebKit 접두어 포함)", () => {
    const body = block("body");
    expect(body).toMatch(/user-select:\s*none/);
    expect(body).toMatch(/-webkit-user-select:\s*none/);
  });

  it("입력창과 textarea는 예외로 글자를 선택하고 편집할 수 있다", () => {
    const inputs = block("input,\\s*textarea");
    expect(inputs).toMatch(/user-select:\s*text/);
    expect(inputs).toMatch(/-webkit-user-select:\s*text/);
  });
});
