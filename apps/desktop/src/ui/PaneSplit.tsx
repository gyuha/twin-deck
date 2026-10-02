import { useRef } from "react";
import { useApp, useAppStore } from "../state/context";
import { Pane } from "./Pane";

/** 왼쪽·오른쪽 패널과 그 사이의 구분선. 구분선을 끌어 너비 비율을 바꾸고, 더블클릭하면 반반으로 되돌린다. */
export function PaneSplit() {
  const split = useApp((s) => s.split);
  const { api } = useAppStore();
  const box = useRef<HTMLDivElement>(null);
  const move = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (r && r.width > 0) api.setSplit((clientX - r.left) / r.width);
  };
  return (
    <div ref={box} className="flex min-h-0 flex-1">
      <div className="flex min-h-0 min-w-0" style={{ width: `${split * 100}%` }}>
        <Pane pane="left" />
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="패널 너비 조절"
        aria-valuemin={15}
        aria-valuemax={85}
        aria-valuenow={Math.round(split * 100)}
        className="w-1 shrink-0 cursor-col-resize touch-none bg-app-line transition-colors hover:bg-accent"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          e.preventDefault();
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) move(e.clientX);
        }}
        onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
        onDoubleClick={() => api.setSplit(0.5)}
      />
      <div className="flex min-h-0 min-w-0 flex-1">
        <Pane pane="right" />
      </div>
    </div>
  );
}
