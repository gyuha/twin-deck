import type { UserBinding } from "@twin-deck/actions";

/** `config.fkeys`/`config.fkey_apps`에서 읽는 부분. specta가 맵을 `Partial<Record>`로 내보낸다. */
export interface FKeyConfig {
  fkeys: Partial<Record<string, string>>;
  fkey_apps: Partial<Record<string, string>>;
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
 * F1~F12와 조합키(`Ctrl+F5`, `Mod+Shift+F2` 등) 설정을 사용자 바인딩으로 바꾼다. 빈 값은 기본 바인딩 유지라 건너뛰고,
 * `none`은 그 키 해제, 앱 실행은 `app`(경로)과 `key`(안내 메시지용)를 인수로 싣는다.
 * `keybindings.toml`보다 먼저 병합되도록 호출하는 쪽에서 앞에 붙인다(파일이 이긴다).
 */
export function fkeyBindings(config: FKeyConfig): UserBinding[] {
  const out: UserBinding[] = [];
  for (const key of Object.keys(config.fkeys)) {
    const value = (config.fkeys[key] ?? "").trim();
    if (!value) continue;
    if (value === "none") out.push({ key, action: null, args: {}, scope: null });
    else if (APP_ACTIONS.includes(value)) out.push({ key, action: value, args: { app: (config.fkey_apps[key] ?? "").trim(), key }, scope: null });
    else out.push({ key, action: value, args: {}, scope: null });
  }
  return out;
}
