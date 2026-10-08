import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useApp, useAppStore, useT } from "../state/context";
import { activeTab } from "../state/store";
import type { FindForm } from "../state/store";

const TAB_KEYS = ["find.tab.basic", "find.tab.advanced", "find.tab.plugin", "find.tab.io", "find.tab.result"] as const;

const field = "h-8 w-full rounded-md border border-app-line bg-app-input px-2 text-sm text-ink outline-none focus:ring-2 disabled:opacity-50";
const btn = "h-8 w-full rounded-md border border-app-line px-3 text-sm hover:bg-app-selected disabled:opacity-40 disabled:hover:bg-transparent";

function Check({ label, checked, onChange, disabled, title }: { label: string; checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean; title?: string }) {
  return (
    <label title={title} className={"flex items-center gap-1.5 whitespace-nowrap text-sm " + (disabled ? "opacity-50" : "")}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Labeled({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={"block " + (className ?? "")}>
      <span className="mb-0.5 block text-sm">{label}</span>
      {children}
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="mb-3">
      <h3 className="mb-1 text-xs text-ink-dull">{title}</h3>
      <div className="space-y-2 rounded-md border border-app-line bg-app-dark-box p-3">{children}</div>
    </section>
  );
}

/**
 * 파일 찾기 다이얼로그(`Mod+F`): Double Commander "파일 찾기"의 기본 탭. 시작하면 결과를 새 가상 탭에 스트리밍한다.
 * 아직 만들지 않은 항목(바꾸기, Office XML, 인코딩, 16진수, 압축파일에서 찾기)과 다른 탭은 비활성으로 보인다.
 */
export function FindDialog() {
  const t = useT();
  const depths = [["all", t("find.depth_all")], ["0", t("find.depth_zero")], ...Array.from({ length: 9 }, (_, i) => [String(i + 1), t("find.depth_n", { n: i + 1 })])] as const;
  const find = useApp((s) => s.find);
  const hasSelection = useApp((s) => activeTab(s).selection.size > 0);
  const running = useApp((s) => (["left", "right"] as const).some((p) => s.panes[p].tabs.some((t) => t.virtual?.running && t.virtual.kind === "find")));
  const hasLast = useApp((s) => s.lastFind !== null);
  const { api } = useAppStore();
  const mask = useRef<HTMLInputElement>(null);
  const open = find !== null;
  useEffect(() => {
    if (open) mask.current?.focus();
  }, [open]);
  if (!find) return null;
  const f = find.form;
  const set = (patch: Partial<FindForm>) => api.setFindForm(patch);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-label={t("find.title")}
        className="flex max-h-full w-[58rem] max-w-full flex-col overflow-auto rounded-lg border border-app-line bg-app-box p-4 text-ink shadow-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          void api.findStart();
        }}
      >
        <h2 className="mb-2 text-center text-sm font-semibold">{t("find.title")}</h2>
        <div role="tablist" aria-label={t("find.tabs_aria")} className="mx-auto mb-3 flex gap-1 rounded-md bg-app-dark-box p-0.5 text-sm">
          {TAB_KEYS.map((tabKey, i) => (
            <button
              key={tabKey}
              type="button"
              role="tab"
              aria-selected={i === 0}
              disabled={i !== 0}
              title={i === 0 ? undefined : t("find.unsupported")}
              className={"rounded px-3 py-0.5 " + (i === 0 ? "bg-app-box shadow" : "opacity-50")}
            >
              {t(tabKey)}
            </button>
          ))}
        </div>
        <div className="flex gap-4">
          <div className="min-w-0 flex-1">
            <Section title={t("find.sec_dir")}>
              <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
                <Check label={t("find.open_tabs")} checked={f.openTabs} onChange={(v) => set({ openTabs: v })} />
                <Check label={t("find.selected_only")} checked={f.selectedOnly} disabled={!hasSelection} onChange={(v) => set({ selectedOnly: v })} />
                <Check label={t("find.follow_symlinks")} checked={f.followSymlinks} onChange={(v) => set({ followSymlinks: v })} />
              </div>
              <Labeled label={t("find.start")}>
                <input className={field} value={f.start} disabled={f.openTabs} onChange={(e) => set({ start: e.target.value })} />
              </Labeled>
              <div className="flex gap-3">
                <Labeled label={t("find.exclude_dirs")} className="flex-1">
                  <input className={field} value={f.excludeDirs} onChange={(e) => set({ excludeDirs: e.target.value })} />
                </Labeled>
                <Labeled label={t("find.depth")} className="w-64">
                  <select className={field} value={f.depth} onChange={(e) => set({ depth: e.target.value })}>
                    {depths.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Labeled>
              </div>
            </Section>
            <Section title={t("find.sec_file")}>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <span className="text-sm font-semibold">{t("find.mask")}</span>
                <div className="flex flex-wrap gap-x-4">
                  <Check label={t("find.in_archives")} checked={false} disabled title={t("find.unsupported")} />
                  <Check label={t("find.substring")} checked={f.substring} onChange={(v) => set({ substring: v })} />
                  <Check label={t("find.regex")} checked={f.regex} onChange={(v) => set({ regex: v })} />
                </div>
              </div>
              <input ref={mask} aria-label={t("find.mask")} className={field} value={f.mask} onChange={(e) => set({ mask: e.target.value })} />
              <Labeled label={t("find.exclude_files")}>
                <input className={field} value={f.excludeFiles} onChange={(e) => set({ excludeFiles: e.target.value })} />
              </Labeled>
            </Section>
            <Section title={t("find.sec_data")}>
              <div className="flex items-center gap-3">
                <Check label={t("find.text_in_files")} checked={f.textOn} onChange={(v) => set({ textOn: v })} />
                <input aria-label={t("find.text_aria")} className={field} value={f.text} disabled={!f.textOn} onChange={(e) => set({ text: e.target.value })} />
              </div>
              <div className="flex items-center gap-3">
                <Check label={t("find.replace")} checked={false} disabled title={t("find.unsupported")} />
                <input aria-label={t("find.replace_aria")} className={field} disabled title={t("find.unsupported")} />
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                <Check label={t("find.invert")} checked={f.invert} disabled={!f.textOn} onChange={(v) => set({ invert: v })} />
                <Check label={t("find.case")} checked={f.caseSensitive} disabled={!f.textOn} onChange={(v) => set({ caseSensitive: v })} />
                <Check label={t("find.text_regex")} checked={f.textRegex} disabled={!f.textOn} onChange={(v) => set({ textRegex: v })} />
                <Check label="Office XML" checked={false} disabled title={t("find.unsupported")} />
              </div>
              <div className="flex items-center gap-5">
                <Labeled label={t("find.encoding")} className="w-56">
                  <select className={field} disabled title={t("find.unsupported")}>
                    <option>Default</option>
                  </select>
                </Labeled>
                <Check label={t("find.hex")} checked={false} disabled title={t("find.unsupported")} />
              </div>
            </Section>
            {find.error && (
              <p role="alert" className="text-sm text-status-error">
                {find.error}
              </p>
            )}
          </div>
          <div className="flex w-36 shrink-0 flex-col gap-2 pt-7">
            <button type="submit" className="h-8 w-full rounded-md bg-accent px-3 text-sm font-semibold text-accent-ink">
              {t("find.start_btn")}
            </button>
            <button type="button" className={btn} disabled={!running} onClick={() => api.cancelFinds()}>
              {t("common.cancel")}
            </button>
            <button type="button" className={btn} onClick={() => api.closeFind()}>
              {t("common.close")}
            </button>
            <div className="h-6" />
            <button type="button" className={btn} onClick={() => api.findReset()}>
              {t("find.new")}
            </button>
            <button type="button" className={btn} disabled={!hasLast} onClick={() => api.findRestoreLast()}>
              {t("find.last")}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
