import type { EntryDto } from "@twin-deck/ts-client";

export interface SelectionSummary {
  /** 파일(심볼릭 링크 포함)의 크기 합. 폴더는 하위 용량을 계산해 둔 것(`dirSizes`)만 더한다. */
  bytes: { selected: number; total: number };
  files: { selected: number; total: number };
  dirs: { selected: number; total: number };
}

/**
 * 목록(`entries`)과 선택(경로 집합)에서 상태 줄에 보일 선택/전체 수와 용량을 센다. 목록에 없는 선택 경로는 세지 않는다.
 * `dirSizes`는 폴더 경로별 계산한 하위 용량(null은 계산 중)이다. 숫자로 계산된 폴더만 용량에 더한다.
 */
export function selectionSummary(
  entries: EntryDto[],
  selection: ReadonlySet<string>,
  dirSizes: Readonly<Record<string, number | null>> = {},
): SelectionSummary {
  const sum: SelectionSummary = { bytes: { selected: 0, total: 0 }, files: { selected: 0, total: 0 }, dirs: { selected: 0, total: 0 } };
  for (const e of entries) {
    const picked = selection.has(e.path);
    if (e.kind === "dir") {
      sum.dirs.total++;
      if (picked) sum.dirs.selected++;
      const computed = dirSizes[e.path];
      if (typeof computed === "number") {
        sum.bytes.total += computed;
        if (picked) sum.bytes.selected += computed;
      }
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
