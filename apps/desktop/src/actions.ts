import type { ActionHandlers } from "@twin-deck/actions";
import type { AppStore } from "./state/store";
import { PAGE_SIZE } from "./state/store";

/** 탐색, 선택, 탭, 보기, Quick Select 액션의 실행 핸들러. */
export function navigationHandlers({ api }: AppStore): Partial<ActionHandlers> {
  return {
    "core.open": () => api.open(),
    "core.go.up": () => api.goUp(),
    "core.move.up": () => api.moveCursor(-1),
    "core.move.down": () => api.moveCursor(1),
    "core.move.page_up": () => api.moveCursor(-PAGE_SIZE),
    "core.move.page_down": () => api.moveCursor(PAGE_SIZE),
    "core.move.home": () => api.cursorHome(),
    "core.move.end": () => api.cursorEnd(),
    "core.pane.switch": () => api.switchPane(),
    "core.select.all": () => api.selectAll(),
    "core.select.none": () => api.selectNone(),
    "core.select.toggle": () => api.toggleSelect(),
    "core.tab.new": () => api.newTab(),
    "core.tab.close": () => api.closeTab(),
    "core.tab.next": () => api.cycleTab(1),
    "core.tab.prev": () => api.cycleTab(-1),
    "core.view.hidden": () => api.toggleHidden(),
    "core.quickselect.accept": () => api.quickAccept(),
    "core.quickselect.cancel": () => api.quickCancel(),
  };
}
