import type { UserBinding } from "@twin-deck/actions";

/** `config.fkeys`/`config.fkey_apps`에서 읽는 부분. specta가 맵을 `Partial<Record>`로 내보낸다. */
export interface FKeyConfig {
  fkeys: Partial<Record<string, string>>;
  fkey_apps: Partial<Record<string, string>>;
}

export const APP_LAUNCH_ACTION = "core.app.launch";

/**
 * F1~F12 설정을 사용자 바인딩으로 바꾼다. 빈 값은 기본 바인딩 유지라 건너뛰고,
 * `none`은 그 키 해제, 앱 실행은 `app`(경로)과 `key`(안내 메시지용)를 인수로 싣는다.
 * `keybindings.toml`보다 먼저 병합되도록 호출하는 쪽에서 앞에 붙인다(파일이 이긴다).
 */
export function fkeyBindings(config: FKeyConfig): UserBinding[] {
  const out: UserBinding[] = [];
  for (let n = 1; n <= 12; n++) {
    const key = `F${n}`;
    const value = (config.fkeys[key] ?? "").trim();
    if (!value) continue;
    if (value === "none") out.push({ key, action: null, args: {}, scope: null });
    else if (value === APP_LAUNCH_ACTION) out.push({ key, action: value, args: { app: (config.fkey_apps[key] ?? "").trim(), key }, scope: null });
    else out.push({ key, action: value, args: {}, scope: null });
  }
  return out;
}
