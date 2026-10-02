import { useMemo, useState } from "react";
import { useAppStore } from "../state/context";
import { buildNewNames, findPattern, MASK_HELP, validateNames } from "../lib/multiRename";
import type { CaseMode, RenameItem, RenameOptions } from "../lib/multiRename";

interface Props {
  items: (RenameItem & { path: string })[];
  existing: string[];
  options: RenameOptions;
}

const CASES: { value: CaseMode; label: string }[] = [
  { value: "none", label: "변경 없음" },
  { value: "upper", label: "대문자" },
  { value: "lower", label: "소문자" },
  { value: "title", label: "첫 글자 대문자" },
];

const input = "w-full border border-app-line bg-app px-1 py-0.5";
const parentOf = (path: string) => path.slice(0, Math.max(path.lastIndexOf("/"), 1)) || "/";

/** 다중 이름 바꾸기 도구(미리보기 표와 입력). 새 이름과 오류는 입력이 바뀔 때마다 다시 계산한다. */
export function MultiRename({ items, existing, options: o }: Props) {
  const { api } = useAppStore();
  const [help, setHelp] = useState(false);
  const newNames = useMemo(() => buildNewNames(items, o), [items, o]);
  const errors = useMemo(() => validateNames(items, newNames, existing), [items, newNames, existing]);
  const patternError = findPattern(o).error;
  const set = (patch: Partial<RenameOptions>) => api.dialogMultiRenameSet(patch);
  const num = (v: string, min: number) => Math.max(Number.parseInt(v, 10) || 0, min);
  const hasError = errors.some((e) => e !== null);
  const changed = items.some((it, i) => it.name !== newNames[i]);

  return (
    <div data-can-rename={!hasError && changed}>
      <div className="mb-1 flex justify-end">
        <button type="button" aria-pressed={help} className="rounded border border-app-line px-2 py-0.5 text-xs" onClick={() => setHelp(!help)}>
          {help ? "도움말 닫기" : "도움말"}
        </button>
      </div>
      {help && (
        <div role="region" aria-label="마스크 도움말" className="mb-3 h-52 overflow-auto border border-app-line p-2 text-xs">
          <p className="mb-2 text-ink-dull">
            마스크에 아래 토큰을 쓰면 항목마다 값으로 바뀝니다. 위치 x, y는 1부터 세고 y를 포함합니다. 범위를 벗어나면 있는 만큼만 가져옵니다.
            날짜·시간은 파일의 수정 시각입니다.
          </p>
          <table className="w-full">
            <thead>
              <tr className="text-left text-ink-faint">
                <th className="w-24 py-0.5">토큰</th>
                <th>설명</th>
                <th>예</th>
              </tr>
            </thead>
            <tbody>
              {MASK_HELP.map((h) => (
                <tr key={h.token}>
                  <td className="py-0.5 font-mono">{h.token}</td>
                  <td>{h.description}</td>
                  <td className="font-mono text-ink-faint">{h.example}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-ink-dull">
            이름에 쓸 수 없는 문자(/)가 생기거나 새 이름이 겹치면 해당 행에 오류가 표시되고 실행할 수 없습니다. 선택 안에서 이름을 서로 맞바꾸는 것은 가능합니다.
          </p>
        </div>
      )}
      <div role="table" aria-label="이름 바꾸기 미리보기" hidden={help} className="mb-3 h-52 overflow-auto border border-app-line">
        <div role="row" className="sticky top-0 grid grid-cols-[1fr_1fr_1fr] bg-app-box px-2 py-0.5 text-xs text-ink-faint">
          <span role="columnheader">이전 파일 이름</span>
          <span role="columnheader">새 파일 이름</span>
          <span role="columnheader">파일 경로</span>
        </div>
        {items.map((it, i) => (
          <div key={it.path} role="row" className="grid grid-cols-[1fr_1fr_1fr] gap-2 px-2 py-0.5 text-xs">
            <span role="cell" className="truncate">
              {it.name}
            </span>
            <span role="cell" className={errors[i] ? "truncate text-status-error" : "truncate"} title={errors[i] ?? undefined}>
              {newNames[i]}
              {errors[i] && <span role="alert"> — {errors[i]}</span>}
            </span>
            <span role="cell" className="truncate text-ink-faint">
              {parentOf(it.path)}
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 text-xs">
        <fieldset className="space-y-1">
          <legend className="mb-1 font-semibold">마스크</legend>
          <label className="block">
            파일 이름
            <input aria-label="파일 이름 마스크" className={input} value={o.nameMask} onChange={(e) => set({ nameMask: e.target.value })} />
          </label>
          <select aria-label="파일 이름 대소문자" className={input} value={o.nameCase} onChange={(e) => set({ nameCase: e.target.value as CaseMode })}>
            {CASES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <label className="block">
            확장자
            <input aria-label="확장자 마스크" className={input} value={o.extMask} onChange={(e) => set({ extMask: e.target.value })} />
          </label>
          <select aria-label="확장자 대소문자" className={input} value={o.extCase} onChange={(e) => set({ extCase: e.target.value as CaseMode })}>
            {CASES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <p className="text-ink-faint">[N] 이름 · [Nx:y] 일부 · [E] 확장자 · [C] 카운터 · [Y][M][D] 날짜 — 자세한 내용은 도움말</p>
        </fieldset>

        <fieldset className="space-y-1">
          <legend className="mb-1 font-semibold">찾기 및 바꾸기</legend>
          <label className="block">
            찾기
            <input aria-label="찾기" className={input} value={o.find} onChange={(e) => set({ find: e.target.value })} />
          </label>
          <label className="block">
            바꾸기
            <input aria-label="바꾸기" className={input} value={o.replace} onChange={(e) => set({ replace: e.target.value })} />
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={o.regex} onChange={(e) => set({ regex: e.target.checked })} />
            정규식
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={o.caseSensitive} onChange={(e) => set({ caseSensitive: e.target.checked })} />
            대소문자 구분
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={o.firstOnly} onChange={(e) => set({ firstOnly: e.target.checked })} />첫 번째만 (1x)
          </label>
          {patternError && (
            <p role="alert" className="text-status-error">
              정규식 오류: {patternError}
            </p>
          )}
        </fieldset>

        <fieldset className="space-y-1">
          <legend className="mb-1 font-semibold">카운터</legend>
          <label className="block">
            시작 번호
            <input aria-label="시작 번호" type="number" className={input} value={o.start} onChange={(e) => set({ start: Number.parseInt(e.target.value, 10) || 0 })} />
          </label>
          <label className="block">
            간격
            <input aria-label="간격" type="number" className={input} value={o.step} onChange={(e) => set({ step: Number.parseInt(e.target.value, 10) || 0 })} />
          </label>
          <label className="block">
            너비
            <input aria-label="너비" type="number" min={1} className={input} value={o.width} onChange={(e) => set({ width: num(e.target.value, 1) })} />
          </label>
        </fieldset>
      </div>
    </div>
  );
}
