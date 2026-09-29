import { describe, expect, it } from "vitest";
import { Keymap, chordFromEvent, chordId, parseChord } from "./index";
import type { KeyEventLike } from "./index";

const ev = (o: Partial<KeyEventLike> & { key: string }): KeyEventLike => ({
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...o,
});

describe("플랫폼 매핑 (ADR-0010)", () => {
  it("Mod는 mac에서 Cmd(meta), 그 외에서 Ctrl", () => {
    expect(parseChord("Mod+T", "mac")).toMatchObject({ meta: true, ctrl: false, key: "t" });
    expect(parseChord("Mod+T", "windows")).toMatchObject({ meta: false, ctrl: true, key: "t" });
    expect(parseChord("Mod+T", "linux")).toMatchObject({ ctrl: true });
  });

  it("Alt는 그대로, Ctrl은 항상 실제 Ctrl", () => {
    expect(parseChord("Alt+Mod+Right", "mac")).toMatchObject({ alt: true, meta: true, key: "ArrowRight" });
    expect(parseChord("Ctrl+O", "mac")).toMatchObject({ ctrl: true, meta: false });
  });

  it("같은 논리 키가 플랫폼별로 다른 물리 조합에 해석된다", () => {
    const bindings = [{ scope: "global" as const, keys: ["Mod+T"], actionId: "core.tab.new" }];
    const mac = new Keymap("mac", bindings);
    const linux = new Keymap("linux", bindings);
    const cmdT = ev({ key: "t", metaKey: true });
    const ctrlT = ev({ key: "t", ctrlKey: true });
    expect(mac.resolve(cmdT, ["global"])).toBe("core.tab.new");
    expect(mac.resolve(ctrlT, ["global"])).toBeUndefined();
    expect(linux.resolve(ctrlT, ["global"])).toBe("core.tab.new");
    expect(linux.resolve(cmdT, ["global"])).toBeUndefined();
  });

  it("키 이름 별칭과 잘못된 이름", () => {
    expect(parseChord("Esc", "mac").key).toBe("Escape");
    expect(parseChord("Return", "mac").key).toBe("Enter");
    expect(() => parseChord("Foo", "mac")).toThrow();
    expect(() => parseChord("Hyper+A", "mac")).toThrow();
  });

  it("Shift로 바뀌는 기호는 물리 코드로 맞춘다 (Mod+Shift+.)", () => {
    const km = new Keymap("mac", [{ scope: "pane", keys: ["Mod+Shift+."], actionId: "core.view.hidden" }]);
    const e = ev({ key: ">", code: "Period", metaKey: true, shiftKey: true });
    expect(chordId(chordFromEvent(e))).toBe(chordId(parseChord("Mod+Shift+.", "mac")));
    expect(km.resolve(e, ["pane"])).toBe("core.view.hidden");
  });
});

describe("스코프 해석", () => {
  const bindings = [
    { scope: "pane" as const, keys: ["Escape"], actionId: "core.select.none" },
    { scope: "dialog" as const, keys: ["Escape"], actionId: "core.dialog.cancel" },
    { scope: "global" as const, keys: ["Mod+Shift+P"], actionId: "core.actions.panel" },
    { scope: "pane" as const, keys: ["F5"], actionId: "core.copy" },
  ];
  const km = new Keymap("linux", bindings);
  const esc = ev({ key: "Escape" });

  it("같은 키가 스코프에 따라 다른 액션으로 해석된다", () => {
    expect(km.resolve(esc, ["pane", "global"])).toBe("core.select.none");
    expect(km.resolve(esc, ["dialog", "pane", "global"])).toBe("core.dialog.cancel");
  });

  it("안쪽 스코프에 없으면 바깥으로 올라간다", () => {
    const e = ev({ key: "p", ctrlKey: true, shiftKey: true });
    expect(km.resolve(e, ["pane", "global"])).toBe("core.actions.panel");
  });

  it("모달이 열려 있으면 아래 스코프 바인딩은 무시된다", () => {
    expect(km.resolve(ev({ key: "F5" }), ["dialog", "pane", "global"])).toBeUndefined();
    expect(km.resolve(ev({ key: "p", ctrlKey: true, shiftKey: true }), ["dialog", "pane", "global"])).toBeUndefined();
  });
});

describe("바인딩 검증 (05 §7)", () => {
  it("pane 스코프의 수정자 없는 문자 키는 무시하고 경고한다", () => {
    const km = new Keymap("mac", [{ scope: "pane", keys: ["a"], actionId: "x.y" }]);
    expect(km.warnings.length).toBe(1);
    expect(km.resolve(ev({ key: "a" }), ["pane"])).toBeUndefined();
  });

  it("모달 스코프의 단일 문자 키는 허용한다", () => {
    const km = new Keymap("mac", [{ scope: "queue", keys: ["P"], actionId: "queue.pause" }]);
    expect(km.warnings).toEqual([]);
    expect(km.resolve(ev({ key: "p" }), ["queue"])).toBe("queue.pause");
  });

  it("같은 스코프+키 중복은 나중 정의가 이기고 경고한다", () => {
    const km = new Keymap("mac", [
      { scope: "pane", keys: ["F5"], actionId: "a" },
      { scope: "pane", keys: ["F5"], actionId: "b" },
    ]);
    expect(km.resolve(ev({ key: "F5" }), ["pane"])).toBe("b");
    expect(km.warnings.length).toBe(1);
  });

  it("알 수 없는 키 이름은 무시하고 경고한다", () => {
    const km = new Keymap("mac", [{ scope: "pane", keys: ["Nope"], actionId: "a" }]);
    expect(km.warnings.length).toBe(1);
  });
});
