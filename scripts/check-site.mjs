import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";

// 프로젝트 Pages의 /twin-deck/ 하위에서도 로컬 링크가 유효한지 검사한다.
const output = new URL("../dist/site/", import.meta.url);
const html = await readFile(new URL("index.html", output), "utf8");
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
const js = await readFile(new URL("main.js", output), "utf8");
for (const [, name] of js.matchAll(/['"`]((?:assets\/)?[\w-]+\.png)['"`]/g)) {
  await access(
    new URL(name.startsWith("assets/") ? name : `assets/${name}`, output),
  );
}
const files = await readdir(output);
assert.deepEqual(
  files.sort(),
  [".nojekyll", "assets", "index.html", "main.js", "styles.css"].sort(),
  "공개 산출물은 허용된 파일만 포함해야 합니다.",
);
console.log(
  "소개 페이지 검사 통과: 로컬 자산, 섹션 링크, 접근성 참조, 공개 파일 목록",
);
