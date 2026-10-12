import { existsSync } from "node:fs";
import { join } from "node:path";

/** @spacedrive 패키지 안의 파일 경로. bun이 패키지를 앱 폴더에 두든 저장소 루트에 올리든 찾는다. */
export function spacedriveFile(rel: string): string {
  const candidates = [join(__dirname, "../../node_modules/@spacedrive", rel), join(__dirname, "../../../../node_modules/@spacedrive", rel)];
  return candidates.find(existsSync) ?? candidates[0];
}
