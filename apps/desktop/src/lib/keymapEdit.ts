import type { UserBinding } from "@twin-deck/actions";
import { chordFromEvent, chordId, ChordError, isPlainCharChord, parseChord, type Binding, type KeyEventLike, type Platform, type Scope } from "@twin-deck/keybinds";
import { APP_ACTIONS } from "./fkeys";

/** 단축키 설정의 한 줄: (액션, 인수, 스코프) 하나와 지금 걸린 키들. */
export interface KeymapRow {
  id: string;
  actionId: string;
  args: Record<string, string>;
  scope: Scope;
  /** 지금 적용 중인 키(OS 중립 표기, 기본+사용자 병합 결과). */
  keys: string[];
  /** 내장 기본 키. */
  defaultKeys: string[];
}

export interface ActionInfo {
  id: string;
  title: string;
  scopes: readonly Scope[];
}

const argsKey = (args: Record<string, string> | undefined) =>
  JSON.stringify(Object.entries(args ?? {}).sort(([a], [b]) => a.localeCompare(b)));
const rowId = (actionId: string, args: Record<string, string> | undefined, scope: Scope) => `${actionId}|${argsKey(args)}|${scope}`;

/** 키 문자열을 비교용 ID로. 읽을 수 없는 키는 그대로(대소문자 무시). */
export function keyId(key: string, platform: Platform): string {
  try {
    return chordId(parseChord(key, platform));
  } catch (e) {
    if (e instanceof ChordError) return key.toLowerCase();
    throw e;
  }
}

/**
 * 설정 화면에 보일 줄을 만든다. 기본 바인딩의 (액션, 인수, 스코프)마다 한 줄, 기본 키가 없는 액션은 첫 스코프로 한 줄.
 * 인수가 필요한 액션(제목에 "(인수:")과 앱 실행 액션(F키 줄에서 앱 경로와 함께 고른다)은 기본 바인딩이 없으면 뺀다.
 */
export function keymapRows(defaults: readonly Binding[], merged: readonly Binding[], actions: readonly ActionInfo[], platform: Platform): KeymapRow[] {
  const rows = new Map<string, KeymapRow>();
  const add = (actionId: string, args: Record<string, string> | undefined, scope: Scope) => {
    const id = rowId(actionId, args, scope);
    if (!rows.has(id)) rows.set(id, { id, actionId, args: { ...(args ?? {}) }, scope, keys: [], defaultKeys: [] });
    return rows.get(id)!;
  };
  for (const b of defaults) {
    if (APP_ACTIONS.includes(b.actionId)) continue;
    const row = add(b.actionId, b.args, b.scope);
    for (const k of b.keys) if (!row.defaultKeys.some((x) => keyId(x, platform) === keyId(k, platform))) row.defaultKeys.push(k);
  }
  for (const a of actions) {
    if (APP_ACTIONS.includes(a.id) || /\(\S+:/.test(a.title) || a.scopes.length === 0) continue;
    if ([...rows.values()].some((r) => r.actionId === a.id)) continue;
    add(a.id, undefined, a.scopes[0]);
  }
  for (const b of merged) {
    if (APP_ACTIONS.includes(b.actionId)) continue;
    const id = rowId(b.actionId, b.args, b.scope);
    const row = rows.get(id) ?? add(b.actionId, b.args, b.scope);
    for (const k of b.keys) if (!row.keys.some((x) => keyId(x, platform) === keyId(k, platform))) row.keys.push(k);
  }
  return [...rows.values()];
}

const MODIFIER_KEYS = new Set(["Shift", "Control", "Meta", "Alt", "AltGraph", "CapsLock", "Fn", "OS"]);

/**
 * 녹화한 키 입력을 저장할 표기로: macOS의 Cmd와 그 밖의 Ctrl은 `Mod`, 순서는 Mod/Ctrl/Alt/Shift.
 * 수식키만 누른 입력은 null.
 */
export function chordText(e: KeyEventLike, platform: Platform): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  const c = chordFromEvent(e);
  const mod = platform === "mac" ? c.meta : c.ctrl;
  const ctrl = platform === "mac" ? c.ctrl : false;
  const key = c.key === " " ? "Space" : c.key.length === 1 ? c.key.toUpperCase() : c.key;
  return [mod && "Mod", ctrl && "Ctrl", c.alt && "Alt", c.shift && "Shift", key].filter(Boolean).join("+");
}

/** 수식키 없이 누르는 문자 키인가. 목록의 빠른 선택과 겹쳐 단축키로 쓰지 않는다. */
export function isPlainCharKey(key: string, platform: Platform): boolean {
  try {
    return isPlainCharChord(parseChord(key, platform));
  } catch {
    return false;
  }
}

/** `row`의 스코프에서 `key`를 이미 쓰는 다른 바인딩. */
export function conflictsFor(row: KeymapRow, key: string, merged: readonly Binding[], platform: Platform): Binding[] {
  const id = keyId(key, platform);
  return merged.filter(
    (b) => b.scope === row.scope && b.keys.some((k) => keyId(k, platform) === id) && rowId(b.actionId, b.args, b.scope) !== row.id,
  );
}

/** 줄에 키를 더할 때 keybindings.toml에 쓸 항목. 액션의 첫 스코프가 아니면 스코프를 적는다. */
export function bindingFor(row: KeymapRow, key: string, declared: readonly Scope[] | undefined): UserBinding {
  return { key, action: row.actionId, args: { ...row.args }, scope: declared?.[0] === row.scope ? null : row.scope };
}

/**
 * 줄에서 키 하나를 뺄 방법.
 * - `reset`: 사용자 파일에서 그 키 항목만 지운다(내장 기본 키가 아닐 때).
 * - `unbind`: `"none"`으로 그 키를 해제한다(해제는 모든 스코프에 걸린다).
 * - `blocked`: 내장 기본 키인데 다른 줄도 그 키를 써서, 여기서만 지울 수 없다.
 */
export function removalFor(row: KeymapRow, key: string, defaults: readonly Binding[], merged: readonly Binding[], platform: Platform): "reset" | "unbind" | "blocked" {
  const id = keyId(key, platform);
  const isDefault = defaults.some((b) => b.keys.some((k) => keyId(k, platform) === id));
  if (!isDefault) return "reset";
  const others = merged.some((b) => b.keys.some((k) => keyId(k, platform) === id) && rowId(b.actionId, b.args, b.scope) !== row.id);
  return others ? "blocked" : "unbind";
}

/** 줄을 기본값으로 되돌릴 때 지울 사용자 항목의 키: 이 줄을 가리키는 항목과 이 줄의 기본 키를 덮은 항목. */
export function resetKeysFor(row: KeymapRow, user: readonly UserBinding[], scopesOf: (id: string) => readonly Scope[] | undefined, platform: Platform): string[] {
  const defaults = new Set(row.defaultKeys.map((k) => keyId(k, platform)));
  return user
    .filter((u) => {
      if (defaults.has(keyId(u.key, platform))) return true;
      if (u.action !== row.actionId) return false;
      const scope = u.scope ?? scopesOf(u.action)?.[0];
      const args = Object.fromEntries(Object.entries(u.args).filter((e): e is [string, string] => e[1] !== undefined));
      return scope === row.scope && argsKey(args) === argsKey(row.args);
    })
    .map((u) => u.key);
}
