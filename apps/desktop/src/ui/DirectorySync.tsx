import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { EntryDto, SyncComparisonDto, SyncOptionsDto, SyncRowDto } from "@twin-deck/ts-client";
import { activeTab, hereOf } from "../state/store";
import { useApp, useAppStore, useT } from "../state/context";
import { formatSize, strftime } from "../lib/format";
import { rustText } from "../i18n";

const field = "h-8 min-w-0 rounded border border-app-line bg-app-input px-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50";
const button = "h-8 shrink-0 rounded border border-app-line px-3 text-sm hover:bg-app-selected focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 disabled:hover:bg-transparent";
const primaryButton = `${button.replace("hover:bg-app-selected", "")} bg-accent font-semibold text-accent-ink hover:brightness-110`;
const statuses = ["leftOnly", "leftNewer", "equal", "different", "conflict", "rightNewer", "rightOnly"] as const;
const pageSize = 200;
type Direction = SyncRowDto["direction"];

export function DirectorySync() {
  const open = useApp((s) => s.directorySyncOpen);
  return open ? <SyncSession /> : null;
}

/** 경로·조건을 바꾸면 비교 결과를 버린다. 표시 필터는 복사 계획과 별개다. */
function SyncSession() {
  const t = useT();
  const { api, backend, store } = useAppStore();
  const sizeFormat = useApp((s) => s.loaded.config.display.size_format);
  const [initial] = useState(() => {
    const s = store.getState();
    const left = activeTab(s, "left");
    const right = activeTab(s, "right");
    const selected = new Set([...left.entries.filter((e) => left.selection.has(e.path)), ...right.entries.filter((e) => right.selection.has(e.path))].map((e) => e.name));
    return { left: hereOf(left), right: hereOf(right), selected: [...selected] };
  });
  const [left, setLeft] = useState(initial.left);
  const [right, setRight] = useState(initial.right);
  const [options, setOptions] = useState<SyncOptionsDto>({ recursive: true, byContent: false, ignoreDate: false, asymmetric: false, pattern: "*", selectedNames: null });
  const [comparison, setComparison] = useState<SyncComparisonDto | null>(null);
  const [directions, setDirections] = useState<Record<string, Direction>>({});
  const [filters, setFilters] = useState<Set<SyncRowDto["status"]>>(() => new Set(statuses));
  const [groups, setGroups] = useState({ both: true, single: true });
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState(t("sync.initial"));
  const [confirm, setConfirm] = useState(false);
  const [page, setPage] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const compareButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const stopButton = useRef<HTMLButtonElement>(null);
  const request = useRef<string | null>(null);
  const alive = useRef(true);
  const revision = useRef(0);

  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement;
    compareButton.current?.focus();
    return () => {
      alive.current = false;
      if (request.current) void backend.cancelDirectoryComparison(request.current).catch(() => {});
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [backend]);
  useEffect(() => {
    if (starting) root.current?.focus();
    else if (confirm) cancelButton.current?.focus();
    else if (busy) stopButton.current?.focus();
    else compareButton.current?.focus();
  }, [confirm, busy, starting]);

  function invalidate() {
    revision.current++;
    setComparison(null);
    setDirections({});
    setConfirm(false);
    setError(null);
    setHint(t("sync.stale"));
    setPage(0);
  }
  const changeOptions = (patch: Partial<SyncOptionsDto>) => { invalidate(); setOptions((o) => ({ ...o, ...patch })); };
  const stop = () => {
    const id = request.current;
    request.current = null;
    if (id) void backend.cancelDirectoryComparison(id).catch((e: unknown) => { if (alive.current) setError(String(e)); });
    setBusy(false);
    setHint(t("sync.cancelled"));
  };
  const close = () => { if (!starting) api.closeDirectorySync(); };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return;
    // 창 안의 키는 기본 폼 조작만 한다. 패널 복사·삭제·탭 단축키로 흘리지 않는다.
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      if (confirm && !starting) { setConfirm(false); compareButton.current?.focus(); }
      else if (busy) stop();
      else close();
    }
    if (event.key === "Tab") {
      const scope = confirm ? root.current?.querySelector("[data-sync-confirm]") : root.current;
      const items = [...(scope?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), summary") ?? [])];
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && (document.activeElement === first || !scope?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && (document.activeElement === last || !scope?.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    }
  };
  async function compare() {
    if (busy || starting) return;
    invalidate();
    const id = crypto.randomUUID();
    const version = revision.current;
    request.current = id;
    setBusy(true);
    try {
      const result = await backend.compareDirectories(id, left.trim(), right.trim(), options);
      if (!alive.current || request.current !== id || revision.current !== version) return;
      setComparison(result);
      setDirections(Object.fromEntries(result.rows.map((r) => [r.relativePath, r.direction])));
      setHint("");
    } catch (e) {
      if (alive.current && request.current === id) setError(rustText(e instanceof Error ? e.message : String(e)));
    } finally {
      if (alive.current && request.current === id) { request.current = null; setBusy(false); }
    }
  }
  function changePath(side: "left" | "right", path: string) {
    invalidate();
    setOptions((o) => ({ ...o, selectedNames: null }));
    (side === "left" ? setLeft : setRight)(path);
  }
  async function pick(side: "left" | "right") {
    const version = revision.current;
    try {
      const path = await backend.pickFolder();
      if (!alive.current || busy || starting || revision.current !== version || path === null) return;
      changePath(side, path);
    } catch (e) { if (alive.current) setError(String(e)); }
  }
  const rows = comparison?.rows ?? [];
  const visible = useMemo(() => rows.filter((r) => filters.has(r.status) && ((r.left && r.right) ? groups.both : groups.single)), [rows, filters, groups]);
  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const planned = rows.filter((r) => (directions[r.relativePath] ?? "skip") !== "skip");
  const summary = {
    total: rows.length, visible: visible.length,
    right: planned.filter((r) => directions[r.relativePath] === "leftToRight").length,
    left: planned.filter((r) => directions[r.relativePath] === "rightToLeft").length,
    overwrite: planned.filter((r) => r.left && r.right).length,
  };
  const unresolved = rows.filter((r) => r.status === "different" && directions[r.relativePath] === "skip").length;
  const date = (entry: EntryDto | null) => entry?.modifiedMs == null ? "—" : strftime("%Y-%m-%d %H:%M:%S", new Date(entry.modifiedMs));
  const size = (entry: EntryDto | null) => !entry ? "—" : entry.kind === "dir" ? "/" : formatSize(entry.size, sizeFormat);
  async function execute() {
    if (!comparison || !planned.length || starting) return;
    setStarting(true);
    setError(null);
    try {
      await api.runDirectorySync(comparison.id, planned.map((r) => ({ relativePath: r.relativePath, direction: directions[r.relativePath] })));
    } catch (e) {
      if (!alive.current) return;
      setError(rustText(e instanceof Error ? e.message : String(e)));
      setConfirm(false);
      setComparison(null);
      setHint(t("sync.stale"));
    } finally { if (alive.current) setStarting(false); }
  }
  const check = (label: string, checked: boolean, onChange: (value: boolean) => void, disabled = false) => (
    <label className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm"><input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />{label}</label>
  );
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-3" onKeyDown={onKeyDown}>
      <div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t("sync.title")} className="relative flex h-[min(52rem,95vh)] w-[min(90rem,98vw)] min-w-0 flex-col overflow-hidden rounded-lg border border-app-line bg-app-box text-ink shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-app-line px-4 py-3"><h2 className="text-base font-semibold">{t("sync.title")}</h2><button className={button} disabled={starting} onClick={close}>{t("common.close")}</button></div>
        <div inert={confirm} className="flex min-h-0 flex-1 flex-col">
          <form className="max-h-[45%] shrink-0 space-y-3 overflow-y-auto border-b border-app-line p-4" onSubmit={(e) => { e.preventDefault(); void compare(); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["left", "right"] as const).map((side) => <label key={side} className="min-w-0 text-xs text-ink-dull"><span className="mb-1 block">{t(`sync.${side}`)}</span><span className="flex gap-1.5"><input aria-label={t(`sync.${side}`)} className={`${field} w-full`} value={side === "left" ? left : right} disabled={busy || starting} onChange={(e) => changePath(side, e.target.value)} /><button type="button" className={button} disabled={busy || starting} aria-label={t("sync.pick", { side: t(`sync.${side}`) })} onClick={() => void pick(side)}>…</button></span></label>)}
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <label className="flex items-center gap-2 text-sm">{t("sync.pattern")}<input className={`${field} w-32`} value={options.pattern} disabled={busy || starting} onChange={(e) => changeOptions({ pattern: e.target.value })} /></label>
              {check(t("sync.recursive"), options.recursive, (v) => changeOptions({ recursive: v }), busy || starting)}
              {check(t("sync.content"), options.byContent, (v) => changeOptions({ byContent: v }), busy || starting)}
              {check(t("sync.ignore_date"), options.ignoreDate, (v) => changeOptions({ ignoreDate: v }), busy || starting)}
              {check(t("sync.asymmetric"), options.asymmetric, (v) => changeOptions({ asymmetric: v }), busy || starting)}
              {check(t("sync.selected"), options.selectedNames !== null, (v) => changeOptions({ selectedNames: v ? initial.selected : null }), busy || starting || initial.selected.length === 0 || left !== initial.left || right !== initial.right)}
            </div>
            <details className="text-xs text-ink-dull"><summary className="w-fit cursor-pointer focus-visible:outline-2 focus-visible:outline-accent">{t("sync.rules")}</summary><p className="mt-2 max-w-[100ch] leading-relaxed">{t("sync.comparison_note")}</p><p className="mt-1 max-w-[100ch] leading-relaxed">{t("sync.folder_note")}</p></details>
            <div className="flex flex-wrap items-center gap-2"><button ref={compareButton} type="submit" className={primaryButton} disabled={busy || starting || !left.trim() || !right.trim()}>{busy ? t("sync.comparing") : t("sync.compare")}</button>{busy && <button ref={stopButton} type="button" className={button} onClick={stop}>{t("sync.cancel_compare")}</button>}<p className="text-xs text-ink-dull">{t("sync.support")}</p></div>
          </form>
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-app-line px-4 py-2 text-xs" role="group" aria-label={t("sync.display")}>
            <span className="text-ink-dull">{t("sync.display")}</span>
            {statuses.map((status) => <button key={status} type="button" aria-pressed={filters.has(status)} className={`${button} h-7 px-2 ${filters.has(status) ? "bg-app-selected" : "text-ink-dull"}`} onClick={() => { setPage(0); setFilters((old) => { const next = new Set(old); if (next.has(status)) next.delete(status); else next.add(status); return next; }); }}>{t(`sync.status.${status}`)}</button>)}
            {check(t("sync.both"), groups.both, (v) => { setPage(0); setGroups((g) => ({ ...g, both: v })); })}
            {check(t("sync.single"), groups.single, (v) => { setPage(0); setGroups((g) => ({ ...g, single: v })); })}
          </div>
          <div className="min-h-0 flex-1 overflow-auto" tabIndex={0} aria-label={t("sync.result")}>
            <table className="w-full border-collapse whitespace-nowrap text-left text-xs tabular-nums">
              <thead className="sticky top-0 z-10 bg-app-box text-ink-dull"><tr>{[t("sync.name"), `${t("sync.left")} · ${t("sync.size")}`, t("sync.date"), t("sync.action"), `${t("sync.right")} · ${t("sync.size")}`, t("sync.date"), t("sync.result")].map((title, i) => <th key={i} scope="col" className="border-b border-app-line px-3 py-2 font-medium">{title}</th>)}</tr></thead>
              <tbody>{visible.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((r) => <tr key={r.relativePath} className="border-b border-app-line hover:bg-app-selected">
                <th scope="row" className="max-w-[28rem] truncate px-3 py-1.5 font-normal" title={r.relativePath}>{r.relativePath}{(r.left ?? r.right)?.kind === "dir" ? "/" : ""}</th>
                <td className="px-3 py-1.5 text-right">{size(r.left)}</td><td className="px-3 py-1.5">{date(r.left)}</td>
                <td className="px-3 py-1"><select aria-label={t("sync.direction", { name: r.relativePath })} className={`${field} h-7 w-40`} value={directions[r.relativePath] ?? "skip"} disabled={r.status === "conflict" || starting} onChange={(e) => setDirections((d) => ({ ...d, [r.relativePath]: e.target.value as Direction }))}>
                  <option value="skip">{t("sync.skip")}</option>{r.left && r.status !== "conflict" && <option value="leftToRight">{t("sync.leftToRight")}</option>}{r.right && !options.asymmetric && r.status !== "conflict" && <option value="rightToLeft">{t("sync.rightToLeft")}</option>}
                </select></td>
                <td className="px-3 py-1.5 text-right">{size(r.right)}</td><td className="px-3 py-1.5">{date(r.right)}</td><td className={`px-3 py-1.5 ${r.status === "conflict" ? "text-status-warning" : "text-ink-dull"}`} title={r.reason ? rustText(r.reason) : undefined}>{t(`sync.status.${r.status}`)}</td>
              </tr>)}</tbody>
            </table>
            {visible.length === 0 && <p role="status" className="p-8 text-center text-sm text-ink-dull">{busy ? t("sync.comparing") : comparison ? t("sync.empty") : hint}</p>}
          </div>
          <div className="shrink-0 space-y-2 border-t border-app-line px-4 py-3">
            {error && <p role="alert" className="text-sm text-status-error">{error}</p>}
            <p className="text-xs text-ink-dull">{t("sync.filters_note")}</p>
            <div className="flex flex-wrap items-center gap-2">
              <p role="status" className="mr-auto text-xs">{t("sync.summary", summary)}</p>
              {pages > 1 && <><button type="button" className={button} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{t("sync.previous")}</button><span className="text-xs">{t("sync.page", { current: currentPage + 1, total: pages })}</span><button type="button" className={button} disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>{t("sync.next")}</button></>}
              <button type="button" className={button} disabled={!comparison || starting} onClick={() => setDirections(Object.fromEntries(rows.map((r) => [r.relativePath, r.direction])))}>{t("sync.default")}</button>
              <button type="button" className={button} disabled={!comparison || starting} onClick={() => setDirections({})}>{t("sync.exclude_all")}</button>
              <button type="button" className={primaryButton} disabled={!comparison || !planned.length || busy || starting} onClick={() => setConfirm(true)}>{t("sync.execute")}</button>
            </div>
          </div>
        </div>
        {confirm && <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 p-4"><section role="alertdialog" aria-modal="true" aria-label={t("sync.confirm")} data-sync-confirm className="w-[34rem] max-w-full rounded-lg border border-app-line bg-app-box p-5 shadow-2xl"><h3 className="mb-3 text-base font-semibold">{t("sync.confirm")}</h3><dl className="space-y-2 break-all text-sm"><dt className="text-ink-dull">{t("sync.left")}</dt><dd>{left}</dd><dt className="text-ink-dull">{t("sync.right")}</dt><dd>{right}</dd></dl><p className="mt-4 text-sm">{t("sync.summary", summary)}</p><p className="mt-3 text-sm text-status-warning">{t("sync.confirm_note")}</p>{unresolved > 0 && <p className="mt-2 text-sm">{t("sync.unresolved", { count: unresolved })}</p>}<div className="mt-5 flex justify-end gap-2"><button ref={cancelButton} type="button" className={button} disabled={starting} onClick={() => { setConfirm(false); compareButton.current?.focus(); }}>{t("common.cancel")}</button><button type="button" className={primaryButton} disabled={starting} onClick={() => void execute()}>{starting ? t("sync.starting") : t("sync.confirm_run")}</button></div></section></div>}
      </div>
    </div>
  );
}
