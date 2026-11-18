import type { UserBinding } from "@twin-deck/actions";

/** F키 줄의 동작(키 → 액션 ID 또는 "none")과 `config.fkey_apps`. specta가 맵을 `Partial<Record>`로 내보낸다. */
export interface FKeyConfig {
  fkeys: Partial<Record<string, string>>;
  fkey_apps: Partial<Record<string, string>>;
}

/** F키 줄 이름(`F5`, `Ctrl+F5`, `Mod+Shift+F2` …). */
export const FKEY_NAME = /^((Mod|Ctrl|Alt|Shift)\+)*F([1-9]|1[0-2])$/i;

/**
 * keybindings.toml의 사용자 바인딩 중 F키 줄을 "키 → 액션 ID(해제는 none)"로 모은다. 같은 키가 여러 번이면 나중 것이 이긴다.
 * 스코프를 강제한 줄은 F키 줄(pane)로 보지 않는다.
 */
export function fkeyValues(bindings: readonly UserBinding[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const b of bindings) {
    if (!FKEY_NAME.test(b.key) || (b.scope && b.scope !== "pane")) continue;
    const name = Object.keys(out).find((k) => k.toLowerCase() === b.key.toLowerCase()) ?? b.key;
    out[name] = b.action ?? "none";
  }
  return out;
}

/** Action Bar에 이어 붙는 F키 버튼 하나. */
export interface FKeyBarItem {
  key: string;
  action: string;
  args: Record<string, unknown>;
}

const fkeyNum = (k: string) => Number(k.slice(k.lastIndexOf("F") + 1));

/**
 * "Action Bar에 표시"를 켠 F키 줄을 바 순서(단독 F1→F12, 그 뒤 조합키)로 돌려준다.
 * 동작이 "기본값"(빈 문자열)이면 `builtin`이 알려 주는 내장 바인딩의 액션을 쓰고, 해제("none")·내장 바인딩 없음은 뺀다.
 */
export function fkeyBarItems(config: FKeyConfig & { fkey_bar: Partial<Record<string, boolean>> }, builtin: (key: string) => string | undefined): FKeyBarItem[] {
  const keys = Object.keys(config.fkey_bar).filter((k) => config.fkey_bar[k]);
  keys.sort((a, b) => Number(a.includes("+")) - Number(b.includes("+")) || fkeyNum(a) - fkeyNum(b) || a.localeCompare(b));
  const out: FKeyBarItem[] = [];
  for (const key of keys) {
    const value = (config.fkeys[key] ?? "").trim();
    if (value === "none") continue;
    const action = value || builtin(key);
    if (!action) continue;
    out.push({ key, action, args: APP_ACTIONS.includes(action) ? { app: (config.fkey_apps[key] ?? "").trim(), key } : {} });
  }
  return out;
}

/** 선택·커서 항목을 앱에 넘기는 액션. */
export const APP_LAUNCH_ACTION = "core.app.launch";
/** 현재 패널의 폴더를 앱에 넘기는 액션(에디터, 버전 관리 프로그램, 터미널 등). */
export const APP_OPEN_FOLDER_ACTION = "core.app.open_folder";
/** 앱 경로(`fkey_apps`)를 쓰는 액션들. */
export const APP_ACTIONS: readonly string[] = [APP_LAUNCH_ACTION, APP_OPEN_FOLDER_ACTION];

/**
 * 앱 실행 액션(`core.app.launch`·`core.app.open_folder`)이 걸린 사용자 바인딩에 `fkey_apps`의 앱 경로(`app`)와 키 이름(`key`, 안내 메시지용)을 싣는다.
 * 인수를 직접 적은 줄은 그대로 둔다.
 */
export function withAppArgs(bindings: readonly UserBinding[], fkeyApps: Partial<Record<string, string>>): UserBinding[] {
  return bindings.map((b) => {
    if (!b.action || !APP_ACTIONS.includes(b.action) || b.args.app !== undefined) return b;
    const app = Object.entries(fkeyApps).find(([k]) => k.toLowerCase() === b.key.toLowerCase())?.[1] ?? "";
    return { ...b, args: { ...b.args, app: app.trim(), key: b.key } };
  });
}
