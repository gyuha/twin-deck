/// <reference types="vite/client" />
import { iconFileName } from "@twin-deck/material-icons";

// 파일 URL만 모은다(`?url`). SVG 본문은 번들에 넣지 않고 <img>가 필요할 때 받는다.
const urls = import.meta.glob("../../../../packages/material-icons/icons/*.svg", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;

const byFile = new Map(Object.entries(urls).map(([path, url]) => [path.slice(path.lastIndexOf("/") + 1), url]));

/** 아이콘 이름(매니페스트 id)의 SVG URL. */
export function iconUrl(icon: string): string {
  const url = byFile.get(iconFileName(icon));
  if (!url) throw new Error(`아이콘 파일이 없습니다: ${icon}`);
  return url;
}
