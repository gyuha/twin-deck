import { useMemo, useState } from "react";
import { t as translate } from "../i18n";
import { parentPath } from "@twin-deck/ts-client";
import { useAppStore, useT } from "../state/context";
import { buildNewNames, findPattern, MASK_HELP, validateNames } from "../lib/multiRename";
import type { CaseMode, RenameItem, RenameOptions } from "../lib/multiRename";

interface Props {
  items: (RenameItem & { path: string })[];
  existing: string[];
  options: RenameOptions;
}

const CASES: { value: CaseMode; readonly label: string }[] = [
  { value: "none", get label() { return translate("rename.case.none"); } },
  { value: "upper", get label() { return translate("rename.case.upper"); } },
  { value: "lower", get label() { return translate("rename.case.lower"); } },
  { value: "title", get label() { return translate("rename.case.title"); } },
];

const input = "w-full border border-app-line bg-app px-1 py-0.5";
const parentOf = (path: string) => parentPath(path) ?? "/";

/** 다중 이름 바꾸기 도구(미리보기 표와 입력). 새 이름과 오류는 입력이 바뀔 때마다 다시 계산한다. */
export function MultiRename({ items, existing, options: o }: Props) {
  const t = useT();
  const { api } = useAppStore();
  const [help, setHelp] = useState(false);
  const newNames = useMemo(() => buildNewNames(items, o), [items, o]);
  const errors = useMemo(() => validateNames(items, newNames, existing), [items, newNames, existing]);
  const patternError = findPattern(o).error;
  const set = (patch: Partial<RenameOptions>) => api.dialogMultiRenameSet(patch);
  const num = (v: string, min: number) => Math.max(Number.parseInt(v, 10) || 0, min);
  const hasError = errors.some((e) => e !== null);
  const changed = items.some((it, i) => it.name !== newNames[i]);

  return (
    <div data-can-rename={!hasError && changed}>
      <div className="mb-1 flex justify-end">
        <button type="button" aria-pressed={help} className="rounded border border-app-line px-2 py-0.5 text-xs" onClick={() => setHelp(!help)}>
          {help ? t("rename.help_close") : t("rename.help")}
        </button>
      </div>
      {help && (
        <div role="region" aria-label={t("rename.mask_help_aria")} className="mb-3 h-52 overflow-auto border border-app-line p-2 text-xs">
          <p className="mb-2 text-ink-dull">
            {t("rename.mask_intro")}
          </p>
          <table className="w-full">
            <thead>
              <tr className="text-left text-ink-faint">
                <th className="w-24 py-0.5">{t("rename.th_token")}</th>
                <th>{t("rename.th_desc")}</th>
                <th>{t("rename.th_example")}</th>
              </tr>
            </thead>
            <tbody>
              {MASK_HELP.map((h) => (
                <tr key={h.token}>
                  <td className="py-0.5 font-mono">{h.token}</td>
                  <td>{h.description}</td>
                  <td className="font-mono text-ink-faint">{h.example}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-ink-dull">
            {t("rename.mask_outro")}
          </p>
        </div>
      )}
      <div role="table" aria-label={t("rename.preview_aria")} hidden={help} className="mb-3 h-52 overflow-auto border border-app-line">
        <div role="row" className="sticky top-0 grid grid-cols-[1fr_1fr_1fr] bg-app-box px-2 py-0.5 text-xs text-ink-faint">
          <span role="columnheader">{t("rename.col_old")}</span>
          <span role="columnheader">{t("rename.col_new")}</span>
          <span role="columnheader">{t("rename.col_path")}</span>
        </div>
        {items.map((it, i) => (
          <div key={it.path} role="row" className="grid grid-cols-[1fr_1fr_1fr] gap-2 px-2 py-0.5 text-xs">
            <span role="cell" className="truncate">
              {it.name}
            </span>
            <span role="cell" className={errors[i] ? "truncate text-status-error" : "truncate"} title={errors[i] ?? undefined}>
              {newNames[i]}
              {errors[i] && <span role="alert"> — {errors[i]}</span>}
            </span>
            <span role="cell" className="truncate text-ink-faint">
              {parentOf(it.path)}
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 text-xs">
        <fieldset className="space-y-1">
          <legend className="mb-1 font-semibold">{t("rename.mask")}</legend>
          <label className="block">
            {t("rename.name")}
            <input aria-label={t("rename.name_mask_aria")} className={input} value={o.nameMask} onChange={(e) => set({ nameMask: e.target.value })} />
          </label>
          <select aria-label={t("rename.name_case_aria")} className={input} value={o.nameCase} onChange={(e) => set({ nameCase: e.target.value as CaseMode })}>
            {CASES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <label className="block">
            {t("rename.ext")}
            <input aria-label={t("rename.ext_mask_aria")} className={input} value={o.extMask} onChange={(e) => set({ extMask: e.target.value })} />
          </label>
          <select aria-label={t("rename.ext_case_aria")} className={input} value={o.extCase} onChange={(e) => set({ extCase: e.target.value as CaseMode })}>
            {CASES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <p className="text-ink-faint">{t("rename.mask_summary")}</p>
        </fieldset>

        <fieldset className="space-y-1">
          <legend className="mb-1 font-semibold">{t("rename.find_replace")}</legend>
          <label className="block">
            {t("rename.find")}
            <input aria-label={t("rename.find")} className={input} value={o.find} onChange={(e) => set({ find: e.target.value })} />
          </label>
          <label className="block">
            {t("rename.replace")}
            <input aria-label={t("rename.replace")} className={input} value={o.replace} onChange={(e) => set({ replace: e.target.value })} />
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={o.regex} onChange={(e) => set({ regex: e.target.checked })} />
            {t("rename.regex")}
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={o.caseSensitive} onChange={(e) => set({ caseSensitive: e.target.checked })} />
            {t("rename.case_sensitive")}
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={o.firstOnly} onChange={(e) => set({ firstOnly: e.target.checked })} />{t("rename.first_only")}
          </label>
          {patternError && (
            <p role="alert" className="text-status-error">
              {t("rename.regex_error", { error: patternError })}
            </p>
          )}
        </fieldset>

        <fieldset className="space-y-1">
          <legend className="mb-1 font-semibold">{t("rename.counter")}</legend>
          <label className="block">
            {t("rename.start")}
            <input aria-label={t("rename.start")} type="number" className={input} value={o.start} onChange={(e) => set({ start: Number.parseInt(e.target.value, 10) || 0 })} />
          </label>
          <label className="block">
            {t("rename.step")}
            <input aria-label={t("rename.step")} type="number" className={input} value={o.step} onChange={(e) => set({ step: Number.parseInt(e.target.value, 10) || 0 })} />
          </label>
          <label className="block">
            {t("rename.width")}
            <input aria-label={t("rename.width")} type="number" min={1} className={input} value={o.width} onChange={(e) => set({ width: num(e.target.value, 1) })} />
          </label>
        </fieldset>
      </div>
    </div>
  );
}
