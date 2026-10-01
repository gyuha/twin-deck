import { iconNameFor } from "@twin-deck/material-icons";
import type { IconKind } from "@twin-deck/material-icons";
import { iconUrl } from "../lib/iconUrls";

/** 이름과 종류에 맞는 파일 아이콘. 장식이므로 보조 기술에는 노출하지 않는다. 심볼릭 링크에는 작은 화살표를 얹는다. */
export function FileIcon({ name, kind, size }: { name: string; kind: IconKind; size: number }) {
  const link = kind === "symlink";
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
      <img src={iconUrl(iconNameFor(name, kind))} alt="" width={size} height={size} draggable={false} />
    </div>
  );
}
