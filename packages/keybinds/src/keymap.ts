import { ChordError, chordFromEvent, chordId, isPlainCharChord, parseChord } from "./chord";
import type { KeyEventLike, Platform } from "./chord";

export type Scope =
  | "global"
  | "pane"
  | "quickSelect"
  | "queue"
  | "preview"
  | "terminal"
  | "dialog"
  | "panel";

/** 열려 있으면 바깥 스코프의 바인딩을 무시하는 스코프. */
const MODAL_SCOPES: ReadonlySet<Scope> = new Set(["dialog", "panel"]);
/** 수정자 없는 문자 키를 허용하는 스코프(3.2절). */
const PLAIN_CHAR_SCOPES: ReadonlySet<Scope> = new Set(["queue", "preview", "dialog", "panel"]);

export interface Binding {
  scope: Scope;
  /** OS 중립 표기. `Mod`는 mac=Cmd, 그 외=Ctrl. */
  keys: string[];
  actionId: string;
  /** 액션 인수 (예: `core.open.directory`의 `src`). */
  args?: Record<string, string>;
}

/** 키 입력이 풀린 결과. */
export interface Resolved {
  actionId: string;
  args?: Record<string, string>;
}

export class Keymap {
  private table = new Map<string, Resolved>();
  readonly warnings: string[] = [];

  constructor(
    readonly platform: Platform,
    bindings: Binding[] = [],
  ) {
    for (const b of bindings) this.add(b);
  }

  private static slot(scope: Scope, id: string) {
    return `${scope}|${id}`;
  }

  /** 같은 스코프+키는 나중 정의가 이기며 경고한다. 잘못된 키는 무시하고 경고한다. */
  add(binding: Binding): void {
    for (const text of binding.keys) {
      let chord;
      try {
        chord = parseChord(text, this.platform);
      } catch (e) {
        if (e instanceof ChordError) {
          this.warnings.push(`${binding.actionId}: ${e.message}`);
          continue;
        }
        throw e;
      }
      if (binding.scope === "pane" && isPlainCharChord(chord)) {
        this.warnings.push(`${binding.actionId}: pane 스코프에 수정자 없는 문자 키(${text})는 Quick Select와 충돌한다`);
        continue;
      }
      if (!PLAIN_CHAR_SCOPES.has(binding.scope) && binding.scope !== "global" && isPlainCharChord(chord)) {
        this.warnings.push(`${binding.actionId}: ${binding.scope} 스코프의 문자 키 바인딩(${text})`);
      }
      const slot = Keymap.slot(binding.scope, chordId(chord));
      const prev = this.table.get(slot);
      if (prev && prev.actionId !== binding.actionId) {
        this.warnings.push(`${binding.scope} ${text}: ${prev.actionId} → ${binding.actionId} (나중 정의가 이김)`);
      }
      this.table.set(slot, { actionId: binding.actionId, args: binding.args });
    }
  }

  /**
   * 키 입력을 액션 ID로 푼다. `scopeStack`은 가장 안쪽 스코프가 앞이다.
   * 모달 스코프를 만나면 그 스코프까지만 검색한다.
   */
  resolve(event: KeyEventLike, scopeStack: Scope[]): string | undefined {
    return this.resolveBinding(event, scopeStack)?.actionId;
  }

  /** `resolve`와 같지만 인수까지 돌려준다. */
  resolveBinding(event: KeyEventLike, scopeStack: Scope[]): Resolved | undefined {
    const id = chordId(chordFromEvent(event));
    for (const scope of scopeStack) {
      const hit = this.table.get(Keymap.slot(scope, id));
      if (hit) return hit;
      if (MODAL_SCOPES.has(scope)) return undefined;
    }
    return undefined;
  }
}
