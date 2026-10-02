import { useApp, useAppStore } from "../state/context";

/** 도움말 화면(F1): 키가 걸린 액션을 분류별로 나열한다. Esc/F1로 닫는다(help 스코프). */
export function Help() {
  const open = useApp((s) => s.helpOpen);
  const { api } = useAppStore();
  if (!open) return null;
  const groups = new Map<string, { id: string; title: string; keys: string }[]>();
  for (const i of api.helpItems()) groups.set(i.category, [...(groups.get(i.category) ?? []), i]);
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-app text-ink">
      <div role="dialog" aria-modal="true" aria-label="도움말" className="flex min-h-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-app-line px-4 py-2">
          <h2 className="text-base font-semibold">도움말 · 단축키</h2>
          <button type="button" className="rounded border border-app-line px-3 py-1 text-sm" onClick={() => api.closeHelp()}>
            닫기 <span className="ml-1 text-ink-faint">Esc</span>
          </button>
        </header>
        <div className="td-thin-scroll min-h-0 flex-1 overflow-auto px-6 py-3">
          {[...groups].map(([category, items]) => (
            <section key={category} aria-label={category} className="mb-4">
              <h3 className="mb-1 text-sm font-semibold">{category}</h3>
              {items.map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-4 border-b border-app-line py-1.5 text-sm">
                  <span>{i.title}</span>
                  <kbd className="shrink-0 font-mono text-xs text-ink-dull">{i.keys}</kbd>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
