import { useEffect, useState } from "react";
import { Button, Input, Select, SelectOption, Switch } from "@spacedrive/primitives";
import { defaultLoaded } from "@twin-deck/ts-client";
import { useApp, useAppStore } from "../state/context";

type Control =
  | { type: "switch" }
  | { type: "int" }
  | { type: "text" }
  | { type: "select"; options: readonly string[] };

interface Item {
  key: string;
  title: string;
  desc?: string;
  control: Control;
}

const THEMES = ["system", "dark", "light", "midnight", "noir", "slate", "nord", "mocha"] as const;
// size_format의 허용 값은 td-config의 검증 목록과 같아야 한다(crates/td-config/src/load.rs).
const SIZE_FORMATS = ["adaptive", "adaptive_kibi", "bytes", "KB", "MB"] as const;

const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: "모양",
    items: [
      { key: "behavior.theme", title: "테마", desc: "system은 OS의 밝기 설정을 따릅니다", control: { type: "select", options: THEMES } },
      { key: "behavior.table.icon_size", title: "아이콘 크기", desc: "파일 목록 행의 아이콘(px)", control: { type: "int" } },
      { key: "behavior.layout.show_action_bar", title: "Action Bar 표시", desc: "아래쪽 단축키 버튼 줄", control: { type: "switch" } },
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
      className="w-40"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
    />
  );
}

/** 사용자 설정을 항목별 컨트롤로 바꾸는 화면(`Mod+,`). 바꾸는 즉시 저장한다. */
export function Settings() {
  const open = useApp((s) => s.settingsOpen);
  const section = useApp((s) => s.settingsSection);
  const config = useApp((s) => s.loaded.config);
  const broken = useApp((s) => s.loaded.warnings.find((w) => w.message.startsWith("TOML 문법 오류")));
  const error = useApp((s) => s.settingsError);
  const { api } = useAppStore();
  if (!open) return null;
  const defaults = defaultLoaded().config;
  const current = SECTIONS[section];
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
            <h3 className="mb-2 text-sm font-semibold">{current.title}</h3>
            {current.items.map((item) => {
              const value = valueAt(config, item.key) as string | number | boolean;
              const isDefault = value === valueAt(defaults, item.key);
              return (
                <div key={item.key} role="group" aria-label={item.title} className="flex items-center justify-between gap-4 border-b border-app-line py-2.5">
                  <div className="min-w-0">
                    <div className="text-sm">{item.title}</div>
                    {item.desc && <div className="text-xs text-ink-faint">{item.desc}</div>}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {!isDefault && !broken && (
                      <button type="button" className="text-xs text-accent hover:underline" onClick={() => void api.resetConfigValue(item.key)}>
                        기본값으로
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
          </section>
        </div>
      </div>
    </div>
  );
}
