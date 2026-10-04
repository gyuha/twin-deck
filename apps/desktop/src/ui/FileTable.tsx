import { useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Rect, Virtualizer } from "@tanstack/react-virtual";
import { parentPath } from "@twin-deck/ts-client";
import type { EntryDto } from "@twin-deck/ts-client";
import { parseColumns } from "../lib/columns";
import type { ColumnSpec } from "../lib/columns";
import { COLUMN_TITLES, cellText } from "../lib/format";
import { quickMatchRange } from "../lib/names";
import { SORT_KEYS } from "../lib/sort";
import { FileIcon } from "./FileIcon";
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

/** 아이콘 칸은 아이콘 크기에 이름과의 간격(6px)을 더한 폭이다. */
const iconColumn = (iconSize: number) => `${iconSize + 6}px`;

const gridTemplate = (cols: ColumnSpec[], iconSize: number) =>
  `1.25rem ${iconColumn(iconSize)} ${cols.map((c) => (c.width ? `${c.width}px` : DEFAULT_WIDTH[c.name])).join(" ")}`;

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

/** 빠른 선택으로 일치한 부분을 색으로 칠한 이름. 일치하지 않으면 이름 그대로다. */
function QuickHighlight({ name, input, prefixOnly }: { name: string; input: string; prefixOnly: boolean }) {
  const range = quickMatchRange(name, input, prefixOnly);
  if (!range) return <>{name}</>;
  const shown = name.normalize("NFC");
  return (
    <>
      {shown.slice(0, range[0])}
      <mark data-quick-match className="rounded-sm bg-status-warning/55 font-semibold text-inherit">
        {shown.slice(range[0], range[1])}
      </mark>
      {shown.slice(range[1])}
    </>
  );
}

export function FileTable({ pane }: { pane: PaneId }) {
  const { api } = useAppStore();
  const tab = useApp((s) => activeTab(s, pane));
  const isActive = useApp((s) => s.activePane === pane);
  const config = useApp((s) => s.loaded.config);
  const rightClickSelect = config.behavior.table.right_click_select;
  const iconSize = config.behavior.table.icon_size;
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
  const drag = useApp((s) => s.drag);

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
        data-path={e.path}
        data-pane={pane}
        data-row-kind={e.kind}
        data-drop-target={drag?.target?.row && drag.target.pane === pane && drag.target.dir === e.path ? "true" : undefined}
        onMouseDown={(ev) => {
          // 왼쪽 단추만, 수정자 없이 눌렀을 때 드래그의 시작점이 된다(Ctrl/Shift/Cmd+클릭은 선택용이다).
          if (ev.button === 0 && !ev.ctrlKey && !ev.shiftKey && !ev.metaKey) api.dragPress(pane, i, ev.clientX, ev.clientY);
        }}
        onClick={(ev) => {
          activate();
          if (ev.shiftKey) {
            api.selectRangeTo(i); // 커서가 기준 행이라 setCursor 보다 먼저
            return;
          }
          api.setCursor(i);
          if (ev.ctrlKey || ev.metaKey) api.toggleSelect();
        }}
        onDoubleClick={() => {
          activate();
          api.setCursor(i);
          void api.open();
        }}
        onContextMenu={(ev) => {
          ev.preventDefault();
          activate();
          if (rightClickSelect) api.toggleSelectAt(i);
          api.openContextMenu(pane, i, ev.clientX, ev.clientY);
        }}
        style={{
          gridTemplateColumns: multi
            ? `1.25rem ${iconColumn(iconSize)} minmax(0,1fr)`
            : gridTemplate(columns, iconSize),
        }}
        className={[
          "grid",
          "h-6 cursor-default items-center border-l-[3px] px-2",
          // 커서: 은은한 배경 + 왼쪽 막대(활성 패널은 accent). 선택: accent 굵은 글자.
          cursor ? (isActive ? "border-accent bg-app-selected" : "border-ink-faint bg-app-selected") : "border-transparent",
          selected ? "font-semibold text-accent" : "",
        ].join(" ")}
      >
        <span aria-hidden>{mark}</span>
        <FileIcon name={e.name} kind={e.kind} size={iconSize} />
        {(multi ? [{ name: "name" } as ColumnSpec] : columns).map((c, k) => (
          <span key={`${c.name}-${k}`} className={c.name === "name" ? "truncate" : "truncate text-right tabular-nums"}>
            {c.name === "name" && tab.quick ? (
              <QuickHighlight name={e.name} input={tab.quick} prefixOnly={config.behavior.quick_select.match_only_prefix} />
            ) : (
              cellText(e, c.name, config.display, undefined, tab.virtual?.kind === "usage")
            )}
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
          className="px-2 py-0.5 text-left text-ink-faint"
        >
          ..
        </button>
      )}
      {!multi && (
        <div
          role="row"
          aria-label="컬럼 머리글"
          style={{ gridTemplateColumns: gridTemplate(columns, iconSize) }}
          className="grid border-b border-l-[3px] border-app-line border-l-transparent px-2 text-xs text-ink-dull"
        >
          <span aria-hidden />
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
        <div role="alert" className="bg-status-error/15 px-2 py-1 text-status-error">
          {tab.error}
        </div>
      )}
      {!tab.error && tab.entries.length === 0 && (
        <div className="px-2 py-1 text-ink-faint">{tab.virtual?.running ? "찾는 중…" : "항목 없음"}</div>
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
        <div role="status" aria-label="빠른 선택" className="border-t border-app-line bg-status-warning/15 px-2 py-0.5">
          빠른 선택: <span>{tab.quick}</span>
        </div>
      )}
    </div>
  );
}
