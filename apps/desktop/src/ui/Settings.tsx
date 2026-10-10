import { useEffect, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { Button, Input, Select, SelectOption } from "@spacedrive/primitives";
import { defaultBindingsFor } from "@twin-deck/actions";
import { defaultLoaded } from "@twin-deck/ts-client";
import { APP_ACTIONS, APP_LAUNCH_ACTION, APP_OPEN_FOLDER_ACTION } from "../lib/fkeys";
import { THEMES } from "../lib/themes.generated";
import { parseThemeList } from "../lib/themeColors";
import { actionTitle, currentLanguage, LOCALES, t as translate } from "../i18n";
import { useApp, useAppStore, useT } from "../state/context";
import { Combobox } from "./Combobox";
import type { ComboOption } from "./Combobox";
import { Switch } from "./Switch";
import { TagInput } from "./TagInput";
import { useUi } from "./uiContext";

type Control =
  | { type: "switch" }
  | { type: "int" }
  | { type: "text" }
  | { type: "color" }
  | { type: "select"; options: readonly string[]; labels?: Record<string, string> }
  /** 검색 입력이 있는 선택 상자(항목이 많을 때). */
  | { type: "combo"; options: readonly ComboOption[] }
  | { type: "tags"; options: readonly ComboOption[] }
  | { type: "fkey" };

interface Item {
  key: string;
  title: string;
  desc?: string;
  control: Control;
}

/** 긴 설명을 ⓘ 아이콘에 숨기고, 마우스를 올리거나 포커스하면 말풍선으로 보인다(글자는 DOM에 있어 보조 기기에도 읽힌다). */
function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <span tabIndex={0} aria-label={text} className="flex size-4 cursor-help items-center justify-center rounded-full border border-app-line text-[10px] leading-none text-ink-dull outline-none hover:bg-app-selected focus:bg-app-selected">
        i
      </span>
      <span role="tooltip" className="pointer-events-none absolute left-0 top-full z-30 mt-1 w-64 max-w-[70vw] whitespace-normal rounded border border-app-line bg-app-box p-2 text-xs font-normal text-ink opacity-0 shadow-lg group-hover:opacity-100 group-focus-within:opacity-100">
        {text}
      </span>
    </span>
  );
}

/** 지금 언어로 읽히는 항목 글자(getter라 화면을 그릴 때마다 사전을 다시 본다). */
const langItem: Item = {
  key: "behavior.language",
  get title() {
    return translate("settings.language.title");
  },
  get desc() {
    return translate("settings.language.desc");
  },
  control: { type: "select", options: LOCALES.map((l) => l.code), labels: Object.fromEntries(LOCALES.map((l) => [l.code, l.name])) },
};

// system·light·dark 뒤에 apps/desktop/themes의 테마가 이어진다(td-config의 THEME_IDS와 같은 생성 원본). 112개라 검색 상자로 고른다.
// 검색은 보이는 이름 말고 파일 이름(dracula-default)과 밝기 표시(어두움/밝음)로도 된다.
const themeChoices = (): readonly ComboOption[] => [
  { value: "system", label: translate("settings.theme.system") },
  { value: "light", label: "light · Catppuccin Latte" },
  { value: "dark", label: "dark · Catppuccin Mocha" },
  ...THEMES.map((t) => ({ value: t.id, label: `${t.name} · ${t.dark ? translate("settings.theme.dark") : translate("settings.theme.light")}`, keywords: t.id })),
];
// 랜덤 테마 후보는 system·light·dark 없이 테마 이름만 받는다.
const themeTagChoices = (): readonly ComboOption[] => themeChoices().slice(3);
// size_format의 허용 값은 td-config의 검증 목록과 같아야 한다(crates/td-config/src/load.rs).
const SIZE_FORMATS = ["adaptive", "adaptive_kibi", "bytes", "KB", "MB"] as const;
// folder_style의 허용 값도 td-config의 검증 목록(ENUMS)과 같아야 한다.
// tab_style의 허용 값도 td-config의 검증 목록(ENUMS)과 같아야 한다.
const TAB_STYLES = ["underline", "segments"] as const;
const FOLDER_STYLES = ["none", "brackets", "parens", "slash"] as const;

const SECTIONS: { title: string; desc?: string; items: Item[] }[] = [
  {
    get title() { return translate("settings.section.appearance.title"); },
    items: [
      langItem,
      { key: "behavior.theme", get title() { return translate("settings.item.behavior.theme.title"); }, get desc() { return translate("settings.item.behavior.theme.desc"); }, get control() { return { type: "combo", options: themeChoices() } as const; } },
      { key: "behavior.random_theme", get title() { return translate("settings.item.behavior.random_theme.title"); }, get desc() { return translate("settings.item.behavior.random_theme.desc"); }, control: { type: "switch" } },
      { key: "behavior.random_themes", get title() { return translate("settings.item.behavior.random_themes.title"); }, get desc() { return translate("settings.item.behavior.random_themes.desc"); }, get control() { return { type: "tags", options: themeTagChoices() } as const; } },
      { key: "behavior.ui_font", get title() { return translate("settings.item.behavior.ui_font.title"); }, get desc() { return translate("settings.item.behavior.ui_font.desc"); }, control: { type: "text" } },
      { key: "behavior.preview_font", get title() { return translate("settings.item.behavior.preview_font.title"); }, get desc() { return translate("settings.item.behavior.preview_font.desc"); }, control: { type: "text" } },
      { key: "behavior.terminal_font", get title() { return translate("settings.item.behavior.terminal_font.title"); }, get desc() { return translate("settings.item.behavior.terminal_font.desc"); }, control: { type: "text" } },
      { key: "behavior.text_color", get title() { return translate("settings.item.behavior.text_color.title"); }, get desc() { return translate("settings.item.behavior.text_color.desc"); }, control: { type: "color" } },
      { key: "behavior.table.icon_size", get title() { return translate("settings.item.behavior.table.icon_size.title"); }, get desc() { return translate("settings.item.behavior.table.icon_size.desc"); }, control: { type: "int" } },
      { key: "behavior.table.zebra_rows", get title() { return translate("settings.item.behavior.table.zebra_rows.title"); }, get desc() { return translate("settings.item.behavior.table.zebra_rows.desc"); }, control: { type: "switch" } },
      { key: "behavior.table.show_marks", get title() { return translate("settings.item.behavior.table.show_marks.title"); }, get desc() { return translate("settings.item.behavior.table.show_marks.desc"); }, control: { type: "switch" } },
      { key: "behavior.table.folder_style", get title() { return translate("settings.item.behavior.table.folder_style.title"); }, get desc() { return translate("settings.item.behavior.table.folder_style.desc"); }, control: { type: "select", options: FOLDER_STYLES } },
      { key: "behavior.table.cursor_fill", get title() { return translate("settings.item.behavior.table.cursor_fill.title"); }, get desc() { return translate("settings.item.behavior.table.cursor_fill.desc"); }, control: { type: "switch" } },
      { key: "behavior.table.show_parent_row", get title() { return translate("settings.item.behavior.table.show_parent_row.title"); }, get desc() { return translate("settings.item.behavior.table.show_parent_row.desc"); }, control: { type: "switch" } },
      { key: "behavior.layout.pane_highlight", get title() { return translate("settings.item.behavior.layout.pane_highlight.title"); }, get desc() { return translate("settings.item.behavior.layout.pane_highlight.desc"); }, control: { type: "switch" } },
      { key: "behavior.layout.tab_style", get title() { return translate("settings.item.behavior.layout.tab_style.title"); }, get desc() { return translate("settings.item.behavior.layout.tab_style.desc"); }, control: { type: "select", options: TAB_STYLES } },
      { key: "behavior.layout.tab_close_button", get title() { return translate("settings.item.behavior.layout.tab_close_button.title"); }, get desc() { return translate("settings.item.behavior.layout.tab_close_button.desc"); }, control: { type: "switch" } },
      { key: "behavior.layout.show_action_bar", get title() { return translate("settings.item.behavior.layout.show_action_bar.title"); }, get desc() { return translate("settings.item.behavior.layout.show_action_bar.desc"); }, control: { type: "switch" } },
      { key: "behavior.layout.action_bar_by_modifier", get title() { return translate("settings.item.behavior.layout.action_bar_by_modifier.title"); }, get desc() { return translate("settings.item.behavior.layout.action_bar_by_modifier.desc"); }, control: { type: "switch" } },
      { key: "behavior.layout.recent_limit", get title() { return translate("settings.item.behavior.layout.recent_limit.title"); }, get desc() { return translate("settings.item.behavior.layout.recent_limit.desc"); }, control: { type: "int" } },
      { key: "behavior.layout.show_drive_bar", get title() { return translate("settings.item.behavior.layout.show_drive_bar.title"); }, get desc() { return translate("settings.item.behavior.layout.show_drive_bar.desc"); }, control: { type: "switch" } },
    ],
  },
  {
    get title() { return translate("settings.section.list.title"); },
    items: [
      { key: "behavior.table.circular_selection", get title() { return translate("settings.item.behavior.table.circular_selection.title"); }, get desc() { return translate("settings.item.behavior.table.circular_selection.desc"); }, control: { type: "switch" } },
      { key: "behavior.table.right_click_select", get title() { return translate("settings.item.behavior.table.right_click_select.title"); }, get desc() { return translate("settings.item.behavior.table.right_click_select.desc"); }, control: { type: "switch" } },
      { key: "behavior.quick_select.match_only_prefix", get title() { return translate("settings.item.behavior.quick_select.match_only_prefix.title"); }, get desc() { return translate("settings.item.behavior.quick_select.match_only_prefix.desc"); }, control: { type: "switch" } },
      { key: "behavior.quick_select.activate_on_any_character", get title() { return translate("settings.item.behavior.quick_select.activate_on_any_character.title"); }, get desc() { return translate("settings.item.behavior.quick_select.activate_on_any_character.desc"); }, control: { type: "switch" } },
    ],
  },
  {
    get title() { return translate("settings.section.format.title"); },
    items: [
      { key: "display.relative_date", get title() { return translate("settings.item.display.relative_date.title"); }, get desc() { return translate("settings.item.display.relative_date.desc"); }, control: { type: "switch" } },
      { key: "display.date_format", get title() { return translate("settings.item.display.date_format.title"); }, get desc() { return translate("settings.item.display.date_format.desc"); }, control: { type: "text" } },
      { key: "display.time_format", get title() { return translate("settings.item.display.time_format.title"); }, get desc() { return translate("settings.item.display.time_format.desc"); }, control: { type: "text" } },
      { key: "display.size_format", get title() { return translate("settings.item.display.size_format.title"); }, control: { type: "select", options: SIZE_FORMATS } },
      { key: "display.folder_size_on_select", get title() { return translate("settings.item.display.folder_size_on_select.title"); }, get desc() { return translate("settings.item.display.folder_size_on_select.desc"); }, control: { type: "switch" } },
    ],
  },
  {
    get title() { return translate("settings.section.preview.title"); },
    get desc() { return translate("settings.section.preview.desc"); },
    items: [
      { key: "preview.audio_autoplay", get title() { return translate("settings.item.preview.audio_autoplay.title"); }, get desc() { return translate("settings.item.preview.audio_autoplay.desc"); }, control: { type: "switch" } },
      { key: "preview.video_autoplay", get title() { return translate("settings.item.preview.video_autoplay.title"); }, get desc() { return translate("settings.item.preview.video_autoplay.desc"); }, control: { type: "switch" } },
      { key: "preview.office", get title() { return translate("settings.item.preview.office.title"); }, get desc() { return translate("settings.item.preview.office.desc"); }, control: { type: "switch" } },
      { key: "preview.image_max_mb", get title() { return translate("settings.item.preview.image_max_mb.title"); }, get desc() { return translate("settings.item.preview.image_max_mb.desc"); }, control: { type: "int" } },
      { key: "preview.pdf_max_mb", get title() { return translate("settings.item.preview.pdf_max_mb.title"); }, get desc() { return translate("settings.item.preview.pdf_max_mb.desc"); }, control: { type: "int" } },
      { key: "preview.audio_max_mb", get title() { return translate("settings.item.preview.audio_max_mb.title"); }, get desc() { return translate("settings.item.preview.audio_max_mb.desc"); }, control: { type: "int" } },
      { key: "preview.pdf_direct", get title() { return translate("settings.item.preview.pdf_direct.title"); }, get desc() { return translate("settings.item.preview.pdf_direct.desc"); }, control: { type: "switch" } },
      { key: "preview.close_on_outside_click", get title() { return translate("settings.item.preview.close_on_outside_click.title"); }, get desc() { return translate("settings.item.preview.close_on_outside_click.desc"); }, control: { type: "switch" } },
    ],
  },
  {
    get title() { return translate("settings.section.confirm.title"); },
    items: [
      { key: "core.confirm.delete", get title() { return translate("settings.item.core.confirm.delete.title"); }, control: { type: "switch" } },
      { key: "core.confirm.trash", get title() { return translate("settings.item.core.confirm.trash.title"); }, control: { type: "switch" } },
    ],
  },
  {
    get title() { return translate("settings.section.folder_shortcuts.title"); },
    get desc() { return translate("settings.section.folder_shortcuts.desc"); },
    items: Array.from({ length: 10 }, (_, n) => ({
      key: `shortcuts.${n}`,
      title: `Ctrl+${n}`,
      control: { type: "text" } as const,
    })),
  },
  {
    get title() { return translate("settings.section.fkeys.title"); },
    get desc() { return translate("settings.section.fkeys.desc"); },
    items: Array.from({ length: 12 }, (_, i) => ({ key: `fkeys.F${i + 1}`, title: `F${i + 1}`, control: { type: "fkey" } as const })),
  },
  {
    get title() { return translate("settings.section.environment.title"); },
    items: [{ key: "environment.text_editor", get title() { return translate("settings.item.environment.text_editor.title"); }, get desc() { return translate("settings.item.environment.text_editor.desc"); }, control: { type: "text" } }],
  },
];

const valueAt = (obj: unknown, key: string): unknown => key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);

/** 입력창은 Enter나 포커스를 벗어날 때 저장한다(글자마다 저장하면 쓰다 만 값이 파일에 남는다). */
function EditableControl({ item, value, disabled, onCommit }: { item: Item; value: string | number; disabled: boolean; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    if (draft !== String(value) && draft.trim() !== "") onCommit(draft);
    else setDraft(String(value));
  };
  return (
    <Input
      aria-label={item.title}
      type={item.control.type === "int" ? "number" : "text"}
      value={draft}
      disabled={disabled}
      size="sm"
      className={item.control.type === "text" ? "w-full" : "w-40"}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
    />
  );
}

/**
 * 색 한 칸: 현재 색 견본 버튼(누르면 색상환이 열림), `#rrggbb` 입력, 지우기(테마 그대로). 색상환을 끄는 동안에는 잠깐 쉬었다가 저장한다.
 */
function ColorControl({ item, value, disabled, onCommit }: { item: Item; value: string; disabled: boolean; onCommit: (v: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const valid = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(draft);
  const commitText = () => {
    if (draft === value) return;
    if (draft.trim() === "" || valid) onCommit(draft.trim());
    else setDraft(value);
  };
  const pick = (c: string) => {
    setDraft(c);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onCommit(c), 250);
  };
  return (
    <div className="relative flex items-center gap-2">
      <button
        type="button"
        aria-label={t("settings.color.pick", { title: item.title })}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="h-6 w-6 rounded border border-app-line"
        style={{ background: valid ? draft : "transparent" }}
      />
      <Input
        aria-label={item.title}
        type="text"
        value={draft}
        placeholder={t("settings.color.placeholder")}
        disabled={disabled}
        size="sm"
        className="w-32"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitText}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitText();
        }}
      />
      <Button type="button" size="sm" disabled={disabled || value === ""} aria-label={t("settings.color.clear_title", { title: item.title })} onClick={() => onCommit("")}>
        {t("settings.color.clear")}
      </Button>
      {open && (
        <div data-testid="color-picker" className="absolute left-0 top-8 z-20 rounded border border-app-line bg-app-box p-2 shadow-lg">
          <HexColorPicker color={valid ? draft : "#888888"} onChange={pick} />
        </div>
      )}
    </div>
  );
}

/**
 * F키 한 줄: 검색되는 동작 선택 상자(기본값 · 해제 · 액션 · 애플리케이션 실행)와, 앱 실행을 고르면 나타나는 앱 경로 입력.
 * Radix Select는 빈 문자열 값을 허용하지 않아서 저장값 ""(기본값)을 화면에서만 "default"로 쓴다.
 */
function FKeyControl({ name, value, disabled }: { name: string; value: string; disabled: boolean }) {
  const t = useT();
  const { registry, platform } = useUi();
  const { api } = useAppStore();
  const app = useApp((s) => s.loaded.config.fkey_apps[name] ?? "");
  const builtin = defaultBindingsFor(platform).find((b) => b.scope === "pane" && b.keys.includes(name));
  const builtinTitle = builtin ? actionTitle(builtin.actionId, registry.get(builtin.actionId)?.title ?? builtin.actionId) : t("settings.fkey.none");
  // 인수가 필요한 액션(정렬 기준, 폴더 경로 등)은 F키에 인수 없이 걸 수 없어서 뺀다. 앱 실행 두 가지만 전용 경로 입력이 있다.
  const actions = registry
    .list()
    .filter((a) => a.scopes.includes("pane") && (APP_ACTIONS.includes(a.id) || !/\(\S+:/.test(a.title)))
    .map((a) => ({ id: a.id, label: a.id === APP_LAUNCH_ACTION ? t("settings.fkey.launch") : a.id === APP_OPEN_FOLDER_ACTION ? t("settings.fkey.open_folder") : actionTitle(a.id, a.title) }))
    .sort((a, b) => a.label.localeCompare(b.label, currentLanguage()));
  const choose = (v: string) => (v === "default" ? api.resetConfigValue(`fkeys.${name}`) : api.setConfigValue(`fkeys.${name}`, { kind: "str", value: v }));
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Combobox
        label={t("settings.fkey.action", { name })}
        value={value === "" ? "default" : value}
        disabled={disabled}
        onChange={(v) => void choose(v)}
        options={[
          { value: "default", label: t("settings.fkey.default", { current: builtinTitle }) },
          { value: "none", label: t("settings.fkey.unbind") },
          ...actions.map((a) => ({ value: a.id, label: a.label, keywords: a.id })),
        ]}
      />
      {APP_ACTIONS.includes(value) && (
        <EditableControl
          item={{ key: `fkey_apps.${name}`, title: t("settings.fkey.app", { name }), control: { type: "text" } }}
          value={app}
          disabled={disabled}
          onCommit={(v) => void api.setConfigValue(`fkey_apps.${name}`, { kind: "str", value: v })}
        />
      )}
    </div>
  );
}

const MODIFIERS = ["Mod", "Ctrl", "Alt", "Shift"] as const;

/** 조합키 F키 항목 추가: F키 + 수식키(Mod/Ctrl/Alt/Shift)를 골라 `fkeys`에 빈 항목으로 만든다. 같은 조합은 한 번만. */
function FKeyAdder({ disabled }: { disabled: boolean }) {
  const t = useT();
  const { api } = useAppStore();
  const existing = useApp((s) => s.loaded.config.fkeys);
  const [f, setF] = useState("F1");
  const [mods, setMods] = useState<string[]>([]);
  const key = [...MODIFIERS.filter((m) => mods.includes(m)), f].join("+");
  const duplicate = key in existing;
  return (
    <div role="group" aria-label={t("settings.fkey.add_combo")} className="flex flex-wrap items-center gap-3 py-2.5">
      <select aria-label={t("settings.section.fkeys.title")} value={f} disabled={disabled} onChange={(e) => setF(e.target.value)} className="rounded border border-app-line bg-app-box px-2 py-1 text-sm">
        {Array.from({ length: 12 }, (_, i) => `F${i + 1}`).map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      {MODIFIERS.map((m) => (
        <label key={m} className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            aria-label={m}
            checked={mods.includes(m)}
            disabled={disabled}
            onChange={(e) => setMods(e.target.checked ? [...mods, m] : mods.filter((x) => x !== m))}
          />
          {m}
        </label>
      ))}
      <Button type="button" variant="gray" size="sm" disabled={disabled || mods.length === 0 || duplicate} onClick={() => void api.setConfigValue(`fkeys.${key}`, { kind: "str", value: "" })}>
        {t("settings.fkey.add")}
      </Button>
      {duplicate && mods.length > 0 && <span className="text-xs text-status-error">{t("settings.fkey.duplicate")}</span>}
    </div>
  );
}

/** 사용자 설정을 항목별 컨트롤로 바꾸는 화면(`Mod+,`). 바꾸는 즉시 저장한다. */
export function Settings({ onThemePreview }: { onThemePreview?: (theme: string | null) => void }) {
  const t = useT();
  const section = useApp((s) => s.settingsSection);
  const config = useApp((s) => s.loaded.config);
  // F키 탭은 고정 F1~F12 뒤에 설정 파일의 조합키 항목이 이어진다.
  // 내장 기본 바인딩의 조합키(Shift+F8, Mod+F12 등)도 설정 파일에 없어도 같이 보인다.
  const { platform } = useUi();
  const comboKeys = [
    ...new Set([
      ...Object.keys(config.fkeys).filter((k) => k.includes("+")),
      ...defaultBindingsFor(platform)
        .filter((b) => b.scope === "pane")
        .flatMap((b) => b.keys)
        .filter((k) => /^((Mod|Ctrl|Alt|Shift)\+)+F\d+$/.test(k)),
    ]),
  ].sort();
  const broken = useApp((s) => s.loaded.warnings.find((w) => w.line != null));
  const error = useApp((s) => s.settingsError);
  const { api } = useAppStore();
  // 설정 화면이 닫히면(테마 목록을 연 채로 닫혀도) 임시 미리보기를 걷는다. 설정은 열려 있는 동안만 이 패널에 그려진다.
  useEffect(() => () => onThemePreview?.(null), [onThemePreview]);
  const defaults = defaultLoaded().config;
  const randomTheme = config.behavior.random_theme;
  const current = SECTIONS[section];
  const items: Item[] = current.title === t("settings.section.fkeys.title") ? [...current.items, ...comboKeys.map((k): Item => ({ key: `fkeys.${k}`, title: k, control: { type: "fkey" } }))] : current.items;
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app text-ink">
      <div role="dialog" aria-label={t("settings.aria")} className="flex min-h-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-app-line px-4 py-2">
          <h2 className="text-base font-semibold">{t("settings.aria")}</h2>
          <div className="flex items-center gap-3">
            {/* 확인 창이 설정 화면에 가려지지 않게 설정을 닫고 확인한다. */}
            <Button
              size="sm"
              variant="gray"
              onClick={() => {
                api.closeSettings();
                void api.checkForUpdate();
              }}
            >
              {t("settings.update")}
            </Button>
            <Button size="sm" variant="gray" onClick={() => void api.revealConfigDir()}>
              {t("settings.open_config_dir")}
            </Button>
            <Button size="sm" variant="gray" onClick={() => api.closeSettings()}>
              {t("settings.close")} <span className="ml-1 text-ink-faint">Esc</span>
            </Button>
          </div>
        </header>
        {(broken || error) && (
          <div role="alert" className="border-b border-app-line bg-status-error/15 px-4 py-2 text-sm text-status-error">
            {broken
              ? t("settings.toml_broken", { line: broken.line ? t("settings.toml_broken_line", { line: broken.line }) : "" })
              : error}
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col">
          <nav role="tablist" aria-label={t("settings.sections")} aria-orientation="horizontal" className="td-thin-scroll flex shrink-0 gap-1 overflow-x-auto border-b border-app-line bg-sidebar p-2">
            {SECTIONS.map((s, i) => (
              <button
                key={s.title}
                type="button"
                role="tab"
                aria-selected={i === section}
                onClick={() => api.setSettingsSection(i)}
                className={
                  "shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm " +
                  (i === section ? "bg-sidebar-selected text-sidebar-ink" : "text-sidebar-ink-dull hover:bg-sidebar-button")
                }
              >
                {s.title}
              </button>
            ))}
          </nav>
          <section role="tabpanel" aria-label={current.title} className="min-w-0 flex-1 overflow-auto px-6 py-3">
            <h3 className="text-sm font-semibold">{current.title}</h3>
            {current.desc ? <p className="mb-2 text-xs text-ink-faint">{current.desc}</p> : <div className="mb-2" />}
            {items.map((item) => {
              const combo = item.key.startsWith("fkeys.") && item.title.includes("+") && item.title in config.fkeys;
              // 설정 파일에 없는 내장 조합키는 값이 없다 → 기본값("")으로 본다.
              const value = (valueAt(config, item.key) ?? (item.control.type === "fkey" ? "" : undefined)) as string | number | boolean;
              const isDefault = value === (valueAt(defaults, item.key) ?? (item.control.type === "fkey" ? "" : undefined));
              const wide = item.control.type === "text" || item.control.type === "fkey" || item.control.type === "tags";
              return (
                <div key={item.key} role="group" aria-label={item.title} className="flex items-center justify-between gap-4 border-b border-app-line py-2.5">
                  <div className={wide ? "w-48 shrink-0" : "min-w-0"}>
                    <div className="flex items-center gap-1.5 text-sm">
                      {item.title}
                      {item.desc && <InfoTip text={item.desc} />}
                    </div>
                  </div>
                  <div className={"flex items-center gap-3 " + (wide ? "min-w-0 flex-1 justify-end" : "shrink-0")}>
                    {(combo || !isDefault) && !broken && (
                      <button type="button" className="whitespace-nowrap text-xs text-accent hover:underline" onClick={() =>
                          void (async () => {
                            await api.resetConfigValue(item.key);
                            // F키는 지정한 앱 경로도 함께 비운다.
                            if (item.control.type === "fkey") {
                              await api.resetConfigValue(item.key.replace("fkeys.", "fkey_apps."));
                              await api.resetConfigValue(item.key.replace("fkeys.", "fkey_bar."));
                            }
                          })()
                        }
                      >
                        {combo ? t("settings.delete") : t("settings.reset")}
                      </button>
                    )}
                    {item.control.type === "switch" && (
                      <Switch
                        aria-label={item.title}
                        checked={value as boolean}
                        disabled={!!broken}
                        onCheckedChange={(v) => void api.setConfigValue(item.key, { kind: "bool", value: v })}
                      />
                    )}
                    {item.control.type === "fkey" && <FKeyControl name={item.title} value={String(value)} disabled={!!broken} />}
                    {item.control.type === "fkey" && (
                      <label className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-ink-dull">
                        <Switch
                          aria-label={t("settings.fkey.show_in_bar", { title: item.title })}
                          checked={config.fkey_bar[item.title] ?? false}
                          disabled={!!broken}
                          onCheckedChange={(v) => void api.setConfigValue(`fkey_bar.${item.title}`, { kind: "bool", value: v })}
                        />
                        Action Bar
                      </label>
                    )}
                    {item.control.type === "select" && (
                      <Select value={String(value)} disabled={!!broken} onChange={(v) => void api.setConfigValue(item.key, { kind: "str", value: v })}>
                        {((ctl) => ctl.options.map((o) => (
                          <SelectOption key={o} value={o}>
                            {ctl.labels?.[o] ?? o}
                          </SelectOption>
                        )))(item.control)}
                      </Select>
                    )}
                    {item.control.type === "combo" && (
                      <Combobox
                        label={item.title}
                        value={String(value)}
                        options={item.control.options}
                        disabled={!!broken || (item.key === "behavior.theme" && randomTheme)}
                        onChange={(v) => void api.setConfigValue(item.key, { kind: "str", value: v })}
                        onPreview={item.key === "behavior.theme" ? onThemePreview : undefined}
                      />
                    )}
                    {item.control.type === "tags" && (
                      <TagInput
                        label={item.title}
                        value={parseThemeList(String(value))}
                        options={item.control.options}
                        disabled={!!broken || !randomTheme}
                        onChange={(v) => void api.setConfigValue(item.key, { kind: "str", value: v.join(",") })}
                        onPreview={onThemePreview}
                      />
                    )}
                    {item.control.type === "color" && (
                      <ColorControl item={item} value={String(value ?? "")} disabled={!!broken} onCommit={(v) => void api.setConfigValue(item.key, { kind: "str", value: v })} />
                    )}
                    {(item.control.type === "int" || item.control.type === "text") && (
                      <EditableControl
                        item={item}
                        value={value as string | number}
                        disabled={!!broken}
                        onCommit={(v) =>
                          void api.setConfigValue(item.key, item.control.type === "int" ? { kind: "int", value: Math.round(Number(v)) } : { kind: "str", value: v })
                        }
                      />
                    )}
                  </div>
                </div>
              );
            })}
            {current.title === t("settings.section.fkeys.title") && <FKeyAdder disabled={!!broken} />}
          </section>
        </div>
      </div>
    </div>
  );
}
