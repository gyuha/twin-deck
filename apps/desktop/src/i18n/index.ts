import { en } from "./en";
import { ko, type Key } from "./ko";
import { isLang, type Lang } from "./locales";

export type { Key } from "./ko";
export { LOCALES, isLang } from "./locales";
export type { Lang } from "./locales";

const DICTS: Record<Lang, Record<Key, string>> = { ko, en };
let current: Lang = "ko";

/** 지금 화면 언어를 정한다. 모르는 값은 한국어로 둔다. */
export function setLanguage(lang: string): void {
  current = isLang(lang) ? lang : "ko";
}

export const currentLanguage = (): Lang => current;

/** 키의 문구를 지금 언어로 돌려준다. 그 언어에 없으면 한국어(원본)로 돌아간다. `{이름}` 자리표시자는 `params`로 채운다. */
export function t(key: Key, params?: Record<string, string | number>): string {
  const text = DICTS[current][key] ?? ko[key];
  return params ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m)) : text;
}

/** 액션 제목. 사전에 없는 액션(플러그인 등)은 `fallback`을 돌려준다. */
export function actionTitle(id: string, fallback: string): string {
  const key = `action.${id}`;
  return key in ko ? t(key as Key) : fallback;
}

/** Action Bar 같은 좁은 곳의 짧은 이름. 짧은 이름이 없으면 일반 제목이다. */
export function actionShortTitle(id: string, fallback: string): string {
  const key = `action.${id}.short`;
  return key in ko ? t(key as Key) : actionTitle(id, fallback);
}

export { RUST_INTERNAL, RUST_MESSAGES } from "./rust";
import { translateRust as translateRustRaw } from "./rust";

/** Rust가 만든 문구를 지금 언어로. 한국어면 그대로다. */
export function rustText(message: string): string {
  return current === "ko" ? message : translateRustRaw(message);
}
