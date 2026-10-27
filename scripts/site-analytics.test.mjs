import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const script = readFileSync(new URL("../site/analytics.js", import.meta.url), "utf8");
function visit(href = "https://gyuha.com/twin-deck/", redirecting = false) {
  const scripts = [];
  const window = { location: { href }, twinDeckLanguageRedirecting: redirecting };
  runInNewContext(script, {
    URL,
    window,
    document: {
      createElement: () => ({}),
      head: { append: (element) => scripts.push(element) },
    },
  });
  return { scripts, events: Array.from(window.dataLayer || [], (event) => Array.from(event)) };
}

test("한국어와 영어 공개 페이지에 같은 GA 태그를 한 번 설정한다", () => {
  for (const href of ["https://gyuha.com/twin-deck/?lang=ko", "https://gyuha.com/twin-deck/en.html"]) {
    const { scripts, events } = visit(href);
    assert.equal(scripts.length, 1);
    assert.equal(scripts[0].src, "https://www.googletagmanager.com/gtag/js?id=G-6794E26N14");
    assert.equal(scripts[0].async, true);
    assert.deepEqual(events.map((event) => event[0]), ["js", "config"]);
    assert.equal(events[1][1], "G-6794E26N14");
    assert.equal(events[1][2].allow_google_signals, false);
    assert.equal(events[1][2].allow_ad_personalization_signals, false);
    assert.equal(events[1][2].cookie_prefix, "twin_deck");
    assert.equal(events[1][2].cookie_path, "/twin-deck/");
  }
});
test("로컬·다른 도메인·블로그 경로에서는 수집하지 않는다", () => {
  for (const href of ["http://localhost:4173/", "http://gyuha.com/twin-deck/", "https://example.com/twin-deck/", "https://gyuha.com/", "https://gyuha.com/twin-deck-other/"]) {
    const result = visit(href);
    assert.equal(result.scripts.length, 0);
    assert.equal(result.events.length, 0);
  }
});
test("언어 이동 전 페이지는 중복 조회를 보내지 않는다", () => {
  const result = visit("https://gyuha.com/twin-deck/", true);
  assert.equal(result.scripts.length, 0);
  assert.equal(result.events.length, 0);
});
