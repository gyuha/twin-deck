import { useEffect } from "react";
import { useApp, useAppStore } from "../state/context";
import { baseName } from "@twin-deck/ts-client";

/**
 * 파일 끌어 놓기(드래그)를 마우스 이벤트로 직접 처리하고, 커서 옆에 복사(+)/이동(−) 표시를 그린다.
 * 브라우저 드래그는 운영체제가 커서의 +를 정해서 Ctrl 상태를 앱이 보여 줄 수 없어서 쓰지 않는다.
 */
export function DragLayer() {
  const { api } = useAppStore();
  const drag = useApp((s) => s.drag);

  useEffect(() => {
    const move = (e: MouseEvent) => api.dragMove(e.clientX, e.clientY, e.ctrlKey, e.target instanceof Element ? e.target : null);
    const up = (e: MouseEvent) => {
      if (e.button === 0) api.dragRelease(e.ctrlKey);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && api.isDragActive()) {
        e.preventDefault();
        e.stopPropagation();
        api.dragCancel();
      } else if (e.key === "Control") api.dragSetCtrl(e.type === "keydown");
    };
    // 드래그를 끝낸 직후의 click은 커서 이동·선택으로 이어지지 않게 막는다.
    const click = (e: MouseEvent) => {
      if (!api.consumeDragClick()) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const cancel = () => api.dragCancel();
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("keydown", key, true);
    window.addEventListener("keyup", key, true);
    window.addEventListener("click", click, true);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("keyup", key, true);
      window.removeEventListener("click", click, true);
      window.removeEventListener("blur", cancel);
    };
  }, [api]);

  if (!drag) return null;
  const label = drag.paths.length === 1 ? baseName(drag.paths[0]) : `${drag.paths.length}개 항목`;
  return (
    <div
      aria-hidden
      data-drag-ghost
      data-valid={drag.target ? "true" : "false"}
      style={{ position: "fixed", left: drag.x + 14, top: drag.y + 14 }}
      className={["pointer-events-none z-50 flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-xs text-accent-ink shadow", drag.target ? "" : "opacity-50"].join(" ")}
    >
      <span data-drag-badge className="font-bold">
        {drag.ctrl ? "−" : "+"}
      </span>
      <span className="max-w-48 truncate">{label}</span>
    </div>
  );
}
