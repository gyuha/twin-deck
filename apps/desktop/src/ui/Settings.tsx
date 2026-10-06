import { useEffect, useState } from "react";
import { Button, Input, Select, SelectOption } from "@spacedrive/primitives";
import { defaultBindingsFor } from "@twin-deck/actions";
import { defaultLoaded } from "@twin-deck/ts-client";
import { APP_ACTIONS, APP_LAUNCH_ACTION, APP_OPEN_FOLDER_ACTION } from "../lib/fkeys";
import { useApp, useAppStore } from "../state/context";
import { Combobox } from "./Combobox";
import { Switch } from "./Switch";
import { useUi } from "./uiContext";

type Control =
  | { type: "switch" }
  | { type: "int" }
  | { type: "text" }
  | { type: "select"; options: readonly string[] }
  | { type: "fkey" };

interface Item {
  key: string;
  title: string;
  desc?: string;
  control: Control;
}

const THEMES = ["system", "dark", "light", "midnight", "noir", "slate", "nord", "mocha"] as const;
// size_format의 허용 값은 td-config의 검증 목록과 같아야 한다(crates/td-config/src/load.rs).
const SIZE_FORMATS = ["adaptive", "adaptive_kibi", "bytes", "KB", "MB"] as const;

const SECTIONS: { title: string; desc?: string; items: Item[] }[] = [
  {
    title: "모양",
    items: [
      { key: "behavior.theme", title: "테마", desc: "system은 OS의 밝기 설정을 따릅니다", control: { type: "select", options: THEMES } },
      { key: "behavior.ui_font", title: "UI 글꼴", desc: "앱 화면 전체의 글꼴. CSS font-family 값(예: Pretendard, sans-serif). 비우면 기본 글꼴", control: { type: "text" } },
      { key: "behavior.preview_font", title: "미리보기 글꼴", desc: "텍스트·코드·JSON·Markdown 미리보기 본문의 글꼴. 비우면 기본 글꼴", control: { type: "text" } },
      { key: "behavior.table.icon_size", title: "아이콘 크기", desc: "파일 목록 행의 아이콘(px)", control: { type: "int" } },
      { key: "behavior.layout.show_action_bar", title: "Action Bar 표시", desc: "아래쪽 단축키 버튼 줄", control: { type: "switch" } },
      { key: "behavior.layout.show_drive_bar", title: "드라이브 바 표시", desc: "패널 위의 볼륨 버튼, 남은 용량, 언마운트 줄", control: { type: "switch" } },
    ],
  },
  {
    title: "목록과 선택",
    items: [
      { key: "behavior.table.circular_selection", title: "순환 선택", desc: "목록 끝에서 처음으로 넘어갑니다", control: { type: "switch" } },
      { key: "behavior.table.right_click_select", title: "우클릭 선택", desc: "오른쪽 클릭으로 항목을 선택에 넣고 뺍니다", control: { type: "switch" } },
      { key: "behavior.quick_select.match_only_prefix", title: "Quick Select 접두 일치", desc: "이름의 앞부분이 맞는 항목만 찾습니다", control: { type: "switch" } },
      { key: "behavior.quick_select.activate_on_any_character", title: "아무 문자로 Quick Select 시작", desc: "글자를 치면 바로 찾기가 시작됩니다", control: { type: "switch" } },
    ],
  },
  {
    title: "표시 형식",
    items: [
      { key: "display.relative_date", title: "상대 날짜", desc: "오늘, 어제처럼 보여 줍니다", control: { type: "switch" } },
      { key: "display.date_format", title: "날짜 형식", desc: "strftime 형식", control: { type: "text" } },
      { key: "display.time_format", title: "시간 형식", desc: "strftime 형식", control: { type: "text" } },
      { key: "display.size_format", title: "크기 형식", control: { type: "select", options: SIZE_FORMATS } },
      { key: "display.folder_size_on_select", title: "선택한 폴더 용량 계산", desc: "폴더를 선택하면 하위 파일의 총 용량을 계산해 크기 칸과 상태 줄에 보여 줍니다", control: { type: "switch" } },
    ],
  },
  {
    title: "미리보기",
    desc: "사운드와 비디오 미리보기를 열었을 때 바로 재생할지 정합니다. 끄면 재생 UI만 보이고 재생 버튼을 눌러야 재생됩니다",
    items: [
      { key: "preview.audio_autoplay", title: "사운드 자동 재생", desc: "mp3, wav, ogg 같은 사운드 파일의 미리보기를 열면 바로 재생합니다", control: { type: "switch" } },
      { key: "preview.video_autoplay", title: "비디오 자동 재생", desc: "mp4, mov, webm 같은 비디오 파일의 미리보기를 열면 바로 재생합니다", control: { type: "switch" } },
      { key: "preview.close_on_outside_click", title: "바깥 클릭으로 닫기", desc: "미리보기 창 바깥을 클릭하면 미리보기를 닫습니다", control: { type: "switch" } },
    ],
  },
  {
    title: "확인",
    items: [
      { key: "core.confirm.delete", title: "영구 삭제 전에 확인", control: { type: "switch" } },
      { key: "core.confirm.trash", title: "휴지통 전에 확인", control: { type: "switch" } },
    ],
  },
  {
    title: "폴더 단축키",
    desc: "Ctrl+숫자를 누르면 지정한 폴더로 이동합니다. 비우면 동작하지 않습니다 (~ 사용 가능)",
    items: Array.from({ length: 10 }, (_, n) => ({
      key: `shortcuts.${n}`,
      title: `Ctrl+${n}`,
      control: { type: "text" } as const,
    })),
  },
  {
    title: "F키",
    desc: "F키마다 실행할 동작을 고릅니다. '기본값'은 내장 동작을 그대로 쓰고, 설정 폴더의 keybindings.toml에 같은 키가 있으면 그쪽이 우선합니다. 애플리케이션 항목에는 실행 파일 경로(예: /opt/homebrew/bin/code)나 앱 이름(macOS)을 적습니다. 옵션이 필요하면 뒤에 이어 적습니다(예: wt -d, wezterm start --cwd). 폴더 경로는 그 뒤에 붙습니다.",
    items: Array.from({ length: 12 }, (_, i) => ({ key: `fkeys.F${i + 1}`, title: `F${i + 1}`, control: { type: "fkey" } as const })),
  },
  {
    title: "환경",
    items: [{ key: "environment.text_editor", title: "텍스트 편집기", desc: "F4로 여는 프로그램. 비우면 기본 앱", control: { type: "text" } }],
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
 * F키 한 줄: 검색되는 동작 선택 상자(기본값 · 해제 · 액션 · 애플리케이션 실행)와, 앱 실행을 고르면 나타나는 앱 경로 입력.
 * Radix Select는 빈 문자열 값을 허용하지 않아서 저장값 ""(기본값)을 화면에서만 "default"로 쓴다.
 */
function FKeyControl({ name, value, disabled }: { name: string; value: string; disabled: boolean }) {
  const { registry, platform } = useUi();
  const { api } = useAppStore();
  const app = useApp((s) => s.loaded.config.fkey_apps[name] ?? "");
  const builtin = defaultBindingsFor(platform).find((b) => b.scope === "pane" && b.keys.includes(name));
  const builtinTitle = builtin ? (registry.get(builtin.actionId)?.title ?? builtin.actionId) : "없음";
  // 인수가 필요한 액션(정렬 기준, 폴더 경로 등)은 F키에 인수 없이 걸 수 없어서 뺀다. 앱 실행 두 가지만 전용 경로 입력이 있다.
  const actions = registry
    .list()
    .filter((a) => a.scopes.includes("pane") && (APP_ACTIONS.includes(a.id) || !a.title.includes("(인수:")))
    .map((a) => ({ id: a.id, label: a.id === APP_LAUNCH_ACTION ? "애플리케이션 실행" : a.id === APP_OPEN_FOLDER_ACTION ? "애플리케이션으로 폴더 열기" : a.title }))
    .sort((a, b) => a.label.localeCompare(b.label, "ko"));
  const choose = (v: string) => (v === "default" ? api.resetConfigValue(`fkeys.${name}`) : api.setConfigValue(`fkeys.${name}`, { kind: "str", value: v }));
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Combobox
        label={`${name} 동작`}
        value={value === "" ? "default" : value}
        disabled={disabled}
        onChange={(v) => void choose(v)}
        options={[
          { value: "default", label: `기본값 (현재: ${builtinTitle})` },
          { value: "none", label: "해제" },
          ...actions.map((a) => ({ value: a.id, label: a.label, keywords: a.id })),
        ]}
      />
      {APP_ACTIONS.includes(value) && (
        <EditableControl
          item={{ key: `fkey_apps.${name}`, title: `${name} 애플리케이션`, control: { type: "text" } }}
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
  const { api } = useAppStore();
  const existing = useApp((s) => s.loaded.config.fkeys);
  const [f, setF] = useState("F1");
  const [mods, setMods] = useState<string[]>([]);
  const key = [...MODIFIERS.filter((m) => mods.includes(m)), f].join("+");
  const duplicate = key in existing;
  return (
    <div role="group" aria-label="조합키 추가" className="flex flex-wrap items-center gap-3 py-2.5">
      <select aria-label="F키" value={f} disabled={disabled} onChange={(e) => setF(e.target.value)} className="rounded border border-app-line bg-app-box px-2 py-1 text-sm">
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
        추가
      </Button>
      {duplicate && mods.length > 0 && <span className="text-xs text-status-error">이미 있는 조합입니다</span>}
    </div>
  );
}

/** 사용자 설정을 항목별 컨트롤로 바꾸는 화면(`Mod+,`). 바꾸는 즉시 저장한다. */
export function Settings() {
  const open = useApp((s) => s.settingsOpen);
  const section = useApp((s) => s.settingsSection);
  const config = useApp((s) => s.loaded.config);
  // F키 탭은 고정 F1~F12 뒤에 설정 파일의 조합키 항목이 이어진다.
  const comboKeys = Object.keys(config.fkeys)
    .filter((k) => k.includes("+"))
    .sort();
  const broken = useApp((s) => s.loaded.warnings.find((w) => w.message.startsWith("TOML 문법 오류")));
  const error = useApp((s) => s.settingsError);
  const { api } = useAppStore();
  if (!open) return null;
  const defaults = defaultLoaded().config;
  const current = SECTIONS[section];
  const items: Item[] = current.title === "F키" ? [...current.items, ...comboKeys.map((k): Item => ({ key: `fkeys.${k}`, title: k, control: { type: "fkey" } }))] : current.items;
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-app text-ink">
      <div role="dialog" aria-modal="true" aria-label="설정" className="flex min-h-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-app-line px-4 py-2">
          <h2 className="text-base font-semibold">설정</h2>
          <div className="flex items-center gap-3">
            <Button size="sm" variant="gray" onClick={() => void api.revealConfigDir()}>
              설정 폴더 열기
            </Button>
            <Button size="sm" variant="gray" onClick={() => api.closeSettings()}>
              닫기 <span className="ml-1 text-ink-faint">Esc</span>
            </Button>
          </div>
        </header>
        {(broken || error) && (
          <div role="alert" className="border-b border-app-line bg-status-error/15 px-4 py-2 text-sm text-status-error">
            {broken
              ? `config.toml에 문법 오류가 있어 설정을 바꿀 수 없습니다${broken.line ? ` (${broken.line}번째 줄)` : ""}. 파일을 고친 뒤 다시 열어 주세요.`
              : error}
          </div>
        )}
        <div className="flex min-h-0 flex-1">
          <nav role="tablist" aria-label="설정 섹션" aria-orientation="vertical" className="w-40 shrink-0 border-r border-app-line bg-sidebar p-2">
            {SECTIONS.map((s, i) => (
              <button
                key={s.title}
                type="button"
                role="tab"
                aria-selected={i === section}
                onClick={() => api.setSettingsSection(i)}
                className={
                  "block w-full rounded-md px-3 py-1.5 text-left text-sm " +
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
              const combo = item.key.startsWith("fkeys.") && item.title.includes("+");
              const value = valueAt(config, item.key) as string | number | boolean;
              const isDefault = value === valueAt(defaults, item.key);
              const wide = item.control.type === "text" || item.control.type === "fkey";
              return (
                <div key={item.key} role="group" aria-label={item.title} className="flex items-center justify-between gap-4 border-b border-app-line py-2.5">
                  <div className={wide ? "w-48 shrink-0" : "min-w-0"}>
                    <div className="text-sm">{item.title}</div>
                    {item.desc && <div className="text-xs text-ink-faint">{item.desc}</div>}
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
                        {combo ? "삭제" : "기본값으로"}
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
                          aria-label={`${item.title} Action Bar에 표시`}
                          checked={config.fkey_bar[item.title] ?? false}
                          disabled={!!broken}
                          onCheckedChange={(v) => void api.setConfigValue(`fkey_bar.${item.title}`, { kind: "bool", value: v })}
                        />
                        Action Bar
                      </label>
                    )}
                    {item.control.type === "select" && (
                      <Select value={String(value)} disabled={!!broken} onChange={(v) => void api.setConfigValue(item.key, { kind: "str", value: v })}>
                        {item.control.options.map((o) => (
                          <SelectOption key={o} value={o}>
                            {o}
                          </SelectOption>
                        ))}
                      </Select>
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
            {current.title === "F키" && <FKeyAdder disabled={!!broken} />}
          </section>
        </div>
      </div>
    </div>
  );
}
