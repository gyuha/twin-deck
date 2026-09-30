import { useAppStore } from "../state/context";
import type { PaneId } from "../state/store";

/** 경로를 조각으로 나눈 이동 링크 (NAV-12). */
export function Breadcrumb({ pane, path }: { pane: PaneId; path: string }) {
  const { api } = useAppStore();
  const parts = path.split("/").filter(Boolean);
  const segments = [{ label: "/", path: "/" }].concat(
    parts.map((p, i) => ({ label: p, path: "/" + parts.slice(0, i + 1).join("/") })),
  );
  const go = (target: string) => {
    api.activate(pane);
    void api.navigate(target);
  };
  return (
    <nav aria-label="경로" className="flex flex-wrap items-center gap-1 px-2 py-1 text-sm">
      {segments.map((seg, i) => {
        // `x.zip!`는 아카이브 경계다. 이름은 버튼에, 경계 표시는 그 뒤에 따로 둔다.
        const isArchive = seg.label.endsWith("!");
        return (
          <span key={seg.path} className="flex items-center gap-1">
            {i > 1 && <span aria-hidden>/</span>}
            <button type="button" tabIndex={-1} onClick={() => go(seg.path)} className="hover:underline">
              {isArchive ? seg.label.slice(0, -1) : seg.label}
            </button>
            {isArchive && (
              <span role="img" aria-label="아카이브 경계" title="아카이브 경계" className="font-bold text-blue-600">
                !
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
