import type { Binding } from "@twin-deck/keybinds";
import { ActionRegistry } from "./registry";
import type { Action, ActionCategory } from "./registry";

/** 액션 실행 가능 여부 판단에 쓰는 화면 상태 요약. */
export interface ActionContext {
  /** 커서가 가리키는 항목이 있는지 (".." 제외). */
  hasCursorItem: boolean;
  selectedCount: number;
  /** 활성 패널의 탭 수. */
  tabCount: number;
  /** 상위 폴더로 갈 수 있는지. */
  canGoUp: boolean;
  /** 이전/다음 폴더로 갈 수 있는지(이 탭의 방문 기록). */
  canGoBack: boolean;
  canGoForward: boolean;
  /** 커서 항목이 폴더인지. */
  cursorIsDir: boolean;
  /** 커서 항목이 압축 파일(아카이브)인지. */
  cursorIsArchive: boolean;
  /** 활성 탭이 다중 컬럼 표시 모드인지. */
  multiColumn: boolean;
  /** 활성 탭이 위치 없는 가상 탭(Look Up/Flatten/Disk Usage 결과)인지. */
  virtualTab: boolean;
  /** 활성 탭의 검색/순회가 아직 진행 중인지. */
  searching: boolean;
  /** 활성 탭이 Disk Usage 결과 탭인지(목록·treemap 어느 쪽이든). */
  usageTab: boolean;
}

const hasTarget = (c: ActionContext) => c.selectedCount > 0 || c.hasCursorItem;

interface Meta {
  id: string;
  title: string;
  shortTitle?: string;
  category: ActionCategory;
  scopes: Action<ActionContext>["scopes"];
  isApplicable?: (c: ActionContext) => boolean;
}

/** M1(P0) 내장 액션. ID는 docs/05 카탈로그를 따른다. */
export const DEFAULT_ACTION_META = [
  { id: "core.copy", title: "복사", shortTitle: "복사", category: "File", scopes: ["pane"], isApplicable: hasTarget },
  { id: "core.move", title: "이동", shortTitle: "이동", category: "File", scopes: ["pane"], isApplicable: hasTarget },
  { id: "core.rename", title: "이름 변경", category: "File", scopes: ["pane"], isApplicable: (c) => c.hasCursorItem },
  { id: "core.rename.multi", title: "다중 이름 바꾸기", category: "File", scopes: ["pane"], isApplicable: (c) => c.selectedCount >= 2 },
  { id: "core.file.new_folder", title: "새 폴더", shortTitle: "새 폴더", category: "File", scopes: ["pane"] },
  { id: "core.file.new_file", title: "새 파일", category: "File", scopes: ["pane"] },
  { id: "core.trash", title: "휴지통으로 이동", shortTitle: "휴지통", category: "File", scopes: ["pane"], isApplicable: hasTarget },
  { id: "core.delete", title: "영구 삭제", shortTitle: "삭제", category: "File", scopes: ["pane"], isApplicable: hasTarget },
  { id: "core.copy.to_inactive", title: "비활성 패널로 복사 (대화상자 없음)", category: "File", scopes: ["pane"], isApplicable: hasTarget },
  { id: "core.move.to_inactive", title: "비활성 패널로 이동 (대화상자 없음)", category: "File", scopes: ["pane"], isApplicable: hasTarget },
  { id: "core.clipboard.copy", title: "클립보드로 복사", category: "File", scopes: ["pane"], isApplicable: hasTarget },
  { id: "core.clipboard.cut", title: "클립보드로 잘라내기", category: "File", scopes: ["pane"], isApplicable: hasTarget },
  { id: "core.clipboard.paste", title: "클립보드에서 붙여넣기", category: "File", scopes: ["pane"], isApplicable: (c) => !c.virtualTab },
  { id: "core.duplicate", title: "복제", category: "File", scopes: ["pane"], isApplicable: hasTarget },
  { id: "core.file.info", title: "파일 정보", category: "File", scopes: ["pane"], isApplicable: (c) => c.hasCursorItem },
  { id: "core.path.copy_folder", title: "폴더 경로 복사", category: "File", scopes: ["pane"] },
  { id: "core.path.copy_files", title: "파일 경로 복사", category: "File", scopes: ["pane"], isApplicable: hasTarget },
  { id: "core.reveal", title: "파일 관리자에서 보기", category: "File", scopes: ["pane"] },
  { id: "core.edit", title: "편집", shortTitle: "편집", category: "File", scopes: ["pane"], isApplicable: hasTarget },
  { id: "core.edit.folder", title: "폴더 편집", category: "File", scopes: ["pane"] },
  { id: "core.select.invert", title: "선택 반전", category: "Selection", scopes: ["pane"] },
  { id: "core.select.invert_current", title: "현재 항목 선택 반전", category: "Selection", scopes: ["pane"], isApplicable: (c) => c.hasCursorItem },
  { id: "core.select.group", title: "패턴으로 선택", category: "Selection", scopes: ["pane"] },
  { id: "core.deselect.group", title: "패턴으로 선택 해제", category: "Selection", scopes: ["pane"] },
  { id: "core.open", title: "열기", category: "Navigation", scopes: ["pane"], isApplicable: (c) => c.hasCursorItem },
  { id: "core.compress", title: "압축", category: "File", scopes: ["pane"], isApplicable: hasTarget },
  { id: "core.extract", title: "추출 (옆의 새 폴더로)", category: "File", scopes: ["pane"], isApplicable: hasTarget },
  { id: "core.extract.to_inactive", title: "추출 (반대편 패널로)", category: "File", scopes: ["pane"], isApplicable: hasTarget },
  { id: "core.file.symlink", title: "심볼릭 링크 만들기 (반대편 패널에)", category: "File", scopes: ["pane"], isApplicable: (c) => c.hasCursorItem },
  { id: "core.find.open", title: "파일 찾기", category: "Navigation", scopes: ["pane"] },
  { id: "core.find.close", title: "파일 찾기 닫기", category: "Navigation", scopes: ["find"] },
  { id: "core.lookup.global", title: "Look Up (전역)", category: "Navigation", scopes: ["pane"] },
  { id: "core.lookup.folder", title: "Look Up (현재 폴더)", category: "Navigation", scopes: ["pane"], isApplicable: (c) => !c.virtualTab },
  { id: "core.flatten", title: "Flatten (하위 파일을 평면 목록으로)", category: "Navigation", scopes: ["pane"], isApplicable: (c) => !c.virtualTab },
  { id: "core.disk_usage", title: "디스크 사용량 분석 (인수: src)", category: "Navigation", scopes: ["pane"] },
  { id: "core.disk_usage.treemap", title: "디스크 사용량 treemap (인수: src)", category: "Navigation", scopes: ["pane"] },
  { id: "core.disk_usage.descend", title: "디스크 사용량 treemap에서 폴더 안으로 내려가기", category: "Navigation", scopes: ["pane"], isApplicable: (c) => c.usageTab },
  { id: "core.disk_usage.toggle_view", title: "디스크 사용량 treemap 켜기/전환 (일반 폴더에서는 열기, Disk Usage 탭에서는 목록 ↔ treemap)", category: "View", scopes: ["pane"] },
  { id: "core.search.cancel", title: "검색/분석 취소", category: "Navigation", scopes: ["pane"], isApplicable: (c) => c.searching },
  { id: "core.reveal_in_tab", title: "해당 폴더로 이동 (새 탭)", category: "Navigation", scopes: ["pane"], isApplicable: (c) => c.virtualTab && c.hasCursorItem },
  { id: "core.open.as_archive", title: "아카이브로 열기 (Open As)", category: "Navigation", scopes: ["pane"], isApplicable: (c) => c.hasCursorItem },
  { id: "core.history.back", title: "이전 폴더", category: "Navigation", scopes: ["pane"], isApplicable: (c) => c.canGoBack },
  { id: "core.history.forward", title: "다음 폴더", category: "Navigation", scopes: ["pane"], isApplicable: (c) => c.canGoForward },
  { id: "core.go.up", title: "상위 폴더", category: "Navigation", scopes: ["pane"], isApplicable: (c) => c.canGoUp },
  { id: "core.move.up", title: "커서 위로", category: "Navigation", scopes: ["pane"] },
  { id: "core.move.down", title: "커서 아래로", category: "Navigation", scopes: ["pane"] },
  { id: "core.move.page_up", title: "페이지 위로", category: "Navigation", scopes: ["pane"] },
  { id: "core.move.page_down", title: "페이지 아래로", category: "Navigation", scopes: ["pane"] },
  { id: "core.move.home", title: "처음으로", category: "Navigation", scopes: ["pane"] },
  { id: "core.move.end", title: "끝으로", category: "Navigation", scopes: ["pane"] },
  { id: "core.move.half_page_up", title: "반 페이지 위로", category: "Navigation", scopes: ["pane"] },
  { id: "core.move.half_page_down", title: "반 페이지 아래로", category: "Navigation", scopes: ["pane"] },
  { id: "core.move.left", title: "상위 폴더 / 이전 컬럼", category: "Navigation", scopes: ["pane"] },
  { id: "core.move.right", title: "폴더 열기·미리보기 / 다음 컬럼", category: "Navigation", scopes: ["pane"], isApplicable: (c) => c.multiColumn || c.hasCursorItem },
  { id: "core.view.order", title: "정렬 (인수: by, dir)", category: "View", scopes: ["pane"] },
  { id: "core.view.mode", title: "표시 모드 (인수: mode)", category: "View", scopes: ["pane"] },
  { id: "core.pane.send", title: "반대편 패널로 보내기 (인수: to)", category: "Navigation", scopes: ["pane"] },
  { id: "core.pane.switch", title: "활성 패널 전환", category: "Navigation", scopes: ["pane"] },
  { id: "core.pane.swap", title: "좌우 패널 바꾸기", category: "Navigation", scopes: ["pane"] },
  { id: "core.select.all", title: "전체 선택", category: "Selection", scopes: ["pane"] },
  // 검색/분석이 진행 중이면 선택이 없어도 Esc가 그 작업을 취소하므로 실행할 수 있다.
  { id: "core.select.none", title: "선택 해제", category: "Selection", scopes: ["pane"], isApplicable: (c) => c.selectedCount > 0 || c.searching },
  { id: "core.select.toggle", title: "현재 항목 선택 토글", category: "Selection", scopes: ["pane"], isApplicable: (c) => c.hasCursorItem },
  { id: "core.preview", title: "미리보기", category: "View", scopes: ["pane"], isApplicable: (c) => c.hasCursorItem },
  { id: "core.preview.close", title: "미리보기 닫기", category: "View", scopes: ["preview"] },
  { id: "core.preview.open", title: "미리보기 닫고 열기", category: "View", scopes: ["preview"] },
  { id: "core.preview.prev", title: "미리보기: 이전 항목", category: "View", scopes: ["preview"] },
  { id: "core.preview.next", title: "미리보기: 다음 항목", category: "View", scopes: ["preview"] },
  { id: "core.preview.forward", title: "미리보기: 폴더면 안으로, 아니면 다음 항목", category: "View", scopes: ["preview"] },
  { id: "core.preview.page_up", title: "미리보기: 한 화면 위로", category: "View", scopes: ["preview"] },
  { id: "core.preview.page_down", title: "미리보기: 한 화면 아래로", category: "View", scopes: ["preview"] },
  { id: "core.preview.delete", title: "미리보기: 파일 삭제", category: "View", scopes: ["preview"] },
  { id: "core.tab.new", title: "새 탭", category: "Tab", scopes: ["pane"] },
  { id: "core.tab.close", title: "탭 닫기", category: "Tab", scopes: ["pane"], isApplicable: (c) => c.tabCount > 1 },
  { id: "core.tab.next", title: "다음 탭", category: "Tab", scopes: ["pane"], isApplicable: (c) => c.tabCount > 1 },
  { id: "core.tab.prev", title: "이전 탭", category: "Tab", scopes: ["pane"], isApplicable: (c) => c.tabCount > 1 },
  { id: "core.view.drive_bar", title: "드라이브 바 표시 토글", category: "View", scopes: ["pane"] },
  { id: "core.view.action_bar", title: "Action Bar 표시 토글", category: "View", scopes: ["pane"] },
  { id: "core.view.hidden", title: "숨김 파일 표시 토글", category: "View", scopes: ["pane"] },
  { id: "core.quickselect.start", title: "Quick Select 시작", category: "Navigation", scopes: ["pane"] },
  { id: "core.config.warnings", title: "설정 경고 보기", category: "View", scopes: ["pane"] },
  { id: "core.quickselect.accept", title: "Quick Select 확정", category: "Navigation", scopes: ["quickSelect"] },
  { id: "core.quickselect.cancel", title: "Quick Select 취소", category: "Navigation", scopes: ["quickSelect"] },
  { id: "core.menu.volumes", title: "볼륨 메뉴", category: "Navigation", scopes: ["pane"] },
  { id: "core.menu.favorites", title: "즐겨찾기 메뉴", category: "Navigation", scopes: ["pane"] },
  { id: "core.menu.recent", title: "최근 위치 메뉴", category: "Navigation", scopes: ["pane"] },
  { id: "core.menu.hierarchy", title: "상위 폴더 메뉴", category: "Navigation", scopes: ["pane"] },
  { id: "core.menu.up", title: "메뉴: 위로", category: "Navigation", scopes: ["panel"] },
  { id: "core.menu.down", title: "메뉴: 아래로", category: "Navigation", scopes: ["panel"] },
  { id: "core.menu.select", title: "메뉴: 이동", category: "Navigation", scopes: ["panel"] },
  { id: "core.menu.close", title: "메뉴 닫기", category: "Navigation", scopes: ["panel"] },
  { id: "core.menu.right", title: "메뉴: 하위 메뉴 열기", category: "Navigation", scopes: ["panel"] },
  { id: "core.menu.left", title: "메뉴: 하위 메뉴 닫기", category: "Navigation", scopes: ["panel"] },
  { id: "core.volume.unmount", title: "볼륨 언마운트", category: "Navigation", scopes: ["panel"] },
  { id: "core.volume.eject", title: "볼륨 추출", category: "Navigation", scopes: ["panel"] },
  { id: "core.recent.clear", title: "최근 위치 비우기", category: "Navigation", scopes: ["panel"] },
  { id: "core.favorites.add", title: "현재 폴더를 즐겨찾기에 추가", category: "Navigation", scopes: ["pane"] },
  { id: "core.go.path", title: "경로로 이동", category: "Navigation", scopes: ["pane"] },
  { id: "core.go.shortcut", title: "폴더 단축키로 이동 (인수: n)", category: "Navigation", scopes: ["pane"] },
  { id: "core.actions.panel", title: "Actions Panel", category: "View", scopes: ["global"] },
  { id: "core.palette.up", title: "Actions Panel: 위로", category: "Navigation", scopes: ["palette"] },
  { id: "core.palette.down", title: "Actions Panel: 아래로", category: "Navigation", scopes: ["palette"] },
  { id: "core.palette.run", title: "Actions Panel: 실행", category: "Navigation", scopes: ["palette"] },
  { id: "core.palette.close", title: "Actions Panel: 닫기", category: "Navigation", scopes: ["palette"] },
  { id: "core.open.directory", title: "폴더 열기 (인수: src)", category: "Navigation", scopes: ["pane"] },
  { id: "core.app.launch", title: "애플리케이션 실행 (인수: app)", category: "File", scopes: ["pane"] },
  { id: "core.app.open_folder", title: "애플리케이션으로 현재 폴더 열기 (인수: app)", category: "File", scopes: ["pane"] },
  { id: "core.app.check_update", title: "업데이트 확인", category: "View", scopes: ["global"] },
  { id: "core.help", title: "도움말 (단축키 목록)", category: "View", scopes: ["pane"] },
  { id: "core.help.close", title: "도움말 닫기", category: "View", scopes: ["help"] },
  { id: "core.window.new", title: "새 창", category: "View", scopes: ["pane"] },
  { id: "core.state.reset", title: "상태 초기화 후 종료", category: "View", scopes: ["pane"] },
  { id: "core.settings.open", title: "설정 화면 열기", category: "View", scopes: ["global"] },
  { id: "core.settings.close", title: "설정 화면 닫기", category: "View", scopes: ["settings"] },
  { id: "core.queue.open", title: "작업 큐 열기/닫기", category: "View", scopes: ["global"] },
  { id: "core.queue.up", title: "큐: 위로", category: "Navigation", scopes: ["queue"] },
  { id: "core.queue.down", title: "큐: 아래로", category: "Navigation", scopes: ["queue"] },
  { id: "core.queue.pause", title: "큐: 일시정지/재개", category: "View", scopes: ["queue"] },
  { id: "core.queue.abort", title: "큐: 중단", category: "View", scopes: ["queue"] },
  { id: "core.queue.close", title: "큐 닫기", category: "View", scopes: ["queue"] },
  { id: "core.dialog.confirm", title: "확인", category: "Dialog", scopes: ["dialog"] },
  { id: "core.dialog.cancel", title: "취소", category: "Dialog", scopes: ["dialog"] },
] as const satisfies readonly Meta[];

export type DefaultActionId = (typeof DEFAULT_ACTION_META)[number]["id"];
export type ActionHandlers = Record<DefaultActionId, Action<ActionContext>["run"]>;

/** 핸들러가 주어진 M1 액션만 등록한다. 누락된 기본 액션은 `missingHandlers`로 확인한다. */
export function createDefaultRegistry(handlers: Partial<ActionHandlers>): ActionRegistry<ActionContext> {
  const registry = new ActionRegistry<ActionContext>();
  for (const meta of DEFAULT_ACTION_META as readonly Meta[]) {
    const run = handlers[meta.id as DefaultActionId];
    if (run) registry.register({ ...meta, run });
  }
  return registry;
}

export function missingHandlers(handlers: Partial<ActionHandlers>): DefaultActionId[] {
  return DEFAULT_ACTION_META.map((m) => m.id).filter((id) => !handlers[id]);
}

const b = (scope: Binding["scope"], actionId: DefaultActionId, ...keys: string[]): Binding => ({
  scope,
  actionId,
  keys,
});

/** 인수가 있는 기본 바인딩. */
const ba = (
  scope: Binding["scope"],
  actionId: DefaultActionId,
  args: Record<string, string>,
  ...keys: string[]
): Binding => ({ scope, actionId, keys, args });

/** M1 기본 키맵 (OS 중립 표기). macOS와 Windows/Linux가 다른 항목은 `DEFAULT_BINDINGS_BY_PLATFORM`에서 덮는다. */
export const DEFAULT_BINDINGS: Binding[] = [
  b("pane", "core.copy", "F5"),
  b("pane", "core.move", "F6"),
  b("pane", "core.rename", "Shift+F6", "F2"),
  b("pane", "core.rename.multi", "Mod+Shift+R"),
  b("pane", "core.clipboard.copy", "Mod+C"),
  b("pane", "core.clipboard.cut", "Mod+X"),
  b("pane", "core.clipboard.paste", "Mod+V"),
  b("pane", "core.duplicate", "Mod+D"),
  b("pane", "core.file.info", "Mod+I"),
  b("pane", "core.path.copy_folder", "F12"),
  b("pane", "core.path.copy_files", "Mod+F12"),
  b("pane", "core.edit", "F4"),
  b("pane", "core.edit.folder", "Shift+F4"),
  b("pane", "core.file.new_folder", "F7"),
  b("pane", "core.file.new_file", "Shift+F7"),
  b("pane", "core.trash", "F8"),
  b("pane", "core.delete", "Shift+F8", "Delete"),
  b("pane", "core.open", "Return"),
  b("pane", "core.go.up", "Backspace"),
  b("pane", "core.disk_usage.descend", "Mod+Return"),
  b("pane", "core.history.back", "Mod+["),
  b("pane", "core.history.forward", "Mod+]"),
  // Alt+←/→는 반대편 패널로 보낸다. 이미 그 쪽 패널이면 이전/다음 폴더로 간다(store.paneSend).
  ba("pane", "core.pane.send", { to: "left" }, "Alt+Left"),
  ba("pane", "core.pane.send", { to: "right" }, "Alt+Right"),
  b("pane", "core.lookup.global", "Mod+P"),
  b("pane", "core.lookup.folder", "Mod+Alt+P"),
  b("pane", "core.move.up", "Up"),
  b("pane", "core.move.down", "Down"),
  b("pane", "core.move.page_up", "PageUp"),
  b("pane", "core.move.page_down", "PageDown"),
  b("pane", "core.move.home", "Home"),
  b("pane", "core.move.end", "End"),
  b("pane", "core.pane.switch", "Tab"),
  // Ctrl+U는 Total Commander·Double Commander·Midnight Commander가 모두 "패널 맞바꾸기"에 쓰는 키다. macOS는 Cmd+U.
  b("pane", "core.pane.swap", "Mod+U"),
  // Alt+T 하나로 폴더 용량 treemap을 연다(일반 폴더) / 목록 ↔ treemap을 바꾼다(Disk Usage 탭). core.disk_usage.treemap은 키 없이 Actions Panel·메뉴·인수(src)로 쓴다.
  // 단독 `T`는 Quick Select가 가져가서 Alt+T다.
  b("pane", "core.disk_usage.toggle_view", "Alt+T"),
  b("pane", "core.move.half_page_up", "Alt+PageUp"),
  b("pane", "core.move.half_page_down", "Alt+PageDown"),
  b("pane", "core.move.left", "Left"),
  b("pane", "core.move.right", "Right"),
  // 정렬/표시 모드의 기본 키는 twin-deck 자체 정의다(docs/05에 기본 키가 없다). 같은 정렬 키를 다시 누르면 방향이 바뀐다.
  ba("pane", "core.view.order", { by: "name" }, "Alt+Shift+N"),
  ba("pane", "core.view.order", { by: "size" }, "Alt+Shift+S"),
  ba("pane", "core.view.order", { by: "modified" }, "Alt+Shift+M"),
  ba("pane", "core.view.order", { by: "created" }, "Alt+Shift+C"),
  ba("pane", "core.view.order", { by: "extension" }, "Alt+Shift+E"),
  ba("pane", "core.view.mode", { mode: "table" }, "Mod+Alt+0"),
  ba("pane", "core.view.mode", { mode: "columns-1" }, "Mod+Alt+1"),
  ba("pane", "core.view.mode", { mode: "columns-2" }, "Mod+Alt+2"),
  ba("pane", "core.view.mode", { mode: "columns-3" }, "Mod+Alt+3"),
  b("pane", "core.select.all", "Mod+A"),
  b("pane", "core.select.none", "Escape"),
  // Space는 선택 토글이다. 미리보기는 오른쪽 키(core.move.right가 파일에서 연다)와 Mod+Y다.
  b("pane", "core.select.toggle", "Insert", "Space", "Shift+Space"),
  b("pane", "core.preview", "Mod+Y", "Shift+Right"),
  b("preview", "core.preview.close", "Escape", "Space", "Left", "Mod+Y"),
  b("preview", "core.preview.open", "Return"),
  b("preview", "core.preview.prev", "Up"),
  b("preview", "core.preview.next", "Down"),
  b("preview", "core.preview.forward", "Right"),
  b("preview", "core.preview.page_up", "PageUp"),
  b("preview", "core.preview.page_down", "PageDown"),
  b("preview", "core.preview.delete", "Delete", "Shift+F8"),
  b("pane", "core.tab.new", "Mod+T"),
  b("pane", "core.tab.close", "Mod+W"),
  b("pane", "core.tab.next", "Ctrl+Tab"),
  b("pane", "core.tab.prev", "Ctrl+Shift+Tab"),
  b("pane", "core.view.hidden", "Mod+Shift+."),
  b("pane", "core.view.drive_bar", "Mod+Shift+D"),
  b("pane", "core.view.action_bar", "Mod+Shift+A"),
  b("pane", "core.quickselect.start", "Mod+Shift+F"),
  b("pane", "core.find.open", "Mod+F"),
  b("find", "core.find.close", "Escape"),
  b("quickSelect", "core.quickselect.accept", "Return"),
  b("quickSelect", "core.quickselect.cancel", "Escape"),
  b("pane", "core.menu.volumes", "Alt+1"),
  b("pane", "core.menu.favorites", "Alt+2"),
  b("pane", "core.menu.recent", "Alt+3"),
  b("pane", "core.menu.hierarchy", "Alt+0"),
  b("pane", "core.go.path", "Mod+G"),
  ...Array.from({ length: 10 }, (_, n) => ba("pane", "core.go.shortcut", { n: String(n) }, `Ctrl+${n}`)),
  b("panel", "core.menu.up", "Up"),
  b("panel", "core.menu.down", "Down"),
  b("panel", "core.menu.select", "Return"),
  b("panel", "core.menu.close", "Escape"),
  b("panel", "core.menu.right", "Right"),
  b("panel", "core.menu.left", "Left"),
  b("panel", "core.volume.unmount", "U"),
  b("panel", "core.volume.eject", "E"),
  b("panel", "core.recent.clear", "Ctrl+Backspace"),
  b("pane", "core.window.new", "Mod+N"),
  b("pane", "core.help", "F1"),
  b("help", "core.help.close", "Escape", "F1"),
  b("global", "core.actions.panel", "Mod+Shift+P"),
  b("palette", "core.palette.up", "Up"),
  b("palette", "core.palette.down", "Down"),
  b("palette", "core.palette.run", "Return"),
  b("palette", "core.palette.close", "Escape"),
  b("global", "core.queue.open", "="),
  b("global", "core.settings.open", "Mod+,"),
  b("settings", "core.settings.close", "Escape"),
  b("queue", "core.queue.up", "Up"),
  b("queue", "core.queue.down", "Down", "Space"),
  b("queue", "core.queue.pause", "P"),
  b("queue", "core.queue.abort", "A", "D"),
  b("queue", "core.queue.close", "Escape"),
  b("dialog", "core.dialog.confirm", "Return"),
  b("dialog", "core.dialog.cancel", "Escape"),
];

/** 플랫폼별로 다른 항목 (05 §5.2, §5.4, §5.5). */
export const DEFAULT_BINDINGS_BY_PLATFORM: Record<"mac" | "other", Binding[]> = {
  mac: [
    b("pane", "core.tab.next", "Alt+Mod+Right"),
    b("pane", "core.tab.prev", "Alt+Mod+Left"),
  ],
  other: [
    b("pane", "core.go.up", "Alt+Up"),
    b("pane", "core.tab.next", "Ctrl+PageDown"),
    b("pane", "core.tab.prev", "Ctrl+PageUp"),
    b("pane", "core.view.hidden", "Ctrl+H"),
  ],
};

export function defaultBindingsFor(platform: "mac" | "windows" | "linux"): Binding[] {
  return [...DEFAULT_BINDINGS, ...DEFAULT_BINDINGS_BY_PLATFORM[platform === "mac" ? "mac" : "other"]];
}
