import { iconNameFor } from "@twin-deck/material-icons";
import type { IconKind } from "@twin-deck/material-icons";
import { iconUrl } from "../lib/iconUrls";
import { useSystemIcon } from "../lib/systemIcons";
import { useAppStore } from "../state/context";

/**
 * 이름과 종류에 맞는 파일 아이콘. 장식이므로 보조 기술에는 노출하지 않는다. 심볼릭 링크에는 작은 화살표를 얹는다.
 * 링크는 `kind`가 `symlink`이거나(대상 파일의 아이콘 규칙) 폴더 아이콘(`kind="dir"`)에 `link`를 켜서 "폴더 링크"를 나타낸다.
 * `systemIcons`(설정 `behavior.table.system_icons`)가 켜져 있고 `path`가 있으면 운영체제가 쓰는 아이콘을 요청해 보여 주고,
 * 응답이 오기 전이나 얻지 못했을 때는 이 앱의 아이콘을 그대로 둔다.
 */
export function FileIcon({ name, kind, size, link: linkProp, path, systemIcons }: { name: string; kind: IconKind; size: number; link?: boolean; path?: string; systemIcons?: boolean }) {
  const { api } = useAppStore();
  const system = useSystemIcon(api, systemIcons && path ? { path, name, isDir: kind === "dir", size } : null);
  const link = linkProp ?? kind === "symlink";
  return (
    <div
      aria-hidden="true"
      data-link={link ? "true" : undefined}
      className={
        "relative flex items-center" +
        (link
          ? " after:absolute after:bottom-[-2px] after:left-[calc(var(--icon)-6px)] after:text-[9px] after:font-bold after:leading-none after:content-['↗']"
          : "")
      }
      style={{ "--icon": `${size}px` } as React.CSSProperties}
    >
      <img src={system ?? iconUrl(iconNameFor(name, kind))} alt="" width={size} height={size} draggable={false} />
    </div>
  );
}
