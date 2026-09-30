// 아카이브 판별. Rust `td_archive::kind_for_name`과 같은 규칙이며, 두 목록이 어긋나면 td-archive 테스트가 실패한다.
const ZIP_EXTS = ["zip", "jar", "war", "aar", "apk", "nupkg", "klib", "sublime-package"];
const TAR_SUFFIXES = [".tar.gz", ".tgz", ".tar.bz2", ".tbz2", ".tbz", ".tar"];

/** 파일 이름이 아카이브(ZIP 계열 + 설정의 추가 확장자, tar 계열)인가. 추가 확장자는 점 없이, 대소문자 무시. */
export function isArchiveName(name: string, extraZipExts: readonly string[] = []): boolean {
  const lower = name.toLowerCase();
  if (TAR_SUFFIXES.some((s) => lower.length > s.length && lower.endsWith(s))) return true;
  const dot = lower.lastIndexOf(".");
  if (dot <= 0) return false;
  const ext = lower.slice(dot + 1);
  return ZIP_EXTS.includes(ext) || extraZipExts.some((e) => e.replace(/^\./, "").toLowerCase() === ext);
}

/** 아카이브 파일 경로에 해당하는 아카이브 루트 경로(`x.zip` → `x.zip!`). */
export function archiveRoot(filePath: string): string {
  return `${filePath}!`;
}

/** 경로가 아카이브 안(또는 아카이브 루트)인가. */
export function isArchivePath(path: string): boolean {
  return /!(\/|$)/.test(path);
}

/** 아카이브 루트(`…!`)이면 그 아카이브 파일 이름(`x.zip`), 아니면 그대로. 상위 이동 후 커서를 맞출 때 쓴다. */
export function archiveFileName(base: string): string {
  return base.endsWith("!") ? base.slice(0, -1) : base;
}
