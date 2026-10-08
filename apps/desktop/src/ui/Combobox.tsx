import { useT } from "../state/context";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { fuzzyScore } from "../lib/fuzzy";

export interface ComboOption {
  value: string;
  label: string;
  /** 검색에만 쓰는 추가 문자열(예: 액션 ID). */
  keywords?: string;
}

interface Props {
  value: string;
  options: readonly ComboOption[];
  onChange: (value: string) => void;
  /** 목록에서 강조 항목이 바뀔 때 그 값으로 호출한다(저장하지 않는 임시 미리보기). 확정 없이 닫으면 null로 호출한다. */
  onPreview?: (value: string | null) => void;
  disabled?: boolean;
  /** 트리거 버튼의 접근성 이름. */
  label: string;
  className?: string;
  /** 트리거 버튼에 현재 값 대신 보일 글자(값을 고르는 게 아니라 항목을 더하는 상자일 때). */
  triggerText?: string;
}

const POPUP_WIDTH = 288;
const LIST_MAX = 256;

/**
 * 검색할 수 있는 선택 상자(shadcn combobox 구조): 트리거 버튼을 누르면 검색 입력과 목록이 뜬다.
 * 입력으로 퍼지 필터링하고 ↑↓로 고르고 Enter로 확정, Esc는 이 목록만 닫는다(설정 화면은 닫히지 않는다).
 */
export function Combobox({ value, options, onChange, onPreview, disabled, label, className, triggerText }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [box, setBox] = useState<{ left: number; width: number; top?: number; bottom?: number }>({ left: 0, width: POPUP_WIDTH });
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const touched = useRef(false); // 사용자가 커서를 움직이기 전(열었을 때의 현재 값 위치)에는 미리보기를 하지 않는다

  const shown = useMemo(() => {
    if (query.trim() === "") return options;
    return options
      .map((o) => ({ o, score: fuzzyScore(query, `${o.label} ${o.keywords ?? ""}`) }))
      .filter((x): x is { o: ComboOption; score: number } => x.score !== null)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.o);
  }, [options, query]);
  const selected = options.find((o) => o.value === value);

  const show = () => {
    const r = trigger.current?.getBoundingClientRect();
    if (r) {
      const width = Math.max(POPUP_WIDTH, r.width);
      const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
      const below = window.innerHeight - r.bottom;
      // 아래 공간이 모자라고 위가 더 넓으면 위로 연다.
      setBox(below < LIST_MAX + 56 && r.top > below ? { left, width, bottom: window.innerHeight - r.top + 4 } : { left, width, top: r.bottom + 4 });
    }
    setQuery("");
    setCursor(Math.max(0, options.findIndex((o) => o.value === value)));
    touched.current = false;
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  // 확정 없이 닫는다(Esc·바깥 클릭·트리거 다시 누르기): 미리보기를 걷는다.
  const cancel = () => {
    onPreview?.(null);
    close();
  };
  const choose = (o: ComboOption) => {
    onChange(o.value);
    close();
  };

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(() => setCursor(0), [query]);
  useEffect(() => {
    if (open && touched.current) onPreview?.(shown[cursor]?.value ?? null);
    // onPreview는 부모가 매번 새로 만들 수 있어 의존성에서 뺀다(커서 이동에만 반응).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cursor, shown]);
  useEffect(() => {
    if (open) document.getElementById(`${listId}-${cursor}`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, cursor, listId]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => (open ? cancel() : show())}
        className={
          "flex h-[25px] min-w-0 items-center justify-between gap-2 rounded-md border border-app-line bg-app-input px-3 text-xs text-ink shadow-sm outline-none focus:ring-2 disabled:opacity-50 " +
          (className ?? "w-56")
        }
      >
        <span className="truncate">{triggerText ?? selected?.label ?? value}</span>
        <span aria-hidden className="text-ink-dull">
          ▾
        </span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50" onMouseDown={cancel}>
          <div
            className="fixed rounded-md border border-app-line bg-app-box p-1 shadow-2xl"
            style={{ left: box.left, width: box.width, top: box.top, bottom: box.bottom }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <input
              ref={input}
              role="searchbox"
              aria-label={t("combo.search", { label })}
              aria-controls={listId}
              aria-activedescendant={shown.length > 0 ? `${listId}-${cursor}` : undefined}
              value={query}
              placeholder={t("combo.placeholder")}
              onChange={(e) => {
                touched.current = true;
                setQuery(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return; // 한글 조합 중 Enter/화살표는 조합 확정용이다
                const move = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
                if (move) touched.current = true;
                if (move) setCursor((c) => (shown.length === 0 ? 0 : (c + move + shown.length) % shown.length));
                else if (e.key === "Enter") {
                  if (shown[cursor]) choose(shown[cursor]);
                } else if (e.key === "Escape") cancel();
                else return;
                // 설정 화면의 Esc/방향키 처리로 번지지 않게 막는다.
                e.preventDefault();
                e.stopPropagation();
              }}
              className="mb-1 h-8 w-full rounded border border-app-line bg-app-input px-2 text-sm text-ink outline-none focus:ring-2"
            />
            <ul id={listId} role="listbox" aria-label={label} className="td-thin-scroll overflow-auto" style={{ maxHeight: LIST_MAX }}>
              {shown.map((o, i) => (
                <li
                  key={o.value}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={o.value === value}
                  onMouseEnter={() => {
                    touched.current = true;
                    setCursor(i);
                  }}
                  onClick={() => choose(o)}
                  className={
                    "flex h-7 cursor-pointer items-center justify-between rounded px-2 text-sm " + (i === cursor ? "bg-accent text-accent-ink" : "text-ink")
                  }
                >
                  <span className="truncate">{o.label}</span>
                  {o.value === value && <span aria-hidden>✓</span>}
                </li>
              ))}
              {shown.length === 0 && <li className="px-2 py-3 text-center text-xs text-ink-faint">{t("combo.none")}</li>}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
