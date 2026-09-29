import type { ActionHandlers } from "@twin-deck/actions";
import type { AppStore } from "./state/store";
import { PAGE_SIZE } from "./state/store";

/** 탐색, 선택, 탭, 보기, Quick Select 액션의 실행 핸들러. */
/** 화면 조작 액션의 실행 핸들러(탐색, 선택, 탭, 보기, Quick Select, 파일 작업, 다이얼로그). */
export function allHandlers(app: AppStore): ActionHandlers {
  return { ...navigationHandlers(app), ...fileOpHandlers(app), ...queueHandlers(app) } as ActionHandlers;
}

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
    "core.quickselect.start": () => api.quickStart(),
    "core.config.warnings": () => api.showConfigWarnings(),
    "core.quickselect.accept": () => api.quickAccept(),
    "core.quickselect.cancel": () => api.quickCancel(),
  };
}

/** 파일 작업(OP-01~07)과 다이얼로그 액션의 실행 핸들러. */
export function fileOpHandlers({ api }: AppStore): Partial<ActionHandlers> {
  return {
    "core.copy": () => api.copyOrMove("copy"),
    "core.move": () => api.copyOrMove("move"),
    "core.rename": () => api.renameCursor(),
    "core.file.new_folder": () => api.newFolder(),
    "core.file.new_file": () => api.newFile(),
    "core.trash": () => api.trashTargets(),
    "core.delete": () => api.deleteTargets(),
    "core.dialog.confirm": () => api.dialogConfirm(),
    "core.dialog.cancel": () => api.dialogCancel(),
  };
}

/** 작업 큐 팝업 액션의 실행 핸들러. */
export function queueHandlers({ api }: AppStore): Partial<ActionHandlers> {
  return {
    "core.queue.open": () => api.toggleQueue(),
    "core.queue.close": () => api.toggleQueue(),
    "core.queue.up": () => api.queueMove(-1),
    "core.queue.down": () => api.queueMove(1),
    "core.queue.pause": () => api.queuePauseToggle(),
    "core.queue.abort": () => api.queueAbortSelected(),
  };
}
