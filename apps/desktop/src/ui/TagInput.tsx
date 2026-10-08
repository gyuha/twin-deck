import { useMemo } from "react";
import { Combobox } from "./Combobox";
import type { ComboOption } from "./Combobox";

interface Props {
  /** 입력된 태그(옵션의 value). */
  value: readonly string[];
  /** 고를 수 있는 태그 후보. */
  options: readonly ComboOption[];
  onChange: (value: string[]) => void;
  /** 후보 목록에서 강조 항목이 바뀔 때의 임시 미리보기(저장하지 않음). 확정 없이 닫으면 null. */
  onPreview?: (value: string | null) => void;
  label: string;
  disabled?: boolean;
}

/**
 * 태그 상자: 고른 항목이 칩으로 쌓이고(✕로 삭제), 끝의 "추가" 상자는 선택 상자(Combobox)와 같다.
 * 검색 입력으로 후보를 거르고 ↑↓로 고르며 Enter로 추가한다. 이미 고른 항목은 후보에서 뺀다.
 */
export function TagInput({ value, options, onChange, onPreview, label, disabled }: Props) {
  const free = useMemo(() => options.filter((o) => !value.includes(o.value)), [options, value]);
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  return (
    <div className={"flex min-w-0 flex-1 flex-wrap items-center gap-1 rounded-md border border-app-line bg-app-input px-1.5 py-1 text-xs text-ink " + (disabled ? "opacity-50" : "")}>
      {value.map((v) => (
        <span key={v} className="flex items-center gap-1 rounded bg-sidebar-selected px-1.5 py-0.5 text-sidebar-ink">
          {labelOf(v)}
          <button type="button" aria-label={`${labelOf(v)} 삭제`} disabled={disabled} className="text-ink-faint hover:text-ink" onClick={() => onChange(value.filter((x) => x !== v))}>
            ✕
          </button>
        </span>
      ))}
      <Combobox label={label} triggerText="+ 테마 추가" value="" options={free} disabled={disabled} className="w-36" onChange={(v) => onChange([...value, v])} onPreview={onPreview} />
    </div>
  );
}
