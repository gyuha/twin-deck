import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// 저장소 전체 대신 소개 페이지와 허용한 공개 이미지 파일만 배포한다.
const root = new URL("../", import.meta.url);
const output = new URL("dist/site/", root);
await rm(output, { recursive: true, force: true });
await mkdir(new URL("assets/", output), { recursive: true });
for (const name of ["index.html", "styles.css", "main.js"]) {
  await cp(new URL(`site/${name}`, root), new URL(name, output));
}
for (const name of [
  "main",
  "drag-copy",
  "preview-code",
  "find",
  "treemap",
  "theme-light",
  "theme-dracula",
]) {
  await cp(
    new URL(`docs/screenshots/${name}.png`, root),
    new URL(`assets/${name}.png`, output),
  );
}
await cp(
  new URL("apps/desktop/src-tauri/icons/128x128@2x.png", root),
  new URL("assets/icon.png", output),
);
await writeFile(new URL(".nojekyll", output), "");
console.log(`소개 페이지 생성: ${fileURLToPath(output)}`);
