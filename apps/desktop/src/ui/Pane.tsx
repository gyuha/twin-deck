import { useApp, useAppStore } from "../state/context";
import { activeTab } from "../state/store";
import type { PaneId } from "../state/store";
import { Breadcrumb } from "./Breadcrumb";
import { VirtualHeader } from "./VirtualHeader";
import { FileTable } from "./FileTable";
import { DriveBar } from "./DriveBar";
import { TabBar } from "./TabBar";

export function Pane({ pane }: { pane: PaneId }) {
  const { api } = useAppStore();
  const isActive = useApp((s) => s.activePane === pane);
  const path = useApp((s) => activeTab(s, pane).path);
  const isVirtual = useApp((s) => !!activeTab(s, pane).virtual);
  return (
    <section
      aria-label={pane === "left" ? "왼쪽 패널" : "오른쪽 패널"}
      data-active={isActive}
      data-pane={pane}
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
        isActive ? "border-accent" : "border-transparent",
      ].join(" ")}
    >
      <DriveBar pane={pane} />
      <TabBar pane={pane} />
      {isVirtual ? <VirtualHeader pane={pane} /> : <Breadcrumb pane={pane} path={path} />}
      <FileTable pane={pane} />
    </section>
  );
}
