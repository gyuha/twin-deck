import type { ActionHandlers } from "@twin-deck/actions";
import type { AppStore } from "./state/store";
import { PAGE_SIZE } from "./state/store";

/** 탐색, 선택, 탭, 보기, Quick Select 액션의 실행 핸들러. */
/** 화면 조작 액션의 실행 핸들러(탐색, 선택, 탭, 보기, Quick Select, 파일 작업, 다이얼로그). */
export function allHandlers(app: AppStore): ActionHandlers {
  return { ...navigationHandlers(app), ...fileOpHandlers(app), ...queueHandlers(app), ...menuHandlers(app), ...paletteHandlers(app) } as ActionHandlers;
}

export function navigationHandlers({ api }: AppStore): Partial<ActionHandlers> {
  return {
    "core.open": () => api.open(),
    "core.open.as_archive": () => api.openAsArchive(),
    "core.lookup.global": () => api.lookup("global"),
    "core.lookup.folder": () => api.lookup("folder"),
    "core.flatten": () => api.flatten(),
    "core.disk_usage": (_ctx, args) => api.diskUsage(args),
    "core.search.cancel": () => api.cancelSearch(),
    "core.reveal_in_tab": () => api.revealInTab(),
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
    // F5/F6(`core.copy`/`core.move`)은 전송 확인 창을 거치고, `*.to_inactive`는 창 없이 바로 비활성 패널로 보낸다.
    "core.copy.to_inactive": () => api.copyOrMove("copy", false),
    "core.move.to_inactive": () => api.copyOrMove("move", false),
    "core.duplicate": () => api.duplicateTargets(),
    "core.compress": () => api.compress(),
    "core.extract": () => api.extract(false),
    "core.extract.to_inactive": () => api.extract(true),
    "core.file.symlink": () => api.symlink(),
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

/** Actions Panel과 인수를 받는 액션(`core.open.directory`)의 실행 핸들러. */
export function paletteHandlers({ api }: AppStore): Partial<ActionHandlers> {
  return {
    "core.window.new": () => api.newWindow(),
    "core.state.reset": () => api.resetState(),
    "core.preview": () => api.previewToggle(),
    "core.preview.close": () => api.previewClose(),
    "core.preview.prev": () => api.previewMove(-1),
    "core.preview.next": () => api.previewMove(1),
    "core.actions.panel": () => api.paletteOpen(),
    "core.palette.up": () => api.paletteMove(-1),
    "core.palette.down": () => api.paletteMove(1),
    "core.palette.run": () => api.paletteRun(),
    "core.palette.close": () => api.paletteClose(),
    "core.open.directory": (_ctx, args) => api.openDirectory(args),
  };
}
