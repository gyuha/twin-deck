import { describe, expect, it } from "vitest";
import { DEFAULT_ACTION_META } from "@twin-deck/actions";
import { en } from "../i18n/en";
import { ko } from "../i18n/ko";
import { LOCALES } from "../i18n/locales";
import { actionShortTitle, actionTitle, setLanguage, t } from "../i18n";

const HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("사전", () => {
  it("한국어·영어 사전의 키가 같다", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ko).sort());
  });

  it("모든 값이 비어 있지 않다", () => {
    for (const [name, dict] of Object.entries({ ko, en })) for (const [k, v] of Object.entries(dict)) expect(v.trim(), `${name}:${k}`).not.toBe("");
  });

  it("영어 사전의 값에 한글이 없다", () => {
    for (const [k, v] of Object.entries(en)) expect(HANGUL.test(v), `en:${k} = ${v}`).toBe(false);
  });

  it("같은 키의 자리표시자가 두 언어에서 같다", () => {
    for (const k of Object.keys(ko) as (keyof typeof ko)[]) expect(placeholders(en[k]), k).toEqual(placeholders(ko[k]));
  });

  it("등록된 모든 액션 ID가 두 언어의 제목을 가진다(짧은 이름이 있으면 그것도)", () => {
    for (const a of DEFAULT_ACTION_META) {
      expect(`action.${a.id}` in ko, a.id).toBe(true);
      expect(`action.${a.id}` in en, a.id).toBe(true);
      if ("shortTitle" in a && a.shortTitle) expect(`action.${a.id}.short` in en, `${a.id}.short`).toBe(true);
    }
  });

  it("지원 언어는 모두 사전이 있고, 이름 목록에 한국어·English가 있다", () => {
    expect(LOCALES.map((l) => l.code)).toEqual(["ko", "en"]);
    expect(LOCALES.map((l) => l.name)).toEqual(["한국어", "English"]);
  });
});

describe("t()", () => {
  it("지금 언어로 돌려주고 자리표시자를 채운다. 모르는 언어는 한국어", () => {
    setLanguage("en");
    expect(t("help.title")).toBe("Keyboard Shortcuts");
    expect(actionTitle("core.copy", "?")).toBe("Copy");
    expect(actionShortTitle("core.rename", "?")).toBe("Rename"); // 짧은 이름이 없으면 일반 제목
    expect(actionTitle("plugin.unknown", "대체 제목")).toBe("대체 제목");
    setLanguage("xx");
    expect(t("help.title")).toBe("키보드 단축키");
    setLanguage("ko");
  });
});
