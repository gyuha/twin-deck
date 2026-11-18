import { describe, expect, it } from "vitest";
import type { Binding } from "@twin-deck/keybinds";
import { bindingFor, chordText, conflictsFor, keymapRows, removalFor, resetKeysFor } from "../lib/keymapEdit";

const ev = (key: string, code: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({
  key,
  code,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

const defaults: Binding[] = [
  { scope: "pane", keys: ["F5"], actionId: "core.copy" },
  { scope: "pane", keys: ["F6"], actionId: "core.move" },
  { scope: "pane", keys: ["Ctrl+3"], actionId: "core.go.shortcut", args: { n: "3" } },
  { scope: "dialog", keys: ["Enter"], actionId: "core.dialog.confirm" },
  { scope: "pane", keys: ["Enter"], actionId: "core.open" },
];
const actions = [
  { id: "core.copy", title: "복사", scopes: ["pane"] as const },
  { id: "core.rename", title: "이름 바꾸기", scopes: ["pane"] as const },
  { id: "core.sort.by", title: "정렬 (인수: key)", scopes: ["pane"] as const },
  { id: "core.app.launch", title: "앱 실행", scopes: ["pane"] as const },
];

describe("단축키 편집 규칙", () => {
  it("기본 바인딩마다, 기본 키가 없는 액션은 첫 스코프로 한 줄씩 만든다(인수 필요 액션·앱 실행은 뺀다)", () => {
    const rows = keymapRows(defaults, defaults, actions, "linux");
    const ids = rows.map((r) => `${r.actionId}${r.args.n ? ":" + r.args.n : ""}@${r.scope}`);
    expect(ids).toEqual(["core.copy@pane", "core.move@pane", "core.go.shortcut:3@pane", "core.dialog.confirm@dialog", "core.open@pane", "core.rename@pane"]);
    expect(rows.find((r) => r.actionId === "core.rename")?.keys).toEqual([]);
  });

  it("줄의 키는 병합 결과를 따른다(사용자가 옮긴 키 반영)", () => {
    const merged: Binding[] = [...defaults.filter((b) => b.actionId !== "core.copy"), { scope: "pane", keys: ["Ctrl+K"], actionId: "core.copy" }];
    const copy = keymapRows(defaults, merged, actions, "linux").find((r) => r.actionId === "core.copy")!;
    expect(copy.keys).toEqual(["Ctrl+K"]);
    expect(copy.defaultKeys).toEqual(["F5"]);
  });

  it("녹화한 키를 OS 중립 표기로 만든다", () => {
    expect(chordText(ev("k", "KeyK", { metaKey: true, shiftKey: true }), "mac")).toBe("Mod+Shift+K");
    expect(chordText(ev("k", "KeyK", { ctrlKey: true }), "mac")).toBe("Ctrl+K");
    expect(chordText(ev("k", "KeyK", { ctrlKey: true, altKey: true }), "windows")).toBe("Mod+Alt+K");
    expect(chordText(ev("F5", "F5"), "linux")).toBe("F5");
    expect(chordText(ev(" ", "Space", { ctrlKey: true }), "linux")).toBe("Mod+Space");
    expect(chordText(ev("Shift", "ShiftLeft", { shiftKey: true }), "linux")).toBeNull();
  });

  it("같은 스코프에서 이미 쓰는 키만 충돌로 본다", () => {
    const rows = keymapRows(defaults, defaults, actions, "linux");
    const rename = rows.find((r) => r.actionId === "core.rename")!;
    expect(conflictsFor(rename, "F5", defaults, "linux").map((b) => b.actionId)).toEqual(["core.copy"]);
    expect(conflictsFor(rename, "f5", defaults, "linux")).toHaveLength(1);
    const confirm = rows.find((r) => r.actionId === "core.dialog.confirm")!;
    expect(conflictsFor(confirm, "F5", defaults, "linux")).toEqual([]);
    // 자기 자신은 충돌이 아니다
    expect(conflictsFor(rows[0], "F5", defaults, "linux")).toEqual([]);
  });

  it("키를 더할 때 액션의 첫 스코프가 아닌 줄만 스코프를 적는다", () => {
    const rows = keymapRows(defaults, defaults, actions, "linux");
    const go = rows.find((r) => r.actionId === "core.go.shortcut")!;
    expect(bindingFor(go, "Alt+3", ["pane"])).toEqual({ key: "Alt+3", action: "core.go.shortcut", args: { n: "3" }, scope: null });
    expect(bindingFor(go, "Alt+3", ["global", "pane"]).scope).toBe("pane");
  });

  it("키를 뺄 때: 사용자가 더한 키는 항목 삭제, 기본 키는 해제, 다른 줄도 쓰는 기본 키는 막는다", () => {
    const merged: Binding[] = [...defaults, { scope: "pane", keys: ["Ctrl+K"], actionId: "core.copy" }];
    const rows = keymapRows(defaults, merged, actions, "linux");
    const copy = rows.find((r) => r.actionId === "core.copy")!;
    const open = rows.find((r) => r.actionId === "core.open")!;
    expect(removalFor(copy, "Ctrl+K", defaults, merged, "linux")).toBe("reset");
    expect(removalFor(copy, "F5", defaults, merged, "linux")).toBe("unbind");
    expect(removalFor(open, "Enter", defaults, merged, "linux")).toBe("blocked");
  });

  it("줄을 기본값으로 되돌리면 그 줄을 가리키거나 기본 키를 덮은 사용자 항목을 지운다", () => {
    const rows = keymapRows(defaults, defaults, actions, "linux");
    const copy = rows.find((r) => r.actionId === "core.copy")!;
    const user = [
      { key: "Ctrl+K", action: "core.copy", args: {}, scope: null },
      { key: "f5", action: null, args: {}, scope: null },
      { key: "Ctrl+J", action: "core.move", args: {}, scope: null },
    ];
    expect(resetKeysFor(copy, user, () => ["pane"], "linux")).toEqual(["Ctrl+K", "f5"]);
  });
});
