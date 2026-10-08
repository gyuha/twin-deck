/** 지원하는 화면 언어. 언어를 더하려면 사전 파일을 만들고 여기에 등록한다(td-config의 `behavior.language` 허용 값도 같이 늘린다). */
export const LOCALES = [
  { code: "ko", name: "한국어" },
  { code: "en", name: "English" },
] as const;

export type Lang = (typeof LOCALES)[number]["code"];

export const isLang = (v: unknown): v is Lang => LOCALES.some((l) => l.code === v);
