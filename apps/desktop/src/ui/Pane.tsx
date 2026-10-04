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
      onMouseDown={(e) => {
        api.activate(pane);
        if (e.button === 3 || e.button === 4) e.preventDefault(); // 웹뷰가 자체 뒤로가기를 하지 않게
      }}
      onDragOver={(e) => {
        // 폴더 행이 아닌 곳(빈 곳, 파일 행)에 놓으면 이 패널의 현재 폴더로 들어간다. 검색 결과 같은 가상 탭에는 놓을 수 없다.
        if (isVirtual || !api.isDragging()) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = api.ctrlHeld(e.ctrlKey) ? "move" : "copy";
      }}
      onDrop={(e) => {
        if (isVirtual || !api.isDragging()) return;
        e.preventDefault();
        // 같은 패널의 빈 곳에 놓는 것은 제자리라 아무 일도 하지 않는다(폴더 행에 놓는 것은 위에서 따로 처리한다).
        if (api.dragSourcePane() === pane) return api.dragEnd();
        void api.dropTransfer(path, e.ctrlKey);
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
