import { useEffect, useRef, useState } from "react";
import { joinPath } from "@twin-deck/ts-client";
import { formatSpace } from "../lib/format";
import { useApp, useAppStore, useT } from "../state/context";
import type { PaneId } from "../state/store";

/**
 * 경로를 조각으로 나눈 이동 링크 (NAV-12).
 * 오른쪽 클릭하거나 빈 공간(경로 조각 버튼이 아닌 곳)을 더블클릭하면 입력 상자로 바뀌어 현재 폴더 경로를 글자로 보여 주고,
 * 경로를 고쳐 Enter를 누르면 그 폴더로 이동한다(Esc·포커스를 잃으면 취소). 경로 조각을 왼쪽 클릭하면 그 폴더로 이동한다.
 * 오른쪽 끝에 이 패널 폴더가 있는 볼륨의 남은 용량을 보인다(드라이브 바를 꺼도 보이고, 용량을 모르면 없다).
 */
export function Breadcrumb({ pane, path }: { pane: PaneId; path: string }) {
  const t = useT();
  const { api } = useAppStore();
  const space = useApp((s) => s.diskSpace[pane]);
  const sizeFormat = useApp((s) => s.loaded.config.display.size_format);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(path);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);
  const startEdit = () => {
    api.activate(pane);
    setValue(path);
    setEditing(true);
  };
  const finish = (go: boolean) => {
    setEditing(false);
    if (go && value.trim() !== "" && value.trim() !== path) void api.goToPath(value);
  };
  // Windows 드라이브(`C:\`, `C:/`)는 그 자체가 루트이고, 그 밖에는 `/`가 루트다.
  const drive = /^[A-Za-z]:[\\/]?/.exec(path)?.[0];
  const root = drive ? (/[\\/]$/.test(drive) ? drive : drive + "\\") : "/";
  const segments = [{ label: root, path: root }];
  for (const part of path.slice(drive?.length ?? 0).split(/[\\/]/).filter(Boolean)) {
    segments.push({ label: part, path: joinPath(segments[segments.length - 1].path, part) });
  }
  const go = (target: string) => {
    api.activate(pane);
    void api.navigate(target);
  };
  if (editing) {
    return (
      <nav aria-label={t("breadcrumb.aria")} className="px-2 py-1 text-sm" onContextMenu={(e) => e.preventDefault()}>
        <input
          ref={input}
          data-path-edit
          aria-label={t("breadcrumb.input_aria")}
          autoFocus
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") {
              e.preventDefault();
              finish(true);
            } else if (e.key === "Escape") {
              e.preventDefault();
              finish(false);
            }
          }}
          className="w-full rounded border border-accent bg-app-box px-1 py-0.5 text-sm outline-none"
        />
      </nav>
    );
  }
  return (
    <nav
      aria-label={t("breadcrumb.aria")}
      onContextMenu={(e) => {
        e.preventDefault();
        startEdit();
      }}
      onDoubleClick={(e) => {
        // 조각 버튼의 더블클릭은 이동용 클릭이라 편집으로 바꾸지 않는다. 빈 공간과 구분자만 편집을 시작한다.
        if ((e.target as Element).closest("button")) return;
        startEdit();
      }}
      className="flex flex-wrap items-center px-2 py-1 text-sm"
    >
      {segments.map((seg, i) => {
        // `x.zip!`는 아카이브 경계다. 이름은 버튼에, 경계 표시는 그 뒤에 따로 둔다.
        const isArchive = seg.label.endsWith("!");
        return (
          <span key={seg.path} className="flex items-center">
            {i > 1 && <span aria-hidden>{seg.path.charAt(seg.path.length - seg.label.length - 1)}</span>}
            <button type="button" tabIndex={-1} onClick={() => go(seg.path)} className="hover:underline">
              {isArchive ? seg.label.slice(0, -1) : seg.label}
            </button>
            {isArchive && (
              <span role="img" aria-label={t("breadcrumb.archive_edge")} title={t("breadcrumb.archive_edge")} className="font-bold text-accent">
                !
              </span>
            )}
          </span>
        );
      })}
      {space && (
        <span className="ml-auto shrink-0 pl-2 text-xs text-ink-dull" title={t("breadcrumb.total", { size: formatSpace(space.total, sizeFormat) })}>
          {t("breadcrumb.free", { size: formatSpace(space.free, sizeFormat) })}
        </span>
      )}
    </nav>
  );
}
