import { useEffect, useRef, useState } from "react";
import { isArchivePath, isRemotePath } from "@twin-deck/ts-client";
import { highlightCommandLine } from "../lib/highlight";
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
  const history = useApp((s) => s.commandHistory);
  const [value, setValue] = useState("");
  // ↑/↓ 기록 탐색 위치(0이 가장 최근, null이면 탐색 중이 아님)와 탐색을 시작하기 전에 치던 글자.
  const [pos, setPos] = useState<number | null>(null);
  const draft = useRef("");
  const input = useRef<HTMLInputElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const local = !tab.virtual && !isArchivePath(tab.path) && !isRemotePath(tab.path);
  // 키로 옮기라는 요청이 올 때마다 포커스를 준다. 줄이 방금 켜졌다면 그려진 뒤에 준다.
  useEffect(() => {
    if (focusTick > 0) input.current?.focus();
  }, [focusTick, show]);
  if (!show) return null;
  // 기록의 pos번째(최근부터)를 입력칸에 채우고 커서를 끝으로 보낸다.
  const recall = (next: number | null, text: string) => {
    setPos(next);
    setValue(text);
    requestAnimationFrame(() => {
      input.current?.setSelectionRange(text.length, text.length);
      syncScroll();
    });
  };
  // 글자가 투명한 입력칸 아래 색칠 레이어를 입력칸의 가로 스크롤에 맞춘다.
  const syncScroll = () => {
    if (layer.current && input.current) layer.current.scrollLeft = input.current.scrollLeft;
  };
  const prompt = local ? `[${tab.path}]${platform === "windows" ? ">" : "$"}` : t("commandline.unavailable");
  return (
    <div className="flex items-center gap-2 border-t border-app-line px-2 py-0.5 text-xs">
      <label htmlFor="command-line-input" className="max-w-[50%] shrink-0 truncate" title={local ? tab.path : undefined}>
        {prompt}
      </label>
      <div className="relative min-w-0 flex-1">
      <div
        ref={layer}
        data-command-line-highlight
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre border border-transparent px-1 py-0.5"
      >
        {/* highlight.js가 입력을 escape한 결과만 넣는다. */}
        <span dangerouslySetInnerHTML={{ __html: highlightCommandLine(value) }} />
      </div>
      <input
        id="command-line-input"
        ref={input}
        data-command-line
        aria-label={t("commandline.aria")}
        value={value}
        disabled={!local}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => {
          setValue(e.target.value);
          setPos(null);
          syncScroll();
        }}
        onKeyUp={syncScroll}
        onSelect={syncScroll}
        onScroll={syncScroll}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter" && value.trim()) {
            e.preventDefault();
            void api.runCommand(value);
            setValue("");
            setPos(null);
          } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            if (history.length === 0) return;
            if (e.key === "ArrowUp") {
              if (pos === null) draft.current = value;
              const next = Math.min((pos ?? -1) + 1, history.length - 1);
              recall(next, history[history.length - 1 - next]);
            } else if (pos !== null) {
              recall(pos === 0 ? null : pos - 1, pos === 0 ? draft.current : history[history.length - pos]);
            }
          } else if (e.key === "Escape") {
            e.preventDefault();
            input.current?.blur();
          }
        }}
        className="relative w-full border border-app-line bg-transparent px-1 py-0.5 text-transparent caret-ink"
      />
      </div>
    </div>
  );
}
