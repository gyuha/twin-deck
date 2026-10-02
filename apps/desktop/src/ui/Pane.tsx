import { useApp } from "../state/context";
import { activeTab } from "../state/store";
import type { PaneId } from "../state/store";
import { Breadcrumb } from "./Breadcrumb";
import { VirtualHeader } from "./VirtualHeader";
import { FileTable } from "./FileTable";
import { TabBar } from "./TabBar";

export function Pane({ pane }: { pane: PaneId }) {
  const isActive = useApp((s) => s.activePane === pane);
  const path = useApp((s) => activeTab(s, pane).path);
  const isVirtual = useApp((s) => !!activeTab(s, pane).virtual);
  return (
    <section
      aria-label={pane === "left" ? "왼쪽 패널" : "오른쪽 패널"}
      data-active={isActive}
      className={[
        "flex min-h-0 min-w-0 flex-1 flex-col border-2",
        isActive ? "border-accent" : "border-transparent",
      ].join(" ")}
    >
      <TabBar pane={pane} />
      {isVirtual ? <VirtualHeader pane={pane} /> : <Breadcrumb pane={pane} path={path} />}
      <FileTable pane={pane} />
    </section>
  );
}
