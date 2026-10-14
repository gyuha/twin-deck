import { Fragment, useEffect, useRef } from "react";
import { t as translate } from "../i18n";
import { categoryTitle, helpTerms, highlightRanges } from "../lib/helpSearch";
import type { CatalogItem } from "../state/store";
import { useApp, useAppStore, useT } from "../state/context";

type Ranges = readonly (readonly [number, number])[];

/** `text`가 전체 문자열의 `base`부터 시작한다고 보고, 검색어와 일치한 구간(`ranges`)을 강조한다(이슈 #56). */
function Marked({ text, base = 0, ranges }: { text: string; base?: number; ranges: Ranges }) {
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const [from, to] of ranges) {
    const s = Math.max(from - base, at);
    const e = Math.min(to - base, text.length);
    if (e <= s) continue;
    if (s > at) parts.push(text.slice(at, s));
    parts.push(
      <mark key={s} data-help-match className="rounded-sm bg-status-warning/55 text-inherit">
        {text.slice(s, e)}
      </mark>,
    );
    at = e;
  }
  if (at === 0) return <>{text}</>;
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

/** `Ctrl+Shift+P` → [`Ctrl`, `Shift`, `P`]와 각 조각의 시작 위치. 키 자체가 `+`인 `Cmd++`도 올바르게 나눈다. */
const tokens = (combo: string, base: number) => {
  let at = base;
  return combo.split(/\+(?!$)/).map((t) => {
    const token = { t, at };
    at += t.length + 1;
    return token;
  });
};

/** 키 하나의 표기: `Shift + F6`처럼 칩을 `+`로 잇고, 대안 키는 "또는"으로 잇는다. 검색어와 일치한 부분은 칩 안에서 강조한다. */
function Keys({ keys, terms }: { keys: string; terms: readonly string[] }) {
  const ranges = highlightRanges(keys, terms);
  let at = 0;
  const combos = keys.split(" · ").map((combo) => {
    const c = { combo, at };
    at += combo.length + 3;
    return c;
  });
  return (
    <span className="flex flex-wrap items-baseline justify-end gap-x-1">
      {combos.map(({ combo, at }, i) => (
        <Fragment key={combo}>
          {i > 0 && <span className="text-ink-faint">{translate("help.or")}</span>}
          {tokens(combo, at).map(({ t, at }, k) => (
            <Fragment key={k}>
              {k > 0 && <span className="text-ink-faint">+</span>}
              <kbd className="font-mono font-semibold text-status-warning">
                <Marked text={t} base={at} ranges={ranges} />
              </kbd>
            </Fragment>
          ))}
        </Fragment>
      ))}
    </span>
  );
}

/**
 * 도움말 화면(F1): 키보드 단축키를 분류별로 2단으로 나열한다. 화면을 어둡게 덮는 패널이고 Esc/F1/배경 클릭으로 닫는다(help 스코프).
 * 메인 화면에서 쓰는 단축키(pane/global 스코프)만 보여 준다(카탈로그가 이미 그렇게 거른다). 대화상자·메뉴 안에서만 쓰는 내부 키는 없다.
 * 맨 위 검색창(스크롤해도 늘 보인다)으로 설명·키·분류를 거르고, ↑↓로 고른 줄을 Return으로 실행한다(이슈 #56).
 */
export function Help() {
  const help = useApp((s) => s.help);
  const { api } = useAppStore();
  const t = useT();
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const open = help !== null;
  // 열리면 검색창에 포커스를 둔다. 글자는 검색창이 받고 ↑↓·Return·Esc는 help 스코프 키로 간다.
  useEffect(() => {
    if (open) search.current?.focus();
  }, [open]);
  // 커서 줄이 스크롤 영역 밖이면 보이게 한다.
  useEffect(() => {
    list.current?.querySelector("[data-help-cursor]")?.scrollIntoView?.({ block: "nearest" });
  }, [help?.cursor, help?.query]);
  if (!help) return null;
  const terms = helpTerms(help.query);
  const items = api.helpView();
  const groups = new Map<string, { item: CatalogItem; index: number }[]>();
  items.forEach((item, index) => groups.set(item.category, [...(groups.get(item.category) ?? []), { item, index }]));
  return (
    <div className="fixed inset-0 z-40 bg-black/50 p-8" onMouseDown={() => api.closeHelp()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("help.aria")}
        className="mx-auto flex h-full max-w-6xl flex-col rounded-lg border border-app-line bg-app-box text-ink shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-4 border-b border-app-line px-5 py-3">
          <h2 className="shrink-0 text-base font-semibold">{t("help.title")}</h2>
          <input
            ref={search}
            type="text"
            aria-label={t("help.search_aria")}
            placeholder={t("help.search_placeholder")}
            value={help.query}
            onChange={(e) => api.helpSetQuery(e.target.value)}
            className="h-8 min-w-0 flex-1 rounded border border-app-line bg-app-input px-2 text-sm text-ink outline-none focus:ring-2"
          />
          <button type="button" className="shrink-0 text-sm font-semibold text-status-warning underline underline-offset-2" onClick={() => api.closeHelp()}>
            {t("help.close")}
          </button>
        </header>
        <div ref={list} className="td-thin-scroll min-h-0 flex-1 overflow-auto px-5 py-4 text-sm">
          {items.length === 0 ? (
            <p className="text-ink-faint">{t("help.none")}</p>
          ) : (
            <div className="columns-1 gap-x-14 md:columns-2">
              {[...groups].map(([category, rows]) => {
                const title = categoryTitle(category);
                return (
                  <section key={category} aria-label={title} className="mb-6 break-inside-avoid">
                    <h3 className="mb-1.5 font-semibold text-status-warning">
                      <Marked text={title} ranges={highlightRanges(title, terms)} />
                    </h3>
                    {rows.map(({ item: i, index }) => (
                      <div
                        key={i.id}
                        data-help-cursor={index === help.cursor ? "" : undefined}
                        aria-current={index === help.cursor ? "true" : undefined}
                        className={[
                          "grid grid-cols-[minmax(9rem,13rem)_auto_1fr] items-baseline gap-x-2 border-l-4 py-0.5 pr-1",
                          index === help.cursor ? "border-accent bg-app-selected" : "border-transparent",
                        ].join(" ")}
                      >
                        <Keys keys={i.keys} terms={terms} />
                        <span className="text-ink-faint">:</span>
                        <span>
                          <Marked text={i.title} ranges={highlightRanges(i.title, terms)} />
                        </span>
                      </div>
                    ))}
                  </section>
                );
              })}
            </div>
          )}
        </div>
        <footer className="border-t border-app-line px-5 py-2 text-xs text-ink-faint">{t("help.footer")}</footer>
      </div>
    </div>
  );
}
