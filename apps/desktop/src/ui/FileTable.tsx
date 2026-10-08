import { useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Rect, Virtualizer } from "@tanstack/react-virtual";
import type { EntryDto } from "@twin-deck/ts-client";
import { parseColumns } from "../lib/columns";
import type { ColumnSpec } from "../lib/columns";
import { COLUMN_TITLES, cellText } from "../lib/format";
import { quickMatchRange } from "../lib/names";
import { SORT_KEYS } from "../lib/sort";
import { FileIcon } from "./FileIcon";
import type { SortKey } from "../lib/sort";
import { useApp, useAppStore, useT } from "../state/context";
import { activeTab, effectiveSort, isFolderEntry } from "../state/store";
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

/** 표시 칸(`●`/`▸`)의 폭. 표시 칸을 끄면 이 칸이 열 정의에서 빠진다. */
const MARK_COLUMN = "1.25rem";

const gridTemplate = (cols: ColumnSpec[], iconSize: number, showMarks: boolean) =>
  `${showMarks ? `${MARK_COLUMN} ` : ""}${iconColumn(iconSize)} ${cols.map((c) => (c.width ? `${c.width}px` : DEFAULT_WIDTH[c.name])).join(" ")}`;

/** 폴더 이름 장식(`behavior.table.folder_style`)의 앞뒤 글자. 화면 표시만 바꾼다. */
const FOLDER_DECOR: Record<string, [string, string]> = { brackets: ["[", "]"], parens: ["(", ")"], slash: ["", "/"] };

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
      // jsdom은 scrollTop 설정이 값도 이벤트도 남기지 않는다. 이 보정은 jsdom에서만 해야 한다: 실제 브라우저에서는
      // 화면 배율이 100%가 아닌 Windows가 scrollTop을 물리 픽셀로 반올림해 읽은 값이 늘 달라지고, 그때 가짜 속성으로
      // 덮으면 그 뒤로 실제 스크롤이 영영 막힌다.
      if (navigator.userAgent.includes("jsdom") && el.scrollTop !== top) {
        Object.defineProperty(el, "scrollTop", { configurable: true, writable: true, value: top });
      }
      el.dispatchEvent(new Event("scroll"));
    },
  });
}

/** 빠른 선택으로 일치한 부분을 색으로 칠한 이름. 일치하지 않으면 이름 그대로다. */
function QuickHighlight({ name, input, prefixOnly }: { name: string; input: string; prefixOnly: boolean }) {
  const t = useT();
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
  const t = useT();
  const { api } = useAppStore();
  const tab = useApp((s) => activeTab(s, pane));
  const isActive = useApp((s) => s.activePane === pane);
  const config = useApp((s) => s.loaded.config);
  const dirSizes = useApp((s) => s.dirSizes);
  const rightClickSelect = config.behavior.table.right_click_select;
  const iconSize = config.behavior.table.icon_size;
  const { zebra_rows: zebra, show_marks: showMarks, folder_style: folderStyle, cursor_fill: cursorFill } = config.behavior.table;
  const [decoPre, decoPost] = FOLDER_DECOR[folderStyle] ?? ["", ""];
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
    const fill = cursor && isActive && cursorFill;
    const stripe = zebra ? (i % 2 === 1 ? "odd" : "even") : undefined;
    const [pre, post] = isFolderEntry(e) ? [decoPre, decoPost] : ["", ""];
    return (
      <div
        key={e.path}
        id={rowId(i)}
        role="option"
        aria-selected={selected}
        aria-rowindex={i + 1}
        data-cursor={cursor}
        data-cursor-fill={fill ? "true" : undefined}
        data-stripe={stripe}
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
          if (ev.ctrlKey || ev.metaKey) api.toggleSelectAt(i); // 키보드와 달리 클릭한 행에 커서가 머문다
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
            ? `${showMarks ? `${MARK_COLUMN} ` : ""}${iconColumn(iconSize)} minmax(0,1fr)`
            : gridTemplate(columns, iconSize, showMarks),
        }}
        className={[
          "grid",
          "h-6 cursor-default items-center border-l-[3px] px-2",
          // 커서: 은은한 배경 + 왼쪽 막대(활성 패널은 accent). 커서 행 꽉 채움을 켜면 활성 패널의 커서 행은 accent 배경이다.
          // 선택: accent 굵은 글자(꽉 채운 행 위에서는 배경과 같은 색이 되지 않게 굵게만). 줄무늬: 커서 행이 아닌 홀수 번째 행.
          cursor
            ? isActive
              ? fill
                ? "border-accent bg-accent text-accent-ink"
                : "border-accent bg-app-selected"
              : "border-ink-faint bg-app-selected"
            : stripe === "odd"
              ? "border-transparent bg-app-line/20"
              : "border-transparent",
          selected ? (fill ? "font-semibold" : "font-semibold text-accent") : "",
        ].join(" ")}
      >
        {showMarks && (
          <span aria-hidden data-mark>
            {mark}
          </span>
        )}
        <FileIcon name={e.name} kind={e.kind} size={iconSize} />
        {(multi ? [{ name: "name" } as ColumnSpec] : columns).map((c, k) => (
          <span key={`${c.name}-${k}`} className={c.name === "name" ? "truncate" : "truncate text-right tabular-nums"}>
            {c.name === "name" && tab.quick ? (
              <>
                {pre}
                <QuickHighlight name={e.name} input={tab.quick} prefixOnly={config.behavior.quick_select.match_only_prefix} />
                {post}
              </>
            ) : c.name === "name" ? (
              `${pre}${cellText(e, c.name, config.display, undefined, tab.virtual?.kind === "usage", dirSizes[e.path])}${post}`
            ) : (
              cellText(e, c.name, config.display, undefined, tab.virtual?.kind === "usage", dirSizes[e.path])
            )}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col text-sm">
      {!multi && (
        <div
          role="row"
          aria-label={t("table.header_aria")}
          style={{ gridTemplateColumns: gridTemplate(columns, iconSize, showMarks) }}
          className="grid border-b border-l-[3px] border-app-line border-l-transparent px-2 text-xs text-ink-dull"
        >
          {showMarks && <span aria-hidden />}
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
        <div className="px-2 py-1 text-ink-faint">{tab.virtual?.running ? t("table.searching") : t("table.empty")}</div>
      )}
      <div
        ref={listRef}
        role="listbox"
        aria-label={t("table.list_aria", { side: pane === "left" ? t("common.left") : t("common.right") })}
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
        <div role="status" aria-label={t("table.quick_aria")} className="border-t border-app-line bg-status-warning/15 px-2 py-0.5">
          {t("table.quick_label")} <span>{tab.quick}</span>
        </div>
      )}
    </div>
  );
}
