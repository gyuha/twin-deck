import { useApp, useT } from "../state/context";
import { rustText, t as translate } from "../i18n";
import { isActiveJob } from "../state/store";
import type { JobDto } from "@twin-deck/ts-client";

const kindLabel = (k: JobDto["kind"]) => translate(`queue.kind.${k}` as const);
const statusLabel = (s: JobDto["status"]) => translate(`queue.status.${s}` as const);

/** 창 오른쪽 위 진행 표시. 실행할 작업이 없으면 나타나지 않는다. */
export function QueueIndicator() {
  const t = useT();
  const queue = useApp((s) => s.queue); // 참조가 안정적인 값만 선택한다(파생은 아래에서)
  const active = queue.filter(isActiveJob);
  if (active.length === 0) return null;
  const done = active.reduce((n, j) => n + j.completed, 0);
  const total = active.reduce((n, j) => n + j.total, 0);
  return (
    <div
      role="status"
      aria-label={t("queue.progress_aria")}
      className="fixed right-2 top-2 rounded bg-accent px-2 py-0.5 text-xs text-accent-ink"
    >
      {t("queue.indicator", { count: active.length })} · {done}/{total} <span className="opacity-80">(=)</span>
    </div>
  );
}

/** `=`로 여는 작업 목록. 키 조작은 `queue` 스코프가 처리한다. */
export function QueuePopup() {
  const t = useT();
  const open = useApp((s) => s.queueOpen);
  const jobs = useApp((s) => s.queue);
  const cursor = useApp((s) => s.queueCursor);
  if (!open) return null;
  return (
    <div className="fixed inset-0 flex items-start justify-center bg-black/20 pt-16">
      <div role="dialog" aria-label={t("queue.title")} className="w-[32rem] max-w-full rounded border border-app-line bg-app-box p-3 text-sm shadow-lg">
        <h2 className="mb-2 font-semibold">{t("queue.title")}</h2>
        {jobs.length === 0 ? (
          <p className="text-ink-faint">{t("queue.empty")}</p>
        ) : (
          <div role="listbox" aria-label={t("queue.list_aria")} aria-activedescendant={`job-${jobs[cursor]?.id}`}>
            {jobs.map((j, i) => (
              <div
                key={j.id}
                id={`job-${j.id}`}
                role="option"
                aria-selected={i === cursor}
                className={i === cursor ? "border-l-4 border-accent bg-app-selected px-2 py-1" : "border-l-4 border-transparent px-2 py-1"}
              >
                <div>
                  {kindLabel(j.kind)} {j.completed}/{j.total} — {statusLabel(j.status)}
                </div>
                {j.current && isActiveJob(j) && <div className="truncate text-xs text-ink-dull">{j.current}</div>}
                {j.errors.map((e) => (
                  <div key={e.path} role="alert" className="text-xs text-status-error">
                    {e.path}: {rustText(e.message)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-ink-faint">{t("queue.hint")}</p>
      </div>
    </div>
  );
}
