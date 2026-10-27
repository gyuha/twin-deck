import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const script = readFileSync(
  new URL("../site/language.js", import.meta.url),
  "utf8",
);
function visit({
  browser = "en-US",
  languages = [browser],
  saved,
  url = "https://gyuha.com/twin-deck/",
  current = "ko",
  blocked = false,
} = {}) {
  let redirected;
  let stored = saved;
  const contextWindow = {
    location: {
      href: url,
      replace: (value) => {
        redirected = value;
      },
    },
  };
  runInNewContext(script, {
    URL,
    window: contextWindow,
    document: { documentElement: { lang: current } },
    navigator: { languages, language: browser },
    localStorage: {
      getItem: () => {
        if (blocked) throw new Error("저장소 차단");
        return stored;
      },
      setItem: (_, value) => {
        if (blocked) throw new Error("저장소 차단");
        stored = value;
      },
    },
  });
  return {
    redirected,
    stored,
    redirecting: Boolean(contextWindow.twinDeckLanguageRedirecting),
  };
}

test("한국어 우선 언어는 한국어 페이지에 머문다", () => {
  for (const browser of ["ko", "ko-KR", "KO-kr"])
    assert.equal(visit({ browser }).redirected, undefined);
});
test("한국어가 아닌 언어와 알 수 없는 언어는 영어로 이동한다", () => {
  for (const browser of ["en-US", "ja-JP", "fr", "", "kok-IN"])
    assert.equal(
      visit({ browser }).redirected,
      "https://gyuha.com/twin-deck/en.html",
    );
});
test("여러 언어 중 첫 번째 언어를 사용한다", () => {
  assert.ok(visit({ languages: ["en-US", "ko-KR"] }).redirected);
  assert.equal(visit({ languages: ["ko-KR", "en-US"] }).redirected, undefined);
});
test("직접 고른 언어를 기억하고 브라우저 언어보다 우선한다", () => {
  assert.equal(visit({ saved: "ko" }).redirected, undefined);
  assert.ok(visit({ browser: "ko", saved: "en" }).redirected);
  const result = visit({
    saved: "en",
    url: "https://gyuha.com/twin-deck/?lang=ko",
  });
  assert.equal(result.stored, "ko");
  assert.equal(result.redirected, undefined);
});
test("영문 공유 주소는 한국어 브라우저에서도 영어로 열린다", () => {
  assert.equal(
    visit({
      browser: "ko",
      saved: "ko",
      current: "en",
      url: "https://gyuha.com/twin-deck/en.html",
    }).redirected,
    undefined,
  );
});
test("영문 페이지에서도 명시적으로 한국어를 고를 수 있다", () => {
  assert.equal(
    visit({
      current: "en",
      url: "https://gyuha.com/twin-deck/en.html?lang=ko#features",
    }).redirected,
    "https://gyuha.com/twin-deck/index.html?lang=ko#features",
  );
});
test("저장소가 차단되어도 자동 선택과 수동 선택이 동작한다", () => {
  assert.ok(visit({ blocked: true }).redirected);
  assert.equal(
    visit({ blocked: true, url: "https://gyuha.com/twin-deck/?lang=ko" })
      .redirected,
    undefined,
  );
});
test("잘못된 저장값을 무시하고 경로와 쿼리와 앵커를 보존한다", () => {
  assert.equal(
    visit({
      saved: "invalid",
      url: "https://gyuha.com/twin-deck/?source=readme#features",
    }).redirected,
    "https://gyuha.com/twin-deck/en.html?source=readme#features",
  );
});
test("언어 이동 후에는 다시 이동하지 않는다", () => {
  const first = visit();
  assert.equal(first.redirecting, true);
  assert.equal(visit({ browser: "ko" }).redirecting, false);
  assert.equal(
    visit({ url: first.redirected, current: "en" }).redirected,
    undefined,
  );
});
