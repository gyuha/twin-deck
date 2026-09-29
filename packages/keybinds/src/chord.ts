export type Platform = "mac" | "windows" | "linux";

/** OS 중립 표기(`Mod+Shift+P`)를 실제 수정자로 푼 결과. key는 정규화된 이름. */
export interface Chord {
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

/** KeyboardEvent에서 필요한 필드만. */
export interface KeyEventLike {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const KEY_ALIASES: Record<string, string> = {
  esc: "Escape",
  escape: "Escape",
  return: "Enter",
  enter: "Enter",
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  space: " ",
  del: "Delete",
  delete: "Delete",
  backspace: "Backspace",
  tab: "Tab",
  insert: "Insert",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
};

const CODE_TO_KEY: Record<string, string> = {
  Period: ".",
  Comma: ",",
  Equal: "=",
  Minus: "-",
  Slash: "/",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
};

export class ChordError extends Error {}

/** 키 이름을 KeyboardEvent.key 어휘로 맞춘다. 알 수 없는 이름이면 ChordError. */
export function normalizeKeyName(name: string): string {
  const alias = KEY_ALIASES[name.toLowerCase()];
  if (alias) return alias;
  if (/^f([1-9]|1\d|20)$/i.test(name)) return name.toUpperCase();
  if (name.length === 1) return name.toLowerCase();
  throw new ChordError(`알 수 없는 키 이름: ${name}`);
}

/** `Mod+Shift+P` 같은 표기를 플랫폼에 맞는 Chord로 푼다. */
export function parseChord(text: string, platform: Platform): Chord {
  const parts = text === "+" ? ["+"] : text.split("+");
  const keyName = parts.pop();
  if (!keyName) throw new ChordError(`빈 키 조합: ${text}`);
  const chord: Chord = {
    ctrl: false,
    meta: false,
    alt: false,
    shift: false,
    key: normalizeKeyName(keyName),
  };
  for (const raw of parts) {
    switch (raw.toLowerCase()) {
      case "mod":
        if (platform === "mac") chord.meta = true;
        else chord.ctrl = true;
        break;
      case "ctrl":
        chord.ctrl = true;
        break;
      case "alt":
        chord.alt = true;
        break;
      case "shift":
        chord.shift = true;
        break;
      default:
        throw new ChordError(`알 수 없는 수정자: ${raw}`);
    }
  }
  return chord;
}

/** 이벤트의 키 이름. 문자/기호는 물리 코드가 있으면 그것을 우선한다(Shift로 바뀌는 기호 대응). */
export function eventKeyName(e: KeyEventLike): string {
  const code = e.code ?? "";
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (code in CODE_TO_KEY) return CODE_TO_KEY[code];
  return e.key.length === 1 ? e.key.toLowerCase() : e.key;
}

export function chordFromEvent(e: KeyEventLike): Chord {
  return {
    ctrl: e.ctrlKey,
    meta: e.metaKey,
    alt: e.altKey,
    shift: e.shiftKey,
    key: eventKeyName(e),
  };
}

export function chordId(c: Chord): string {
  return `${c.ctrl ? "C" : ""}${c.meta ? "M" : ""}${c.alt ? "A" : ""}${c.shift ? "S" : ""}:${c.key}`;
}

/** 수정자 없이(Shift만 허용) 눌리는 문자 키인가. Quick Select와 충돌하는 조합. */
export function isPlainCharChord(c: Chord): boolean {
  return !c.ctrl && !c.meta && !c.alt && c.key.length === 1 && c.key !== " ";
}
