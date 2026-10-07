import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { defaultBindingsFor } from "@twin-deck/actions";
import { activePane, entryNames, renderApp } from "./helpers";

describe("패널 좌우 바꾸기 (core.pane.swap)", () => {
  it("Ctrl+U로 왼쪽과 오른쪽 패널의 내용(폴더·탭·커서)이 서로 바뀌고, 활성 패널은 내용을 따라간다", async () => {
    const { user } = await renderApp();
    expect(entryNames("right")).toEqual(["x.txt"]);
    expect(entryNames("left")).toContain("docs");
    expect(activePane()).toBe("left");
    await user.keyboard("{ArrowDown}"); // 왼쪽 커서를 움직여 두면 커서도 함께 가는지 볼 수 있다
    await user.keyboard("{Control>}u{/Control}");
    await waitFor(() => expect(entryNames("left")).toEqual(["x.txt"]));
    expect(entryNames("right")).toContain("docs");
    expect(activePane()).toBe("right"); // 왼쪽에서 작업하던 패널이 오른쪽으로 갔고 계속 활성이다
    expect(screen.getByRole("region", { name: "오른쪽 패널" })).toHaveAttribute("data-active", "true");
  });

  it("다시 누르면 원래대로 돌아간다", async () => {
    const { user } = await renderApp();
    const left = entryNames("left");
    await user.keyboard("{Control>}u{/Control}{Control>}u{/Control}");
    await waitFor(() => expect(entryNames("left")).toEqual(left));
    expect(entryNames("right")).toEqual(["x.txt"]);
    expect(activePane()).toBe("left");
  });

  it("macOS에서는 Cmd+U(Mod+U), Windows/Linux에서는 Ctrl+U로 기본 바인딩되어 있다", () => {
    const swap = (list: { actionId: string; keys: string[] }[]) => list.filter((b) => b.actionId === "core.pane.swap").flatMap((b) => b.keys);
    expect(swap(defaultBindingsFor("mac"))).toEqual(["Mod+U"]);
    expect(swap(defaultBindingsFor("linux"))).toEqual(["Mod+U"]);
  });
});
