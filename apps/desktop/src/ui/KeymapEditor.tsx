import { useEffect, useMemo, useState } from "react";
import { Button, Input } from "@spacedrive/primitives";
import { defaultBindingsFor, mergeUserBindings } from "@twin-deck/actions";
import { formatKey, type Scope } from "@twin-deck/keybinds";
import { actionTitle, type Key } from "../i18n";
import { withAppArgs } from "../lib/fkeys";
import { bindingFor, chordText, conflictsFor, isPlainCharKey, keymapRows, removalFor, resetKeysFor, type KeymapRow } from "../lib/keymapEdit";
import { useApp, useAppStore, useT } from "../state/context";
import { useUi } from "./uiContext";

const FOLDER_SHORTCUT = "core.go.shortcut";
const SCOPE_LABELS: readonly string[] = ["global", "pane", "quickSelect", "queue", "preview", "terminal", "dialog", "panel"];

/** 키를 기다리는 줄과, 같은 스코프에서 겹친 키를 옮길지 묻는 중인 상태. */
type Pending = { row: string; key?: string; message?: string };

/**
 * 단축키 설정의 "모든 단축키" 목록. `query`(탭 맨 위 검색창)로 이름·액션 ID·키를 거른다. 줄마다 지금 걸린 키를 칩으로 보이고, [+]로 다음 키 입력을 녹화해 더하고, ×로 뺀다.
 * 같은 스코프에서 이미 쓰는 키면 옮길지 묻고, 옮기면 원래 동작에서는 빠진다. 바꾼 값은 keybindings.toml의 현재 OS 섹션에 쓴다.
 * 폴더 단축키 줄은 이동할 폴더 경로도 함께 고친다.
 */
export function KeymapEditor({ disabled, query }: { disabled: boolean; query: string }) {
  const t = useT();
  const { registry, platform } = useUi();
  const { api } = useAppStore();
  const user = useApp((s) => s.loaded.bindings);
  const fkeyApps = useApp((s) => s.loaded.config.fkey_apps);
  const shortcuts = useApp((s) => s.loaded.config.shortcuts);
  const [pending, setPending] = useState<Pending | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  const defaults = useMemo(() => defaultBindingsFor(platform), [platform]);
  const scopesOf = (id: string) => registry.get(id)?.scopes;
  const merged = useMemo(
    () => mergeUserBindings(defaults, withAppArgs(user, fkeyApps), (id) => registry.get(id)?.scopes, platform).bindings,
    [defaults, user, fkeyApps, registry, platform],
  );
  const rows = useMemo(() => keymapRows(defaults, merged, registry.list(), platform), [defaults, merged, registry, platform]);
  const titleOf = (row: { actionId: string; args?: Record<string, string> }) =>
    row.actionId === FOLDER_SHORTCUT && row.args?.n !== undefined
      ? t("settings.keymap.folder_title", { n: row.args.n })
      : actionTitle(row.actionId, registry.get(row.actionId)?.title ?? row.actionId);
  // 같은 동작이 여러 스코프에 있으면 스코프를 덧붙여 줄을 구분한다.
  const multiScope = new Set(rows.filter((r, _, all) => all.some((o) => o !== r && o.actionId === r.actionId && o.scope !== r.scope)).map((r) => r.id));
  const scopeLabel = (s: Scope) => (SCOPE_LABELS.includes(s) ? t(`settings.keymap.scope.${s}` as Key) : s);
  const label = (row: KeymapRow) => (multiScope.has(row.id) ? `${titleOf(row)} (${scopeLabel(row.scope)})` : titleOf(row));

  const q = query.trim().toLowerCase();
  const visible = rows
    .filter((r) => !q || [label(r), r.actionId, ...r.keys, ...r.keys.map((k) => formatKey(k, platform))].some((s) => s.toLowerCase().includes(q)))
    .sort((a, b) => label(a).localeCompare(label(b)));

  const add = (row: KeymapRow, key: string) => void api.setKeybinding(bindingFor(row, key, scopesOf(row.actionId))).then(() => setPending(null));

  const recorded = (row: KeymapRow, key: string) => {
    if (row.keys.some((k) => k.toLowerCase() === key.toLowerCase())) return setPending(null);
    if (isPlainCharKey(key, platform)) return setPending({ row: row.id, message: t("settings.keymap.plain") });
    const other = conflictsFor(row, key, merged, platform)[0];
    if (other) return setPending({ row: row.id, key, message: t("settings.keymap.conflict", { key: formatKey(key, platform), other: titleOf(other) }) });
    add(row, key);
  };

  const remove = (row: KeymapRow, key: string) => {
    const how = removalFor(row, key, defaults, merged, platform);
    if (how === "blocked") return setPending({ row: row.id, message: t("settings.keymap.blocked", { key: formatKey(key, platform) }) });
    setPending(null);
    void (how === "reset" ? api.resetKeybinding(key) : api.setKeybinding({ key, action: null, args: {}, scope: null }));
  };

  const resetRow = async (row: KeymapRow) => {
    for (const key of resetKeysFor(row, user, scopesOf, platform)) await api.resetKeybinding(key);
  };

  const resetAll = async () => {
    setConfirmAll(false);
    for (const key of [...new Set(user.map((u) => u.key))]) await api.resetKeybinding(key);
  };

  return (
    <div role="group" aria-label={t("settings.keymap.title")} className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-app-line pb-2">
        <h4 className="text-sm font-semibold">{t("settings.keymap.title")}</h4>
        <div className="flex items-center gap-2">
          {confirmAll ? (
            <span className="flex items-center gap-2 text-xs">
              {t("settings.keymap.reset_all_confirm")}
              <Button type="button" variant="gray" size="sm" onClick={() => void resetAll()}>
                {t("settings.keymap.reset_all")}
              </Button>
              <Button type="button" variant="gray" size="sm" onClick={() => setConfirmAll(false)}>
                {t("settings.keymap.cancel")}
              </Button>
            </span>
          ) : (
            <Button type="button" variant="gray" size="sm" disabled={disabled || user.length === 0} onClick={() => setConfirmAll(true)}>
              {t("settings.keymap.reset_all")}
            </Button>
          )}
        </div>
      </div>
      {visible.map((row) => {
        const name = label(row);
        const changed = resetKeysFor(row, user, scopesOf, platform).length > 0;
        const here = pending?.row === row.id ? pending : null;
        return (
          <div key={row.id} role="group" aria-label={name} className="border-b border-app-line py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 text-sm">{name}</span>
              {row.keys.map((k) => (
                <span key={k} className="flex items-center gap-1 rounded border border-app-line bg-app-box px-1.5 py-0.5 text-xs">
                  <kbd>{formatKey(k, platform)}</kbd>
                  <button type="button" aria-label={t("settings.keymap.remove", { key: formatKey(k, platform), title: name })} disabled={disabled} className="text-ink-faint hover:text-ink" onClick={() => remove(row, k)}>
                    ×
                  </button>
                </span>
              ))}
              {here && here.key === undefined && here.message === undefined ? (
                <KeyRecorder label={t("settings.keymap.recording_aria", { title: name })} onKey={(k) => recorded(row, k)} onCancel={() => setPending(null)} />
              ) : (
                <button type="button" aria-label={t("settings.keymap.add", { title: name })} disabled={disabled} className="rounded border border-dashed border-app-line px-1.5 text-xs text-ink-dull hover:text-ink" onClick={() => setPending({ row: row.id })}>
                  +
                </button>
              )}
              {changed && (
                <button type="button" disabled={disabled} className="whitespace-nowrap text-xs text-accent hover:underline" onClick={() => void resetRow(row)}>
                  {t("settings.reset")}
                </button>
              )}
            </div>
            {here?.message && (
              <div className="mt-1 flex items-center gap-2 text-xs text-status-error">
                {here.message}
                {here.key && (
                  <Button type="button" variant="gray" size="sm" onClick={() => add(row, here.key!)}>
                    {t("settings.keymap.move")}
                  </Button>
                )}
                <Button type="button" variant="gray" size="sm" onClick={() => setPending(null)}>
                  {here.key ? t("settings.keymap.cancel") : t("settings.keymap.ok")}
                </Button>
              </div>
            )}
            {row.actionId === FOLDER_SHORTCUT && row.args.n !== undefined && (
              <FolderPath n={row.args.n} value={shortcuts[row.args.n] ?? ""} disabled={disabled} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 다음 키 입력 하나를 받는 칸. 앱의 단축키로 새지 않게 여기서 멈춘다(`data-key-record`). Esc는 취소. */
function KeyRecorder({ label, onKey, onCancel }: { label: string; onKey: (key: string) => void; onCancel: () => void }) {
  const t = useT();
  const { platform } = useUi();
  return (
    <span className="flex items-center gap-2">
      <input
        data-key-record
        autoFocus
        readOnly
        aria-label={label}
        placeholder={t("settings.keymap.press")}
        className="w-32 rounded border border-accent bg-app-box px-1.5 py-0.5 text-xs"
        onBlur={onCancel}
        onKeyDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.key === "Escape" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) return onCancel();
          const key = chordText(e, platform);
          if (key) onKey(key);
        }}
      />
      <span className="text-xs text-ink-faint">{t("settings.keymap.recording")}</span>
    </span>
  );
}

/** 폴더 단축키 줄의 이동할 폴더 경로. Enter나 포커스를 벗어날 때 저장하고, 비우면 기본값(미지정)으로 되돌린다. */
function FolderPath({ n, value, disabled }: { n: string; value: string; disabled: boolean }) {
  const t = useT();
  const { api } = useAppStore();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft === value) return;
    void (draft.trim() === "" ? api.resetConfigValue(`shortcuts.${n}`) : api.setConfigValue(`shortcuts.${n}`, { kind: "str", value: draft }));
  };
  return (
    <div className="mt-1">
      <Input
        aria-label={t("settings.keymap.folder_path", { n })}
        placeholder={t("settings.keymap.folder_placeholder")}
        value={draft}
        disabled={disabled}
        size="sm"
        className="w-full"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
      />
    </div>
  );
}
