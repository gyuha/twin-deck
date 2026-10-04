import { formatSpace } from "../lib/format";
import { volumeOf } from "../lib/volumes";
import { useApp, useAppStore } from "../state/context";
import { activeTab } from "../state/store";
import type { PaneId } from "../state/store";

/**
 * 패널 위의 드라이브 바(Double Commander 방식). 윗줄은 마운트된 볼륨 버튼(현재 볼륨 강조, 누르면 그 루트로 이동),
 * 아랫줄은 현재 볼륨 이름과 남은 용량, 루트가 아닌 볼륨의 언마운트 버튼이다. 용량을 알 수 없으면 남은 용량은 표시하지 않는다.
 * `behavior.layout.show_drive_bar`로 끈다(설정 화면, 메뉴바 View 메뉴, `core.view.drive_bar`).
 */
export function DriveBar({ pane }: { pane: PaneId }) {
  const { api } = useAppStore();
  const volumes = useApp((s) => s.volumes);
  const path = useApp((s) => activeTab(s, pane).path);
  const virtual = useApp((s) => !!activeTab(s, pane).virtual);
  const space = useApp((s) => s.diskSpace[pane]);
  const sizeFormat = useApp((s) => s.loaded.config.display.size_format);
  const show = useApp((s) => s.loaded.config.behavior.layout.show_drive_bar);
  if (!show || volumes.length === 0) return null;
  const current = virtual ? null : volumeOf(path, volumes);
  const side = pane === "left" ? "왼쪽" : "오른쪽";
  return (
    <div className="shrink-0 border-b border-app-line text-xs">
      <div role="toolbar" aria-label={`드라이브 (${side} 패널)`} className="flex flex-wrap gap-1 px-2 py-1">
        {volumes.map((v) => {
          const on = current?.mountPoint === v.mountPoint;
          return (
            <button
              key={v.mountPoint}
              type="button"
              aria-pressed={on}
              title={v.mountPoint}
              onClick={() => void api.selectVolume(pane, v.mountPoint)}
              className={"rounded border px-2 py-0.5 " + (on ? "border-accent bg-accent/15 text-ink" : "border-app-line text-ink-dull hover:bg-app-selected")}
            >
              {v.name}
            </button>
          );
        })}
      </div>
      <div role="group" aria-label={`현재 볼륨 (${side} 패널)`} className="flex items-center justify-between gap-2 px-2 pb-1">
        <span className="truncate">{current?.name ?? ""}</span>
        <span className="flex shrink-0 items-center gap-2">
          {current && space && <span title={`전체 ${formatSpace(space.total, sizeFormat)}`}>{formatSpace(space.free, sizeFormat)} 남음</span>}
          {current && current.mountPoint !== "/" && current.mountPoint !== volumes[0].mountPoint && (
            <button type="button" aria-label="언마운트" className="rounded border border-app-line px-2 py-0.5 hover:bg-app-selected" onClick={() => void api.unmountVolume(pane)}>
              ⏏ 언마운트
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
