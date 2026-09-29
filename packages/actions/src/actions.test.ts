import { describe, expect, it, vi } from "vitest";
import { Keymap } from "@twin-deck/keybinds";
import type { Scope } from "@twin-deck/keybinds";
import {
  ActionRegistry,
  DEFAULT_ACTION_META,
  createDefaultRegistry,
  mergeUserBindings,
  missingHandlers,
  defaultBindingsFor,
} from "./index";
import type { ActionContext, ActionHandlers } from "./index";

const ctx = (o: Partial<ActionContext> = {}): ActionContext => ({
  hasCursorItem: false,
  selectedCount: 0,
  tabCount: 1,
  canGoUp: true,
  cursorIsDir: false,
  multiColumn: false,
  ...o,
});

function handlers(run = vi.fn()): ActionHandlers {
  return Object.fromEntries(DEFAULT_ACTION_META.map((m) => [m.id, run])) as unknown as ActionHandlers;
}

describe("레지스트리", () => {
  it("중복 ID 등록은 오류", () => {
    const r = new ActionRegistry<ActionContext>();
    r.register({ id: "a.b", title: "t", category: "File", scopes: ["pane"], run() {} });
    expect(() =>
      r.register({ id: "a.b", title: "t2", category: "File", scopes: ["pane"], run() {} }),
    ).toThrow(/이미 등록/);
  });

  it("알 수 없는 ID는 unknown", async () => {
    const r = new ActionRegistry<ActionContext>();
    expect(await r.dispatch("nope", ctx())).toBe("unknown");
  });
});

describe("ACT-02 컨텍스트 조건부 활성", () => {
  it("선택도 커서 항목도 없으면 복사/이동/삭제는 비활성이고 실행되지 않는다", async () => {
    const run = vi.fn();
    const r = createDefaultRegistry(handlers(run));
    for (const id of ["core.copy", "core.move", "core.trash", "core.delete", "core.rename"]) {
      expect(r.isApplicable(id, ctx())).toBe(false);
      expect(await r.dispatch(id, ctx())).toBe("inapplicable");
    }
    expect(run).not.toHaveBeenCalled();
  });

  it("커서 항목 또는 선택이 있으면 활성", async () => {
    const run = vi.fn();
    const r = createDefaultRegistry(handlers(run));
    expect(r.isApplicable("core.copy", ctx({ hasCursorItem: true }))).toBe(true);
    expect(r.isApplicable("core.copy", ctx({ selectedCount: 2 }))).toBe(true);
    expect(await r.dispatch("core.copy", ctx({ selectedCount: 2 }))).toBe("ran");
    expect(run).toHaveBeenCalledOnce();
  });

  it("이름 변경은 커서 항목이 필요하다", () => {
    const r = createDefaultRegistry(handlers());
    expect(r.isApplicable("core.rename", ctx({ selectedCount: 3 }))).toBe(false);
    expect(r.isApplicable("core.rename", ctx({ hasCursorItem: true }))).toBe(true);
  });

  it("탭이 하나면 탭 닫기는 비활성, 위로 갈 수 없으면 상위 이동 비활성", () => {
    const r = createDefaultRegistry(handlers());
    expect(r.isApplicable("core.tab.close", ctx({ tabCount: 1 }))).toBe(false);
    expect(r.isApplicable("core.tab.close", ctx({ tabCount: 2 }))).toBe(true);
    expect(r.isApplicable("core.go.up", ctx({ canGoUp: false }))).toBe(false);
  });

  it("조건 없는 액션(새 폴더)은 항상 활성", () => {
    const r = createDefaultRegistry(handlers());
    expect(r.isApplicable("core.file.new_folder", ctx())).toBe(true);
  });
});

describe("핸들러 누락 검사", () => {
  it("일부만 주면 그 액션만 등록되고 누락 목록을 알 수 있다", () => {
    const r = createDefaultRegistry({ "core.copy": () => {} });
    expect(r.has("core.copy")).toBe(true);
    expect(r.has("core.move")).toBe(false);
    expect(missingHandlers({ "core.copy": () => {} })).toContain("core.move");
    expect(missingHandlers(handlers())).toEqual([]);
  });
});

describe("기본 키맵", () => {
  const registry = createDefaultRegistry(handlers());

  it.each(["mac", "windows", "linux"] as const)("%s: 모든 바인딩이 등록된 액션 ID를 가리키고 경고가 없다", (platform) => {
    const bindings = defaultBindingsFor(platform);
    for (const b of bindings) {
      expect(registry.has(b.actionId), b.actionId).toBe(true);
      const action = registry.get(b.actionId)!;
      expect(action.scopes, `${b.actionId} 스코프`).toContain(b.scope);
    }
    expect(new Keymap(platform, bindings).warnings).toEqual([]);
  });

  it("M1 파일 작업 기본 키 (F5~F8)", () => {
    const km = new Keymap("linux", defaultBindingsFor("linux"));
    const key = (k: string, shiftKey = false) => ({
      key: k,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey,
    });
    expect(km.resolve(key("F5"), ["pane"])).toBe("core.copy");
    expect(km.resolve(key("F6"), ["pane"])).toBe("core.move");
    expect(km.resolve(key("F6", true), ["pane"])).toBe("core.rename");
    expect(km.resolve(key("F7"), ["pane"])).toBe("core.file.new_folder");
    expect(km.resolve(key("F7", true), ["pane"])).toBe("core.file.new_file");
    expect(km.resolve(key("F8"), ["pane"])).toBe("core.trash");
    expect(km.resolve(key("F8", true), ["pane"])).toBe("core.delete");
    expect(km.resolve(key("Tab"), ["pane"])).toBe("core.pane.switch");
    expect(km.resolve(key("Escape"), ["pane"])).toBe("core.select.none");
  });

  it("탭 이동 키는 mac과 다른 OS가 다르다 (05 §5.4)", () => {
    const mac = new Keymap("mac", defaultBindingsFor("mac"));
    const linux = new Keymap("linux", defaultBindingsFor("linux"));
    const cmdOptRight = { key: "ArrowRight", ctrlKey: false, metaKey: true, altKey: true, shiftKey: false };
    const ctrlPgDn = { key: "PageDown", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false };
    expect(mac.resolve(cmdOptRight, ["pane"])).toBe("core.tab.next");
    expect(linux.resolve(ctrlPgDn, ["pane"])).toBe("core.tab.next");
    expect(mac.resolve(ctrlPgDn, ["pane"])).toBeUndefined();
  });
});

describe("사용자 키바인딩 병합 (CFG-02)", () => {
  const registry = createDefaultRegistry(handlers());
  const scopesOf = (id: string): readonly Scope[] | undefined => registry.get(id)?.scopes;
  const user = (key: string, action: string | null, args: Record<string, string> = {}, scope: string | null = null) => ({
    key,
    action,
    args,
    scope,
  });
  const ev = (key: string, o: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...o,
  });
  const build = (specs: ReturnType<typeof user>[]) => {
    const merged = mergeUserBindings(defaultBindingsFor("linux"), specs, scopesOf, "linux");
    const km = new Keymap("linux", merged.bindings);
    return { km, warnings: [...merged.warnings, ...km.warnings] };
  };

  it("keybinding_unbind_none: none으로 기본 바인딩을 해제한다", () => {
    const { km, warnings } = build([user("F5", null)]);
    expect(warnings).toEqual([]);
    expect(km.resolve(ev("F5"), ["pane"])).toBeUndefined();
    expect(km.resolve(ev("F6"), ["pane"])).toBe("core.move"); // 다른 키는 그대로
  });

  it("사용자 바인딩이 기본을 대체하고 경고가 없다", () => {
    const { km, warnings } = build([user("F5", "core.move")]);
    expect(warnings).toEqual([]);
    expect(km.resolve(ev("F5"), ["pane"])).toBe("core.move");
  });

  it("인수를 보존한다", () => {
    const { km, warnings } = build([user("Alt+H", "core.open", { src: "~" })]);
    expect(warnings).toEqual([]);
    expect(km.resolveBinding(ev("h", { altKey: true }), ["pane"])).toEqual({
      actionId: "core.open",
      args: { src: "~" },
    });
  });

  it("scope를 강제로 지정할 수 있다", () => {
    const { km } = build([user("F9", "core.copy", {}, "global")]);
    expect(km.resolve(ev("F9"), ["global"])).toBe("core.copy");
    expect(km.resolve(ev("F9"), ["pane"])).toBeUndefined();
  });

  it("존재하지 않는 액션, 알 수 없는 키/스코프는 무시하고 경고한다", () => {
    const { km, warnings } = build([
      user("F9", "nope.action"),
      user("Hyper+X", "core.copy"),
      user("F10", "core.copy", {}, "weird"),
    ]);
    expect(warnings).toHaveLength(3);
    expect(km.resolve(ev("F9"), ["pane"])).toBeUndefined();
    expect(km.resolve(ev("F5"), ["pane"])).toBe("core.copy");
  });

  it("dispatch가 인수를 액션에 전달한다", async () => {
    const run = vi.fn();
    const r = new ActionRegistry<ActionContext>();
    r.register({ id: "x.open", title: "t", category: "File", scopes: ["pane"], run });
    await r.dispatch("x.open", ctx(), { src: "~" });
    expect(run).toHaveBeenCalledWith(ctx(), { src: "~" });
  });
});
