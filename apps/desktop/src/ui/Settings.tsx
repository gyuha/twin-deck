/// <reference types="vite/client" />
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { EmojiPicker } from "frimousse";
import { HexColorPicker } from "react-colorful";
import { Button, Input, Select, SelectOption } from "@spacedrive/primitives";
import { defaultBindingsFor } from "@twin-deck/actions";
import type { Platform } from "@twin-deck/keybinds";
import { defaultLoaded } from "@twin-deck/ts-client";
import type { RemoteServer, RemoteServerStatus, SmbServer } from "@twin-deck/ts-client";
import { APP_ACTIONS, APP_LAUNCH_ACTION, APP_OPEN_FOLDER_ACTION } from "../lib/fkeys";
import { THEMES } from "../lib/themes.generated";
import { parseThemeList } from "../lib/themeColors";
import { withIcon } from "../lib/connections";
import { actionTitle, currentLanguage, LOCALES, t as translate, type Key } from "../i18n";
import { useApp, useAppStore, useT } from "../state/context";
import { Combobox } from "./Combobox";
import type { ComboOption } from "./Combobox";
import { Switch } from "./Switch";
import { TagInput } from "./TagInput";
import { parseColumn, withExtensionColumn } from "../lib/columns";
import { useUi } from "./uiContext";
import licensesText from "../generated/licenses.md?raw";
import { MarkdownView } from "./MarkdownView";

type Control =
  | { type: "switch" }
  | { type: "extension-column" }
  | { type: "int" }
  | { type: "text" }
  | { type: "color" }
  /** 특수 탭 색: 자동·끔·직접 지정(`#rrggbb`) 선택 상자와, 직접 지정이면 색 한 칸. */
  | { type: "tab-color" }
  | { type: "select"; options: readonly string[]; labels?: Record<string, string> }
  /** 검색 입력이 있는 선택 상자(항목이 많을 때). */
  | { type: "combo"; options: readonly ComboOption[] }
  | { type: "tags"; options: readonly ComboOption[] }
  | { type: "fkey" }
  /** 전역 단축키: 수식키 체크 + 키 선택 상자. 값은 `Mod+Alt+O` 문자열이다. */
  | { type: "hotkey" }
  /** 저장된 SMB 서버 목록(`smb.servers`): 목록 + 선택 항목 편집 폼. 목록 전체를 한 번에 저장한다. */
  | { type: "smb-servers" }
  /** 저장된 원격(SFTP·FTP) 서버 목록(`remote.servers`): SMB 목록과 같은 모양의 편집기. */
  | { type: "remote-servers" }
  /** 내장 서버(Twin Deck Remote) 켜기·끄기와 설정·비밀번호·접속 정보. */
  | { type: "twindeck-server" }
  /** `remote.servers` 중 `protocol = "twindeck"` 항목만 보이는 접속 주소 편집기. */
  | { type: "twindeck-servers" };

interface Item {
  key: string;
  title: string;
  desc?: string;
  control: Control;
  /** 이 플랫폼에서는 설정 화면에 보이지 않는다(값은 설정 파일에 그대로 있다). */
  hideOn?: readonly Platform[];
  /** 값이 비어 있으면 설정 화면에 보이지 않는다. 남아 있는 이전 설정을 지울 수 있게만 보여 줄 때 쓴다. */
  hideWhenEmpty?: boolean;
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

/**
 * 값이 기본값과 다를 때 나타나는 되돌리기(반시계 화살표) 아이콘 버튼("기본값으로"). 마우스를 올리거나 포커스하면 설명 말풍선이 뜬다.
 * 버튼은 값이 기본값이면 없어지지만 자리(고정 크기)는 늘 남겨, 값을 바꿀 때 줄의 배치가 움직이지 않는다.
 */
function ResetSlot({ label, show, onClick }: { label: string; show: boolean; onClick: () => void }) {
  return (
    <span className="group relative inline-flex size-6 shrink-0 items-center justify-center">
      {show && (
        <>
          <button
            type="button"
            aria-label={label}
            onClick={onClick}
            className="flex size-6 items-center justify-center rounded text-ink-dull outline-none hover:bg-app-selected hover:text-ink focus:bg-app-selected"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
          <span role="tooltip" className="pointer-events-none absolute left-0 top-full z-30 mt-1 whitespace-nowrap rounded border border-app-line bg-app-box px-2 py-1 text-xs font-normal text-ink opacity-0 shadow-lg group-hover:opacity-100 group-focus-within:opacity-100">
            {label}
          </span>
        </>
      )}
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
// 터미널 테마: 빈 값은 앱 테마를 따른다. 그 뒤에 light·dark·테마 이름이 이어진다(system은 없다).
const terminalThemeChoices = (): readonly ComboOption[] => [{ value: "", label: translate("settings.theme.follow_app") }, ...themeChoices().slice(1)];
// 랜덤 테마 후보는 system·light·dark 없이 테마 이름만 받는다.
const themeTagChoices = (): readonly ComboOption[] => themeChoices().slice(3);
// size_format의 허용 값은 td-config의 검증 목록과 같아야 한다(crates/td-config/src/load.rs).
const SIZE_FORMATS = ["adaptive", "adaptive_kibi", "bytes", "KB", "MB"] as const;
// folder_style의 허용 값도 td-config의 검증 목록(ENUMS)과 같아야 한다.
// tab_style의 허용 값도 td-config의 검증 목록(ENUMS)과 같아야 한다.
const TAB_STYLES = ["underline", "segments"] as const;
// tab_position의 허용 값도 td-config의 검증 목록(ENUMS)과 같아야 한다.
const TAB_POSITIONS = ["top", "bottom"] as const;
// environment.terminal의 허용 값도 td-config의 검증 목록(ENUMS)과 같아야 한다.
const TERMINAL_SHELLS = ["default", "cmd", "powershell", "gitbash"] as const;
const COLUMN_LINES = ["none", "solid", "dash"] as const;
const FOLDER_STYLES =["none", "brackets", "parens", "slash"] as const;

const remoteSection: { title: string; desc?: string; items: Item[] } = {
  get title() { return translate("settings.section.remote.title"); },
  get desc() { return translate("settings.section.remote.desc"); },
  items: [
    { key: "remote.auto_reconnect", get title() { return translate("settings.item.remote.auto_reconnect.title"); }, get desc() { return translate("settings.item.remote.auto_reconnect.desc"); }, control: { type: "switch" } },
    { key: "remote.servers", get title() { return translate("settings.remote.list"); }, control: { type: "remote-servers" } },
  ],
};

const twinDeckRemoteSection: { title: string; desc?: string; items: Item[] } = {
  get title() { return translate("settings.section.twindeck.title"); },
  get desc() { return translate("settings.section.twindeck.desc"); },
  items: [
    { key: "remote_server", get title() { return translate("settings.twindeck.server"); }, control: { type: "twindeck-server" } },
    { key: "remote.servers", get title() { return translate("settings.twindeck.list"); }, control: { type: "twindeck-servers" } },
  ],
};

const smbSection: { title: string; desc?: string; items: Item[] } = {
  get title() { return translate("settings.section.smb.title"); },
  get desc() { return translate("settings.section.smb.desc"); },
  items: [{ key: "smb.servers", get title() { return translate("settings.smb.list"); }, control: { type: "smb-servers" } }],
};

/** 업데이트 탭. 항목 대신 `UpdatePanel`(현재 버전·확인·설치·오픈소스 라이선스)을 그린다. */
const updateSection: { title: string; desc?: string; items: Item[] } = {
  get title() { return translate("settings.section.update.title"); },
  items: [
    { key: "environment.auto_update_check", get title() { return translate("settings.item.environment.auto_update_check.title"); }, get desc() { return translate("settings.item.environment.auto_update_check.desc"); }, control: { type: "switch" } },
  ],
};

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
      { key: "behavior.terminal_theme", get title() { return translate("settings.item.behavior.terminal_theme.title"); }, get desc() { return translate("settings.item.behavior.terminal_theme.desc"); }, get control() { return { type: "combo", options: terminalThemeChoices() } as const; } },
      { key: "behavior.terminal_font", get title() { return translate("settings.item.behavior.terminal_font.title"); }, get desc() { return translate("settings.item.behavior.terminal_font.desc"); }, control: { type: "text" } },
      { key: "behavior.text_color_dark", get title() { return translate("settings.item.behavior.text_color_dark.title"); }, get desc() { return translate("settings.item.behavior.text_color_dark.desc"); }, control: { type: "color" } },
      { key: "behavior.text_color_light", get title() { return translate("settings.item.behavior.text_color_light.title"); }, get desc() { return translate("settings.item.behavior.text_color_light.desc"); }, control: { type: "color" } },
      { key: "behavior.text_color", get title() { return translate("settings.item.behavior.text_color.title"); }, get desc() { return translate("settings.item.behavior.text_color.desc"); }, control: { type: "color" }, hideWhenEmpty: true },
      { key: "behavior.layout.pane_highlight", get title() { return translate("settings.item.behavior.layout.pane_highlight.title"); }, get desc() { return translate("settings.item.behavior.layout.pane_highlight.desc"); }, control: { type: "switch" } },
      { key: "behavior.layout.tab_style", get title() { return translate("settings.item.behavior.layout.tab_style.title"); }, get desc() { return translate("settings.item.behavior.layout.tab_style.desc"); }, control: { type: "select", options: TAB_STYLES } },
      { key: "behavior.layout.tab_position", get title() { return translate("settings.item.behavior.layout.tab_position.title"); }, get desc() { return translate("settings.item.behavior.layout.tab_position.desc"); }, control: { type: "select", options: TAB_POSITIONS } },
      { key: "behavior.layout.tab_color_terminal", get title() { return translate("settings.item.behavior.layout.tab_color_terminal.title"); }, get desc() { return translate("settings.item.behavior.layout.tab_color.desc"); }, control: { type: "tab-color" } },
      { key: "behavior.layout.tab_color_smb", get title() { return translate("settings.item.behavior.layout.tab_color_smb.title"); }, get desc() { return translate("settings.item.behavior.layout.tab_color.desc"); }, control: { type: "tab-color" } },
      { key: "behavior.layout.tab_color_remote", get title() { return translate("settings.item.behavior.layout.tab_color_remote.title"); }, get desc() { return translate("settings.item.behavior.layout.tab_color.desc"); }, control: { type: "tab-color" } },
      { key: "behavior.layout.tab_color_twindeck", get title() { return translate("settings.item.behavior.layout.tab_color_twindeck.title"); }, get desc() { return translate("settings.item.behavior.layout.tab_color.desc"); }, control: { type: "tab-color" } },
      { key: "behavior.layout.tab_close_button", get title() { return translate("settings.item.behavior.layout.tab_close_button.title"); }, get desc() { return translate("settings.item.behavior.layout.tab_close_button.desc"); }, control: { type: "switch" } },
      { key: "behavior.layout.show_action_bar", get title() { return translate("settings.item.behavior.layout.show_action_bar.title"); }, get desc() { return translate("settings.item.behavior.layout.show_action_bar.desc"); }, control: { type: "switch" } },
      { key: "behavior.layout.action_bar_by_modifier", get title() { return translate("settings.item.behavior.layout.action_bar_by_modifier.title"); }, get desc() { return translate("settings.item.behavior.layout.action_bar_by_modifier.desc"); }, control: { type: "switch" } },
      { key: "behavior.layout.show_folder_tree", get title() { return translate("settings.item.behavior.layout.show_folder_tree.title"); }, get desc() { return translate("settings.item.behavior.layout.show_folder_tree.desc"); }, control: { type: "switch" } },
      { key: "behavior.layout.show_command_line", get title() { return translate("settings.item.behavior.layout.show_command_line.title"); }, get desc() { return translate("settings.item.behavior.layout.show_command_line.desc"); }, control: { type: "switch" } },
      { key: "behavior.layout.show_drive_bar", get title() { return translate("settings.item.behavior.layout.show_drive_bar.title"); }, get desc() { return translate("settings.item.behavior.layout.show_drive_bar.desc"); }, control: { type: "switch" } },
    ],
  },
  {
    get title() { return translate("settings.section.list.title"); },
    items: [
      { key: "behavior.table.icon_size", get title() { return translate("settings.item.behavior.table.icon_size.title"); }, get desc() { return translate("settings.item.behavior.table.icon_size.desc"); }, control: { type: "int" } },
      { key: "behavior.table.system_icons", get title() { return translate("settings.item.behavior.table.system_icons.title"); }, get desc() { return translate("settings.item.behavior.table.system_icons.desc"); }, control: { type: "switch" } },
      { key: "behavior.table.zebra_rows", get title() { return translate("settings.item.behavior.table.zebra_rows.title"); }, get desc() { return translate("settings.item.behavior.table.zebra_rows.desc"); }, control: { type: "switch" } },
      { key: "behavior.table.show_marks", get title() { return translate("settings.item.behavior.table.show_marks.title"); }, get desc() { return translate("settings.item.behavior.table.show_marks.desc"); }, control: { type: "switch" } },
      { key: "behavior.table.folder_style", get title() { return translate("settings.item.behavior.table.folder_style.title"); }, get desc() { return translate("settings.item.behavior.table.folder_style.desc"); }, control: { type: "select", options: FOLDER_STYLES } },
      { key: "behavior.table.column_lines", get title() { return translate("settings.item.behavior.table.column_lines.title"); }, get desc() { return translate("settings.item.behavior.table.column_lines.desc"); }, control: { type: "select", options: COLUMN_LINES } },
      { key: "view.table.columns", get title() { return translate("settings.extension_column.title"); }, get desc() { return translate("settings.extension_column.desc"); }, control: { type: "extension-column" } },
      { key: "behavior.table.keep_extension", get title() { return translate("settings.item.behavior.table.keep_extension.title"); }, get desc() { return translate("settings.item.behavior.table.keep_extension.desc"); }, control: { type: "switch" } },
      { key: "behavior.table.cursor_fill", get title() { return translate("settings.item.behavior.table.cursor_fill.title"); }, get desc() { return translate("settings.item.behavior.table.cursor_fill.desc"); }, control: { type: "switch" } },
      { key: "behavior.table.show_parent_row", get title() { return translate("settings.item.behavior.table.show_parent_row.title"); }, get desc() { return translate("settings.item.behavior.table.show_parent_row.desc"); }, control: { type: "switch" } },
      { key: "behavior.table.group_by_modified", get title() { return translate("settings.item.behavior.table.group_by_modified.title"); }, get desc() { return translate("settings.item.behavior.table.group_by_modified.desc"); }, control: { type: "switch" } },
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
    items: [
      { key: "environment.text_editor", get title() { return translate("settings.item.environment.text_editor.title"); }, get desc() { return translate("settings.item.environment.text_editor.desc"); }, control: { type: "text" } },
      { key: "environment.terminal", get title() { return translate("settings.item.environment.terminal.title"); }, get desc() { return translate("settings.item.environment.terminal.desc"); }, control: { type: "select", options: TERMINAL_SHELLS } , hideOn: ["mac", "linux"] }, // Windows에서만 쓰는 설정이다
      { key: "environment.single_instance", get title() { return translate("settings.item.environment.single_instance.title"); }, get desc() { return translate("settings.item.environment.single_instance.desc"); }, control: { type: "switch" } },
      { key: "environment.background_on_close", get title() { return translate("settings.item.environment.background_on_close.title"); }, get desc() { return translate("settings.item.environment.background_on_close.desc"); }, control: { type: "switch" }, hideOn: ["windows", "linux"] }, // Dock이 있는 macOS에서만 쓴다
      { key: "environment.global_hotkey_enabled", get title() { return translate("settings.item.environment.global_hotkey_enabled.title"); }, get desc() { return translate("settings.item.environment.global_hotkey_enabled.desc"); }, control: { type: "switch" } },
      { key: "environment.global_hotkey", get title() { return translate("settings.item.environment.global_hotkey.title"); }, get desc() { return translate("settings.item.environment.global_hotkey.desc"); }, control: { type: "hotkey" } },
      { key: "behavior.layout.recent_limit", get title() { return translate("settings.item.behavior.layout.recent_limit.title"); }, get desc() { return translate("settings.item.behavior.layout.recent_limit.desc"); }, control: { type: "int" } },
    ],
  },
  updateSection,
  smbSection,
  remoteSection,
  twinDeckRemoteSection,
];

/**
 * 설정 탭을 묶는 그룹. `count`는 SECTIONS 앞에서부터 이어서 센 개수라 순서는 SECTIONS 그대로 두고(탭 번호 `settingsSection`이 그대로다) 제목만 끼운다.
 * 합이 SECTIONS.length와 같아야 한다(어긋나면 테스트가 잡는다). 새 탭은 어울리는 그룹의 `count`를 올리고 SECTIONS에 같은 자리로 넣는다.
 */
export const SECTION_GROUPS: { titleKey: Key; count: number }[] = [
  { titleKey: "settings.group.view", count: 4 },
  { titleKey: "settings.group.behavior", count: 3 },
  { titleKey: "settings.group.system", count: 2 },
  { titleKey: "settings.group.connection", count: 3 },
];

/** 업데이트 탭의 순번. 업데이트 확인 액션이 이 탭을 연다. */
export const UPDATE_SECTION = SECTIONS.indexOf(updateSection);
/** SMB 서버 탭의 순번. `api.openSettings(SMB_SECTION)`으로 이 탭을 바로 연다. */
export const SMB_SECTION = SECTIONS.indexOf(smbSection);
/** 원격(SFTP·FTP) 서버 탭의 순번. `api.openSettings(REMOTE_SECTION)`으로 이 탭을 바로 연다. */
export const REMOTE_SECTION = SECTIONS.indexOf(remoteSection);
/** Twin Deck Remote 탭의 순번. */
export const TWIN_DECK_REMOTE_SECTION = SECTIONS.indexOf(twinDeckRemoteSection);

const valueAt = (obj: unknown, key: string): unknown => key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);

/** 입력창은 Enter나 포커스를 벗어날 때 저장한다(글자마다 저장하면 쓰다 만 값이 파일에 남는다). */
function EditableControl({ item, value, disabled, onCommit }: { item: Item; value: string | number; disabled: boolean; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    if (draft !== String(value) && draft.trim() !== "") onCommit(draft);
    else setDraft(String(value));
  };
  const input = (
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
  // 글자 입력은 줄에서 남는 폭을 모두 쓴다(입력 컴포넌트가 내용 폭으로 줄어들지 않게 감싼다). 숫자 입력은 고정 폭이다.
  return item.control.type === "text" ? <div className="min-w-0 flex-1">{input}</div> : input;
}

const TAB_COLOR_MODES = ["auto", "off", "custom"] as const;

/**
 * 특수 탭 색(이슈 #92): 자동·끔·직접 지정. 직접 지정으로 바꾸면 지금 보이는 자동 색에서 시작하고 색 한 칸을 함께 보인다.
 * 색 칸을 지우면 자동으로 돌아간다.
 */
function TabColorControl({ item, value, disabled, onCommit }: { item: Item; value: string; disabled: boolean; onCommit: (v: string) => void }) {
  const t = useT();
  const mode = value === "auto" || value === "off" ? value : "custom";
  const start = () => {
    const kind = item.key.slice(item.key.lastIndexOf("_") + 1);
    const auto = getComputedStyle(document.documentElement).getPropertyValue(`--tab-${kind}-fill`).trim();
    return /^#[0-9a-fA-F]{6}$/.test(auto) ? auto : "#808080";
  };
  return (
    <div className="flex items-center gap-2">
      <Select value={mode} disabled={disabled} onChange={(m) => m !== mode && onCommit(m === "custom" ? start() : m)}>
        {TAB_COLOR_MODES.map((m) => (
          <SelectOption key={m} value={m}>
            {t(`settings.tab_color.${m}`)}
          </SelectOption>
        ))}
      </Select>
      {mode === "custom" && <ColorControl item={item} value={value} disabled={disabled} onCommit={(v) => onCommit(v || "auto")} />}
    </div>
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
    // F키 줄의 둘째 줄: 동작 상자와 (앱 실행 동작이면) 앱 경로 입력이 나란히 남는 폭을 반씩 쓴다. 첫 줄은 제목·되돌리기·액션바 스위치다.
    <div className="col-span-full row-start-2 flex min-w-0 items-center gap-2">
      <Combobox
        className="min-w-0 flex-1 basis-0"
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

/** `Mod`는 macOS에서 Cmd로 보여 준다. */
const modifierLabel = (m: string, platform: Platform) => (m === "Mod" && platform === "mac" ? "Cmd" : m);
/** Windows·Linux에서는 `Mod`가 `Ctrl`과 같은 키라 `Mod` 체크는 숨긴다. */
const modifiersFor = (platform: Platform) => (platform === "mac" ? MODIFIERS : MODIFIERS.filter((m) => m !== "Mod"));

/** 조합키 F키 항목 추가: F키 + 수식키(Mod/Ctrl/Alt/Shift)를 골라 `fkeys`에 빈 항목으로 만든다. 같은 조합은 한 번만. */
function FKeyAdder({ disabled }: { disabled: boolean }) {
  const t = useT();
  const { platform } = useUi();
  const { api } = useAppStore();
  const existing = useApp((s) => s.loaded.config.fkeys);
  const [f, setF] = useState("F1");
  const [mods, setMods] = useState<string[]>([]);
  const key = [...MODIFIERS.filter((m) => mods.includes(m)), f].join("+");
  const duplicate = key in existing || (platform !== "mac" && key.replace("Ctrl", "Mod") in existing);
  return (
    <div role="group" aria-label={t("settings.fkey.add_combo")} className="flex flex-wrap items-center gap-3 py-2.5">
      <select aria-label={t("settings.section.fkeys.title")} value={f} disabled={disabled} onChange={(e) => setF(e.target.value)} className="rounded border border-app-line bg-app-box px-2 py-1 text-sm">
        {Array.from({ length: 12 }, (_, i) => `F${i + 1}`).map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      {modifiersFor(platform).map((m) => (
        <label key={m} className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            aria-label={modifierLabel(m, platform)}
            checked={mods.includes(m)}
            disabled={disabled}
            onChange={(e) => setMods(e.target.checked ? [...mods, m] : mods.filter((x) => x !== m))}
          />
          {modifierLabel(m, platform)}
        </label>
      ))}
      <Button type="button" variant="gray" size="sm" disabled={disabled || mods.length === 0 || duplicate} onClick={() => void api.setConfigValue(`fkeys.${key}`, { kind: "str", value: "" })}>
        {t("settings.fkey.add")}
      </Button>
      {duplicate && mods.length > 0 && <span className="text-xs text-status-error">{t("settings.fkey.duplicate")}</span>}
    </div>
  );
}

const HOTKEY_KEYS = [...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)), ...Array.from({ length: 10 }, (_, i) => String(i)), ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`)];
const isFKey = (k: string) => /^F\d+$/.test(k);

/** `Mod+Alt+O`을 (수식키, 키)로 푼다. 수식키 순서가 다르거나 목록에 없는 키면 `null`. */
function parseHotkey(value: string, platform: Platform): { mods: string[]; key: string } | null {
  const parts = value.split("+");
  const key = parts.pop() ?? "";
  if (!HOTKEY_KEYS.includes(key) || parts.some((m) => !(MODIFIERS as readonly string[]).includes(m))) return null;
  // Windows·Linux에서는 `Mod`를 `Ctrl`과 같은 체크로 보여 준다.
  const mods = platform === "mac" ? parts : [...new Set(parts.map((m) => (m === "Mod" ? "Ctrl" : m)))];
  return { mods, key };
}

/** 전역 화면 열기 단축키: 수식키 체크 + 키 선택 상자. 글자·숫자는 수식키가 하나 이상일 때만 저장하고, 목록에 없는 값은 고르기 전까지 그대로 둔다. */
function HotkeyControl({ name, value, disabled, onCommit }: { name: string; value: string; disabled: boolean; onCommit: (v: string) => void }) {
  const t = useT();
  const { platform } = useUi();
  const parsed = parseHotkey(value, platform);
  const [mods, setMods] = useState<string[]>(parsed?.mods ?? []);
  const [key, setKey] = useState(parsed?.key ?? "");
  useEffect(() => {
    const p = parseHotkey(value, platform);
    if (p) {
      setMods(p.mods);
      setKey(p.key);
    } else {
      setKey("");
      if (value !== "") setMods([]);
    }
  }, [value, platform]);
  const change = (nextMods: string[], nextKey: string) => {
    setMods(nextMods);
    setKey(nextKey);
    if (nextKey === "") return nextKey !== key ? onCommit("") : undefined;
    if (nextMods.length === 0 && !isFKey(nextKey)) return;
    onCommit([...MODIFIERS.filter((m) => nextMods.includes(m)), nextKey].join("+"));
  };
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {modifiersFor(platform).map((m) => (
        <label key={m} className="flex items-center gap-1 text-sm">
          <input type="checkbox" aria-label={modifierLabel(m, platform)} checked={mods.includes(m)} disabled={disabled} onChange={(e) => change(e.target.checked ? [...mods, m] : mods.filter((x) => x !== m), key)} />
          {modifierLabel(m, platform)}
        </label>
      ))}
      <select aria-label={name} value={key} disabled={disabled} onChange={(e) => change(mods, e.target.value)} className="rounded border border-app-line bg-app-box px-2 py-1 text-sm">
        <option value="">{t("settings.hotkey.none")}</option>
        {HOTKEY_KEYS.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      {value !== "" && !parsed && <span className="text-xs text-ink-faint">{t("settings.hotkey.unlisted", { value })}</span>}
      {key !== "" && !isFKey(key) && mods.length === 0 && <span className="text-xs text-status-error">{t("settings.hotkey.needs_modifier")}</span>}
    </div>
  );
}

/**
 * 서버 입력 창. 설정 화면의 좁은 칸 대신 가운데에 띄운다. 키 입력은 설정 화면(바깥)으로 새지 않게 여기서 멈추고,
 * Esc·바깥 클릭·닫기로 닫는다. 입력한 값은 닫아도 목록 초안에 남고, 파일에는 바깥의 "저장"을 눌러야 쓴다.
 * 업데이트 탭의 설치 확인(`footer`로 버튼을 바꾼다)과 오픈소스 라이선스(`wide`로 창 대부분을 쓴다)도 이 창을 쓴다.
 */
function ServerModal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const t = useT();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // 입력 칸이 없으면 창 자체에 포커스를 둬야 Esc가 설정 화면까지 가지 않는다.
    (root.current?.querySelector<HTMLElement>("input, select") ?? root.current)?.focus();
  }, []);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={"flex max-h-full max-w-full flex-col gap-3 overflow-auto rounded border border-app-line bg-app-box p-4 text-sm shadow-lg outline-none " + (wide ? "h-[90vh] w-[90vw]" : "w-[32rem]")}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape" && !e.nativeEvent.isComposing) onClose();
        }}
      >
        <h2 className="font-semibold">{title}</h2>
        {children}
        <div className="flex justify-end gap-2">
          {footer ?? (
            <Button type="button" size="sm" variant="accent" onClick={onClose}>
              {t("common.close")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 입력에서 마지막 글자(자소 묶음) 하나만 남긴다. 이모지 선택기로 새로 고르면 이전 아이콘을 바꾼다. */
function lastGrapheme(value: string): string {
  const parts = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value.trim())];
  return parts.length > 0 ? parts[parts.length - 1].segment : "";
}

/** 이모지 팝업의 크기(px). 아이콘 칸 아래에 둘 자리가 모자라면 위로 올려 그린다. */
const EMOJI_POPUP = { w: 320, h: 300 };

/**
 * 연결 항목의 이모지 한 칸(이슈 #93). 연결 메뉴·드라이브 바·경로 표시줄·탭 이름 앞에 붙는다.
 * 칸을 누르면 `frimousse` 이모지 선택기가 팝업으로 뜬다. 편집 창의 크기·스크롤을 바꾸지 않도록 `body`로 포털해 `fixed`로 그린다.
 * 이모지 데이터는 앱에 들어 있다(`public/emojibase`, 인터넷 요청 없음). 목록에 없는 이모지는 칸에 직접 넣는다(포커스는 칸에 남는다).
 */
function IconField({ value, disabled, onChange, onDone }: { value: string; disabled: boolean; onChange: (v: string) => void; onDone: () => void }) {
  const t = useT();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  // 고른 뒤 포커스를 칸으로 돌릴 때 그 포커스가 팝업을 다시 열지 않게 한 번 건너뛴다.
  const skipOpen = useRef(false);
  const open = () => {
    const r = input.current?.getBoundingClientRect();
    if (!r) return;
    const below = r.bottom + 4;
    const top = below + EMOJI_POPUP.h > window.innerHeight ? Math.max(4, r.top - EMOJI_POPUP.h - 4) : below;
    setPos({ top, left: Math.max(4, Math.min(r.left, window.innerWidth - EMOJI_POPUP.w - 4)) });
  };
  const close = () => {
    setPos(null);
    skipOpen.current = true;
    input.current?.focus();
  };
  useEffect(() => {
    if (!pos) return;
    const away = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!wrap.current?.contains(target) && !popup.current?.contains(target)) setPos(null);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [pos]);
  const pick = (emoji: string) => {
    onChange(emoji);
    close();
  };
  return (
    <div
      ref={wrap}
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
      onKeyDown={(e) => {
        // 팝업이 열려 있으면 Esc는 팝업만 닫는다(편집 창까지 닫지 않는다). 팝업은 포털이지만 React 이벤트는 여기까지 올라온다.
        if (pos && e.key === "Escape" && !e.nativeEvent.isComposing) {
          e.stopPropagation();
          close();
        }
      }}
    >
      <span className="w-24 shrink-0">{t("settings.server.icon")}</span>
      <Input
        ref={input}
        aria-label={t("settings.server.icon")}
        type="text"
        size="sm"
        className="w-16"
        value={value}
        disabled={disabled}
        placeholder="🙂"
        onChange={(e) => onChange(lastGrapheme(e.target.value))}
        onClick={open}
        onFocus={() => {
          if (skipOpen.current) skipOpen.current = false;
          else open();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") onDone();
        }}
      />
      <span className="text-xs text-ink-faint">{t("settings.server.icon_hint")}</span>
      {pos &&
        !disabled &&
        createPortal(
          <div
            ref={popup}
            role="dialog"
            aria-label={t("settings.server.icon_picker")}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: EMOJI_POPUP.w, height: EMOJI_POPUP.h }}
            className="z-[60] flex flex-col overflow-hidden rounded border border-app-line bg-app-box text-sm shadow-lg"
          >
            <EmojiPicker.Root
              locale={currentLanguage() === "en" ? "en" : "ko"}
              emojibaseUrl="/emojibase"
              columns={8}
              onEmojiSelect={(e) => pick(e.emoji)}
              className="flex min-h-0 flex-1 flex-col"
            >
              <EmojiPicker.Search aria-label={t("settings.server.icon_search")} placeholder={t("settings.server.icon_search")} className="m-2 rounded border border-app-line bg-app-dark-box px-2 py-1 outline-none" />
              <EmojiPicker.Viewport className="relative min-h-0 flex-1 overflow-y-auto">
                <EmojiPicker.Loading className="absolute inset-0 flex items-center justify-center text-ink-faint">{t("settings.server.icon_loading")}</EmojiPicker.Loading>
                <EmojiPicker.Empty className="absolute inset-0 flex items-center justify-center text-ink-faint">{t("settings.server.icon_empty")}</EmojiPicker.Empty>
                <EmojiPicker.List
                  className="select-none pb-1"
                  components={{
                    CategoryHeader: ({ category, ...props }) => (
                      <div {...props} className="bg-app-box px-2 py-1 text-xs font-semibold text-ink-faint">
                        {category.label}
                      </div>
                    ),
                    Row: ({ children, ...props }) => (
                      <div {...props} className="scroll-my-1 px-1">
                        {children}
                      </div>
                    ),
                    Emoji: ({ emoji, ...props }) => (
                      <button {...props} className="flex size-9 items-center justify-center rounded text-xl data-[active]:bg-app-selected">
                        {emoji.emoji}
                      </button>
                    ),
                  }}
                />
              </EmojiPicker.Viewport>
            </EmojiPicker.Root>
            <div className="flex justify-end border-t border-app-line p-1.5">
              <Button type="button" size="sm" variant="gray" onClick={() => pick("")}>
                {t("settings.server.icon_clear")}
              </Button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

const EMPTY_SMB: SmbServer = { name: "", host: "", share: "", user: "" };
const SMB_FIELDS = ["name", "host", "share", "user"] as const;

/**
 * 저장된 SMB 서버 목록과 선택 항목 편집 폼. 다른 항목과 달리 바꾸는 즉시 저장하지 않고 "저장"을 눌러 목록 전체를 쓴다
 * (항목 하나를 쓰다 만 상태로 host·share가 비면 저장이 거부되기 때문이다). 비밀번호는 여기서 받지 않고 지우기만 한다.
 */
function SmbServersControl({ label, disabled }: { label: string; disabled: boolean }) {
  const t = useT();
  const { api } = useAppStore();
  const saved = useApp((s) => s.loaded.config.smb.servers ?? []);
  const [draft, setDraft] = useState<SmbServer[]>(saved);
  const [selected, setSelected] = useState(0);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  // 저장하면(또는 설정 파일이 밖에서 바뀌면) 새 목록으로 다시 시작한다.
  const savedKey = JSON.stringify(saved);
  useEffect(() => {
    setDraft(JSON.parse(savedKey) as SmbServer[]);
    setSelected((i) => Math.min(i, Math.max(0, (JSON.parse(savedKey) as SmbServer[]).length - 1)));
  }, [savedKey]);
  const dirty = JSON.stringify(draft) !== savedKey;
  const current = draft[selected] as SmbServer | undefined;
  const edit = (field: (typeof SMB_FIELDS)[number] | "icon", value: string) => {
    setDraft(draft.map((s, i) => (i === selected ? { ...s, [field]: value } : s)));
    setInvalid(null);
    setNotice(null);
  };
  const save = async () => {
    const bad = draft.findIndex((s) => !s.host.trim() || !s.share.trim());
    if (bad >= 0) {
      setSelected(bad);
      setInvalid(t("settings.smb.required", { n: bad + 1 }));
      return false;
    }
    setInvalid(null);
    await api.setSmbServers(draft);
    return true;
  };
  // 비밀번호는 저장된 항목 순번으로 지운다. 저장 전 변경이 있으면 순번이 어긋날 수 있어 막는다.
  const canForget = !disabled && !dirty && !!current?.user;
  // 연결을 누르면 (저장 전 변경이 있으면 먼저 저장하고) 설정 화면을 닫고, 설정이 덮고 있던 그 패널에서 연결한다. 저장이 거부되면 닫지도 연결하지도 않는다.
  const settingsPane = useApp((s) => s.settingsPane);
  const canConnect = !disabled && !!current;
  return (
    <div role="group" aria-label={label} className="flex min-h-0 flex-1 flex-col gap-3 py-2.5">
      <ul role="listbox" aria-label={label} className="min-h-[12rem] flex-1 overflow-auto rounded border border-app-line">
        {draft.length === 0 && <li className="px-2 py-1.5 text-xs text-ink-faint">{t("settings.smb.empty")}</li>}
        {draft.map((s, i) => (
          <li
            key={i}
            role="option"
            aria-selected={i === selected}
            tabIndex={0}
            onClick={() => setSelected(i)}
            onDoubleClick={() => {
              setSelected(i);
              setEditing(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setSelected(i);
            }}
            className={"cursor-default px-2 py-1.5 text-sm " + (i === selected ? "bg-app-selected" : "hover:bg-app-hover")}
          >
            <div className="truncate">{withIcon(s.icon, s.name || `${s.host}/${s.share}`)}</div>
            <div className="truncate text-xs text-ink-faint">
              {s.host}/{s.share}
              {s.user ? ` · ${s.user}` : ""}
            </div>
          </li>
        ))}
      </ul>
      {(invalid || notice || dirty) && (
        <div className="flex items-center gap-3">
          {invalid && <span className="text-xs text-status-error">{invalid}</span>}
          {!invalid && notice && <span role="status" className="text-xs text-ink-dull">{notice}</span>}
          {!invalid && !notice && dirty && <span className="text-xs text-ink-faint">{t("settings.smb.unsaved")}</span>}
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="gray"
            disabled={disabled}
            onClick={() => {
              setDraft([...draft, { ...EMPTY_SMB }]);
              setSelected(draft.length);
              setEditing(true);
              setNotice(null);
            }}
          >
            {t("settings.smb.add")}
          </Button>
          <Button type="button" size="sm" variant="gray" disabled={disabled || !current} onClick={() => setEditing(true)}>
            {t("settings.smb.edit")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="gray"
            disabled={disabled || !current}
            onClick={() => {
              if (!current) return;
              // 선택한 항목 바로 뒤에 같은 내용으로 복제한다. 이름이 있으면 구분되게 "(복사)"를 붙인다.
              const copy = { ...current, name: current.name ? `${current.name} ${t("settings.smb.copy_suffix")}` : "" };
              setDraft([...draft.slice(0, selected + 1), copy, ...draft.slice(selected + 1)]);
              setSelected(selected + 1);
              setInvalid(null);
              setNotice(null);
            }}
          >
            {t("settings.smb.duplicate")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="gray"
            disabled={disabled || !current}
            onClick={() => {
              setDraft(draft.filter((_, i) => i !== selected));
              setSelected(Math.max(0, selected - 1));
              setInvalid(null);
              setNotice(null);
            }}
          >
            {t("settings.smb.delete")}
          </Button>
        </div>
        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            size="sm"
            variant="gray"
            disabled={!canConnect}
            onClick={() =>
              void (async () => {
                if (dirty && !(await save())) return;
                api.closeSettings();
                await api.connectSmb(settingsPane, selected);
              })()
            }
          >
            {t("settings.smb.connect")}
          </Button>
          <Button type="button" size="sm" variant="accent" disabled={disabled || !dirty} onClick={() => void save()}>
            {t("settings.smb.save")}
          </Button>
        </div>
      </div>
      {editing && current && (
        <ServerModal title={t("settings.smb.edit_title")} onClose={() => setEditing(false)}>
          <div className="flex flex-col gap-2">
            {SMB_FIELDS.map((field) => (
              <label key={field} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="w-24 shrink-0">{t(`settings.smb.${field}`)}</span>
                <Input
                  aria-label={t(`settings.smb.${field}`)}
                  type="text"
                  size="sm"
                  className="min-w-[12rem] flex-1"
                  value={current[field]}
                  disabled={disabled}
                  placeholder={field === "name" ? t("settings.smb.name_placeholder") : field === "user" ? t("settings.smb.user_placeholder") : field === "host" ? "nas.local" : "share"}
                  onChange={(e) => edit(field, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setEditing(false);
                  }}
                />
              </label>
            ))}
            <IconField value={current.icon ?? ""} disabled={disabled} onChange={(v) => edit("icon", v)} onDone={() => setEditing(false)} />
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="gray"
                disabled={!canForget}
                onClick={() =>
                  void api.smbForgetPassword(selected).then((ok) => {
                    if (ok) setNotice(t("settings.smb.forgotten"));
                  })
                }
              >
                {t("settings.smb.forget")}
              </Button>
            </div>
          </div>
        </ServerModal>
      )}
    </div>
  );
}

const EMPTY_REMOTE: RemoteServer = { name: "", protocol: "sftp", host: "", port: 0, user: "", base_dir: "" };
const REMOTE_TEXT_FIELDS = ["name", "host", "user", "base_dir"] as const;

/**
 * 저장된 원격(SFTP·FTP) 서버 목록과 선택 항목 편집 폼. SMB 목록처럼 "저장"을 눌러 목록 전체를 쓴다.
 * 비밀번호는 여기서 받지 않고 지우기만 한다(연결할 때 묻고, 기억하면 OS 키체인에 둔다). FTP 항목에는 암호화되지 않는다는 경고를 보인다.
 */
function RemoteServersControl({
  label,
  disabled,
  protocols = ["sftp", "ftp"],
  addProtocol = "sftp",
}: {
  label: string;
  disabled: boolean;
  /** 이 편집기가 다루는 protocol. 목록에는 이것만 보이고, 나머지 항목은 저장할 때 그대로 보존된다. */
  protocols?: readonly string[];
  /** "추가"로 만드는 항목의 protocol. */
  addProtocol?: string;
}) {
  const t = useT();
  const { api } = useAppStore();
  const saved = useApp((s) => s.loaded.config.remote.servers ?? []);
  const [draft, setDraft] = useState<RemoteServer[]>(saved);
  // 목록 전체(draft)를 한 번에 저장하므로 선택은 전체 목록의 순번이고, 이 편집기의 protocol이 아닌 항목은 보이지 않을 뿐 그대로 둔다.
  const visibleOf = (list: RemoteServer[]) => list.flatMap((s, i) => (protocols.includes(s.protocol) ? [i] : []));
  const [selected, setSelected] = useState(() => visibleOf(saved)[0] ?? -1);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const savedKey = JSON.stringify(saved);
  useEffect(() => {
    const next = JSON.parse(savedKey) as RemoteServer[];
    setDraft(next);
    setSelected((i) => (visibleOf(next).includes(i) ? i : (visibleOf(next)[0] ?? -1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);
  const dirty = JSON.stringify(draft) !== savedKey;
  const current = (selected >= 0 ? draft[selected] : undefined) as RemoteServer | undefined;
  const visible = visibleOf(draft);
  const patch = (change: Partial<RemoteServer>) => {
    setDraft(draft.map((s, i) => (i === selected ? { ...s, ...change } : s)));
    setInvalid(null);
    setNotice(null);
  };
  const save = async () => {
    const bad = draft.findIndex((s) => protocols.includes(s.protocol) && !s.host.trim());
    if (bad >= 0) {
      setSelected(bad);
      setInvalid(t("settings.remote.required", { n: visible.indexOf(bad) + 1 }));
      return false;
    }
    const badPort = draft.findIndex((s) => protocols.includes(s.protocol) && (!Number.isInteger(s.port) || s.port < 0 || s.port > 65535));
    if (badPort >= 0) {
      setSelected(badPort);
      setInvalid(t("settings.remote.bad_port", { n: visible.indexOf(badPort) + 1 }));
      return false;
    }
    setInvalid(null);
    await api.setRemoteServers(draft);
    return true;
  };
  const defaultPort = (p: string) => (p === "ftp" ? 21 : p === "twindeck" ? 2222 : 22);
  const canForget = !disabled && !dirty && !!current?.user;
  // 연결을 누르면 (저장 전 변경이 있으면 먼저 저장하고) 설정 화면을 닫고, 설정이 덮고 있던 그 패널에서 연결한다. 저장이 거부되면 닫지도 연결하지도 않는다.
  const settingsPane = useApp((s) => s.settingsPane);
  const canConnect = !disabled && !!current;
  return (
    <div role="group" aria-label={label} className="flex min-h-0 flex-1 flex-col gap-3 py-2.5">
      <ul role="listbox" aria-label={label} className="min-h-[12rem] flex-1 overflow-auto rounded border border-app-line">
        {visible.length === 0 && <li className="px-2 py-1.5 text-xs text-ink-faint">{t("settings.remote.empty")}</li>}
        {draft.map((s, i) => !protocols.includes(s.protocol) ? null : (
          <li
            key={i}
            role="option"
            aria-selected={i === selected}
            tabIndex={0}
            onClick={() => setSelected(i)}
            onDoubleClick={() => {
              setSelected(i);
              setEditing(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setSelected(i);
            }}
            className={"cursor-default px-2 py-1.5 text-sm " + (i === selected ? "bg-app-selected" : "hover:bg-app-hover")}
          >
            <div className="truncate">{withIcon(s.icon, s.name || (s.user ? `${s.user}@${s.host}` : s.host))}</div>
            <div className="truncate text-xs text-ink-faint">
              {s.protocol.toUpperCase()} · {s.host}
              {s.port ? `:${s.port}` : ""}
            </div>
          </li>
        ))}
      </ul>
      {(invalid || notice || dirty) && (
        <div className="flex items-center gap-3">
          {invalid && <span className="text-xs text-status-error">{invalid}</span>}
          {!invalid && notice && <span role="status" className="text-xs text-ink-dull">{notice}</span>}
          {!invalid && !notice && dirty && <span className="text-xs text-ink-faint">{t("settings.remote.unsaved")}</span>}
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="gray"
            disabled={disabled}
            onClick={() => {
              setDraft([...draft, { ...EMPTY_REMOTE, protocol: addProtocol }]);
              setSelected(draft.length);
              setEditing(true);
              setNotice(null);
            }}
          >
            {t("settings.remote.add")}
          </Button>
          <Button type="button" size="sm" variant="gray" disabled={disabled || !current} onClick={() => setEditing(true)}>
            {t("settings.remote.edit")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="gray"
            disabled={disabled || !current}
            onClick={() => {
              if (!current) return;
              // 선택한 항목 바로 뒤에 같은 내용으로 복제한다. 이름이 있으면 구분되게 "(복사)"를 붙인다.
              const copy = { ...current, name: current.name ? `${current.name} ${t("settings.remote.copy_suffix")}` : "" };
              setDraft([...draft.slice(0, selected + 1), copy, ...draft.slice(selected + 1)]);
              setSelected(selected + 1);
              setInvalid(null);
              setNotice(null);
            }}
          >
            {t("settings.remote.duplicate")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="gray"
            disabled={disabled || !current}
            onClick={() => {
              const next = draft.filter((_, i) => i !== selected);
              const left = visibleOf(next);
              setDraft(next);
              setSelected(left.filter((i) => i < selected).pop() ?? left[0] ?? -1);
              setInvalid(null);
              setNotice(null);
            }}
          >
            {t("settings.remote.delete")}
          </Button>
        </div>
        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            size="sm"
            variant="gray"
            disabled={!canConnect}
            onClick={() =>
              void (async () => {
                if (dirty && !(await save())) return;
                api.closeSettings();
                await api.connectRemote(settingsPane, selected);
              })()
            }
          >
            {t("settings.remote.connect")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="gray"
            disabled={!canConnect || current?.protocol !== "sftp"}
            onClick={() =>
              void (async () => {
                if (dirty && !(await save())) return;
                api.closeSettings();
                await api.connectRemoteTerminal(settingsPane, selected);
              })()
            }
          >
            {t("settings.remote.connect_terminal")}
          </Button>
          <Button type="button" size="sm" variant="accent" disabled={disabled || !dirty} onClick={() => void save()}>
            {t("settings.remote.save")}
          </Button>
        </div>
      </div>
      {editing && current && (
        <ServerModal title={t(current.protocol === "twindeck" ? "settings.twindeck.edit_title" : "settings.remote.edit_title")} onClose={() => setEditing(false)}>
          <div className="flex flex-col gap-2">
            {protocols.length > 1 && <label className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="w-24 shrink-0">{t("settings.remote.protocol")}</span>
              <select
                aria-label={t("settings.remote.protocol")}
                value={current.protocol}
                disabled={disabled}
                onChange={(e) => patch({ protocol: e.target.value })}
                className="rounded border border-app-line bg-app-box px-2 py-1 text-sm"
              >
                <option value="sftp">SFTP</option>
                <option value="ftp">FTP</option>
              </select>
            </label>}
            {current.protocol === "sftp" && <p role="note" className="text-xs text-ink-dull">{t("settings.remote.sftp_warning")}</p>}
            {current.protocol === "ftp" && (
              <p role="note" className="text-xs text-status-error">
                {t("settings.remote.ftp_warning")}
              </p>
            )}
            {REMOTE_TEXT_FIELDS.filter((field) => !(field === "base_dir" && current.protocol === "twindeck")).map((field) => (
              <label key={field} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="w-24 shrink-0">{t(`settings.remote.${field}`)}</span>
                <Input
                  aria-label={t(`settings.remote.${field}`)}
                  type="text"
                  size="sm"
                  className="min-w-[12rem] flex-1"
                  value={current[field]}
                  disabled={disabled}
                  placeholder={
                    field === "name"
                      ? t("settings.remote.name_placeholder")
                      : field === "user"
                        ? t(current.protocol === "ftp" ? "settings.remote.user_placeholder_ftp" : "settings.remote.user_placeholder")
                        : field === "host"
                          ? "files.example.com"
                          : t("settings.remote.base_dir_placeholder")
                  }
                  onChange={(e) => patch({ [field]: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setEditing(false);
                  }}
                />
              </label>
            ))}
            <IconField value={current.icon ?? ""} disabled={disabled} onChange={(v) => patch({ icon: v })} onDone={() => setEditing(false)} />
            <label className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="w-24 shrink-0">{t("settings.remote.port")}</span>
              <Input
                aria-label={t("settings.remote.port")}
                type="text"
                inputMode="numeric"
                size="sm"
                className="min-w-[12rem] flex-1"
                value={current.port ? String(current.port) : ""}
                disabled={disabled}
                placeholder={String(defaultPort(current.protocol))}
                onChange={(e) => patch({ port: Number(e.target.value.replace(/\D/g, "")) || 0 })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setEditing(false);
                }}
              />
            </label>
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="gray"
                disabled={!canForget}
                onClick={() =>
                  void api.remoteForgetPassword(selected).then((ok) => {
                    if (ok) setNotice(t("settings.remote.forgotten"));
                  })
                }
              >
                {t("settings.remote.forget")}
              </Button>
            </div>
          </div>
        </ServerModal>
      )}
    </div>
  );
}

const TD_REMOTE_KEYS = ["bind", "port", "root", "user"] as const;

/**
 * 내장 서버(Twin Deck Remote) 영역. 켜기·끄기는 Backend를 바로 부르고(설정의 `enabled`도 함께 맞춰 다음 실행에도 이어진다),
 * 수신 주소·포트·루트·사용자·쓰기·셸은 설정 키로 저장한다. 켜져 있는 동안 바꾼 값은 서버를 다시 켜야 적용되므로 안내만 보인다(자동 재시작은 하지 않는다).
 * 비밀번호는 입력창에서 받아 키체인으로만 보내고, 상태에는 설정 여부만 있어 화면에 되돌려 보이지 않는다.
 */
function TwinDeckServerControl({ label, disabled }: { label: string; disabled: boolean }) {
  const t = useT();
  const { api, backend } = useAppStore();
  const cfg = useApp((s) => s.loaded.config.remote_server);
  const [status, setStatus] = useState<RemoteServerStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  /** 서버가 켜질 때(또는 이 화면을 열었을 때 이미 켜져 있던) 설정. 지금 설정과 다르면 다시 켜야 적용된다. */
  const [applied, setApplied] = useState<string | null>(null);
  const cfgKey = JSON.stringify([cfg.bind, cfg.port, cfg.root, cfg.user, cfg.allow_write, cfg.allow_shell]);
  const cfgKeyRef = useRef(cfgKey);
  cfgKeyRef.current = cfgKey;
  useEffect(() => {
    let alive = true;
    void backend.remoteServerStatus().then((st) => {
      if (!alive) return;
      setStatus(st);
      if (st.running) setApplied((a) => a ?? cfgKeyRef.current);
    }, () => {});
    return () => {
      alive = false;
    };
  }, [backend]);
  const msg = (e: unknown) => String(e instanceof Error ? e.message : e);
  const run = async (job: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await job();
    } catch (e) {
      setError(msg(e));
      void backend.remoteServerStatus().then(setStatus, () => {});
    } finally {
      setBusy(false);
    }
  };
  const running = !!status?.running;
  const hasPassword = !!status?.hasPassword;
  const rootEmpty = !cfg.root.trim();
  const blocker = !hasPassword ? t("settings.twindeck.need_password") : rootEmpty ? t("settings.twindeck.need_root") : null;
  const toggle = (on: boolean) =>
    void run(async () => {
      if (on) {
        const next = await backend.remoteServerStart();
        setStatus(next);
        setApplied(cfgKeyRef.current);
      } else {
        setStatus(await backend.remoteServerStop());
        setApplied(null);
      }
      await api.setConfigValue("remote_server.enabled", { kind: "bool", value: on });
    });
  const setPw = (value: string) =>
    void run(async () => {
      setStatus(await backend.setRemoteServerPassword(value));
      setPassword("");
    });
  const field = (key: (typeof TD_REMOTE_KEYS)[number]) => {
    const item: Item = { key: `remote_server.${key}`, title: t(`settings.twindeck.${key}`), control: { type: key === "port" ? "int" : "text" } };
    return (
      <div key={key} role="group" aria-label={item.title} className="flex items-center justify-between gap-4 border-b border-app-line py-2.5">
        <div className="w-48 shrink-0">
          <div className="text-sm">{item.title}</div>
          {key === "bind" && <div className="text-xs text-ink-faint">{t("settings.twindeck.bind_desc")}</div>}
        </div>
        <div className="flex min-w-0 flex-1 justify-end">
          <EditableControl
            item={item}
            value={cfg[key]}
            disabled={disabled}
            onCommit={(v) => void api.setConfigValue(item.key, key === "port" ? { kind: "int", value: Math.round(Number(v)) } : { kind: "str", value: v })}
          />
        </div>
      </div>
    );
  };
  const flag = (key: "allow_write" | "allow_shell") => (
    <div key={key} role="group" aria-label={t(`settings.twindeck.${key}`)} className="flex items-center justify-between gap-4 border-b border-app-line py-2.5">
      <div className="min-w-0">
        <div className="text-sm">{t(`settings.twindeck.${key}`)}</div>
        <div className="text-xs text-ink-faint">{t(`settings.twindeck.${key}_desc`)}</div>
      </div>
      <Switch aria-label={t(`settings.twindeck.${key}`)} checked={cfg[key]} disabled={disabled} onCheckedChange={(v) => void api.setConfigValue(`remote_server.${key}`, { kind: "bool", value: v })} />
    </div>
  );
  return (
    <div role="group" aria-label={label} className="flex flex-col">
      <div role="group" aria-label={t("settings.twindeck.enable")} className="flex items-center justify-between gap-4 border-b border-app-line py-2.5">
        <div className="min-w-0">
          <div className="text-sm">{t("settings.twindeck.enable")}</div>
          {!running && blocker && <div role="note" className="text-xs text-ink-faint">{blocker}</div>}
        </div>
        <Switch aria-label={t("settings.twindeck.enable")} checked={running} disabled={disabled || busy || status === null || (!running && !!blocker)} onCheckedChange={toggle} />
      </div>
      {(error || status?.lastError) && (
        <div role="alert" className="border-b border-app-line py-2 text-xs text-status-error">
          {error ?? status?.lastError}
        </div>
      )}
      {running && applied !== null && applied !== cfgKey && (
        <div role="status" className="border-b border-app-line py-2 text-xs text-ink-dull">{t("settings.twindeck.restart")}</div>
      )}
      {running && status && (
        <div role="group" aria-label={t("settings.twindeck.connect_info")} className="flex flex-col gap-1 border-b border-app-line py-2.5 text-sm">
          <div>
            {t("settings.twindeck.addresses")}: <span data-testid="twindeck-addresses">{status.addresses.join(", ")}</span>
          </div>
          <div className="break-all">
            {t("settings.twindeck.fingerprint")}: <span data-testid="twindeck-fingerprint">{status.fingerprint}</span>
          </div>
        </div>
      )}
      {TD_REMOTE_KEYS.map(field)}
      {flag("allow_write")}
      {flag("allow_shell")}
      <div role="group" aria-label={t("settings.twindeck.password")} className="flex items-center justify-between gap-4 border-b border-app-line py-2.5">
        <div className="min-w-0">
          <div className="text-sm">{t("settings.twindeck.password")}</div>
          <div className="text-xs text-ink-faint">{hasPassword ? t("settings.twindeck.password_set") : t("settings.twindeck.password_unset")}</div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            aria-label={t("settings.twindeck.password_input")}
            type="password"
            autoComplete="new-password"
            size="sm"
            className="w-48"
            value={password}
            disabled={disabled || busy}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && password) setPw(password);
            }}
          />
          {/* 줄 제목이 이미 "비밀번호"라 보이는 글자는 짧게 두고, 화면 읽기 프로그램용 이름(aria-label)은 전체 문구를 유지한다. */}
          <Button type="button" size="sm" variant="gray" className="whitespace-nowrap" aria-label={t("settings.twindeck.password_save")} disabled={disabled || busy || !password} onClick={() => setPw(password)}>
            {t("settings.twindeck.password_save_short")}
          </Button>
          <Button type="button" size="sm" variant="gray" className="whitespace-nowrap" aria-label={t("settings.twindeck.password_delete")} disabled={disabled || busy || !hasPassword} onClick={() => setPw("")}>
            {t("settings.twindeck.password_delete_short")}
          </Button>
        </div>
      </div>
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
  const location = useApp((s) => s.configLocation);
  useEffect(() => {
    void api.loadConfigLocation();
  }, [api]);
  const defaults = defaultLoaded().config;
  const randomTheme = config.behavior.random_theme;
  const hotkeyOff = !config.environment.global_hotkey_enabled;
  const current = SECTIONS[section];
  const sectionItems: Item[] = current.title === t("settings.section.fkeys.title") ? [...current.items, ...comboKeys.map((k): Item => ({ key: `fkeys.${k}`, title: k, control: { type: "fkey" } }))] : current.items;
  const items = sectionItems.filter((it) => !it.hideOn?.includes(platform) && !(it.hideWhenEmpty && !valueAt(config, it.key)));
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app text-ink">
      <div role="dialog" aria-label={t("settings.aria")} className="flex min-h-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-app-line px-4 py-2">
          <h2 className="text-base font-semibold">{t("settings.aria")}</h2>
          <div className="flex items-center gap-3">
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
        <div className="flex min-h-0 flex-1">
          <nav role="tablist" aria-label={t("settings.sections")} aria-orientation="vertical" className="td-thin-scroll flex w-44 shrink-0 flex-col gap-3 overflow-y-auto border-r border-app-line bg-sidebar p-2">
            {SECTION_GROUPS.reduce<{ start: number; nodes: ReactElement[] }>(
              (acc, g) => {
                const range = SECTIONS.slice(acc.start, acc.start + g.count);
                acc.nodes.push(
                  <div key={g.titleKey} role="group" aria-label={t(g.titleKey)} className={"flex flex-col gap-0.5 " + (acc.start > 0 ? "border-t border-app-line pt-3" : "")}>
                    {/* 그룹 제목은 탭보다 작고 흐리게, 탭은 안쪽으로 들여 한눈에 구분한다. */}
                    <div className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-ink-faint">{t(g.titleKey)}</div>
                    {range.map((s, j) => {
                      const i = acc.start + j;
                      return (
                        <button
                          key={s.title}
                          type="button"
                          role="tab"
                          aria-selected={i === section}
                          onClick={() => api.setSettingsSection(i)}
                          className={
                            "ml-2 truncate rounded-md px-3 py-1.5 text-left text-sm " +
                            (i === section ? "bg-sidebar-selected text-sidebar-ink" : "text-sidebar-ink-dull hover:bg-sidebar-button")
                          }
                        >
                          {s.title}
                        </button>
                      );
                    })}
                  </div>,
                );
                acc.start += g.count;
                return acc;
              },
              { start: 0, nodes: [] },
            ).nodes}
          </nav>
          <section role="tabpanel" aria-label={current.title} className={"min-w-0 flex-1 overflow-auto px-6 py-3" + (items.some((i) => i.control.type === "smb-servers" || i.control.type === "remote-servers" || i.control.type === "twindeck-servers") ? " flex flex-col" : "")}>
            <h3 className="text-sm font-semibold">{current.title}</h3>
            {current.desc ? <p className="mb-2 text-xs text-ink-faint">{current.desc}</p> : <div className="mb-2" />}
            {items.map((item) => {
              // SMB 서버 목록은 한 줄짜리 항목이 아니라 탭 전체를 쓰는 편집기다(기본값으로 버튼도 없다).
              if (item.control.type === "smb-servers") return <SmbServersControl key={item.key} label={item.title} disabled={!!broken} />;
              if (item.control.type === "remote-servers") return <RemoteServersControl key={item.key} label={item.title} disabled={!!broken} />;
              if (item.control.type === "twindeck-server") return <TwinDeckServerControl key={item.key} label={item.title} disabled={!!broken} />;
              if (item.control.type === "twindeck-servers") return <RemoteServersControl key={item.key} label={item.title} disabled={!!broken} protocols={["twindeck"]} addProtocol="twindeck" />;
              const combo = item.key.startsWith("fkeys.") && item.title.includes("+") && item.title in config.fkeys;
              // 설정 파일에 없는 내장 조합키는 값이 없다 → 기본값("")으로 본다.
              const extensionColumn = item.control.type === "extension-column";
              // `확장자 유지`는 확장자 컬럼이 보일 때만 켜고 끌 수 있다(컬럼이 없으면 원래 확장자가 이름에 보인다, 이슈 #86).
              const keepExtensionOff = item.key === "behavior.table.keep_extension" && !config.view.table.columns.some((c) => parseColumn(c)?.name === "extension");
              const value = (extensionColumn ? config.view.table.columns.some((s) => parseColumn(s)?.name === "extension") : valueAt(config, item.key) ?? (item.control.type === "fkey" ? "" : undefined)) as string | number | boolean;
              const isDefault = extensionColumn ? !value : value === (valueAt(defaults, item.key) ?? (item.control.type === "fkey" ? "" : undefined));
              const wide = item.control.type === "text" || item.control.type === "fkey" || item.control.type === "tags" || item.control.type === "hotkey";
              // 태그 목록은 칩이 여러 줄로 쌓이는 넓은 입력이라, 제목 오른쪽 좁은 칸에 두면 왼쪽이 크게 빈다. 제목 아래 전체 폭을 쓴다.
              const stacked = item.control.type === "tags";
              return (
                <div key={item.key} role="group" aria-label={item.title} className={"border-b border-app-line py-2.5 " + (stacked ? "flex flex-col items-stretch gap-2" : item.control.type === "fkey" ? "grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-2" : "flex items-center justify-between gap-4")}>
                  <div className={stacked || item.control.type === "fkey" ? "min-w-0" : item.key.startsWith("shortcuts.") ? "w-12 shrink-0" : wide ? "w-48 shrink-0" : "min-w-0"}>
                    <div className="flex items-center gap-1.5 text-sm">
                      {item.title}
                      {item.desc && <InfoTip text={item.desc} />}
                    </div>
                  </div>
                  <div className={item.control.type === "fkey" ? "contents" : "flex items-center gap-3 " + (stacked ? "w-full min-w-0" : wide ? "min-w-0 flex-1 justify-end" : "shrink-0")}>
                    {!broken && !combo && (
                      <ResetSlot
                        label={t("settings.reset")}
                        show={!isDefault}
                        onClick={() =>
                          void (async () => {
                              if (extensionColumn) {
                                await api.setConfigValue(item.key, { kind: "strList", value: withExtensionColumn(config.view.table.columns, false) });
                              } else {
                                await api.resetConfigValue(item.key);
                              }
                              // F키는 지정한 앱 경로도 함께 비운다.
                              if (item.control.type === "fkey") {
                                await api.resetConfigValue(item.key.replace("fkeys.", "fkey_apps."));
                                await api.resetConfigValue(item.key.replace("fkeys.", "fkey_bar."));
                              }
                            })()
                        }
                      />
                    )}
                    {combo && !broken && (
                      <button type="button" className="whitespace-nowrap text-xs text-accent hover:underline" onClick={() =>
                          void (async () => {
                            if (extensionColumn) {
                              await api.setConfigValue(item.key, { kind: "strList", value: withExtensionColumn(config.view.table.columns, false) });
                            } else {
                              await api.resetConfigValue(item.key);
                            }
                            // F키는 지정한 앱 경로도 함께 비운다.
                            if (item.control.type === "fkey") {
                              await api.resetConfigValue(item.key.replace("fkeys.", "fkey_apps."));
                              await api.resetConfigValue(item.key.replace("fkeys.", "fkey_bar."));
                            }
                          })()
                        }
                      >
                        {t("settings.delete")}
                      </button>
                    )}
                    {(item.control.type === "switch" || extensionColumn) && (
                      <Switch
                        aria-label={item.title}
                        checked={value as boolean}
                        disabled={!!broken || keepExtensionOff}
                        onCheckedChange={(v) => void api.setConfigValue(item.key, extensionColumn ? { kind: "strList", value: withExtensionColumn(config.view.table.columns, v) } : { kind: "bool", value: v })}
                      />
                    )}
                    {item.control.type === "hotkey" && (
                      <HotkeyControl name={item.title} value={String(value)} disabled={!!broken || hotkeyOff} onCommit={(v) => void api.setConfigValue(item.key, { kind: "str", value: v })} />
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
                        {t("status.action_bar")}
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
                    {item.control.type === "tab-color" && (
                      <TabColorControl item={item} value={String(value ?? "auto")} disabled={!!broken} onCommit={(v) => void api.setConfigValue(item.key, { kind: "str", value: v })} />
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
            {current.title === t("settings.section.environment.title") && (
              <div role="group" aria-label={t("settings.config_location.label")} className="flex items-center justify-between gap-4 border-b border-app-line py-2.5">
                <div className="w-48 shrink-0">
                  <div className="flex items-center gap-1.5 text-sm">
                    {t("settings.config_location.label")}
                    <InfoTip text={t("settings.config_location.desc")} />
                  </div>
                </div>
                <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                  <span data-testid="config-location" className="min-w-0 truncate text-sm text-ink-dull" title={location?.dir}>
                    {location ? (location.custom ? location.dir : `${t("settings.config_location.default")} (${location.dir})`) : ""}
                  </span>
                  <Button size="sm" variant="gray" className="shrink-0 whitespace-nowrap" onClick={() => void api.revealConfigDir()}>
                    {t("settings.config_location.open")}
                  </Button>
                  <Button size="sm" variant="gray" className="shrink-0 whitespace-nowrap" onClick={() => void api.pickConfigLocation()}>
                    {t("settings.config_location.change")}
                  </Button>
                  {location?.custom && (
                    <Button size="sm" variant="gray" className="shrink-0 whitespace-nowrap" onClick={() => void api.resetConfigLocation()}>
                      {t("settings.config_location.reset")}
                    </Button>
                  )}
                </div>
              </div>
            )}
            {current.title === t("settings.section.environment.title") && (
              <div role="group" aria-label={t("settings.config_transfer.label")} className="flex items-center justify-between gap-4 border-b border-app-line py-2.5">
                <div className="w-48 shrink-0">
                  <div className="flex items-center gap-1.5 text-sm">
                    {t("settings.config_transfer.label")}
                    <InfoTip text={t("settings.config_transfer.desc")} />
                  </div>
                </div>
                <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                  <Button size="sm" variant="gray" className="shrink-0 whitespace-nowrap" onClick={() => void api.exportConfig()}>
                    {t("settings.config_export")}
                  </Button>
                  <Button size="sm" variant="gray" className="shrink-0 whitespace-nowrap" onClick={() => void api.importConfig()}>
                    {t("settings.config_import")}
                  </Button>
                </div>
              </div>
            )}
            {current.title === t("settings.section.environment.title") && platform === "mac" && (
              <div className="flex justify-end py-3">
                <Button size="sm" variant="gray" className="shrink-0 whitespace-nowrap bg-status-error text-white" onClick={() => void api.quitApp()}>
                  {t("settings.quit_app")}
                </Button>
              </div>
            )}
            {current === updateSection && <UpdatePanel />}
          </section>
        </div>
      </div>
    </div>
  );
}

/**
 * 업데이트 탭: 현재 버전과 변경 사항, 업데이트 확인 상태와 설치, 오픈소스 라이선스 고지.
 * 설치 확인과 라이선스는 설정 위에 모달로 띄운다(설정의 다른 창처럼 설정 화면에 가려지지 않는다).
 */
function UpdatePanel() {
  const t = useT();
  const { api } = useAppStore();
  const version = useApp((s) => s.appVersion);
  const update = useApp((s) => s.update);
  const [confirming, setConfirming] = useState(false);
  const [licenses, setLicenses] = useState(false);
  useEffect(() => {
    void api.loadAppVersion();
  }, [api]);
  const status =
    update.kind === "idle" ? t("settings.update.idle")
    : update.kind === "checking" ? t("settings.update.checking")
    : update.kind === "latest" ? t("settings.update.latest")
    : update.kind === "error" ? t("settings.update.error", { message: update.message })
    : update.kind === "installing" ? t("settings.update.installing")
    : t("settings.update.available", { version: update.info.version });
  const notes = update.kind === "available" || update.kind === "installing" ? (update.info.notes ?? "").split("\n").filter((l) => l.trim()) : [];
  const busy = update.kind === "checking" || update.kind === "installing";
  return (
    <div className="flex flex-col gap-3 pt-1">
      <div className="rounded-md border border-app-line bg-app-box px-3">
        <div className="flex items-center justify-between gap-4 border-b border-app-line py-2.5 text-sm">
          <span>{t("settings.update.current_version")}</span>
          <div className="flex items-center gap-3">
            <span data-testid="app-version" className="text-ink-dull">{version ?? ""}</span>
            {/* GitHub 릴리스 목록을 기본 브라우저로 연다(이슈 #70). */}
            <Button size="sm" variant="gray" className="whitespace-nowrap" onClick={() => void api.openReleasesPage()}>
              {t("settings.releases")}
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 py-2.5 text-sm">
          <span role="status" className={"min-w-0 " + (update.kind === "error" ? "text-status-error" : update.kind === "idle" ? "text-ink-faint" : "text-ink-dull")}>
            {status}
          </span>
          <Button size="sm" variant="gray" className="shrink-0 whitespace-nowrap" disabled={busy} onClick={() => void api.checkForUpdate()}>
            {t("settings.update.check_now")}
          </Button>
        </div>
        {(update.kind === "available" || update.kind === "installing") && (
          <div className="flex flex-col gap-2 border-t border-app-line py-2.5 text-sm">
            {notes.length > 0 && (
              <div className="td-thin-scroll max-h-48 overflow-auto whitespace-pre-wrap text-ink-dull">{notes.join("\n")}</div>
            )}
            <div className="flex justify-end">
              <Button size="sm" variant="accent" disabled={update.kind === "installing"} onClick={() => setConfirming(true)}>
                {t("settings.update.install")}
              </Button>
            </div>
          </div>
        )}
      </div>
      <div className="rounded-md border border-app-line bg-app-box px-3 py-2.5">
        <Button size="sm" variant="gray" className="whitespace-nowrap" onClick={() => setLicenses(true)}>
          {t("settings.licenses")}
        </Button>
      </div>
      {confirming && update.kind === "available" && (
        <ServerModal
          title={t("settings.update.confirm_title", { version: update.info.version })}
          onClose={() => setConfirming(false)}
          footer={
            <>
              <Button type="button" size="sm" variant="gray" onClick={() => setConfirming(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="accent"
                onClick={() => {
                  setConfirming(false);
                  void api.installUpdate();
                }}
              >
                {t("settings.update.confirm_install")}
              </Button>
            </>
          }
        >
          <p className="text-ink-dull">{t("settings.update.confirm_desc")}</p>
        </ServerModal>
      )}
      {licenses && (
        <ServerModal title={t("settings.licenses.title")} onClose={() => setLicenses(false)} wide>
          <div className="td-thin-scroll min-h-0 flex-1 select-text overflow-auto rounded border border-app-line bg-app px-4 py-2">
            <MarkdownView text={licensesText} />
          </div>
        </ServerModal>
      )}
    </div>
  );
}
