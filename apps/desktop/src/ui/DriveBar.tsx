import { volumeOf } from "../lib/volumes";
import { useApp, useAppStore } from "../state/context";
import { activeTab } from "../state/store";
import type { PaneId } from "../state/store";

/**
 * 패널 위의 드라이브 바(Double Commander 방식). 한 줄이다: 마운트된 볼륨 버튼(현재 볼륨 강조, 누르면 그 루트로 이동)이 왼쪽에 있고,
 * 오른쪽 끝에 루트가 아닌 볼륨일 때만 언마운트 버튼이 있다. 남은 용량은 이 바를 꺼도 보이도록 경로 표시줄(Breadcrumb) 오른쪽 끝에 있다.
 * 볼륨 버튼이 많아 줄이 넘치면 오른쪽 끝 블록은 다음 줄로 내려가도 오른쪽에 붙는다.
 * `behavior.layout.show_drive_bar`로 끈다(설정 화면, 메뉴바 View 메뉴, `core.view.drive_bar`).
 */
export function DriveBar({ pane }: { pane: PaneId }) {
  const { api } = useAppStore();
  const volumes = useApp((s) => s.volumes);
  const path = useApp((s) => activeTab(s, pane).path);
  const virtual = useApp((s) => !!activeTab(s, pane).virtual);
  const show = useApp((s) => s.loaded.config.behavior.layout.show_drive_bar);
  if (!show || volumes.length === 0) return null;
  const current = virtual ? null : volumeOf(path, volumes);
  const side = pane === "left" ? "왼쪽" : "오른쪽";
  return (
    <div className="shrink-0 border-b border-app-line text-xs">
      <div role="toolbar" aria-label={`드라이브 (${side} 패널)`} className="flex flex-wrap items-center gap-1 px-2 py-1">
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
        {current && current.mountPoint !== "/" && current.mountPoint !== volumes[0].mountPoint && (
          <span role="group" aria-label={`현재 볼륨 (${side} 패널)`} className="ml-auto flex shrink-0 items-center gap-2">
            <button type="button" aria-label="언마운트" className="rounded border border-app-line px-2 py-0.5 hover:bg-app-selected" onClick={() => void api.unmountVolume(pane)}>
              ⏏ 언마운트
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
