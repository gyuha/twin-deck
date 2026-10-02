import { useMemo } from "react";
import { formatKey } from "@twin-deck/keybinds";
import type { ActionContext } from "@twin-deck/actions";
import { parentPath } from "@twin-deck/ts-client";
import { useApp } from "../state/context";
import { activeTab, cursorEntry } from "../state/store";
import { useUi } from "./uiContext";

/** 현재 화면 상태를 요약한 액션 컨텍스트. 원시 값만 선택해서 불필요한 재렌더를 피한다. */
export function useActionContext(): ActionContext {
  const hasCursorItem = useApp((s) => !!cursorEntry(activeTab(s)));
  const selectedCount = useApp((s) => activeTab(s).selection.size);
  const tabCount = useApp((s) => s.panes[s.activePane].tabs.length);
  const canGoUp = useApp((s) => !activeTab(s).virtual && parentPath(activeTab(s).path) !== null);
  const cursorIsDir = useApp((s) => cursorEntry(activeTab(s))?.kind === "dir");
  const multiColumn = useApp((s) => activeTab(s).view.mode === "columns");
  const virtualTab = useApp((s) => !!activeTab(s).virtual);
  const searching = useApp((s) => !!activeTab(s).virtual?.running);
  return useMemo(
    () => ({ hasCursorItem, selectedCount, tabCount, canGoUp, cursorIsDir, multiColumn, virtualTab, searching }),
    [hasCursorItem, selectedCount, tabCount, canGoUp, cursorIsDir, multiColumn, virtualTab, searching],
  );
}

/** 설정 `layout.action_bar`의 액션 ID 중 등록된 것 (하단 버튼 줄의 구성). */
export function useBarIds(): { known: string[]; unknown: string[] } {
  const ids = useApp((s) => s.loaded.config.layout.action_bar);
  const { registry } = useUi();
  return useMemo(
    () => ({ known: ids.filter((id) => registry.has(id)), unknown: ids.filter((id) => !registry.has(id)) }),
    [ids, registry],
  );
}

/** Action Bar (PANE-07): 액션과 현재 키를 한 줄로 보여 주는 하단 버튼. `behavior.layout.show_action_bar`로 끈다. */
export function ActionBar() {
  const show = useApp((s) => s.loaded.config.behavior.layout.show_action_bar);
  const { known } = useBarIds();
  const ctx = useActionContext();
  const { registry, keymap, platform } = useUi();
  if (!show) return null;
  return (
    <div role="toolbar" aria-label="액션 바" className="flex gap-1 border-t border-app-line bg-app-dark-box px-1 py-0.5 text-xs">
      {known.map((id) => {
        const action = registry.get(id)!;
        const key = keymap.keysFor(id)[0];
        const enabled = registry.isApplicable(id, ctx);
        return (
          <button
            key={id}
            type="button"
            tabIndex={-1}
            aria-disabled={!enabled}
            title={id}
            onClick={() => {
              if (enabled) void registry.dispatch(id, ctx);
            }}
            className={"flex items-center gap-1 rounded border border-app-line px-2 py-0.5 " + (enabled ? "" : "opacity-40")}
          >
            {key && <kbd className="font-mono text-ink-dull">{formatKey(key, platform)}</kbd>}
            <span>{action.shortTitle ?? action.title}</span>
          </button>
        );
      })}
    </div>
  );
}
