import { joinPath } from "@twin-deck/ts-client";
import { useAppStore } from "../state/context";
import type { PaneId } from "../state/store";

/** 경로를 조각으로 나눈 이동 링크 (NAV-12). */
export function Breadcrumb({ pane, path }: { pane: PaneId; path: string }) {
  const { api } = useAppStore();
  // Windows 드라이브(`C:\`, `C:/`)는 그 자체가 루트이고, 그 밖에는 `/`가 루트다.
  const drive = /^[A-Za-z]:[\\/]?/.exec(path)?.[0];
  const root = drive ? (/[\\/]$/.test(drive) ? drive : drive + "\\") : "/";
  const segments = [{ label: root, path: root }];
  for (const part of path.slice(drive?.length ?? 0).split(/[\\/]/).filter(Boolean)) {
    segments.push({ label: part, path: joinPath(segments[segments.length - 1].path, part) });
  }
  const go = (target: string) => {
    api.activate(pane);
    void api.navigate(target);
  };
  return (
    <nav aria-label="경로" className="flex flex-wrap items-center px-2 py-1 text-sm">
      {segments.map((seg, i) => {
        // `x.zip!`는 아카이브 경계다. 이름은 버튼에, 경계 표시는 그 뒤에 따로 둔다.
        const isArchive = seg.label.endsWith("!");
        return (
          <span key={seg.path} className="flex items-center">
            {i > 1 && <span aria-hidden>{seg.path.charAt(seg.path.length - seg.label.length - 1)}</span>}
            <button type="button" tabIndex={-1} onClick={() => go(seg.path)} className="hover:underline">
              {isArchive ? seg.label.slice(0, -1) : seg.label}
            </button>
            {isArchive && (
              <span role="img" aria-label="아카이브 경계" title="아카이브 경계" className="font-bold text-accent">
                !
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
