import { useEffect } from "react";
import { actionContext, scopeStack } from "../state/store";
import type { AppStore } from "../state/store";
import type { ActionRegistry } from "@twin-deck/actions";
import type { ActionContext } from "@twin-deck/actions";
import type { Keymap } from "@twin-deck/keybinds";

interface Options {
  app: AppStore;
  keymap: Keymap;
  registry: ActionRegistry<ActionContext>;
}

const isPlainChar = (e: KeyboardEvent) => e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;

/** window keydown을 키맵과 액션 레지스트리로 라우팅한다 (docs/05 §3). */
export function useKeyboard({ app, keymap, registry }: Options) {
  useEffect(() => {
    const { store, api } = app;
    const onKeyDown = (e: KeyboardEvent) => {
      // IME 조합 중 입력은 건드리지 않는다.
      if (e.isComposing) return;
      const s = store.getState();
      const stack = scopeStack(s);
      const top = stack[0];
      const plain = !e.ctrlKey && !e.metaKey && !e.altKey;

      if ((top === "pane" || top === "quickSelect") && e.shiftKey && plain && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        api.shiftMove(e.key === "ArrowUp" ? -1 : 1);
        return;
      }
      if (top === "quickSelect" && e.key === " " && plain) {
        e.preventDefault();
        api.quickInput(" ");
        return;
      }
      // Quick Select 입력 중의 Backspace는 상위 이동이 아니라 글자 지우기다.
      if (top === "quickSelect" && e.key === "Backspace" && plain) {
        e.preventDefault();
        api.quickBackspace();
        return;
      }
      const id = keymap.resolve(e, stack);
      if (id) {
        e.preventDefault();
        void registry.dispatch(id, actionContext(s));
        return;
      }
      if ((top === "pane" || top === "quickSelect") && isPlainChar(e)) {
        e.preventDefault();
        api.quickInput(e.key);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [app, keymap, registry]);
}
