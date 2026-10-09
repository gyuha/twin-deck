import { Fragment, useEffect, useRef } from "react";
import { t as translate } from "../i18n";
import type { Key } from "../i18n";
import { useApp, useAppStore, useT } from "../state/context";
import { useUi } from "./uiContext";

const CATEGORIES = ["File", "Navigation", "View", "Selection", "Tab", "Dialog"];
const categoryTitle = (c: string) => (CATEGORIES.includes(c) ? translate(`category.${c}` as Key) : c);

/** `Ctrl+Shift+P` → [`Ctrl`, `Shift`, `P`]. 키 자체가 `+`인 `Cmd++`도 올바르게 나눈다. */
const tokens = (combo: string) => combo.split(/\+(?!$)/);

/** 키 하나의 표기: `Shift + F6`처럼 칩을 `+`로 잇고, 대안 키는 "또는"으로 잇는다. */
function Keys({ keys }: { keys: string }) {
  return (
    <span className="flex flex-wrap items-baseline justify-end gap-x-1">
      {keys.split(" · ").map((combo, i) => (
        <Fragment key={combo}>
          {i > 0 && <span className="text-ink-faint">{translate("help.or")}</span>}
          {tokens(combo).map((t, k) => (
            <Fragment key={k}>
              {k > 0 && <span className="text-ink-faint">+</span>}
              <kbd className="font-mono font-semibold text-status-warning">{t}</kbd>
            </Fragment>
          ))}
        </Fragment>
      ))}
    </span>
  );
}

/**
 * 도움말 화면(F1): 키보드 단축키를 분류별로 2단으로 나열한다. 화면을 어둡게 덮는 패널이고 Esc/F1/배경 클릭으로 닫는다(help 스코프).
 * 메인 화면에서 쓰는 단축키(pane/global 스코프)만 보여 주고, 대화상자·메뉴 안에서만 쓰는 내부 키는 뺀다.
 */
export function Help() {
  const open = useApp((s) => s.helpOpen);
  const { api } = useAppStore();
  const { registry } = useUi();
  const t = useT();
  const closeBtn = useRef<HTMLButtonElement>(null);
  // 열리면 닫기 버튼에 포커스를 둔다(Return으로 닫힌다).
  useEffect(() => {
    if (open) closeBtn.current?.focus();
  }, [open]);
  if (!open) return null;
  const groups = new Map<string, { id: string; title: string; keys: string }[]>();
  for (const i of api.helpItems()) {
    const scopes = registry.get(i.id)?.scopes ?? [];
    if (!scopes.includes("pane") && !scopes.includes("global")) continue;
    groups.set(i.category, [...(groups.get(i.category) ?? []), i]);
  }
  return (
    <div className="fixed inset-0 z-40 bg-black/50 p-8" onMouseDown={() => api.closeHelp()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("help.aria")}
        className="mx-auto flex h-full max-w-6xl flex-col rounded-lg border border-app-line bg-app-box text-ink shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-baseline justify-between border-b border-app-line px-5 py-3">
          <h2 className="text-base font-semibold">{t("help.title")}</h2>
          <button type="button" ref={closeBtn} className="text-sm font-semibold text-status-warning underline underline-offset-2" onClick={() => api.closeHelp()}>
            {t("help.close")}
          </button>
        </header>
        <div className="td-thin-scroll min-h-0 flex-1 overflow-auto px-5 py-4 text-sm">
          <div className="columns-1 gap-x-14 md:columns-2">
            {[...groups].map(([category, items]) => (
              <section key={category} aria-label={categoryTitle(category)} className="mb-6 break-inside-avoid">
                <h3 className="mb-1.5 font-semibold text-status-warning">{categoryTitle(category)}</h3>
                {items.map((i) => (
                  <div key={i.id} className="grid grid-cols-[minmax(9rem,13rem)_auto_1fr] items-baseline gap-x-2 py-0.5">
                    <Keys keys={i.keys} />
                    <span className="text-ink-faint">:</span>
                    <span>{i.title}</span>
                  </div>
                ))}
              </section>
            ))}
          </div>
        </div>
        <footer className="border-t border-app-line px-5 py-2 text-xs text-ink-faint">{t("help.footer")}</footer>
      </div>
    </div>
  );
}
