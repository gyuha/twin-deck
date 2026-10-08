import { useEffect, useRef } from "react";
import { useApp, useAppStore, useT } from "../state/context";

/** Actions Panel (ACT-01): 액션 이름을 퍼지 검색해서 실행한다. Alt를 누르고 있으면 액션 ID를 보여 준다. */
export function ActionsPalette() {
  const t = useT();
  const palette = useApp((s) => s.palette);
  const { api } = useAppStore();
  const input = useRef<HTMLInputElement>(null);
  const open = palette !== null;

  // 열릴 때 입력창에 포커스하고 이전 검색어를 선택해 두어 바로 덮어쓸 수 있게 한다.
  useEffect(() => {
    if (open) {
      input.current?.focus();
      input.current?.select();
    } else {
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
  }, [open]);

  if (!palette) return null;
  const items = api.paletteView();
  return (
    <div className="fixed inset-0 flex items-start justify-center bg-black/20 pt-16">
      <div role="dialog" aria-label="Actions Panel" className="w-[34rem] max-w-full rounded border border-app-line bg-app-box p-3 text-sm shadow-lg">
        <input
          ref={input}
          aria-label={t("palette.search_aria")}
          value={palette.query}
          onChange={(e) => api.paletteSetQuery(e.target.value)}
          placeholder={t("palette.placeholder")}
          className="mb-2 w-full border border-app-line px-1 py-0.5"
        />
        {items.length === 0 ? (
          <p className="text-ink-faint">{t("palette.none")}</p>
        ) : (
          <div role="listbox" aria-label={t("palette.list_aria")} className="max-h-80 overflow-auto">
            {items.slice(0, 50).map((it, i) => (
              <div
                key={it.id}
                role="option"
                aria-selected={i === palette.cursor}
                aria-disabled={!it.applicable}
                className={[
                  "flex justify-between gap-2 border-l-4 px-2 py-0.5",
                  i === palette.cursor ? "border-accent bg-app-selected" : "border-transparent",
                  it.applicable ? "" : "opacity-40",
                ].join(" ")}
              >
                <span>{it.title}</span>
                <span className="font-mono text-xs text-ink-faint">{palette.showIds ? it.id : it.keys}</span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-ink-faint">{t("palette.hint")}</p>
      </div>
    </div>
  );
}
