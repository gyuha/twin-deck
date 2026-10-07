import { useEffect, useMemo, useRef, useState } from "react";
import { formatSize } from "../lib/format";
import { groupSmall, layoutTreemap, OTHER } from "../lib/treemap";
import type { Tile } from "../lib/treemap";
import { useApp, useAppStore } from "../state/context";
import { activeTab, publishUsageTiles } from "../state/store";
import type { PaneId } from "../state/store";

/** 측정하지 못할 때(첫 그리기 전, 테스트)의 그림 크기. */
const FALLBACK = { w: 800, h: 480 };
/** 타일에 글자를 넣을 수 있는 최소 크기(px). */
const LABEL_MIN = { w: 64, h: 34 };

/**
 * Disk Usage의 treemap 보기: 바로 아래 항목의 크기를 면적에 비례한 사각형 타일로 그린다(squarified).
 * 전체의 0.5% 미만인 항목은 "기타 N개" 타일 하나로 묶는다. 커서는 그 항목의 타일에 표시된다.
 * 방향키는 화면에서 인접한 타일로 커서를 옮기고(Home·End는 크기순 처음/끝), 타일 클릭·Enter는 반대쪽 패널에 그 폴더를 연다.
 * 더블클릭·Shift+→·Mod+Enter는 그 폴더로 내려가며, Backspace는 한 단계 위로 올라간다.
 */
export function UsageTreemap({ pane }: { pane: PaneId }) {
  const { api } = useAppStore();
  const tab = useApp((s) => activeTab(s, pane));
  const style = useApp((s) => s.loaded.config.display.size_format);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(FALLBACK);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => el.clientWidth > 0 && el.clientHeight > 0 && setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const entries = tab.entries;
  const total = entries.reduce((s, e) => s + e.size, 0);
  const { tiles, other, byId } = useMemo(() => {
    const items = entries.map((e) => ({ id: e.path, value: e.size }));
    const { kept, other } = groupSmall(items);
    const all = other ? [...kept, { id: OTHER, value: other.value }] : kept;
    return { tiles: layoutTreemap(all, size.w, size.h), other, byId: new Map(entries.map((e, i) => [e.path, i])) };
  }, [entries, size.w, size.h]);

  // 방향키 이동이 화면과 같은 배치를 쓰도록 스토어에 알려 둔다.
  useEffect(() => {
    publishUsageTiles(pane, tiles);
    return () => publishUsageTiles(pane, undefined);
  }, [pane, tiles]);

  const cursorPath = entries[tab.cursor]?.path;
  const selectedId = cursorPath && other?.ids.includes(cursorPath) ? OTHER : cursorPath;
  const pct = (v: number) => (total > 0 ? `${((v / total) * 100).toFixed(1)}%` : "0.0%");
  /** 타일을 눌렀을 때 커서를 옮긴다. "기타" 타일은 묶인 첫 항목에 커서를 둔다(타일이 선택 표시되도록). 폴더·파일 항목이면 그 번호, 아니면 -1. */
  const pick = (t: Tile) => {
    api.activate(pane);
    if (t.id === OTHER) {
      const first = other ? byId.get(other.ids[0]) : undefined;
      if (first !== undefined) api.setCursor(first);
      return -1;
    }
    const i = byId.get(t.id) ?? -1;
    if (i >= 0) api.setCursor(i);
    return i;
  };
  const hue = (i: number) => `hsl(${(i * 47) % 360} 52% 40%)`;

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden p-1">
      <div ref={box} role="img" aria-label="용량 treemap" className="relative h-full w-full">
        {tiles.map((t, n) => {
          const isOther = t.id === OTHER;
          const e = isOther ? undefined : entries[byId.get(t.id) ?? -1];
          const name = isOther ? `기타 ${other?.count}개` : (e?.name ?? "");
          const bytes = isOther ? (other?.value ?? 0) : (e?.size ?? 0);
          const isDir = e?.kind === "dir";
          const roomy = t.w >= LABEL_MIN.w && t.h >= LABEL_MIN.h;
          return (
            <div
              key={t.id}
              data-tile
              aria-selected={t.id === selectedId}
              title={`${name} · ${formatSize(bytes, style)} · ${pct(bytes)}`}
              onClick={() => {
                pick(t);
                void api.usageOpenOther(t.id === OTHER);
              }}
              onDoubleClick={() => {
                if (pick(t) >= 0) void api.usageDescend();
              }}
              style={{
                position: "absolute",
                left: t.x,
                top: t.y,
                width: Math.max(t.w - 1, 0),
                height: Math.max(t.h - 1, 0),
                background: isOther ? "hsl(220 6% 30%)" : isDir ? hue(n) : "hsl(220 8% 38%)",
                border: isOther ? "1px dashed hsl(220 6% 55%)" : undefined,
                outline: t.id === selectedId ? "2px solid var(--color-accent, #6aa9ff)" : undefined,
                outlineOffset: -2,
              }}
              className="cursor-pointer overflow-hidden px-1 py-0.5 text-xs leading-tight text-white"
            >
              {roomy && (
                <>
                  <div className="truncate font-semibold">{name}</div>
                  <div className="truncate opacity-80">{formatSize(bytes, style)}</div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
