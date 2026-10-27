import { cp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// 저장소 전체 대신 소개 페이지와 허용한 공개 이미지 파일만 배포한다.
const root = new URL("../", import.meta.url);
const output = new URL("dist/site/", root);
await rm(output, { recursive: true, force: true });
await mkdir(new URL("assets/", output), { recursive: true });
for (const name of ["styles.css", "main.js", "language.js", "analytics.js", "sitemap.xml"]) {
  await cp(new URL(`site/${name}`, root), new URL(name, output));
}
// 앱 화면은 언어별로 둔다. 영문 페이지는 영어 UI로 찍은 docs/screenshots/en/의 같은 이름을 쓴다.
const screenshots = [
  "main",
  "drag-copy",
  "preview-code",
  "find",
  "treemap",
  "theme-dracula",
];
await mkdir(new URL("assets/en/", output), { recursive: true });
for (const name of screenshots) {
  await cp(
    new URL(`docs/screenshots/${name}.png`, root),
    new URL(`assets/${name}.png`, output),
  );
  await cp(
    new URL(`docs/screenshots/en/${name}.png`, root),
    new URL(`assets/en/${name}.png`, output),
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

// 검색 결과용 구조화 데이터는 언어별로 만들어 <head>에 넣는다. 가격·라이선스처럼 확인되지 않은 사실은 쓰지 않는다.
const siteUrl = "https://gyuha.com/twin-deck/";
const structuredData = {
  ko: {
    url: siteUrl,
    description:
      "두 패널을 나란히 놓고 키보드로 파일을 복사·이동·미리 보고 찾는 macOS · Windows용 듀얼 패널 파일 관리자.",
    inLanguage: "ko",
  },
  en: {
    url: `${siteUrl}en.html`,
    description:
      "A keyboard-driven dual-pane file manager for macOS and Windows. Copy, move, preview, and search files side by side.",
    inLanguage: "en",
  },
};
function withStructuredData(html, language) {
  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Twin Deck",
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "macOS, Windows",
    image: `${siteUrl}assets/${language === "en" ? "en/" : ""}main.png`,
    downloadUrl: "https://github.com/gyuha/twin-deck/releases",
    sameAs: ["https://github.com/gyuha/twin-deck"],
    ...structuredData[language],
  };
  // </script>로 끝나는 문자열이 섞여도 태그가 닫히지 않게 < 를 이스케이프한다.
  const json = JSON.stringify(data, null, 2).replaceAll("<", "\\u003c");
  return html.replace(
    "</head>",
    `    <script type="application/ld+json">\n${json}\n    </script>\n  </head>`,
  );
}

// 마크업은 하나로 유지하고 영어 정적 HTML도 생성한다. 번역 누락은 배포 전에 차단한다.
const translations = JSON.parse(
  await readFile(new URL("site/english.json", root), "utf8"),
);
const source = await readFile(new URL("site/index.html", root), "utf8");
await writeFile(
  new URL("index.html", output),
  withStructuredData(source, "ko"),
);
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
  .replace(
    '<meta property="og:locale" content="ko_KR" />',
    '<meta property="og:locale" content="en_US" />',
  )
  .replace(
    '<meta property="og:locale:alternate" content="en_US" />',
    '<meta property="og:locale:alternate" content="ko_KR" />',
  )
  .replace(/<(?:link|meta)\b[^>]+>/g, (tag) =>
    /rel="canonical"|property="og:url"/.test(tag)
      ? tag.replace(
          "https://gyuha.com/twin-deck/",
          "https://gyuha.com/twin-deck/en.html",
        )
      : tag,
  )
  .replace(
    new RegExp(`assets/(${screenshots.join("|")})\\.png`, "g"),
    "assets/en/$1.png",
  )
  .replace(
    /<a\b[^>]*\bclass="language-toggle"[\s\S]*?<\/a\s*>/,
    '<a class="language-toggle" href="index.html?lang=ko" lang="ko" hreflang="ko" aria-label="한국어로 읽기">한국어</a>',
  );
await writeFile(new URL("en.html", output), withStructuredData(english, "en"));
