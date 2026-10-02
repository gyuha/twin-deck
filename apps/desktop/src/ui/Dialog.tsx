import { useEffect, useRef } from "react";
import { useApp, useAppStore } from "../state/context";
import { CONFLICT_CHOICES, isActiveJob } from "../state/store";

const CHOICE_LABEL = { overwrite: "덮어쓰기 (O)", skip: "건너뛰기 (S)", rename: "이름 바꿔 복사 (R)" } as const;

/** 모달 다이얼로그. Return 확인, Escape 취소는 키 라우터(dialog 스코프)가 처리한다. */
export function Dialog() {
  const dialog = useApp((s) => s.dialog);
  const { api } = useAppStore();
  const input = useRef<HTMLInputElement>(null);
  const kind = dialog?.kind;
  const jobId = dialog?.kind === "progress" ? dialog.jobId : null;
  const job = useApp((s) => (jobId === null ? undefined : s.queue.find((j) => j.id === jobId)));
  const selectStem = dialog?.kind === "name" && dialog.selectStem;

  // 열릴 때 첫 입력에 포커스, 이름 변경이면 확장자를 뺀 부분을 선택한다.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.focus();
    const dot = el.value.lastIndexOf(".");
    el.setSelectionRange(0, selectStem && dot > 0 ? dot : el.value.length);
  }, [kind, selectStem]);

  // 닫힐 때 포커스를 문서로 돌려준다(패널은 키 라우터가 받는다).
  useEffect(() => {
    if (!dialog) (document.activeElement as HTMLElement | null)?.blur?.();
  }, [dialog]);

  if (!dialog) return null;
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/30">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={dialog.title}
        className="w-96 max-w-full rounded border border-app-line bg-app-box p-4 text-sm shadow-lg"
      >
        <h2 className="mb-2 font-semibold">{dialog.title}</h2>
        {dialog.kind === "name" && (
          <>
            <input
              ref={input}
              aria-label={dialog.label ?? "이름"}
              value={dialog.value}
              onChange={(e) => api.dialogSetValue(e.target.value)}
              className="w-full border border-app-line px-1 py-0.5"
            />
            {dialog.option && (
              <label className="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={dialog.option.checked}
                  onChange={(e) => api.dialogSetOption(e.target.checked)}
                />
                {dialog.option.label}
              </label>
            )}
            {dialog.error && (
              <p role="alert" className="mt-1 text-status-error">
                {dialog.error}
              </p>
            )}
            {dialog.confirmLabel && (
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" className="rounded border border-app-line px-3 py-0.5" onClick={() => api.dialogCancel()}>
                  취소
                </button>
                <button type="button" className="rounded bg-accent px-3 py-0.5 text-white" onClick={() => api.dialogConfirm()}>
                  {dialog.confirmLabel}
                </button>
              </div>
            )}
          </>
        )}
        {dialog.kind === "progress" && job && (
          <>
            <div
              role="progressbar"
              aria-label="전송 진행"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={job.filesTotal ? Math.round((job.filesDone / job.filesTotal) * 100) : undefined}
              className="h-2 w-full overflow-hidden rounded bg-app-slider"
            >
              <div className="h-full bg-accent" style={{ width: `${job.filesTotal ? (job.filesDone / job.filesTotal) * 100 : 0}%` }} />
            </div>
            <p className="mt-1">{job.filesTotal === null ? "집계 중…" : `${job.filesDone}/${job.filesTotal}개`}</p>
            {job.current && isActiveJob(job) && <p className="truncate text-xs text-ink-dull">{job.current}</p>}
            {job.errors.map((e) => (
              <p key={e.path} role="alert" className="text-xs text-status-error">
                {e.path}: {e.message}
              </p>
            ))}
            <div className="mt-3 flex justify-end">
              <button type="button" className="rounded border border-app-line px-3 py-0.5" onClick={() => (isActiveJob(job) ? api.dialogCancel() : api.dialogConfirm())}>
                {isActiveJob(job) ? "중단" : "닫기"}
              </button>
            </div>
          </>
        )}
        {(dialog.kind === "confirm" || dialog.kind === "info") && (
          <ul className="mb-1 list-inside list-disc">
            {dialog.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        )}
        {dialog.kind === "conflict" && (
          <>
            <p className="mb-2 break-all">{dialog.existing}</p>
            <div role="radiogroup" aria-label="충돌 처리" className="flex flex-col gap-1">
              {CONFLICT_CHOICES.map((c, i) => (
                <div
                  key={c}
                  role="radio"
                  aria-checked={i === dialog.selected}
                  className={i === dialog.selected ? "font-bold underline" : ""}
                  onClick={() => api.dialogSetChoice(i)}
                >
                  {i === dialog.selected ? "▶ " : "  "}
                  {CHOICE_LABEL[c]}
                </div>
              ))}
            </div>
          </>
        )}
        <p className="mt-3 text-xs text-ink-faint">
          {dialog.kind === "progress"
            ? "Esc 중단"
            : `Return 확인 · Esc 취소${dialog.kind === "name" && dialog.goto ? " · Tab 완성" : ""}`}
        </p>
      </div>
    </div>
  );
}
