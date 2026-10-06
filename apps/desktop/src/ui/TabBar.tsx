import { baseName } from "@twin-deck/ts-client";
import { useApp, useAppStore } from "../state/context";
import type { PaneId } from "../state/store";

export function TabBar({ pane }: { pane: PaneId }) {
  const { tabs, active } = useApp((s) => s.panes[pane]);
  const segments = useApp((s) => s.loaded.config.behavior.layout.tab_style === "segments");
  const { api } = useAppStore();
  return (
    <div role="tablist" aria-label="탭" className={segments ? "flex border-b border-app-line text-sm" : "flex gap-1 border-b border-app-line px-1 text-sm"}>
      {tabs.map((t, i) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          tabIndex={-1}
          aria-selected={i === active}
          onClick={() => api.activate(pane, i)}
          className={
            segments
              ? // 칸형(Marta식): 폭을 균등 분할하고 활성 탭은 배경으로 구분한다. 좁아지면 이름을 말줄임으로 줄인다.
                "min-w-0 flex-1 truncate border-r border-app-line px-2 text-center last:border-r-0 " + (i === active ? "bg-app-selected font-semibold" : "text-ink-faint")
              : i === active
                ? "border-b-2 border-accent px-2 font-semibold"
                : "px-2 text-ink-faint"
          }
        >
          {t.virtual ? t.virtual.title : baseName(t.path) || t.path}
        </button>
      ))}
    </div>
  );
}
