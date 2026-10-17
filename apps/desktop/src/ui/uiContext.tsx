import { t as translate } from "../i18n";
import { createContext, useContext } from "react";
import type { ActionContext, ActionRegistry } from "@twin-deck/actions";
import type { Keymap, Platform } from "@twin-deck/keybinds";

/** 키맵과 액션 레지스트리를 UI 컴포넌트(Action Bar 등)에 전달한다. */
export interface UiContextValue {
  registry: ActionRegistry<ActionContext>;
  keymap: Keymap;
  platform: Platform;
  /** 지금 테마·글자색으로 파일 신선도 단계를 나눌 수 있는지(이슈 #91). 설정 화면이 쓸 수 없는 이유를 보일 때 쓴다. */
  freshnessReady: boolean;
}

export const UiContext = createContext<UiContextValue | null>(null);

export function useUi(): UiContextValue {
  const v = useContext(UiContext);
  if (!v) throw new Error(translate("error.no_ui_context"));
  return v;
}
