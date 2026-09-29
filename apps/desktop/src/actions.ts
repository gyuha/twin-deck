import type { ActionHandlers } from "@twin-deck/actions";
import type { AppStore } from "./state/store";
import { PAGE_SIZE } from "./state/store";

/** 탐색, 선택, 탭, 보기, Quick Select 액션의 실행 핸들러. */
/** 화면 조작 액션의 실행 핸들러(탐색, 선택, 탭, 보기, Quick Select, 파일 작업, 다이얼로그). */
export function allHandlers(app: AppStore): ActionHandlers {
  return { ...navigationHandlers(app), ...fileOpHandlers(app), ...queueHandlers(app), ...menuHandlers(app) } as ActionHandlers;
}

export function navigationHandlers({ api }: AppStore): Partial<ActionHandlers> {
  return {
    "core.open": () => api.open(),
    "core.go.up": () => api.goUp(),
    "core.move.up": () => api.moveCursor(-1),
    "core.move.down": () => api.moveCursor(1),
    "core.move.page_up": () => api.moveCursor(-PAGE_SIZE),
    "core.move.page_down": () => api.moveCursor(PAGE_SIZE),
    "core.move.half_page_up": () => api.moveHalfPage(-1),
    "core.move.half_page_down": () => api.moveHalfPage(1),
    "core.move.left": () => api.moveColumn(-1),
    "core.move.right": () => api.moveColumn(1),
    "core.view.order": (_ctx, args) => api.setOrder(args),
    "core.view.mode": (_ctx, args) => api.setViewMode(args),
    "core.move.home": () => api.cursorHome(),
    "core.move.end": () => api.cursorEnd(),
    "core.pane.switch": () => api.switchPane(),
    "core.select.all": () => api.selectAll(),
    "core.select.none": () => api.selectNone(),
    "core.select.toggle": () => api.toggleSelect(),
    "core.select.invert": () => api.invertSelection(),
    "core.select.invert_current": () => api.invertCurrent(),
    "core.select.group": () => api.selectGroup(true),
    "core.deselect.group": () => api.selectGroup(false),
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
    // 이 앱의 F5/F6도 대상 경로 대화상자 없이 비활성 패널로 보낸다(docs/07 §6의 확인 대화상자는 아직 없다).
    "core.copy.to_inactive": () => api.copyOrMove("copy"),
    "core.move.to_inactive": () => api.copyOrMove("move"),
    "core.duplicate": () => api.duplicateTargets(),
    "core.file.info": () => api.showFileInfo(),
    "core.path.copy_folder": () => api.copyFolderPath(),
    "core.path.copy_files": () => api.copyFilePaths(),
    "core.reveal": () => api.revealCursor(),
    "core.edit": () => api.editTargets(),
    "core.edit.folder": () => api.editFolder(),
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

/** 탐색 보조 메뉴(Volumes/Favorites/Recent/Hierarchy)와 Go To Path의 실행 핸들러. */
export function menuHandlers({ api }: AppStore): Partial<ActionHandlers> {
  return {
    "core.menu.volumes": () => api.openMenu("volumes"),
    "core.menu.favorites": () => api.openMenu("favorites"),
    "core.menu.recent": () => api.openMenu("recent"),
    "core.menu.hierarchy": () => api.openMenu("hierarchy"),
    "core.menu.up": () => api.menuMove(-1),
    "core.menu.down": () => api.menuMove(1),
    "core.menu.select": () => api.menuSelect(),
    "core.menu.close": () => api.menuClose(),
    "core.volume.unmount": () => api.menuVolumeAction("unmount"),
    "core.volume.eject": () => api.menuVolumeAction("eject"),
    "core.recent.clear": () => api.menuClearRecent(),
    "core.favorites.add": () => api.addFavoriteHere(),
    "core.go.path": () => api.gotoPath(),
  };
}
