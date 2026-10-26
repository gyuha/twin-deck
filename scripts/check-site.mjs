import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";

// 프로젝트 Pages의 /twin-deck/ 하위에서도 로컬 링크가 유효한지 검사한다.
const output = new URL("../dist/site/", import.meta.url);
for (const page of ["index.html", "en.html"]) {
  const html = await readFile(new URL(page, output), "utf8");
  assert.match(
    html,
    /name="color-scheme" content="dark"/,
    "사이트는 다크 테마만 제공합니다.",
  );
  assert.doesNotMatch(
    html,
    /theme-toggle|theme-light\.png/,
    "밝은 테마 전환을 배포하지 않습니다.",
  );
  if (page === "en.html") {
    assert.match(html, /<html lang="en">/, "영문 페이지의 문서 언어");
    assert.match(
      html,
      /href="index.html\?lang=ko"/,
      "영문 페이지의 한국어 전환 링크",
    );
    assert.match(
      html,
      /rel="canonical"\s+href="https:\/\/gyuha.com\/twin-deck\/en.html"/,
      "영문 페이지의 대표 주소",
    );
    const content = html.replace(
      /<a\b[^>]*class="language-toggle"[\s\S]*?<\/a\s*>/,
      "",
    );
    assert.doesNotMatch(
      content,
      /[가-힣]/u,
      "영문 페이지에 미번역 한국어가 없어야 합니다.",
    );
  }
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size, "HTML id가 중복되면 안 됩니다.");
  for (const [, reference] of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    if (/^https?:/.test(reference)) continue;
    if (reference.startsWith("#")) {
      assert.ok(
        reference === "#" || ids.includes(reference.slice(1)),
        `없는 섹션: ${reference}`,
      );
    } else {
      assert.ok(
        !reference.startsWith("/"),
        `프로젝트 경로를 무시하는 절대 경로: ${reference}`,
      );
      await access(new URL(reference, output));
    }
  }
  for (const [, id] of html.matchAll(
    /\baria-(?:controls|labelledby)="([^"]+)"/g,
  )) {
    assert.ok(ids.includes(id), `접근성 참조 대상이 없습니다: ${id}`);
  }
}
const js = await readFile(new URL("main.js", output), "utf8");
const css = await readFile(new URL("styles.css", output), "utf8");
for (const [, reference] of css.matchAll(
  /url\(["']?(assets\/[\w.-]+)["']?\)/g,
)) {
  await access(new URL(reference, output));
}
for (const [, name] of js.matchAll(/['"`]((?:assets\/)?[\w-]+\.png)['"`]/g)) {
  await access(
    new URL(name.startsWith("assets/") ? name : `assets/${name}`, output),
  );
}
const files = await readdir(output);
assert.deepEqual(
  files.sort(),
  [
    ".nojekyll",
    "assets",
    "index.html",
    "en.html",
    "language.js",
    "main.js",
    "styles.css",
  ].sort(),
  "공개 산출물은 허용된 파일만 포함해야 합니다.",
);
console.log(
  "소개 페이지 검사 통과: 로컬 자산, 섹션 링크, 접근성 참조, 공개 파일 목록",
);
