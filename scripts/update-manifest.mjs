#!/usr/bin/env node
// 업데이트용 latest.json에 이 OS의 항목을 병합한다. macOS와 Windows를 따로 빌드·업로드하므로, 올라와 있는 latest.json을
// 읽어 이 플랫폼 항목만 더하거나 바꾼다. 올리지 않은 OS의 항목은 만들지 않는다(그 OS는 그 버전을 건너뛴다).
//
// 사용: node scripts/update-manifest.mjs --version 0.5.0 --platform darwin-aarch64 --url <URL> --sig-file <.sig 파일>
//        [--existing <기존 latest.json>] [--notes <릴리스 노트>] [--pub-date <RFC 3339>] --out <latest.json>
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Tauri updater가 읽는 형식: { version, notes, pub_date, platforms: { "<os>-<arch>": { url, signature } } } */
export function mergeManifest(existing, { version, platform, url, signature, notes, pubDate }) {
  if (!version) throw new Error("version이 필요합니다");
  if (!platform) throw new Error("platform이 필요합니다");
  if (!url) throw new Error("url이 필요합니다");
  const sig = (signature ?? "").trim();
  if (!sig) throw new Error("서명(.sig) 내용이 비어 있습니다");
  if (existing && existing.version !== version) {
    throw new Error(`기존 latest.json의 버전(${existing.version})이 ${version}과 다릅니다. 한 매니페스트에 두 버전을 섞을 수 없습니다`);
  }
  return {
    version,
    notes: notes ?? existing?.notes ?? "",
    pub_date: pubDate ?? existing?.pub_date ?? new Date().toISOString(),
    platforms: { ...(existing?.platforms ?? {}), [platform]: { url, signature: sig } },
  };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!key?.startsWith("--") || argv[i + 1] === undefined) throw new Error(`잘못된 인수: ${key ?? ""}`);
    out[key.slice(2)] = argv[i + 1];
  }
  return out;
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  for (const k of ["version", "platform", "url", "sig-file", "out"]) if (!a[k]) throw new Error(`--${k}가 필요합니다`);
  const existing = a.existing && existsSync(a.existing) ? JSON.parse(readFileSync(a.existing, "utf8")) : null;
  const merged = mergeManifest(existing, {
    version: a.version,
    platform: a.platform,
    url: a.url,
    signature: readFileSync(a["sig-file"], "utf8"),
    notes: a.notes,
    pubDate: a["pub-date"],
  });
  writeFileSync(a.out, JSON.stringify(merged, null, 2) + "\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(`update-manifest: ${e.message}`);
    process.exit(1);
  }
}
