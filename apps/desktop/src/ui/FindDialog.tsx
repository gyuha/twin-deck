import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useApp, useAppStore } from "../state/context";
import { activeTab } from "../state/store";
import type { FindForm } from "../state/store";

const UNSUPPORTED = "아직 지원하지 않습니다";
const TABS = ["기본", "고급", "플러그인", "불러오기/저장", "결과"];
const DEPTHS = [["all", "모두 (무제한 깊이)"], ["0", "현재 디렉터리만"], ...Array.from({ length: 9 }, (_, i) => [String(i + 1), `${i + 1}단계`])] as const;

const field = "h-8 w-full rounded-md border border-app-line bg-app-input px-2 text-sm text-ink outline-none focus:ring-2 disabled:opacity-50";
const btn = "h-8 w-full rounded-md border border-app-line px-3 text-sm hover:bg-app-selected disabled:opacity-40 disabled:hover:bg-transparent";

function Check({ label, checked, onChange, disabled, title }: { label: string; checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean; title?: string }) {
  return (
    <label title={title} className={"flex items-center gap-1.5 whitespace-nowrap text-sm " + (disabled ? "opacity-50" : "")}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Labeled({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={"block " + (className ?? "")}>
      <span className="mb-0.5 block text-sm">{label}</span>
      {children}
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="mb-3">
      <h3 className="mb-1 text-xs text-ink-dull">{title}</h3>
      <div className="space-y-2 rounded-md border border-app-line bg-app-dark-box p-3">{children}</div>
    </section>
  );
}

/**
 * 파일 찾기 다이얼로그(`Mod+F`): Double Commander "파일 찾기"의 기본 탭. 시작하면 결과를 새 가상 탭에 스트리밍한다.
 * 아직 만들지 않은 항목(바꾸기, Office XML, 인코딩, 16진수, 압축파일에서 찾기)과 다른 탭은 비활성으로 보인다.
 */
export function FindDialog() {
  const find = useApp((s) => s.find);
  const hasSelection = useApp((s) => activeTab(s).selection.size > 0);
  const running = useApp((s) => (["left", "right"] as const).some((p) => s.panes[p].tabs.some((t) => t.virtual?.running && t.virtual.kind === "find")));
  const hasLast = useApp((s) => s.lastFind !== null);
  const { api } = useAppStore();
  const mask = useRef<HTMLInputElement>(null);
  const open = find !== null;
  useEffect(() => {
    if (open) mask.current?.focus();
  }, [open]);
  if (!find) return null;
  const f = find.form;
  const set = (patch: Partial<FindForm>) => api.setFindForm(patch);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-label="파일 찾기"
        className="flex max-h-full w-[58rem] max-w-full flex-col overflow-auto rounded-lg border border-app-line bg-app-box p-4 text-ink shadow-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          void api.findStart();
        }}
      >
        <h2 className="mb-2 text-center text-sm font-semibold">파일 찾기</h2>
        <div role="tablist" aria-label="파일 찾기 탭" className="mx-auto mb-3 flex gap-1 rounded-md bg-app-dark-box p-0.5 text-sm">
          {TABS.map((t, i) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={i === 0}
              disabled={i !== 0}
              title={i === 0 ? undefined : UNSUPPORTED}
              className={"rounded px-3 py-0.5 " + (i === 0 ? "bg-app-box shadow" : "opacity-50")}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-4">
          <div className="min-w-0 flex-1">
            <Section title="디렉터리">
              <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
                <Check label="열려있는 탭" checked={f.openTabs} onChange={(v) => set({ openTabs: v })} />
                <Check label="선택한 디렉터리 및 파일" checked={f.selectedOnly} disabled={!hasSelection} onChange={(v) => set({ selectedOnly: v })} />
                <Check label="심볼릭 링크 따라가기" checked={f.followSymlinks} onChange={(v) => set({ followSymlinks: v })} />
              </div>
              <Labeled label="디렉터리에서 시작(D)">
                <input className={field} value={f.start} disabled={f.openTabs} onChange={(e) => set({ start: e.target.value })} />
              </Labeled>
              <div className="flex gap-3">
                <Labeled label="하위 디렉터리 제외(X)" className="flex-1">
                  <input className={field} value={f.excludeDirs} onChange={(e) => set({ excludeDirs: e.target.value })} />
                </Labeled>
                <Labeled label="하위 디렉터리에서 검색(B)" className="w-64">
                  <select className={field} value={f.depth} onChange={(e) => set({ depth: e.target.value })}>
                    {DEPTHS.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Labeled>
              </div>
            </Section>
            <Section title="파일">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <span className="text-sm font-semibold">파일 마스크(F)</span>
                <div className="flex flex-wrap gap-x-4">
                  <Check label="압축파일에서 찾기" checked={false} disabled title={UNSUPPORTED} />
                  <Check label="파일 이름의 일부로 검색" checked={f.substring} onChange={(v) => set({ substring: v })} />
                  <Check label="정규식" checked={f.regex} onChange={(v) => set({ regex: v })} />
                </div>
              </div>
              <input ref={mask} aria-label="파일 마스크(F)" className={field} value={f.mask} onChange={(e) => set({ mask: e.target.value })} />
              <Labeled label="파일 제외(E)">
                <input className={field} value={f.excludeFiles} onChange={(e) => set({ excludeFiles: e.target.value })} />
              </Labeled>
            </Section>
            <Section title="데이터 찾기">
              <div className="flex items-center gap-3">
                <Check label="파일에서 텍스트 찾기" checked={f.textOn} onChange={(v) => set({ textOn: v })} />
                <input aria-label="찾을 텍스트" className={field} value={f.text} disabled={!f.textOn} onChange={(e) => set({ text: e.target.value })} />
              </div>
              <div className="flex items-center gap-3">
                <Check label="바꾸기" checked={false} disabled title={UNSUPPORTED} />
                <input aria-label="바꿀 텍스트" className={field} disabled title={UNSUPPORTED} />
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                <Check label="텍스트를 포함하지 않는 파일 찾기" checked={f.invert} disabled={!f.textOn} onChange={(v) => set({ invert: v })} />
                <Check label="대소문자 구분" checked={f.caseSensitive} disabled={!f.textOn} onChange={(v) => set({ caseSensitive: v })} />
                <Check label="텍스트 정규식" checked={f.textRegex} disabled={!f.textOn} onChange={(v) => set({ textRegex: v })} />
                <Check label="Office XML" checked={false} disabled title={UNSUPPORTED} />
              </div>
              <div className="flex items-center gap-5">
                <Labeled label="인코딩(G)" className="w-56">
                  <select className={field} disabled title={UNSUPPORTED}>
                    <option>Default</option>
                  </select>
                </Labeled>
                <Check label="16진수" checked={false} disabled title={UNSUPPORTED} />
              </div>
            </Section>
            {find.error && (
              <p role="alert" className="text-sm text-status-error">
                {find.error}
              </p>
            )}
          </div>
          <div className="flex w-36 shrink-0 flex-col gap-2 pt-7">
            <button type="submit" className="h-8 w-full rounded-md bg-accent px-3 text-sm font-semibold text-white">
              시작
            </button>
            <button type="button" className={btn} disabled={!running} onClick={() => api.cancelFinds()}>
              취소
            </button>
            <button type="button" className={btn} onClick={() => api.closeFind()}>
              닫기
            </button>
            <div className="h-6" />
            <button type="button" className={btn} onClick={() => api.findReset()}>
              새 검색
            </button>
            <button type="button" className={btn} disabled={!hasLast} onClick={() => api.findRestoreLast()}>
              마지막 검색
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
