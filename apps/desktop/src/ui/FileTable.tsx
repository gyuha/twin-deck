import { useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Rect, Virtualizer } from "@tanstack/react-virtual";
import { parentPath } from "@twin-deck/ts-client";
import type { EntryDto } from "@twin-deck/ts-client";
import { parseColumns } from "../lib/columns";
import type { ColumnSpec } from "../lib/columns";
import { COLUMN_TITLES, cellText } from "../lib/format";
import { SORT_KEYS } from "../lib/sort";
import type { SortKey } from "../lib/sort";
import { useApp, useAppStore } from "../state/context";
import { activeTab, effectiveSort } from "../state/store";
import type { PaneId } from "../state/store";

const ROW_HEIGHT = 24;

const DEFAULT_WIDTH: Record<ColumnSpec["name"], string> = {
  name: "minmax(0,1fr)",
  size: "6rem",
  created: "8rem",
  modified: "8rem",
  added: "6rem",
  extension: "5rem",
  permissions: "7rem",
  permissions_octal: "5rem",
};

const gridTemplate = (cols: ColumnSpec[]) =>
  `1.25rem ${cols.map((c) => (c.width ? `${c.width}px` : DEFAULT_WIDTH[c.name])).join(" ")}`;

/** 보이는 행만 그리는 가상 스크롤러. jsdom처럼 크기 관찰이 없는 환경에서도 동작하도록 측정을 직접 제공한다. */
function useRows(count: number, ref: React.RefObject<HTMLDivElement | null>): Virtualizer<HTMLDivElement, Element> {
  return useVirtualizer<HTMLDivElement, Element>({
    count,
    getScrollElement: () => ref.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    useFlushSync: false, // 이펙트 안의 스크롤이 렌더 중 flushSync를 일으키지 않게 한다
    initialRect: { width: 800, height: 480 },
    observeElementRect: (instance, cb) => {
      const el = instance.scrollElement;
      if (!el) return;
      const report = () => cb({ width: el.clientWidth || 800, height: el.clientHeight || 480 } satisfies Rect);
      report();
      if (typeof ResizeObserver === "undefined") return;
      const ro = new ResizeObserver(report);
      ro.observe(el);
      return () => ro.disconnect();
    },
    scrollToFn: (offset, { adjustments = 0 }, instance) => {
      const el = instance.scrollElement;
      if (!el) return;
      const top = offset + adjustments;
      el.scrollTop = top;
      // jsdom은 scrollTop 설정이 값도 이벤트도 남기지 않는다. 실제 브라우저에서는 이 분기에 들어오지 않는다.
      if (el.scrollTop !== top) Object.defineProperty(el, "scrollTop", { configurable: true, writable: true, value: top });
      el.dispatchEvent(new Event("scroll"));
    },
  });
}

export function FileTable({ pane }: { pane: PaneId }) {
  const { api } = useAppStore();
  const tab = useApp((s) => activeTab(s, pane));
  const isActive = useApp((s) => s.activePane === pane);
  const config = useApp((s) => s.loaded.config);
  const rightClickSelect = config.behavior.table.right_click_select;
  const columns = useMemo(() => parseColumns(config.view.table.columns), [config.view.table.columns]);
  const sort = effectiveSort(tab, config.view.table.columns);

  const multi = tab.view.mode === "columns";
  const colCount = tab.view.mode === "columns" ? tab.view.count : 1;
  const rows = Math.max(1, Math.ceil(tab.entries.length / colCount));
  const listRef = useRef<HTMLDivElement>(null);
  const virtualizer = useRows(rows, listRef);
  const rowId = (i: number) => `${pane}-${tab.id}-row-${i}`;

  // 커서가 화면 밖이면 스크롤한다 (열 우선 배치: index = 열 * rows + 행).
  useEffect(() => {
    if (tab.entries.length > 0) virtualizer.scrollToIndex(tab.cursor % rows, { align: "auto" });
  }, [tab.cursor, rows, tab.entries.length, virtualizer]);

  const activate = () => api.activate(pane);

  const renderRow = (e: EntryDto, i: number) => {
    const selected = tab.selection.has(e.path);
    const cursor = i === tab.cursor;
    const mark = selected ? "●" : e.kind === "dir" ? "▸" : "";
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
        style={multi ? undefined : { gridTemplateColumns: gridTemplate(columns) }}
        className={[
          multi ? "grid grid-cols-[1.25rem_minmax(0,1fr)]" : "grid",
          "h-6 cursor-default items-center px-2",
          cursor ? (isActive ? "bg-blue-600 text-white outline outline-2 outline-blue-800" : "bg-neutral-300") : "",
          selected ? "font-bold" : "",
        ].join(" ")}
      >
        <span aria-hidden>{mark}</span>
        {(multi ? [{ name: "name" } as ColumnSpec] : columns).map((c, k) => (
          <span key={`${c.name}-${k}`} className={c.name === "name" ? "truncate" : "truncate text-right tabular-nums"}>
            {cellText(e, c.name, config.display, undefined, tab.virtual?.kind === "usage")}
          </span>
        ))}
      </div>
    );
  };

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
      {!multi && (
        <div
          role="row"
          aria-label="컬럼 머리글"
          style={{ gridTemplateColumns: gridTemplate(columns) }}
          className="grid border-b border-neutral-300 px-2 text-xs text-neutral-600"
        >
          <span aria-hidden />
          {columns.map((c, k) => {
            const sortable = (SORT_KEYS as readonly string[]).includes(c.name);
            const active = sortable && sort.key === c.name;
            return (
              <span
                key={`${c.name}-${k}`}
                role="columnheader"
                aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                onClick={() => {
                  if (!sortable) return;
                  activate();
                  api.setOrder({ by: c.name as SortKey });
                }}
                className={(c.name === "name" ? "" : "text-right ") + (sortable ? "cursor-pointer" : "")}
              >
                {COLUMN_TITLES[c.name]}
                {active ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
              </span>
            );
          })}
        </div>
      )}
      {tab.error && (
        <div role="alert" className="bg-red-100 px-2 py-1 text-red-800">
          {tab.error}
        </div>
      )}
      {!tab.error && tab.entries.length === 0 && (
        <div className="px-2 py-1 text-neutral-500">{tab.virtual?.running ? "찾는 중…" : "항목 없음"}</div>
      )}
      <div
        ref={listRef}
        role="listbox"
        aria-label={`${pane === "left" ? "왼쪽" : "오른쪽"} 파일 목록`}
        aria-multiselectable="true"
        aria-activedescendant={tab.entries.length ? rowId(tab.cursor) : undefined}
        aria-rowcount={tab.entries.length}
        data-view={multi ? `columns-${colCount}` : "table"}
        className="min-h-0 flex-1 overflow-auto"
      >
        <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
          {virtualizer.getVirtualItems().map((v) => (
            <div
              key={v.key}
              role="presentation"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: ROW_HEIGHT,
                transform: `translateY(${v.start}px)`,
                display: multi ? "grid" : "block",
                gridTemplateColumns: multi ? `repeat(${colCount}, minmax(0,1fr))` : undefined,
              }}
            >
              {Array.from({ length: colCount }, (_, c) => {
                const i = c * rows + v.index;
                const e = tab.entries[i];
                return e ? renderRow(e, i) : null;
              })}
            </div>
          ))}
        </div>
      </div>
      {tab.quick !== null && (
        <div role="status" aria-label="빠른 선택" className="border-t border-neutral-300 bg-yellow-50 px-2 py-0.5">
          빠른 선택: <span>{tab.quick}</span>
        </div>
      )}
    </div>
  );
}
