import { useEffect } from "react";
import { parentPath } from "@twin-deck/ts-client";
import type { EntryDto } from "@twin-deck/ts-client";
import { useApp, useAppStore } from "../state/context";
import { activeTab } from "../state/store";
import type { PaneId } from "../state/store";

function humanSize(e: EntryDto): string {
  if (e.kind === "dir") return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = e.size;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${i === 0 ? n : n.toFixed(1)} ${units[i]}`;
}

export function FileTable({ pane }: { pane: PaneId }) {
  const { api } = useAppStore();
  const tab = useApp((s) => activeTab(s, pane));
  const isActive = useApp((s) => s.activePane === pane);
  const rightClickSelect = useApp((s) => s.loaded.config.behavior.table.right_click_select);
  const rowId = (i: number) => `${pane}-${tab.id}-row-${i}`;

  useEffect(() => {
    document.getElementById(rowId(tab.cursor))?.scrollIntoView?.({ block: "nearest" });
  });

  const activate = () => api.activate(pane);

  return (
    <div className="flex min-h-0 flex-1 flex-col text-sm">
      {parentPath(tab.path) !== null && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="상위 폴더"
          onDoubleClick={() => {
            activate();
            void api.goUp();
          }}
          className="px-2 py-0.5 text-left text-neutral-500"
        >
          ..
        </button>
      )}
      {tab.error && (
        <div role="alert" className="bg-red-100 px-2 py-1 text-red-800">
          {tab.error}
        </div>
      )}
      {!tab.error && tab.entries.length === 0 && <div className="px-2 py-1 text-neutral-500">항목 없음</div>}
      <div
        role="listbox"
        aria-label={`${pane === "left" ? "왼쪽" : "오른쪽"} 파일 목록`}
        aria-multiselectable="true"
        aria-activedescendant={tab.entries.length ? rowId(tab.cursor) : undefined}
        aria-rowcount={tab.entries.length}
        className="min-h-0 flex-1 overflow-auto"
      >
        {tab.entries.map((e, i) => {
          const selected = tab.selection.has(e.path);
          const cursor = i === tab.cursor;
          return (
            <div
              key={e.path}
              id={rowId(i)}
              role="option"
              aria-selected={selected}
              aria-rowindex={i + 1}
              data-cursor={cursor}
              onClick={(ev) => {
                activate();
                api.setCursor(i);
                if (ev.ctrlKey || ev.metaKey) api.toggleSelect();
              }}
              onDoubleClick={() => {
                activate();
                api.setCursor(i);
                void api.open();
              }}
              onContextMenu={(ev) => {
                if (!rightClickSelect) return;
                ev.preventDefault();
                activate();
                api.toggleSelectAt(i);
              }}
              className={[
                "grid cursor-default grid-cols-[1.25rem_1fr_6rem_8rem] px-2 py-0.5",
                cursor ? (isActive ? "bg-blue-600 text-white outline outline-2 outline-blue-800" : "bg-neutral-300") : "",
                selected ? "font-bold" : "",
              ].join(" ")}
            >
              <span aria-hidden>{selected ? "●" : e.kind === "dir" ? "▸" : ""}</span>
              <span className="truncate">{e.name}</span>
              <span className="text-right tabular-nums">{humanSize(e)}</span>
              <span className="text-right tabular-nums">
                {e.modifiedMs ? new Date(e.modifiedMs).toLocaleDateString() : ""}
              </span>
            </div>
          );
        })}
      </div>
      {tab.quick !== null && (
        <div role="status" aria-label="빠른 선택" className="border-t border-neutral-300 bg-yellow-50 px-2 py-0.5">
          빠른 선택: <span>{tab.quick}</span>
        </div>
      )}
    </div>
  );
}
