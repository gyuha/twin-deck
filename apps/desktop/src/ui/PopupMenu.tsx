import { useApp, useAppStore } from "../state/context";

/** Volumes/Favorites/Recent/Hierarchy 팝업. 키 조작은 `panel` 스코프가 처리한다. */
export function PopupMenu() {
  const menu = useApp((s) => s.menu);
  const { api } = useAppStore();
  if (!menu) return null;
  let n = 0;
  return (
    <div className="fixed inset-0 flex items-start justify-center bg-black/20 pt-16">
      <div role="dialog" aria-label={menu.title} className="w-[28rem] max-w-full rounded border border-app-line bg-app-box p-3 text-sm shadow-lg">
        <h2 className="mb-2 font-semibold">{menu.title}</h2>
        {menu.kind === "recent" && (
          <input
            autoFocus
            aria-label="필터"
            placeholder="입력해서 거르기"
            value={menu.filter ?? ""}
            onChange={(e) => api.menuSetFilter(e.target.value)}
            className="mb-2 w-full rounded border border-app-line bg-app-dark-box px-2 py-1 text-sm outline-none"
          />
        )}
        {menu.items.length === 0 ? (
          <p className="text-ink-faint">{menu.filter ? "일치하는 항목 없음" : "항목 없음"}</p>
        ) : (
          <div role="listbox" aria-label={`${menu.title} 목록`}>
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
          {menu.kind === "recent" ? "↑↓ 이동 · 입력 필터 · Alt+숫자/Return 선택 · Ctrl+Backspace 비우기 · Esc 닫기" : `↑↓ 이동 · 숫자/Return 선택 · Esc 닫기${menu.kind === "volumes" ? " · U 언마운트 · E 추출" : ""}`}
        </p>
      </div>
    </div>
  );
}
