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
      // 경로 표시줄의 직접 입력 중에는 글자·방향키가 단축키로 가지 않게 한다(입력창이 처리한다).
      if (e.target instanceof Element && e.target.closest("[data-path-edit]")) return;
      const s = store.getState();
      const stack = scopeStack(s);
      const top = stack[0];
      const plain = !e.ctrlKey && !e.metaKey && !e.altKey;

      if ((top === "pane" || top === "quickSelect") && e.shiftKey && plain && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        api.shiftMove(e.key === "ArrowUp" ? -1 : 1);
        return;
      }
      if (top === "quickSelect" && plain && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        api.quickMove(e.key === "ArrowUp" ? -1 : 1);
        return;
      }
      if (top === "quickSelect" && e.key === " " && plain) {
        e.preventDefault();
        api.quickInput(" ");
        return;
      }
      if (top === "palette" && e.key === "Alt") api.paletteShowIds(true);
      // Go To Path: Tab으로 폴더 이름을 완성한다(포커스 이동 대신).
      if (top === "dialog" && s.dialog?.kind === "name" && s.dialog.goto && e.key === "Tab" && plain) {
        e.preventDefault();
        void api.gotoComplete();
        return;
      }
      // 최근 위치 메뉴: 글자·숫자·Backspace는 필터 입력창이 받는다. 숫자 바로 선택은 Alt+숫자(Option+숫자는 e.key가 특수문자라 e.code로 본다).
      if (top === "panel" && (s.menu?.kind === "recent" || s.menu?.kind === "favorites")) {
        const digit = /^Digit([0-9])$/.exec(e.code);
        if (e.altKey && !e.ctrlKey && !e.metaKey && digit) {
          e.preventDefault();
          void api.menuSelectNth(Number(digit[1]));
          return;
        }
        // 필터를 입력하는 중(`my-project` 등)에는 +/-도 글자로 받는다.
        if (s.menu?.kind === "favorites" && !s.menu.filter && (e.key === "+" || e.key === "-")) {
          e.preventDefault();
          void (e.key === "+" ? api.menuAddFavoriteHere() : api.menuRemoveFavorite());
          return;
        }
        if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key.length === 1 || e.key === "Backspace")) return;
      }
      // 팝업 메뉴: 숫자키로 항목을 고른다.
      if (top === "panel" && plain && /^[0-9]$/.test(e.key)) {
        e.preventDefault();
        void api.menuSelectNth(Number(e.key));
        return;
      }
      // 충돌 다이얼로그: 방향키로 고르고 O/S/R로 바로 확정한다. A는 "남은 항목에도 적용"을 켜고 끈다.
      if (top === "dialog" && s.dialog?.kind === "conflict" && plain) {
        const d = s.dialog;
        const step = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[e.key];
        if (step) {
          e.preventDefault();
          api.dialogSetChoice(d.selected + step);
          return;
        }
        if (e.key.toLowerCase() === "a" && d.remaining > 1) {
          e.preventDefault();
          api.dialogSetApplyAll();
          return;
        }
        const shortcut = { o: 0, s: 1, r: 2 }[e.key.toLowerCase()];
        if (shortcut !== undefined && e.key.length === 1) {
          e.preventDefault();
          api.dialogSetChoice(shortcut);
          api.dialogConfirm();
          return;
        }
      }
      // Quick Select 입력 중의 Backspace는 상위 이동이 아니라 글자 지우기다.
      if (top === "quickSelect" && e.key === "Backspace" && plain) {
        e.preventDefault();
        api.quickBackspace();
        return;
      }
      const hit = keymap.resolveBinding(e, stack);
      if (hit) {
        e.preventDefault();
        void registry.dispatch(hit.actionId, actionContext(s), hit.args);
        return;
      }
      if ((top === "pane" || top === "quickSelect") && isPlainChar(e)) {
        e.preventDefault();
        api.quickInput(e.key);
      }
    };
    // Actions Panel: Alt를 누르고 있는 동안 액션 ID를 보여 준다.
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt") store.getState().palette && api.paletteShowIds(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [app, keymap, registry]);
}
