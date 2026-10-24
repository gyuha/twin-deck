import { useEffect, useRef, useState } from "react";
import { isArchivePath, isRemotePath } from "@twin-deck/ts-client";
import { activeTab } from "../state/store";
import { useApp, useAppStore, useT } from "../state/context";
import { useUi } from "./uiContext";

/** 명령어 줄 (이슈 #110, Double Commander식): 활성 탭의 로컬 폴더에서 셸 한 줄을 실행한다. `behavior.layout.show_command_line`으로 끈다. */
export function CommandLine() {
  const t = useT();
  const { api } = useAppStore();
  const { platform } = useUi();
  const show = useApp((s) => s.loaded.config.behavior.layout.show_command_line);
  const focusTick = useApp((s) => s.commandLineFocus);
  const tab = useApp((s) => activeTab(s));
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const local = !tab.virtual && !isArchivePath(tab.path) && !isRemotePath(tab.path);
  // 키로 옮기라는 요청이 올 때마다 포커스를 준다. 줄이 방금 켜졌다면 그려진 뒤에 준다.
  useEffect(() => {
    if (focusTick > 0) input.current?.focus();
  }, [focusTick, show]);
  if (!show) return null;
  const prompt = local ? `[${tab.path}]${platform === "windows" ? ">" : "$"}` : t("commandline.unavailable");
  return (
    <div className="flex items-center gap-2 border-t border-app-line px-2 py-0.5 text-xs">
      <label htmlFor="command-line-input" className="max-w-[50%] shrink-0 truncate" title={local ? tab.path : undefined}>
        {prompt}
      </label>
      <input
        id="command-line-input"
        ref={input}
        data-command-line
        aria-label={t("commandline.aria")}
        value={value}
        disabled={!local}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter" && value.trim()) {
            e.preventDefault();
            void api.runCommand(value);
            setValue("");
          } else if (e.key === "Escape") {
            e.preventDefault();
            input.current?.blur();
          }
        }}
        className="min-w-0 flex-1 border border-app-line bg-transparent px-1 py-0.5"
      />
    </div>
  );
}
