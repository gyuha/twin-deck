import { useEffect, useRef } from "react";
import { rustText, t as translate } from "../i18n";
import { useApp, useAppStore, useT } from "../state/context";
import { CONFLICT_CHOICES, isActiveJob } from "../state/store";
import type { DialogState } from "../state/store";
import { buildNewNames, validateNames } from "../lib/multiRename";
import { MultiRename } from "./MultiRename";
import { formatSpace } from "../lib/format";

const choiceLabel = (c: "overwrite" | "skip" | "rename") => translate(`dialog.choice.${c}` as const);

/** 다중 이름 바꾸기: 오류가 없고 바뀌는 이름이 하나라도 있을 때만 실행할 수 있다. */
function canMultiRename(d: Extract<DialogState, { kind: "multirename" }>): boolean {
  const names = buildNewNames(d.items, d.options);
  return !validateNames(d.items, names, d.existing).some((e) => e !== null) && d.items.some((it, i) => it.name !== names[i]);
}

/** 모달 다이얼로그. Return 확인, Escape 취소는 키 라우터(dialog 스코프)가 처리한다. */
export function Dialog() {
  const t = useT();
  const dialog = useApp((s) => s.dialog);
  const { api } = useAppStore();
  const input = useRef<HTMLInputElement>(null);
  const kind = dialog?.kind;
  const jobId = dialog?.kind === "progress" ? dialog.jobId : null;
  const job = useApp((s) => (jobId === null ? undefined : s.queue.find((j) => j.id === jobId)));
  const sizeFormat = useApp((s) => s.loaded.config.display.size_format);
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
        className={`${dialog.kind === "multirename" ? "w-[56rem]" : "w-96"} max-w-full rounded border border-app-line bg-app-box p-4 text-sm shadow-lg`}
      >
        <h2 className="mb-2 font-semibold">{dialog.title}</h2>
        {dialog.kind === "name" && (
          <>
            <input
              ref={input}
              aria-label={dialog.label ?? t("dialog.name")}
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
          </>
        )}
        {dialog.kind === "multirename" && <MultiRename items={dialog.items} existing={dialog.existing} options={dialog.options} />}
        {dialog.kind === "progress" && job && (() => {
          // 파일이 1개이고 바이트를 알면 그 파일의 바이트 진행률을, 아니면 파일 개수 진행을 보여 준다.
          const byBytes = job.filesTotal === 1 && job.bytesTotal !== null && job.bytesTotal > 0;
          const ratio = byBytes ? job.bytesDone / job.bytesTotal! : job.filesTotal ? job.filesDone / job.filesTotal : 0;
          const started = byBytes ? job.bytesDone > 0 : job.filesDone > 0;
          return (
          <>
            <div
              role="progressbar"
              aria-label={t("dialog.progress_aria")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={byBytes || job.filesTotal ? Math.round(ratio * 100) : undefined}
              className="h-2 w-full overflow-hidden rounded bg-app-slider"
            >
              {/* 아직 시작한 진행이 없으면 막대가 죽어 보이지 않게 깜빡이는 진행 중 표시를 한다. */}
              {isActiveJob(job) && !started ? (
                <div className="h-full w-full animate-pulse bg-accent opacity-40" />
              ) : (
                <div className="h-full bg-accent" style={{ width: `${ratio * 100}%` }} />
              )}
            </div>
            <p className="mt-1">
              {byBytes
                ? `${formatSpace(job.bytesDone, sizeFormat)} / ${formatSpace(job.bytesTotal!, sizeFormat)}`
                : job.filesTotal === null
                  ? t("dialog.counting")
                  : t("dialog.files_progress", { done: job.filesDone, total: job.filesTotal })}
            </p>
            {job.current && isActiveJob(job) && <p className="truncate text-xs text-ink-dull">{job.current}</p>}
            {job.errors.length > 0 && (
              <div className="mt-1 max-h-40 overflow-auto">
                <p className="text-xs text-ink-dull">{t("dialog.errors", { count: job.errors.length })}</p>
                {job.errors.map((e) => (
                  <p key={e.path} role="alert" className="break-all text-xs text-status-error">
                    {e.path}: {rustText(e.message)}
                  </p>
                ))}
              </div>
            )}
            <div className="mt-3 flex justify-end gap-2">
              {isActiveJob(job) ? (
                <>
                  {/* 창만 닫고 작업은 큐에서 계속 돈다. 그동안 큐 팝업(=)을 열거나 다른 복사를 걸 수 있다. */}
                  <button type="button" className="rounded border border-app-line px-3 py-0.5" onClick={() => api.dialogConfirm()}>
                    {t("dialog.background")}
                  </button>
                  <button type="button" className="rounded border border-app-line px-3 py-0.5" onClick={() => api.dialogCancel()}>
                    {t("dialog.abort")}
                  </button>
                </>
              ) : (
                <button type="button" className="rounded border border-app-line px-3 py-0.5" onClick={() => api.dialogConfirm()}>
                  {t("common.close")}
                </button>
              )}
            </div>
          </>
          );
        })()}
        {(dialog.kind === "confirm" || dialog.kind === "info") && (
          <ul className="mb-1 list-inside list-disc">
            {dialog.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        )}
        {dialog.kind === "choice" && (
          <>
            <ul className="mb-2 list-inside list-disc">
              {dialog.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <div role="radiogroup" aria-label={dialog.title} className="flex flex-col gap-1">
              {dialog.choices.map((c, i) => (
                <div key={c} role="radio" aria-checked={i === dialog.selected} className={i === dialog.selected ? "font-bold underline" : ""} onClick={() => api.dialogSetChoice(i)}>
                  {i === dialog.selected ? "▶ " : "  "}
                  {c}
                </div>
              ))}
            </div>
          </>
        )}
        {dialog.kind === "conflict" && (
          <>
            <p className="mb-2 break-all">{dialog.existing}</p>
            <div role="radiogroup" aria-label={t("dialog.conflict_aria")} className="flex flex-col gap-1">
              {CONFLICT_CHOICES.map((c, i) => (
                <div
                  key={c}
                  role="radio"
                  aria-checked={i === dialog.selected}
                  className={i === dialog.selected ? "font-bold underline" : ""}
                  onClick={() => api.dialogSetChoice(i)}
                >
                  {i === dialog.selected ? "▶ " : "  "}
                  {choiceLabel(c)}
                </div>
              ))}
            </div>
            {dialog.remaining > 1 && (
              <label className="mt-2 flex items-center gap-2">
                <input type="checkbox" checked={dialog.all} onChange={(e) => api.dialogSetApplyAll(e.target.checked)} />
                {t("dialog.apply_all", { count: dialog.remaining - 1 })}
              </label>
            )}
          </>
        )}
        {dialog.kind !== "progress" && (
          <div className="mt-3 flex justify-end gap-2">
            {dialog.kind === "multirename" && (
              <button type="button" className="mr-auto rounded border border-app-line px-3 py-0.5" onClick={() => api.dialogMultiRenameReset()}>
                {t("dialog.reset_all")}
              </button>
            )}
            {dialog.kind !== "info" && (
              <button type="button" className="rounded border border-app-line px-3 py-0.5" onClick={() => api.dialogCancel()}>
                {dialog.kind === "multirename" ? t("common.close") : t("common.cancel")}
              </button>
            )}
            <button
              type="button"
              disabled={dialog.kind === "multirename" && !canMultiRename(dialog)}
              className="rounded bg-accent px-3 py-0.5 text-accent-ink disabled:opacity-40"
              onClick={() => api.dialogConfirm()}
            >
              {(dialog.kind === "name" || dialog.kind === "confirm") && dialog.confirmLabel ? dialog.confirmLabel : dialog.kind === "multirename" ? t("dialog.rename") : t("common.ok")}
            </button>
          </div>
        )}
        <p className="mt-3 text-xs text-ink-faint">
          {dialog.kind === "progress"
            ? job && isActiveJob(job)
              ? t("dialog.hint_active")
              : t("dialog.hint_done")
            : t("dialog.hint", { tab: dialog.kind === "name" && dialog.goto ? t("dialog.hint_tab") : "" })}
        </p>
      </div>
    </div>
  );
}
