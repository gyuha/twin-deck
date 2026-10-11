/** 컬럼 명세 `[<|>]이름[:너비]` (Rust `td_config::parse_column`과 같은 규칙). */
export type ColumnName =
  | "name"
  | "size"
  | "created"
  | "modified"
  | "added"
  | "extension"
  | "permissions"
  | "permissions_octal";

export const COLUMN_NAMES: readonly ColumnName[] = [
  "name",
  "size",
  "created",
  "modified",
  "added",
  "extension",
  "permissions",
  "permissions_octal",
];

export interface ColumnSpec {
  name: ColumnName;
  /** `<` 오름차순, `>` 내림차순 표시. */
  sort: "asc" | "desc" | null;
  width: number | null;
}

/** 해석에 실패하면 null. */
export function parseColumn(spec: string): ColumnSpec | null {
  let sort: ColumnSpec["sort"] = null;
  let rest = spec;
  if (rest.startsWith("<")) {
    sort = "asc";
    rest = rest.slice(1);
  } else if (rest.startsWith(">")) {
    sort = "desc";
    rest = rest.slice(1);
  }
  let width: number | null = null;
  const colon = rest.indexOf(":");
  if (colon >= 0) {
    const w = rest.slice(colon + 1);
    if (!/^[0-9]+$/.test(w) || Number(w) === 0) return null;
    width = Number(w);
    rest = rest.slice(0, colon);
  }
  const name = COLUMN_NAMES.find((n) => n === rest);
  return name ? { name, sort, width } : null;
}

/** 설정의 컬럼 목록. 잘못된 항목은 빼고(경고는 Rust가 낸다), name이 없으면 앞에 넣는다. */
export function parseColumns(specs: readonly string[]): ColumnSpec[] {
  const cols = specs.map(parseColumn).filter((c): c is ColumnSpec => c !== null);
  if (!cols.some((c) => c.name === "name")) cols.unshift({ name: "name", sort: null, width: null });
  return cols;
}

export const MIN_COLUMN_WIDTH = 40;
export const MAX_COLUMN_WIDTH = 600;

/** 설정의 컬럼 명세 목록에서 `name` 컬럼의 `:너비`만 바꾼다. 정렬 표시와 순서는 그대로, 목록에 없으면 그대로 돌려준다. */
export function withColumnWidth(specs: readonly string[], name: ColumnName, width: number): string[] {
  const w = Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(width)));
  return specs.map((raw) => {
    const c = parseColumn(raw);
    if (!c || c.name !== name) return raw;
    const mark = c.sort === "asc" ? "<" : c.sort === "desc" ? ">" : "";
    return `${mark}${name}:${w}`;
  });
}
