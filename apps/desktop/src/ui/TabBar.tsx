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
  const [over, setOver] = useState<number | null>(null);
  const justDragged = useRef(false);
  const tabIndexAt = (el: EventTarget | null) => {
    const tab = el instanceof Element ? el.closest('[role="tab"]') : null;
    const list = tab?.closest('[role="tablist"]');
    return tab && list ? Array.from(list.querySelectorAll('[role="tab"]')).indexOf(tab) : -1;
  };
  const press = (e: React.MouseEvent, from: number) => {
    if (e.button !== 0 || tabs.length < 2) return;
    const [x, y] = [e.clientX, e.clientY];
    let dragging = false;
    let to = from;
    const move = (m: MouseEvent) => {
      if (!dragging && Math.hypot(m.clientX - x, m.clientY - y) < DRAG_THRESHOLD) return;
      dragging = true;
      const at = tabIndexAt(m.target);
      to = at >= 0 && at < tabs.length ? at : to;
      setOver(to === from ? null : to);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setOver(null);
      if (!dragging) return;
      // 끌기를 끝낸 직후의 click은 탭 전환으로 이어지지 않게 막는다(click이 오지 않아도 곧 풀린다).
      justDragged.current = true;
      setTimeout(() => (justDragged.current = false), 0);
      api.moveTab(pane, from, to);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
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
          className={
            (over === i ? "outline outline-1 -outline-offset-1 outline-accent " : "") +
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
