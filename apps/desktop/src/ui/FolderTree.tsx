import { useEffect, useMemo, useRef, useState } from "react";
import { baseName, isArchivePath, isRemotePath, parentPath } from "@twin-deck/ts-client";
import { activeTab, clampTreeWidth, TREE_WIDTH_DEFAULT, TREE_WIDTH_MAX, TREE_WIDTH_MIN } from "../state/store";
import type { PaneId } from "../state/store";
import { useApp, useAppStore, useT } from "../state/context";
import { Chevron } from "./Chevron";

/** 폴더 트리 (이슈 #125, VS Code식): 하나뿐인 왼쪽 트리가 좌우 패널의 현재 폴더를 보인다. `behavior.layout.show_folder_tree`로 켠다. */

/** 트리의 뿌리. Windows는 드라이브 루트들, 그 밖은 `/` 하나. */
function rootsOf(mounts: string[]): string[] {
  const drives = mounts.filter((m) => /^[A-Za-z]:/.test(m));
  return drives.length > 0 ? drives : ["/"];
}

/** `path`의 조상(뿌리부터, 자기 자신은 뺀다). */
function ancestorsOf(path: string): string[] {
  const out: string[] = [];
  for (let p = parentPath(path); p; p = parentPath(p)) out.unshift(p);
  return out;
}

/** 로컬 폴더가 아니면(가상 탭·압축 안·원격) 트리에 표시하지 않는다. */
const localPath = (tab: { path: string; virtual?: unknown }): string | null => (tab.virtual || isArchivePath(tab.path) || isRemotePath(tab.path) ? null : tab.path);

interface Row {
  path: string;
  depth: number;
  open: boolean;
  /** 하위 폴더가 있는지 아직 모르면(읽기 전) true로 두어 펼침 표시를 보인다. */
  hasChildren: boolean;
}

export function FolderTree() {
  const t = useT();
  const { api, backend } = useAppStore();
  const show = useApp((s) => s.loaded.config.behavior.layout.show_folder_tree);
  const showHidden = useApp((s) => s.showHidden);
  const mounts = useApp((s) => s.volumes.map((v) => v.mountPoint).join("\n"));
  const activePane = useApp((s) => s.activePane);
  const leftPath = useApp((s) => localPath(activeTab(s, "left")));
  const rightPath = useApp((s) => localPath(activeTab(s, "right")));
  // 패널 목록의 하위 폴더 이름들. 패널에서 폴더를 만들거나 지우거나 옮겨 이 값이 바뀌면 트리의 그 폴더도 다시 읽는다.
  const dirSig = (pane: PaneId) => (s: Parameters<typeof activeTab>[0]) => activeTab(s, pane).entries.filter((e) => e.kind === "dir").map((e) => e.name).join("/");
  const leftDirs = useApp(dirSig("left"));
  const rightDirs = useApp(dirSig("right"));
  const configWidth = useApp((s) => s.loaded.config.behavior.layout.folder_tree_width);
  const draftWidth = useApp((s) => s.treeWidthDraft);
  const width = draftWidth ?? clampTreeWidth(configWidth);
  const dropDir = useApp((s) => (s.drag?.target?.tree ? s.drag.target.dir : null));
  const roots = useMemo(() => rootsOf(mounts ? mounts.split("\n") : []), [mounts]);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  /** 폴더 경로 → 하위 폴더 경로들. 키가 없으면 아직 읽지 않았다. */
  const [children, setChildren] = useState<ReadonlyMap<string, string[]>>(new Map());
  const requested = useRef(new Set<string>());
  const box = useRef<HTMLElement>(null);

  const load = (dir: string) => {
    if (requested.current.has(dir)) return;
    requested.current.add(dir);
    backend
      .listDir(dir, showHidden)
      .then((entries) => {
        const dirs = entries.filter((e) => e.kind === "dir").map((e) => e.path).sort((a, b) => baseName(a).localeCompare(baseName(b)));
        setChildren((m) => new Map(m).set(dir, dirs));
      })
      .catch(() => {
        requested.current.delete(dir);
        setChildren((m) => new Map(m).set(dir, [])); // 읽지 못한 폴더는 비어 있는 것으로 보인다(권한 등)
      });
  };

  // 숨김 파일 표시를 바꾸면 읽은 목록을 버리고 다시 읽는다.
  useEffect(() => {
    requested.current.clear();
    setChildren(new Map());
  }, [showHidden]);

  // 패널의 현재 폴더가 바뀌면 그 조상을 펼치고 읽어, 트리가 그 위치를 보이게 한다(이슈 #125).
  const revealKey = `${leftPath ?? ""}\n${rightPath ?? ""}\n${showHidden}`;
  useEffect(() => {
    if (!show) return;
    // 조상과 그 폴더 자신을 펼친다(하위 폴더가 보여야 거기에 끌어 놓을 수 있다).
    const wanted = [leftPath, rightPath].flatMap((p) => (p ? [...ancestorsOf(p), p] : []));
    for (const r of roots) load(r);
    if (wanted.length === 0) return;
    setOpen((prev) => (wanted.every((w) => prev.has(w)) ? prev : new Set([...prev, ...wanted])));
    for (const w of wanted) load(w);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, revealKey, roots]);

  // 패널의 하위 폴더가 바뀌면(만들기·삭제·이동) 그 폴더의 트리 목록을 다시 읽는다. 처음 그릴 때는 위에서 이미 읽는다.
  const lastDirs = useRef<string | null>(null);
  useEffect(() => {
    if (!show) return;
    const sig = `${leftPath}|${leftDirs}||${rightPath}|${rightDirs}`;
    if (lastDirs.current !== null && lastDirs.current !== sig) {
      for (const p of [leftPath, rightPath]) {
        if (!p) continue;
        requested.current.delete(p);
        load(p);
      }
    }
    lastDirs.current = sig;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, leftPath, rightPath, leftDirs, rightDirs]);

  // 활성 패널의 폴더가 바뀌면 그 노드가 보이게 스크롤한다.
  const activeDir = activePane === "left" ? leftPath : rightPath;
  useEffect(() => {
    if (!show || !activeDir) return;
    box.current?.querySelector<HTMLElement>("[data-active-dir='true']")?.scrollIntoView?.({ block: "nearest" });
  }, [show, activeDir, children, open]);

  const rows = useMemo(() => {
    const out: Row[] = [];
    const walk = (path: string, depth: number) => {
      const kids = children.get(path);
      const isOpen = open.has(path);
      out.push({ path, depth, open: isOpen, hasChildren: kids === undefined ? true : kids.length > 0 });
      if (isOpen && kids) for (const k of kids) walk(k, depth + 1);
    };
    for (const r of roots) walk(r, 0);
    return out;
  }, [roots, open, children]);

  if (!show) return null;
  const toggle = (path: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else {
        next.add(path);
        load(path);
      }
      return next;
    });
  };
  const badges = (path: string): PaneId[] => (["left", "right"] as const).filter((p) => (p === "left" ? leftPath : rightPath) === path);
  return (
    <>
    <nav ref={box} aria-label={t("foldertree.aria")} data-folder-tree style={{ width }} className="td-thin-scroll shrink-0 overflow-auto bg-app-dark-box py-1 text-xs">
      <div role="tree" aria-label={t("foldertree.aria")}>
      {rows.map((r) => {
        const here = badges(r.path);
        const isActive = here.includes(activePane);
        return (
          <div
            key={r.path}
            role="treeitem"
            aria-level={r.depth + 1}
            aria-expanded={r.hasChildren ? r.open : undefined}
            aria-selected={here.length > 0}
            data-tree-path={r.path}
            data-active-dir={isActive ? "true" : undefined}
            data-drop-target={dropDir === r.path ? "true" : undefined}
            title={r.path}
            style={{ paddingLeft: 4 + r.depth * 12 }}
            className={["flex cursor-default items-center gap-1 whitespace-nowrap pr-2 hover:bg-app-hover", isActive ? "bg-app-selected" : here.length > 0 ? "bg-app-selected-item" : "", dropDir === r.path ? "outline outline-1 outline-accent" : ""].join(" ")}
            // 트리를 눌러도 파일 목록의 키보드 포커스는 그대로 둔다.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              void api.navigate(r.path);
              if (!r.open) toggle(r.path);
            }}
          >
            <button
              type="button"
              tabIndex={-1}
              aria-label={r.open ? t("foldertree.collapse", { name: baseName(r.path) || r.path }) : t("foldertree.expand", { name: baseName(r.path) || r.path })}
              className={"flex size-4 shrink-0 items-center justify-center text-ink-dull hover:text-ink " + (r.hasChildren ? "" : "invisible")}
              onClick={(e) => {
                e.stopPropagation();
                toggle(r.path);
              }}
            >
              <Chevron open={r.open} />
            </button>
            <span className="min-w-0 flex-1 truncate">{baseName(r.path) || r.path}</span>
            {here.map((p) => (
              <span key={p} data-pane-badge={p} className="shrink-0 rounded bg-accent px-1 text-[10px] leading-4 text-accent-ink">
                {p === "left" ? t("foldertree.left") : t("foldertree.right")}
              </span>
            ))}
          </div>
        );
      })}
      </div>
    </nav>
    {/* 오른쪽 경계를 끌어 너비를 바꾼다. 더블클릭하면 기본 너비로 돌아간다(파일 패널 사이 구분선과 같은 방식). */}
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t("foldertree.resize")}
      aria-valuemin={TREE_WIDTH_MIN}
      aria-valuemax={TREE_WIDTH_MAX}
      aria-valuenow={width}
      className="w-1 shrink-0 cursor-col-resize touch-none bg-app-line transition-colors hover:bg-accent"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        const left = box.current?.getBoundingClientRect().left;
        if (e.currentTarget.hasPointerCapture(e.pointerId) && left !== undefined) api.setTreeWidthDraft(e.clientX - left);
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        const w = api.getTreeWidthDraft();
        if (w !== null) void api.setTreeWidth(w);
      }}
      onDoubleClick={() => void api.setTreeWidth(TREE_WIDTH_DEFAULT)}
    />
    </>
  );
}
