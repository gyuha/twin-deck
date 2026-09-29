import { ChordError, chordId, parseChord } from "@twin-deck/keybinds";
import type { Binding, Platform, Scope } from "@twin-deck/keybinds";

/** `keybindings.toml`에서 읽은 한 줄 (Rust `BindingSpec`과 같은 모양). */
export interface UserBinding {
  key: string;
  /** null이면 기본 바인딩 해제(`"F5" = "none"`). */
  action: string | null;
  /** specta는 맵을 `Partial<Record>`로 내보낸다. */
  args: Partial<Record<string, string>>;
  scope: string | null;
}

export interface MergeResult {
  bindings: Binding[];
  warnings: string[];
}

const SCOPES: readonly Scope[] = ["global", "pane", "quickSelect", "queue", "preview", "terminal", "dialog", "panel"];

/**
 * 기본 바인딩 위에 사용자 바인딩을 얹는다(05 §7).
 * - 해제(`none`): 같은 키의 기본/앞선 바인딩을 모든 스코프에서 지운다.
 * - 새 바인딩: 액션이 선언한 스코프를 쓰고(`scope`로 강제 가능), 같은 스코프+키의 앞선 바인딩을 대체한다.
 * - 존재하지 않는 액션 ID, 알 수 없는 키/스코프는 경고하고 무시한다.
 */
export function mergeUserBindings(
  defaults: Binding[],
  user: UserBinding[],
  scopesOf: (actionId: string) => readonly Scope[] | undefined,
  platform: Platform,
): MergeResult {
  const warnings: string[] = [];
  // 키 하나당 항목 하나로 펼친다.
  let entries = defaults.flatMap((b) => b.keys.map((key) => ({ ...b, keys: [key] })));
  const chordOf = (key: string) => chordId(parseChord(key, platform));

  for (const u of user) {
    let id: string;
    try {
      id = chordOf(u.key);
    } catch (e) {
      if (e instanceof ChordError) {
        warnings.push(`${u.key}: ${e.message}`);
        continue;
      }
      throw e;
    }
    if (u.action === null) {
      entries = entries.filter((b) => chordOf(b.keys[0]) !== id);
      continue;
    }
    const declared = scopesOf(u.action);
    if (!declared) {
      warnings.push(`${u.key}: 존재하지 않는 액션 ID를 무시합니다: ${u.action}`);
      continue;
    }
    let scope: Scope | undefined = declared[0];
    if (u.scope !== null) {
      scope = SCOPES.find((s) => s === u.scope);
      if (!scope) {
        warnings.push(`${u.key}: 알 수 없는 스코프를 무시합니다: ${u.scope}`);
        continue;
      }
    }
    if (!scope) {
      warnings.push(`${u.key}: ${u.action}의 스코프를 알 수 없습니다`);
      continue;
    }
    entries = entries.filter((b) => !(b.scope === scope && chordOf(b.keys[0]) === id));
    const args = Object.fromEntries(Object.entries(u.args).filter((e): e is [string, string] => e[1] !== undefined));
    entries.push({
      scope,
      keys: [u.key],
      actionId: u.action,
      args: Object.keys(args).length ? args : undefined,
    });
  }
  return { bindings: entries, warnings };
}
