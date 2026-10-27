import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";

// 프로젝트 Pages의 /twin-deck/ 하위에서도 로컬 링크가 유효한지 검사한다.
const output = new URL("../dist/site/", import.meta.url);
for (const page of ["index.html", "en.html"]) {
  const html = await readFile(new URL(page, output), "utf8");
  assert.equal(
    (html.match(/<script src="analytics\.js" defer><\/script>/g) || []).length,
    1,
    "각 언어 페이지에 GA 초기화 스크립트가 하나 있어야 합니다.",
  );
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
  // 검색·공유용 메타: 대표 주소와 언어별 주소가 서로 맞는지, 길이가 검색 결과에서 잘리지 않는지 본다.
  const self =
    page === "en.html"
      ? "https://gyuha.com/twin-deck/en.html"
      : "https://gyuha.com/twin-deck/";
  const meta = (name) =>
    html.match(
      new RegExp(`<meta\\s+(?:name|property)="${name}"\\s+content="([^"]*)"`),
    )?.[1];
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  assert.ok(title && title.length <= 60, `title은 60자 이하: ${title}`);
  const description = meta("description");
  assert.ok(
    description && description.length >= 70 && description.length <= 170,
    `description 길이: ${description?.length}`,
  );
  assert.equal(meta("og:url"), self, "og:url은 이 페이지의 대표 주소");
  assert.equal(meta("og:title"), title, "og:title은 title과 같아야 합니다.");
  assert.equal(meta("twitter:title"), title, "twitter:title");
  assert.equal(meta("og:image:alt"), meta("twitter:image:alt"), "이미지 설명");
  assert.match(meta("og:image"), /^https:\/\/gyuha\.com\/twin-deck\/assets\//);
  assert.equal(
    meta("og:locale"),
    page === "en.html" ? "en_US" : "ko_KR",
    "og:locale",
  );
  for (const [language, href] of [
    ["ko", "https://gyuha.com/twin-deck/"],
    ["en", "https://gyuha.com/twin-deck/en.html"],
    ["x-default", "https://gyuha.com/twin-deck/"],
  ]) {
    assert.match(
      html,
      new RegExp(`hreflang="${language}"\\s+href="${href}"`),
      `hreflang ${language}`,
    );
  }
  const ld = html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
  )?.[1];
  assert.ok(ld, "구조화 데이터(JSON-LD)가 있어야 합니다.");
  const data = JSON.parse(ld);
  assert.equal(data["@type"], "SoftwareApplication");
  assert.equal(data.url, self, "JSON-LD url");
  assert.equal(data.inLanguage, page === "en.html" ? "en" : "ko");
  if (page === "en.html")
    assert.doesNotMatch(
      ld,
      /[가-힣]/u,
      "영문 JSON-LD에 한국어가 없어야 합니다.",
    );
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
const sitemap = await readFile(new URL("sitemap.xml", output), "utf8");
for (const loc of [
  "https://gyuha.com/twin-deck/",
  "https://gyuha.com/twin-deck/en.html",
])
  assert.ok(
    sitemap.includes(`<loc>${loc}</loc>`),
    `sitemap에 없는 주소: ${loc}`,
  );
const files = await readdir(output);
assert.deepEqual(
  files.sort(),
  [
    ".nojekyll",
    "assets",
    "index.html",
    "en.html",
    "language.js",
    "analytics.js",
    "main.js",
    "sitemap.xml",
    "styles.css",
  ].sort(),
  "공개 산출물은 허용된 파일만 포함해야 합니다.",
);
console.log(
  "소개 페이지 검사 통과: 로컬 자산, 섹션 링크, 접근성 참조, 검색·공유 메타, 공개 파일 목록",
);
