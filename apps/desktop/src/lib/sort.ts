import type { EntryDto } from "@twin-deck/ts-client";
import { normalizeName } from "./names";
import type { ColumnSpec } from "./columns";

export type SortKey = "name" | "size" | "created" | "modified" | "added" | "extension";
export type SortDir = "asc" | "desc";
export interface SortState {
  key: SortKey;
  dir: SortDir;
}

export const SORT_KEYS: readonly SortKey[] = ["name", "size", "created", "modified", "added", "extension"];
export const DEFAULT_SORT: SortState = { key: "name", dir: "asc" };

export function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

/** 컬럼 명세에서 첫 정렬 표시(`<`,`>`)가 있는 컬럼의 정렬. 없으면 null. */
export function sortFromColumns(cols: readonly ColumnSpec[]): SortState | null {
  const c = cols.find((c) => c.sort && (SORT_KEYS as readonly string[]).includes(c.name));
  return c ? { key: c.name as SortKey, dir: c.sort! } : null;
}

/** 폴더이거나 폴더를 가리키는 심볼릭 링크인가(`isFolderEntry`와 같은 규칙; 순환 import를 피하려고 여기서 직접 판단한다). */
const isFolder = (e: EntryDto) => e.kind === "dir" || (e.kind === "symlink" && e.linkIsDir);

const nullsLast = (n: number | null | undefined, dir: SortDir) => n ?? (dir === "asc" ? Infinity : -Infinity);

/**
 * 폴더(폴더를 가리키는 심볼릭 링크 포함)를 먼저 두고 `sort` 기준으로 정렬한 새 배열. 같으면 이름순(항상 오름차순)으로 안정적으로 정한다.
 * 이름 키는 한 번만 계산해서 10만 항목에서도 빠르다.
 */
export function sortEntries(entries: readonly EntryDto[], sort: SortState): EntryDto[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  const decorated = entries.map((e) => ({ e, name: normalizeName(e.name) }));
  const primary = (e: EntryDto, name: string): string | number => {
    switch (sort.key) {
      case "size":
        return e.size;
      case "created":
        return nullsLast(e.createdMs, sort.dir);
      case "modified":
        return nullsLast(e.modifiedMs, sort.dir);
      case "extension":
        return extensionOf(name);
      default:
        return name; // name, added(데이터 없음)
    }
  };
  decorated.sort((a, b) => {
    // 폴더를 가리키는 심볼릭 링크도 폴더처럼 위에 둔다(열기·표시와 같은 규칙, 이슈 #47).
    const ad = isFolder(a.e);
    if (ad !== isFolder(b.e)) return ad ? -1 : 1;
    const pa = primary(a.e, a.name);
    const pb = primary(b.e, b.name);
    if (pa !== pb) return (pa < pb ? -1 : 1) * sign;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  return decorated.map((d) => d.e);
}
