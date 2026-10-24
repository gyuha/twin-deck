import { t as translate } from "../i18n";
import { createContext, useContext } from "react";
import type { ActionContext, ActionRegistry } from "@twin-deck/actions";
import type { Keymap, Platform } from "@twin-deck/keybinds";
import type { WarpTheme } from "../lib/themes.generated";

/** 키맵과 액션 레지스트리를 UI 컴포넌트(Action Bar 등)에 전달한다. */
export interface UiContextValue {
  registry: ActionRegistry<ActionContext>;
  keymap: Keymap;
  platform: Platform;
  /** 지금 적용 중인 테마(처음 그려지기 전에는 null). 터미널이 이 색을 따른다. */
  theme?: WarpTheme | null;
}

export const UiContext = createContext<UiContextValue | null>(null);

export function useUi(): UiContextValue {
  const v = useContext(UiContext);
  if (!v) throw new Error(translate("error.no_ui_context"));
  return v;
}
