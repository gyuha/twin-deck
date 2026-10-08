import { useApp, useAppStore, useT } from "../state/context";

/** Volumes/Favorites/Recent/Hierarchy 팝업. 키 조작은 `panel` 스코프가 처리한다. */
export function PopupMenu() {
  const t = useT();
  const menu = useApp((s) => s.menu);
  const { api } = useAppStore();
  if (!menu) return null;
  let n = 0;
  return (
    <div className="fixed inset-0 flex items-start justify-center bg-black/20 pt-16">
      <div role="dialog" aria-label={menu.title} className="w-[28rem] max-w-full rounded border border-app-line bg-app-box p-3 text-sm shadow-lg">
        <h2 className="mb-2 font-semibold">{menu.title}</h2>
        {(menu.kind === "recent" || menu.kind === "favorites") && (
          <input
            autoFocus
            aria-label={t("popup.filter")}
            placeholder={t("popup.filter_placeholder")}
            value={menu.filter ?? ""}
            onChange={(e) => api.menuSetFilter(e.target.value)}
            className="mb-2 w-full rounded border border-app-line bg-app-dark-box px-2 py-1 text-sm outline-none"
          />
        )}
        {menu.items.length === 0 ? (
          <p className="text-ink-faint">{menu.filter ? t("popup.no_match") : t("popup.empty")}</p>
        ) : (
          <div role="listbox" aria-label={t("popup.list_aria", { title: menu.title })}>
            {menu.items.map((it, i) => {
              if (it.separator) return <hr key={i} role="separator" className="my-1 border-app-line" />;
              if (it.path === undefined) {
                return (
                  <div key={i} className="mt-1 px-2 text-xs font-semibold text-ink-faint">
                    {it.label}
                  </div>
                );
              }
              n += 1;
              const hint = n <= 10 ? String(n % 10) : "";
              return (
                <div
                  key={i}
                  role="option"
                  aria-selected={i === menu.cursor}
                  className={i === menu.cursor ? "border-l-4 border-accent bg-app-selected px-2 py-0.5" : "border-l-4 border-transparent px-2 py-0.5"}
                >
                  <span className="mr-2 inline-block w-3 text-ink-faint">{hint}</span>
                  {it.label}
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-xs text-ink-faint">
          {menu.kind === "recent" || menu.kind === "favorites" ? t("popup.hint_list", { extra: menu.kind === "recent" ? t("popup.hint_recent") : t("popup.hint_favorites") }) : t("popup.hint_menu", { extra: menu.kind === "volumes" ? t("popup.hint_volumes") : "" })}
        </p>
      </div>
    </div>
  );
}
