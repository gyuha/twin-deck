import manifest from "../manifest.json";

export type IconKind = "file" | "dir" | "symlink";

const definitions: Record<string, { iconPath: string }> = manifest.iconDefinitions;

// 매니페스트에는 `APKBUILD`처럼 대문자가 섞인 키가 있어 소문자 맵을 따로 만든다. 정확히 같은 키를 먼저 본다.
function lowerMap(map: Record<string, string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(map)) {
    const lk = k.toLowerCase();
    if (!out.has(lk)) out.set(lk, v);
  }
  return out;
}

const fileNames = lowerMap(manifest.fileNames);
const fileExtensions = lowerMap(manifest.fileExtensions);
const folderNames = lowerMap(manifest.folderNames);

/** 항목의 이름과 종류로 아이콘 이름(매니페스트의 아이콘 id)을 정한다. */
export function iconNameFor(name: string, kind: IconKind): string {
  const lower = name.toLowerCase();
  if (kind === "dir") return folderNames.get(lower) ?? manifest.folder;

  const byName = fileNames.get(lower);
  if (byName) return byName;

  // `a.test.ts`는 `test.ts`, `ts` 순으로 긴 확장자부터 찾는다.
  let dot = lower.indexOf(".");
  while (dot !== -1) {
    const byExt = fileExtensions.get(lower.slice(dot + 1));
    if (byExt) return byExt;
    dot = lower.indexOf(".", dot + 1);
  }
  return manifest.file;
}

/** 아이콘 이름에 대응하는 `icons/` 안의 SVG 파일명. */
export function iconFileName(icon: string): string {
  const def = definitions[icon];
  if (!def) throw new Error(`알 수 없는 아이콘: ${icon}`);
  return def.iconPath.slice(def.iconPath.lastIndexOf("/") + 1);
}
