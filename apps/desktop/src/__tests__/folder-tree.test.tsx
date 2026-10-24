import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { entryNames, list, renderApp } from "./helpers";

// 왼쪽 /home/a: docs(readme.md) other(o.txt) a.txt b.txt / 오른쪽 /home/b: dest(d.txt) x.txt
const seed = (tree = true) => {
  const b = new FakeBackend().seed({
    "/home/a/docs/readme.md": "r",
    "/home/a/other/o.txt": "o",
    "/home/a/a.txt": "aaa",
    "/home/a/b.txt": "bbb",
    "/home/b/dest/d.txt": "d",
    "/home/b/x.txt": "xxx",
  });
  b.setConfig((l) => (l.config.behavior.layout.show_folder_tree = tree));
  return b;
};
const tree = () => screen.queryByRole("navigation", { name: "폴더 트리" });
const node = (path: string) => tree()!.querySelector<HTMLElement>(`[data-tree-path="${path}"]`);
const badges = (path: string) => [...(node(path)?.querySelectorAll("[data-pane-badge]") ?? [])].map((b) => b.textContent);
const rowByText = (name: string) => within(list("left")).getAllByRole("option").find((o) => o.textContent?.includes(name))!;

describe("폴더 트리 (이슈 #125)", () => {
  it("기본은 꺼져 있다", async () => {
    await renderApp(seed(false));
    expect(tree()).not.toBeInTheDocument();
  });

  it("켜면 왼쪽에 트리가 하나 보이고, 좌우 패널의 현재 폴더까지 펼쳐 L·R로 표시한다", async () => {
    await renderApp(seed());
    await waitFor(() => expect(node("/home/a")).not.toBeNull());
    expect(screen.getAllByRole("navigation", { name: "폴더 트리" })).toHaveLength(1);
    expect(badges("/home/a")).toEqual(["L"]);
    expect(badges("/home/b")).toEqual(["R"]);
    expect(node("/home/a")).toHaveAttribute("aria-selected", "true");
  });

  it("패널이 다른 폴더로 가면 트리의 표시와 펼침이 따라 움직인다", async () => {
    const { user } = await renderApp(seed());
    await waitFor(() => expect(badges("/home/a")).toEqual(["L"]));
    await user.dblClick(rowByText("docs"));
    await waitFor(() => expect(badges("/home/a/docs")).toEqual(["L"]));
    expect(badges("/home/a")).toEqual([]);
    expect(node("/home/a/other")).not.toBeNull(); // 조상 /home/a가 펼쳐져 형제도 보인다
  });

  it("노드를 누르면 포커스가 있는 패널의 폴더가 바뀐다", async () => {
    const { user } = await renderApp(seed());
    await waitFor(() => expect(node("/home/a/other")).not.toBeNull());
    await user.click(node("/home/a/other")!);
    await waitFor(() => expect(entryNames("left")).toContain("o.txt"));
    expect(badges("/home/a/other")).toEqual(["L"]);
    // 오른쪽 패널로 포커스를 옮긴 뒤 누르면 오른쪽이 바뀐다
    await user.click(within(list("right")).getAllByRole("option")[0]);
    await user.click(node("/home/a")!);
    await waitFor(() => expect(entryNames("right")).toContain("a.txt"));
    expect(badges("/home/a")).toEqual(["R"]);
  });

  it("화살표를 누르면 하위 폴더를 펼치고 접는다", async () => {
    const { user } = await renderApp(seed());
    await waitFor(() => expect(node("/home/b")).not.toBeNull());
    await waitFor(() => expect(node("/home/b/dest")).not.toBeNull()); // 패널의 현재 폴더는 하위 폴더가 보이게 펼쳐진다
    await user.click(within(node("/home/b")!).getByRole("button", { name: "b 접기" }));
    expect(node("/home/b/dest")).toBeNull();
    await user.click(within(node("/home/b")!).getByRole("button", { name: "b 펼치기" }));
    await waitFor(() => expect(node("/home/b/dest")).not.toBeNull());
  });

  it("Ctrl+B와 상태 줄 버튼과 설정이 트리를 켜고 끄며 설정에 저장한다", async () => {
    const { user, backend } = await renderApp(seed(false));
    await user.keyboard("{Control>}b{/Control}");
    await waitFor(() => expect(tree()).toBeInTheDocument());
    expect((await backend.getConfig()).config.behavior.layout.show_folder_tree).toBe(true);
    await user.click(screen.getByRole("button", { name: "폴더 트리 표시" }));
    await waitFor(() => expect(tree()).not.toBeInTheDocument());
    expect((await backend.getConfig()).config.behavior.layout.show_folder_tree).toBe(false);
  });

  it("파일을 트리의 폴더 노드에 놓으면 그 폴더로 복사하고, Ctrl을 누르고 놓으면 이동한다", async () => {
    const { backend } = await renderApp(seed());
    const target = () => node("/home/a/other")!;
    await waitFor(() => expect(target()).not.toBeNull());
    const drag = (name: string, ctrl: boolean) => {
      const src = rowByText(name);
      fireEvent.mouseDown(src, { button: 0, clientX: 10, clientY: 10 });
      fireEvent.mouseMove(src, { clientX: 40, clientY: 40, ctrlKey: ctrl });
      fireEvent.mouseMove(target(), { clientX: 5, clientY: 100, ctrlKey: ctrl });
      expect(target()).toHaveAttribute("data-drop-target", "true"); // 놓일 곳 강조
      fireEvent.mouseUp(target(), { button: 0, ctrlKey: ctrl });
    };
    drag("a.txt", false);
    await waitFor(() => expect(backend.read("/home/a/other/a.txt")).toBe("aaa"));
    expect(backend.exists("/home/a/a.txt")).toBe(true); // 복사: 원본 유지
    await act(async () => {});
    drag("b.txt", true);
    await waitFor(() => expect(backend.read("/home/a/other/b.txt")).toBe("bbb"));
    expect(backend.exists("/home/a/b.txt")).toBe(false); // 이동: 원본이 사라진다
  });

  it("끄는 폴더 자신이나 트리 밖에서는 트리 노드가 놓을 곳으로 강조되지 않는다", async () => {
    await renderApp(seed());
    await waitFor(() => expect(node("/home/a/docs")).not.toBeNull());
    const src = rowByText("docs");
    fireEvent.mouseDown(src, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.mouseMove(src, { clientX: 40, clientY: 40 });
    fireEvent.mouseMove(node("/home/a/docs")!, { clientX: 5, clientY: 100 });
    expect(node("/home/a/docs")).not.toHaveAttribute("data-drop-target");
    fireEvent.mouseUp(node("/home/a/docs")!, { button: 0 });
  });
});
