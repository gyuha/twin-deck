import { cp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// 저장소 전체 대신 소개 페이지와 허용한 공개 이미지 파일만 배포한다.
const root = new URL("../", import.meta.url);
const output = new URL("dist/site/", root);
await rm(output, { recursive: true, force: true });
await mkdir(new URL("assets/", output), { recursive: true });
for (const name of ["index.html", "styles.css", "main.js", "language.js"]) {
  await cp(new URL(`site/${name}`, root), new URL(name, output));
}
for (const name of [
  "main",
  "drag-copy",
  "preview-code",
  "find",
  "treemap",
  "theme-dracula",
]) {
  await cp(
    new URL(`docs/screenshots/${name}.png`, root),
    new URL(`assets/${name}.png`, output),
  );
}
// 캐릭터와 배경은 독립된 공개 자산으로 복사한다.
for (const name of [
  "courier.webp",
  "courier-small.webp",
  "night-city.webp",
  "night-city-small.webp",
]) {
  await cp(
    new URL(`site/assets/${name}`, root),
    new URL(`assets/${name}`, output),
  );
}
await cp(
  new URL("apps/desktop/src-tauri/icons/128x128@2x.png", root),
  new URL("assets/icon.png", output),
);
await writeFile(new URL(".nojekyll", output), "");
console.log(`소개 페이지 생성: ${fileURLToPath(output)}`);

// 마크업은 하나로 유지하고 영어 정적 HTML도 생성한다. 번역 누락은 배포 전에 차단한다.
const translations = JSON.parse(
  await readFile(new URL("site/english.json", root), "utf8"),
);
const source = await readFile(new URL("site/index.html", root), "utf8");
function translate(value) {
  if (!/[가-힣]/u.test(value)) return value;
  const key = value.trim().replace(/\s+/g, " ");
  if (!Object.hasOwn(translations, key))
    throw new Error(`영문 번역 누락: ${key}`);
  const escaped = translations[key]
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
  return value.match(/^\s*/)[0] + escaped + value.match(/\s*$/)[0];
}
let english = source.replace(/<[^>]+>|[^<]+/g, (part) =>
  part.startsWith("<")
    ? part.replace(/"([^"]*)"/g, (_, value) => `"${translate(value)}"`)
    : translate(part),
);
english = english
  .replace('<html lang="ko">', '<html lang="en">')
  .replace(/<(?:link|meta)\b[^>]+>/g, (tag) =>
    /rel="canonical"|property="og:url"/.test(tag)
      ? tag.replace(
          "https://gyuha.com/twin-deck/",
          "https://gyuha.com/twin-deck/en.html",
        )
      : tag,
  )
  .replace(
    /<a\b[^>]*\bclass="language-toggle"[\s\S]*?<\/a\s*>/,
    '<a class="language-toggle" href="index.html?lang=ko" lang="ko" hreflang="ko" aria-label="한국어로 읽기">한국어</a>',
  );
await writeFile(new URL("en.html", output), english);
