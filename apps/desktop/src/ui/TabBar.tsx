import { baseName } from "@twin-deck/ts-client";
import { useApp, useAppStore } from "../state/context";
import type { PaneId } from "../state/store";

export function TabBar({ pane }: { pane: PaneId }) {
  const { tabs, active } = useApp((s) => s.panes[pane]);
  const { api } = useAppStore();
  return (
    <div role="tablist" aria-label="탭" className="flex gap-1 border-b border-neutral-300 px-1 text-sm">
      {tabs.map((t, i) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          tabIndex={-1}
          aria-selected={i === active}
          onClick={() => api.activate(pane)}
          className={i === active ? "border-b-2 border-blue-600 px-2 font-semibold" : "px-2 text-neutral-500"}
        >
          {baseName(t.path) || "/"}
        </button>
      ))}
    </div>
  );
}
