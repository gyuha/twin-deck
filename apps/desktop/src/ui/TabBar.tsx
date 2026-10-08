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
  const closeable = useApp((s) => s.loaded.config.behavior.layout.tab_close_button);
  const [hover, setHover] = useState<number | null>(null); // 호버한 탭(닫기 버튼이 켜졌을 때 ✕를 보일 탭)
  const dropTarget = useApp((s) => s.tabDropTarget === pane);
  // 끌기 중: 끌린 탭(from)은 커서를 따라 dx만큼 움직이고, 지나는 탭들은 shift만큼 비켜 놓일 자리(to)를 보여 준다.
  const [drag, setDrag] = useState<{ from: number; to: number; dx: number; shift: number } | null>(null);
  const justDragged = useRef(false);
  const tabIndexAt = (el: EventTarget | null) => {
    const tab = el instanceof Element ? el.closest('[role="tab"]') : null;
    const list = tab?.closest('[role="tablist"]');
    return tab && list ? Array.from(list.querySelectorAll('[role="tab"]')).indexOf(tab) : -1;
  };
  const press = (e: React.MouseEvent, from: number) => {
    if (e.button !== 0) return; // 탭이 하나여도 끌 수 있다(다른 패널로 복사)
    const [x, y] = [e.clientX, e.clientY];
    // 누른 시점의 탭 위치. 끌린 탭이 커서 밑에서 움직이므로 놓일 자리는 이 위치로 판단한다(레이아웃이 없으면 마우스 밑 탭으로).
    const list = (e.currentTarget as HTMLElement).closest('[role="tablist"]');
    const rects = Array.from(list?.querySelectorAll('[role="tab"]') ?? []).map((el) => el.getBoundingClientRect());
    const laidOut = rects.length === tabs.length && rects.every((r) => r.width > 0);
    // 반대쪽 패널의 탭 줄(누른 시점의 위치). 끌린 탭이 커서 밑에서 움직이므로 이벤트 대상이 아니라 좌표로 판단한다.
    const otherPane: PaneId = pane === "left" ? "right" : "left";
    const otherList = document.querySelector(`[role="tablist"][data-pane="${otherPane}"]`);
    const otherBar = otherList?.getBoundingClientRect();
    const otherRects = Array.from(otherList?.querySelectorAll('[role="tab"]') ?? []).map((el) => el.getBoundingClientRect());
    const ownBar = list?.getBoundingClientRect();
    const within = (r: DOMRect | undefined, px: number, py: number) => !!r && r.width > 0 && px >= r.left && px < r.right && py >= r.top && py <= r.bottom;
    /** 반대쪽 탭 줄 위에서 놓을 자리: 중심이 커서보다 오른쪽인 첫 탭 앞, 없으면 맨 뒤. */
    const insertAt = (px: number) => {
      const i = otherRects.findIndex((r) => (r.left + r.right) / 2 > px);
      return i < 0 ? otherRects.length : i;
    };
    let crossIndex: number | null = null; // 반대쪽 탭 줄 위에 있으면 거기서 놓을 자리
    // 사이 탭이 비키는 거리 = 끌린 탭 폭 + 탭 사이 틈(밑줄형은 `gap-1`, 칸형은 0).
    const gap = laidOut && rects.length > 1 ? rects[1].left - rects[0].right : 0;
    const shift = laidOut ? rects[from].width + gap : 0;
    /** 커서 x가 놓일 탭: 탭 위면 그 탭, 틈이나 바깥이면 가장 가까운 탭. */
    const targetAt = (m: MouseEvent) => {
      if (!laidOut) return tabIndexAt(m.target);
      const inside = rects.findIndex((r) => m.clientX >= r.left && m.clientX < r.right);
      if (inside >= 0) return inside;
      let best = 0;
      rects.forEach((r, i) => {
        const d = (v: DOMRect) => Math.min(Math.abs(m.clientX - v.left), Math.abs(m.clientX - v.right));
        if (d(r) < d(rects[best])) best = i;
      });
      return best;
    };
    let dragging = false;
    let cancelled = false;
    let to = from;
    const stopListening = () => {
      api.setTabDropTarget(null);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", cancel);
    };
    /** 끌기를 취소한다(Esc·창이 포커스를 잃음·버튼이 이미 떼어져 있음). 순서는 바꾸지 않고, 아직 오지 않은 mouseup이 뒤처리만 한다. */
    function cancel() {
      if (cancelled) return;
      cancelled = true;
      stopListening();
      setDrag(null);
    }
    function key(e: KeyboardEvent) {
      if (e.key !== "Escape" || !dragging) return;
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
    function move(m: MouseEvent) {
      if (m.buttons === 0) return cancel(); // mouseup을 놓친 채 버튼이 이미 떼어져 있다
      if (!dragging && Math.hypot(m.clientX - x, m.clientY - y) < DRAG_THRESHOLD) return;
      dragging = true;
      if (!tabs[from]?.virtual && within(otherBar, m.clientX, m.clientY)) { // 가상 탭은 패널 간에 옮기지 않는다
        // 반대쪽 패널의 탭 줄 위: 놓으면 그쪽으로 보낸다. 자기 패널 안의 탭은 비키지 않는다.
        crossIndex = insertAt(m.clientX);
        to = from;
        api.setTabDropTarget(otherPane);
      } else {
        crossIndex = null;
        api.setTabDropTarget(null);
        // 자기 탭 줄에서 세로로 멀리 벗어나면(파일 목록 위 등) 순서를 바꾸지 않는다.
        const nearOwn = !laidOut || !ownBar || (m.clientY >= ownBar.top - 24 && m.clientY <= ownBar.bottom + 24);
        const at = nearOwn ? targetAt(m) : from;
        if (at >= 0 && at < tabs.length) to = at;
      }
      setDrag({ from, to, dx: m.clientX - x, shift });
    }
    function up() {
      stopListening();
      window.removeEventListener("mouseup", up);
      setDrag(null);
      if (!dragging && !cancelled) return;
      // 끌기를 끝낸 직후의 click은 탭 전환으로 이어지지 않게 막는다(click이 오지 않아도 곧 풀린다).
      justDragged.current = true;
      setTimeout(() => (justDragged.current = false), 0);
      if (cancelled) return;
      if (crossIndex !== null) void api.transferTab(pane, from, otherPane, crossIndex);
      else api.moveTab(pane, from, to);
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", cancel);
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
    <div role="tablist" aria-label="탭" data-pane={pane} data-drop-target={dropTarget ? "true" : undefined} className={segments ? "flex border-b border-app-line text-sm" : "flex gap-1 border-b border-app-line px-1 text-sm"}>
      {tabs.map((t, i) => {
        const name = t.virtual ? t.virtual.title : baseName(t.path) || t.path;
        const pad = closeable ? "px-6" : "px-2";
        const tabButton = (
          <button
            key={closeable ? undefined : t.id}
            role="tab"
            type="button"
            tabIndex={-1}
            aria-selected={i === active}
            onMouseDown={(e) => {
              if (e.button === 1) {
                // 가운데 버튼: 끌기를 시작하지 않고 자동 스크롤도 막는다(닫기는 뗄 때 auxclick에서). 패널 활성화도 하지 않는다(다른 패널의 탭을 닫아도 활성 패널은 그대로).
                e.preventDefault();
                e.stopPropagation();
              }
              else press(e, i);
            }}
            onAuxClick={(e) => {
              if (e.button !== 1) return;
              e.preventDefault();
              void api.closeTabAt(pane, i);
            }}
            onClick={() => {
              if (!justDragged.current) api.activate(pane, i);
            }}
            style={closeable ? undefined : dragStyle(i)}
            className={
              // 탭은 키보드 대상이 아니라(tabIndex -1) 클릭으로만 포커스를 받는다. 기본 포커스 링이 미리보기 같은 키보드 조작 중에 테두리로 보이지 않게 끈다.
              // 닫기 버튼이 켜지면 ✕ 자리를 위해 좌우 패딩을 같게 넓힌다(px-6). 호버로 글자가 움직이지 않고 칸형에서도 글자가 가운데에 남는다.
              "outline-none " +
              (segments
                ? // 칸형(Marta식): 폭을 균등 분할하고 활성 탭은 배경으로 구분한다. 좁아지면 이름을 말줄임으로 줄인다.
                  (closeable ? "min-w-0 flex-1 truncate px-6 py-1 text-center " : "min-w-0 flex-1 truncate border-r border-app-line px-2 py-1 text-center last:border-r-0 ") +
                  (i === active ? "bg-app-selected font-semibold" : "text-ink-faint")
                : i === active
                  ? `border-b-2 border-accent ${pad} py-1 font-semibold`
                  : `${pad} py-1 text-ink-faint`)
            }
          >
            {name}
          </button>
        );
        if (!closeable) return tabButton;
        return (
          <div
            key={t.id}
            style={dragStyle(i)}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover((h) => (h === i ? null : h))}
            className={"relative flex " + (segments ? "min-w-0 flex-1 border-r border-app-line last:border-r-0" : "")}
          >
            {tabButton}
            {hover === i && tabs.length > 1 && !drag && (
              <button
                type="button"
                tabIndex={-1}
                aria-label={`탭 닫기: ${name}`}
                // 가운데 클릭처럼 끌기를 시작하지 않고 패널 활성화도 하지 않는다(다른 패널의 탭을 닫아도 활성 패널은 그대로).
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setHover(null);
                  void api.closeTabAt(pane, i);
                }}
                className="absolute right-1 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center rounded text-xs leading-none text-ink-faint outline-none hover:bg-app-selected hover:text-ink"
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
