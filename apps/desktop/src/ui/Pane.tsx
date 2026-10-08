import { useApp, useAppStore } from "../state/context";
import { activeTab } from "../state/store";
import type { PaneId } from "../state/store";
import { Breadcrumb } from "./Breadcrumb";
import { VirtualHeader } from "./VirtualHeader";
import { FileTable } from "./FileTable";
import { UsageTreemap } from "./UsageTreemap";
import { DriveBar } from "./DriveBar";
import { TabBar } from "./TabBar";
import { Settings } from "./Settings";

const swallow = (e: { stopPropagation(): void; preventDefault(): void }) => {
  e.stopPropagation();
  e.preventDefault();
};

export function Pane({ pane, onThemePreview }: { pane: PaneId; onThemePreview?: (theme: string | null) => void }) {
  const { api } = useAppStore();
  const isActive = useApp((s) => s.activePane === pane);
  const path = useApp((s) => activeTab(s, pane).path);
  const isVirtual = useApp((s) => !!activeTab(s, pane).virtual);
  const treemap = useApp((s) => activeTab(s, pane).virtual?.kind === "usage" && activeTab(s, pane).virtual?.view === "treemap");
  const paneHighlight = useApp((s) => s.loaded.config.behavior.layout.pane_highlight);
  // 끌어 온 파일이 이 패널의 현재 폴더에 놓일 대상이다(폴더 행 위가 아닐 때).
  const dropHere = useApp((s) => !!s.drag?.target && !s.drag.target.row && s.drag.target.pane === pane);
  const hasSettings = useApp((s) => s.settingsOpen && s.settingsPane === pane); // 설정이 이 패널 자리에 떠 있다
  const otherHasSettings = useApp((s) => s.settingsOpen && s.settingsPane !== pane); // 설정은 반대쪽에 있고 이 패널은 결과를 보여 준다(누름 무시)
  // 반대쪽 패널은 눌러도(클릭·더블클릭·우클릭·끌기 시작) 아무 일도 하지 않는다. 캡처 단계에서 막아 안쪽 행·탭이 받지 못하게 한다. 휠 스크롤은 막지 않는다.
  const block = otherHasSettings
    ? { onMouseDownCapture: swallow, onMouseUpCapture: swallow, onPointerDownCapture: swallow, onClickCapture: swallow, onDoubleClickCapture: swallow, onContextMenuCapture: swallow, onAuxClickCapture: swallow }
    : {};
  return (
    <section
      {...block}
      aria-label={pane === "left" ? "왼쪽 패널" : "오른쪽 패널"}
      data-active={isActive}
      data-pane={pane}
      data-drop-target={dropHere ? "true" : undefined}
      onMouseDown={(e) => {
        api.activate(pane);
        if (e.button === 3 || e.button === 4) e.preventDefault(); // 웹뷰가 자체 뒤로가기를 하지 않게
      }}
      onMouseUp={(e) => {
        // 마우스 뒤로(3)/앞으로(4) 버튼: 이 패널 탭의 이전/다음 폴더로
        if (e.button === 3) void api.goBack();
        else if (e.button === 4) void api.goForward();
        else return;
        e.preventDefault();
      }}
      className={[
        "flex min-h-0 min-w-0 flex-1 flex-col border-2",
        isActive && paneHighlight ? "border-accent" : "border-transparent",
        ...(dropHere ? ["bg-accent/10"] : []),
      ].join(" ")}
    >
      {hasSettings ? (
        <Settings onThemePreview={onThemePreview} />
      ) : (
        <>
          <DriveBar pane={pane} />
          <TabBar pane={pane} />
          {isVirtual ? <VirtualHeader pane={pane} /> : <Breadcrumb pane={pane} path={path} />}
          {treemap ? <UsageTreemap pane={pane} /> : <FileTable pane={pane} />}
        </>
      )}
    </section>
  );
}
