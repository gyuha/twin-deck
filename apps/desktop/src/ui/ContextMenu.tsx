import { formatKey } from "@twin-deck/keybinds";
import { useApp, useAppStore } from "../state/context";
import { CONTEXT_MENU } from "../state/store";
import type { CtxItem } from "../state/store";
import { useActionContext } from "./ActionBar";
import { useUi } from "./uiContext";

const MENU_WIDTH = 224;
const ROW_HEIGHT = 24;

/** 파일 행 컨텍스트 메뉴. 마우스 위치에 열리고, 키 조작은 `panel` 스코프가 처리한다. */
export function ContextMenu() {
  const m = useApp((s) => s.ctxMenu);
  const { api } = useAppStore();
  const ctx = useActionContext();
  const { registry, keymap, platform } = useUi();
  if (!m) return null;

  const renderItems = (items: readonly CtxItem[], label: string, cursor: number | null, onHover: (i: number) => void) => (
    <div role="menu" aria-label={label} className="rounded-lg border border-app-line bg-app-box py-1 text-sm shadow-lg" style={{ width: MENU_WIDTH }}>
      {items.map((it, i) => {
        if (!it.label) return <hr key={i} role="separator" className="my-1 border-app-line" />;
        const enabled = it.sub ? true : it.actionId ? registry.isApplicable(it.actionId, ctx) : false;
        const keys = it.actionId ? keymap.keysFor(it.actionId).map((k) => formatKey(k, platform))[0] : undefined;
        return (
          <div
            key={i}
            role="menuitem"
            aria-disabled={!enabled}
            aria-haspopup={it.sub ? "menu" : undefined}
            data-cursor={i === cursor}
            onMouseEnter={() => onHover(i)}
            onClick={() => enabled && void api.ctxSelect(it)}
            className={[
              "mx-1 flex h-6 items-center justify-between rounded px-2",
              i === cursor ? "bg-accent text-white" : "",
              enabled ? "" : "opacity-40",
            ].join(" ")}
          >
            <span>{it.label}</span>
            <span className={i === cursor ? "text-xs" : "text-xs text-ink-faint"}>{it.sub ? "▸" : (keys ?? "")}</span>
          </div>
        );
      })}
    </div>
  );

  const subItems = m.subCursor !== null ? CONTEXT_MENU[m.cursor].sub : undefined;
  const height = CONTEXT_MENU.length * ROW_HEIGHT;
  const left = Math.max(0, Math.min(m.x, window.innerWidth - MENU_WIDTH - 8));
  const top = Math.max(0, Math.min(m.y, window.innerHeight - height - 16));
  const subLeft = left + MENU_WIDTH + 4 + MENU_WIDTH > window.innerWidth ? -MENU_WIDTH - 4 : MENU_WIDTH + 4;
  return (
    <div
      className="fixed inset-0 z-50"
      onMouseDown={() => api.ctxClose()}
      onContextMenu={(e) => {
        e.preventDefault();
        api.ctxClose();
      }}
    >
      <div className="absolute" style={{ left, top }} onMouseDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
        {renderItems(CONTEXT_MENU, "컨텍스트 메뉴", subItems ? null : m.cursor, (i) => api.ctxHover(i, null))}
        {subItems && (
          <div className="absolute" style={{ left: subLeft, top: m.cursor * ROW_HEIGHT }}>
            {renderItems(subItems, "다음으로 열기", m.subCursor, (i) => api.ctxHover(m.cursor, i))}
          </div>
        )}
      </div>
    </div>
  );
}
