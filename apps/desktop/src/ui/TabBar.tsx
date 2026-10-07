import { useRef, useState } from "react";
import { baseName } from "@twin-deck/ts-client";
import { useApp, useAppStore } from "../state/context";
import type { PaneId } from "../state/store";

/** 이 거리(px)보다 적게 움직이면 끌기가 아니라 클릭이다. */
const DRAG_THRESHOLD = 4;

/** 탭을 눌러 끌어 같은 패널 안에서 순서를 바꾼다(마우스 이벤트로 직접 처리 — 파일 끌기와 같은 방식). */
export function TabBar({ pane }: { pane: PaneId }) {
  const { tabs, active } = useApp((s) => s.panes[pane]);
  const segments = useApp((s) => s.loaded.config.behavior.layout.tab_style === "segments");
  const { api } = useAppStore();
  // 끌기 중: 끌린 탭(from)은 커서를 따라 dx만큼 움직이고, 지나는 탭들은 shift만큼 비켜 놓일 자리(to)를 보여 준다.
  const [drag, setDrag] = useState<{ from: number; to: number; dx: number; shift: number } | null>(null);
  const justDragged = useRef(false);
  const tabIndexAt = (el: EventTarget | null) => {
    const tab = el instanceof Element ? el.closest('[role="tab"]') : null;
    const list = tab?.closest('[role="tablist"]');
    return tab && list ? Array.from(list.querySelectorAll('[role="tab"]')).indexOf(tab) : -1;
  };
  const press = (e: React.MouseEvent, from: number) => {
    if (e.button !== 0 || tabs.length < 2) return;
    const [x, y] = [e.clientX, e.clientY];
    // 누른 시점의 탭 위치. 끌린 탭이 커서 밑에서 움직이므로 놓일 자리는 이 위치로 판단한다(레이아웃이 없으면 마우스 밑 탭으로).
    const list = (e.currentTarget as HTMLElement).closest('[role="tablist"]');
    const rects = Array.from(list?.querySelectorAll('[role="tab"]') ?? []).map((el) => el.getBoundingClientRect());
    const laidOut = rects.length === tabs.length && rects.every((r) => r.width > 0);
    const next = rects[from + 1] ?? rects[from - 1];
    const shift = laidOut ? (from + 1 < rects.length ? next.left - rects[from].left : rects[from].left - next.left) : 0;
    let dragging = false;
    let to = from;
    const move = (m: MouseEvent) => {
      if (!dragging && Math.hypot(m.clientX - x, m.clientY - y) < DRAG_THRESHOLD) return;
      dragging = true;
      const at = laidOut ? rects.findIndex((r) => m.clientX >= r.left && m.clientX < r.right) : tabIndexAt(m.target);
      if (at >= 0 && at < tabs.length) to = at;
      else if (laidOut) to = m.clientX < rects[0].left ? 0 : tabs.length - 1;
      setDrag({ from, to, dx: m.clientX - x, shift });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setDrag(null);
      if (!dragging) return;
      // 끌기를 끝낸 직후의 click은 탭 전환으로 이어지지 않게 막는다(click이 오지 않아도 곧 풀린다).
      justDragged.current = true;
      setTimeout(() => (justDragged.current = false), 0);
      api.moveTab(pane, from, to);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  /** 끌기 중 이 탭의 모양: 끌린 탭은 커서를 따르고, 사이의 탭은 한 칸 비킨다. */
  const dragStyle = (i: number): React.CSSProperties | undefined => {
    if (!drag) return undefined;
    if (i === drag.from) return { transform: `translateX(${drag.dx}px)`, zIndex: 10, position: "relative", boxShadow: "0 2px 8px rgba(0,0,0,.35)", cursor: "grabbing" };
    const between = drag.from < drag.to ? i > drag.from && i <= drag.to : i >= drag.to && i < drag.from;
    const dir = drag.from < drag.to ? -1 : 1;
    return { transform: between ? `translateX(${dir * drag.shift}px)` : undefined, transition: "transform 120ms" };
  };
  return (
    <div role="tablist" aria-label="탭" className={segments ? "flex border-b border-app-line text-sm" : "flex gap-1 border-b border-app-line px-1 text-sm"}>
      {tabs.map((t, i) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          tabIndex={-1}
          aria-selected={i === active}
          onMouseDown={(e) => press(e, i)}
          onClick={() => {
            if (!justDragged.current) api.activate(pane, i);
          }}
          style={dragStyle(i)}
          className={
            (segments
              ? // 칸형(Marta식): 폭을 균등 분할하고 활성 탭은 배경으로 구분한다. 좁아지면 이름을 말줄임으로 줄인다.
                "min-w-0 flex-1 truncate border-r border-app-line px-2 py-1 text-center last:border-r-0 " + (i === active ? "bg-app-selected font-semibold" : "text-ink-faint")
              : i === active
                ? "border-b-2 border-accent px-2 py-1 font-semibold"
                : "px-2 py-1 text-ink-faint")
          }
        >
          {t.virtual ? t.virtual.title : baseName(t.path) || t.path}
        </button>
      ))}
    </div>
  );
}
