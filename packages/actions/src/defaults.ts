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
  /** 커서 항목이 폴더인지. */
  cursorIsDir: boolean;
}

const hasTarget = (c: ActionContext) => c.selectedCount > 0 || c.hasCursorItem;

interface Meta {
  id: string;
  title: string;
  category: ActionCategory;
  scopes: Action<ActionContext>["scopes"];
  isApplicable?: (c: ActionContext) => boolean;
}

/** M1(P0) 내장 액션. ID는 docs/05 카탈로그를 따른다. */
export const DEFAULT_ACTION_META = [
  { id: "core.copy", title: "복사", category: "File", scopes: ["pane"], isApplicable: hasTarget },
  { id: "core.move", title: "이동", category: "File", scopes: ["pane"], isApplicable: hasTarget },
  { id: "core.rename", title: "이름 변경", category: "File", scopes: ["pane"], isApplicable: (c) => c.hasCursorItem },
  { id: "core.file.new_folder", title: "새 폴더", category: "File", scopes: ["pane"] },
  { id: "core.file.new_file", title: "새 파일", category: "File", scopes: ["pane"] },
  { id: "core.trash", title: "휴지통으로 이동", category: "File", scopes: ["pane"], isApplicable: hasTarget },
  { id: "core.delete", title: "영구 삭제", category: "File", scopes: ["pane"], isApplicable: hasTarget },
  { id: "core.open", title: "열기", category: "Navigation", scopes: ["pane"], isApplicable: (c) => c.hasCursorItem },
  { id: "core.go.up", title: "상위 폴더", category: "Navigation", scopes: ["pane"], isApplicable: (c) => c.canGoUp },
  { id: "core.move.up", title: "커서 위로", category: "Navigation", scopes: ["pane"] },
  { id: "core.move.down", title: "커서 아래로", category: "Navigation", scopes: ["pane"] },
  { id: "core.move.page_up", title: "페이지 위로", category: "Navigation", scopes: ["pane"] },
  { id: "core.move.page_down", title: "페이지 아래로", category: "Navigation", scopes: ["pane"] },
  { id: "core.move.home", title: "처음으로", category: "Navigation", scopes: ["pane"] },
  { id: "core.move.end", title: "끝으로", category: "Navigation", scopes: ["pane"] },
  { id: "core.pane.switch", title: "활성 패널 전환", category: "Navigation", scopes: ["pane"] },
  { id: "core.select.all", title: "전체 선택", category: "Selection", scopes: ["pane"] },
  { id: "core.select.none", title: "선택 해제", category: "Selection", scopes: ["pane"], isApplicable: (c) => c.selectedCount > 0 },
  { id: "core.select.toggle", title: "현재 항목 선택 토글", category: "Selection", scopes: ["pane"], isApplicable: (c) => c.hasCursorItem },
  { id: "core.tab.new", title: "새 탭", category: "Tab", scopes: ["pane"] },
  { id: "core.tab.close", title: "탭 닫기", category: "Tab", scopes: ["pane"], isApplicable: (c) => c.tabCount > 1 },
  { id: "core.tab.next", title: "다음 탭", category: "Tab", scopes: ["pane"], isApplicable: (c) => c.tabCount > 1 },
  { id: "core.tab.prev", title: "이전 탭", category: "Tab", scopes: ["pane"], isApplicable: (c) => c.tabCount > 1 },
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
  { id: "core.volume.unmount", title: "볼륨 언마운트", category: "Navigation", scopes: ["panel"] },
  { id: "core.volume.eject", title: "볼륨 추출", category: "Navigation", scopes: ["panel"] },
  { id: "core.recent.clear", title: "최근 위치 비우기", category: "Navigation", scopes: ["panel"] },
  { id: "core.favorites.add", title: "현재 폴더를 즐겨찾기에 추가", category: "Navigation", scopes: ["pane"] },
  { id: "core.go.path", title: "경로로 이동", category: "Navigation", scopes: ["pane"] },
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

/** M1 기본 키맵 (OS 중립 표기). macOS와 Windows/Linux가 다른 항목은 `DEFAULT_BINDINGS_BY_PLATFORM`에서 덮는다. */
export const DEFAULT_BINDINGS: Binding[] = [
  b("pane", "core.copy", "F5"),
  b("pane", "core.move", "F6"),
  b("pane", "core.rename", "Shift+F6"),
  b("pane", "core.file.new_folder", "F7"),
  b("pane", "core.file.new_file", "Shift+F7"),
  b("pane", "core.trash", "F8"),
  b("pane", "core.delete", "Shift+F8"),
  b("pane", "core.open", "Return"),
  b("pane", "core.go.up", "Backspace"),
  b("pane", "core.move.up", "Up"),
  b("pane", "core.move.down", "Down"),
  b("pane", "core.move.page_up", "PageUp"),
  b("pane", "core.move.page_down", "PageDown"),
  b("pane", "core.move.home", "Home"),
  b("pane", "core.move.end", "End"),
  b("pane", "core.pane.switch", "Tab"),
  b("pane", "core.select.all", "Mod+A"),
  b("pane", "core.select.none", "Escape"),
  b("pane", "core.select.toggle", "Space", "Insert"),
  b("pane", "core.tab.new", "Mod+T"),
  b("pane", "core.tab.close", "Mod+W"),
  b("pane", "core.view.hidden", "Mod+Shift+."),
  b("pane", "core.quickselect.start", "Mod+F"),
  b("quickSelect", "core.quickselect.accept", "Return"),
  b("quickSelect", "core.quickselect.cancel", "Escape"),
  b("pane", "core.menu.volumes", "Alt+1"),
  b("pane", "core.menu.favorites", "Alt+2"),
  b("pane", "core.menu.recent", "Alt+3"),
  b("pane", "core.menu.hierarchy", "Alt+0"),
  b("pane", "core.go.path", "Mod+G"),
  b("panel", "core.menu.up", "Up"),
  b("panel", "core.menu.down", "Down"),
  b("panel", "core.menu.select", "Return"),
  b("panel", "core.menu.close", "Escape"),
  b("panel", "core.volume.unmount", "U"),
  b("panel", "core.volume.eject", "E"),
  b("panel", "core.recent.clear", "C"),
  b("global", "core.queue.open", "="),
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
