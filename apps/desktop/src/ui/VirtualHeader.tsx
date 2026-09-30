import { useApp } from "../state/context";
import { activeTab } from "../state/store";
import type { PaneId } from "../state/store";
import { formatSize } from "../lib/format";

/** 가상 탭(Look Up/Flatten/Disk Usage 결과)의 머리글: 제목, 진행 상태, 경고 (PANE-06). */
export function VirtualHeader({ pane }: { pane: PaneId }) {
  const tab = useApp((s) => activeTab(s, pane));
  const style = useApp((s) => s.loaded.config.display.size_format);
  const v = tab.virtual;
  if (!v) return null;
  const state = v.running ? "진행 중… (Esc로 취소)" : v.cancelled ? "취소됨" : "완료";
  return (
    <div className="border-b border-neutral-300 px-2 py-1 text-sm">
      <div role="status" aria-label="검색 상태" className="flex flex-wrap items-center gap-x-3">
        <span className="font-semibold">{v.title}</span>
        <span>{tab.entries.length}개</span>
        {v.kind === "usage" && <span>총 {formatSize(v.totalBytes, style)}</span>}
        <span className={v.running ? "text-blue-800" : "text-neutral-600"}>{state}</span>
      </div>
      {v.warnings.length > 0 && (
        <ul aria-label="경고" className="text-red-700">
          {v.warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
