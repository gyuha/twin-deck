import { useEffect, useMemo, useState } from "react";
import { actionShortTitle } from "../i18n";
import { defaultBindingsFor } from "@twin-deck/actions";
import { formatKey } from "@twin-deck/keybinds";
import type { ActionContext } from "@twin-deck/actions";
import { parentPath } from "@twin-deck/ts-client";
import { fkeyBarItems } from "../lib/fkeys";
import { useApp, useT } from "../state/context";
import { actionContext, activeTab, cursorEntry } from "../state/store";
import { useUi } from "./uiContext";

/** 현재 화면 상태를 요약한 액션 컨텍스트. 원시 값만 선택해서 불필요한 재렌더를 피한다. */
export function useActionContext(): ActionContext {
  useT(); // 언어가 바뀌면 버튼 이름을 다시 그린다
  const hasCursorItem = useApp((s) => !!cursorEntry(activeTab(s)));
  const selectedCount = useApp((s) => activeTab(s).selection.size);
  const tabCount = useApp((s) => s.panes[s.activePane].tabs.length);
  const canGoUp = useApp((s) => !activeTab(s).virtual && parentPath(activeTab(s).path) !== null);
  const canGoBack = useApp((s) => !activeTab(s).virtual && activeTab(s).back.length > 0);
  const canGoForward = useApp((s) => !activeTab(s).virtual && activeTab(s).forward.length > 0);
  const cursorIsDir = useApp((s) => cursorEntry(activeTab(s))?.kind === "dir");
  const cursorIsArchive = useApp((s) => actionContext(s).cursorIsArchive);
  const multiColumn = useApp((s) => activeTab(s).view.mode === "columns");
  const virtualTab = useApp((s) => !!activeTab(s).virtual);
  const searching = useApp((s) => !!activeTab(s).virtual?.running);
  const usageTab = useApp((s) => activeTab(s).virtual?.kind === "usage");
  return useMemo(
    () => ({ hasCursorItem, selectedCount, tabCount, canGoUp, canGoBack, canGoForward, cursorIsDir, cursorIsArchive, multiColumn, virtualTab, searching, usageTab }),
    [hasCursorItem, selectedCount, tabCount, canGoUp, canGoBack, canGoForward, cursorIsDir, cursorIsArchive, multiColumn, virtualTab, searching, usageTab],
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

/** 설정 `fkey_bar`로 켠 F키 줄 중 쓸 수 있는 것. 같은 인수 없는 액션이 기본 구성에 이미 있으면 중복이라 뺀다. */
function useFKeyBarItems(known: string[]) {
  const fkeys = useApp((s) => s.loaded.config.fkeys);
  const fkeyApps = useApp((s) => s.loaded.config.fkey_apps);
  const fkeyBar = useApp((s) => s.loaded.config.fkey_bar);
  const { registry, platform } = useUi();
  return useMemo(() => {
    const builtin = (key: string) => defaultBindingsFor(platform).find((b) => b.scope === "pane" && b.keys.includes(key))?.actionId;
    return fkeyBarItems({ fkeys, fkey_apps: fkeyApps, fkey_bar: fkeyBar }, builtin).filter(
      (it) => registry.has(it.action) && !(known.includes(it.action) && Object.keys(it.args).length === 0),
    );
  }, [fkeys, fkeyApps, fkeyBar, platform, registry, known]);
}

/** 지금 누르고 있는 수식키를 "Alt+Ctrl+Shift+Mod" 같은 정규 문자열로(없으면 ""). 창이 포커스를 잃으면 비운다. */
function useHeldModifiers(enabled: boolean, platform: string): string {
  const [held, setHeld] = useState("");
  useEffect(() => {
    if (!enabled) {
      setHeld("");
      return;
    }
    const from = (e: KeyboardEvent) => {
      const mods: string[] = [];
      if (e.altKey) mods.push("Alt");
      if (platform === "mac" ? e.metaKey : e.ctrlKey) mods.push("Mod");
      if (platform === "mac" && e.ctrlKey) mods.push("Ctrl");
      if (e.shiftKey) mods.push("Shift");
      setHeld(mods.join("+"));
    };
    const clear = () => setHeld("");
    window.addEventListener("keydown", from);
    window.addEventListener("keyup", from);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", from);
      window.removeEventListener("keyup", from);
      window.removeEventListener("blur", clear);
    };
  }, [enabled, platform]);
  return held;
}

/** 키 문자열의 수식키 부분을 `useHeldModifiers`와 같은 정규 형태로. */
const modsOf = (key: string | undefined) =>
  (key ? key.split("+").slice(0, -1) : [])
    .sort((a, b) => ["Alt", "Mod", "Ctrl", "Shift"].indexOf(a) - ["Alt", "Mod", "Ctrl", "Shift"].indexOf(b))
    .join("+");

/** Action Bar (PANE-07): 액션과 현재 키를 한 줄로 보여 주는 하단 버튼. `behavior.layout.show_action_bar`로 끈다. */
export function ActionBar() {
  const t = useT();
  const show = useApp((s) => s.loaded.config.behavior.layout.show_action_bar);
  const { known } = useBarIds();
  const extra = useFKeyBarItems(known);
  const ctx = useActionContext();
  const { registry, keymap, platform } = useUi();
  const byModifier = useApp((s) => s.loaded.config.behavior.layout.action_bar_by_modifier);
  // 팝업 메뉴·다이얼로그·미리보기·설정이 열려 있으면 수식키를 눌러도 바를 바꾸지 않는다(Ctrl+= 같은 창 안 단축키 때문).
  const overlayOpen = useApp((s) => !!s.menu || !!s.dialog || !!s.preview || s.settingsOpen);
  const heldRaw = useHeldModifiers(show && byModifier, platform);
  const held = overlayOpen ? "" : heldRaw;
  if (!show) return null;
  // 옵션이 켜져 있으면 누르고 있는 수식키와 같은 조합의 버튼만 보인다(안 누르면 수식키 없는 버튼).
  const visible = (key: string | undefined) => !byModifier || modsOf(key) === held;
  return (
    <div role="toolbar" aria-label={t("actionbar.aria")} className="flex gap-1 border-t border-app-line bg-app-dark-box px-1 py-0.5 text-xs">
      {known.map((id) => {
        const action = registry.get(id)!;
        const key = keymap.keysFor(id)[0];
        if (!visible(key)) return null;
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
            <span>{actionShortTitle(id, action.shortTitle ?? action.title)}</span>
          </button>
        );
      })}
      {extra.map((it) => {
        if (!visible(it.key)) return null;
        const action = registry.get(it.action)!;
        const enabled = registry.isApplicable(it.action, ctx);
        return (
          <button
            key={`fkey:${it.key}`}
            type="button"
            tabIndex={-1}
            aria-disabled={!enabled}
            title={it.action}
            onClick={() => {
              if (enabled) void registry.dispatch(it.action, ctx, it.args);
            }}
            className={"flex items-center gap-1 rounded border border-app-line px-2 py-0.5 " + (enabled ? "" : "opacity-40")}
          >
            <kbd className="font-mono text-ink-dull">{formatKey(it.key, platform)}</kbd>
            <span>{actionShortTitle(it.action, action.shortTitle ?? action.title)}</span>
          </button>
        );
      })}
    </div>
  );
}
