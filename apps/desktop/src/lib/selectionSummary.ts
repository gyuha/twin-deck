import type { EntryDto } from "@twin-deck/ts-client";

export interface SelectionSummary {
  /** 파일(심볼릭 링크 포함)의 크기 합. 폴더 안의 파일은 더하지 않는다. */
  bytes: { selected: number; total: number };
  files: { selected: number; total: number };
  dirs: { selected: number; total: number };
}

/** 목록(`entries`)과 선택(경로 집합)에서 상태 줄에 보일 선택/전체 수와 용량을 센다. 목록에 없는 선택 경로는 세지 않는다. */
export function selectionSummary(entries: EntryDto[], selection: ReadonlySet<string>): SelectionSummary {
  const sum: SelectionSummary = { bytes: { selected: 0, total: 0 }, files: { selected: 0, total: 0 }, dirs: { selected: 0, total: 0 } };
  for (const e of entries) {
    const picked = selection.has(e.path);
    if (e.kind === "dir") {
      sum.dirs.total++;
      if (picked) sum.dirs.selected++;
    } else {
      sum.files.total++;
      sum.bytes.total += e.size;
      if (picked) {
        sum.files.selected++;
        sum.bytes.selected += e.size;
      }
    }
  }
  return sum;
}
