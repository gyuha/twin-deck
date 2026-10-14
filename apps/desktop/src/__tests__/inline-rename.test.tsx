import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";

// 목록 안에서 바로 하는 이름 변경 (이슈 #65)
// /home/a: docs/ src/ a.txt b.txt c.txt Makefile — 폴더가 먼저, 그 뒤 이름순(대소문자 무시)
const seed = () =>
  new FakeBackend().seed({
    "/home/a/docs/readme.md": "r",
    "/home/a/src/main.rs": "m",
    "/home/a/Makefile": "mk",
    "/home/a/a.txt": "a",
    "/home/a/b.txt": "b",
    "/home/a/c.txt": "c",
    "/home/b/x.txt": "x",
  });

const box = () => screen.queryByRole("textbox", { name: "새 이름" }) as HTMLInputElement | null;
const findBox = async () => (await screen.findByRole("textbox", { name: "새 이름" })) as HTMLInputElement;
/** 입력칸이 들어 있는 행의 경로. */
const editingPath = () => box()?.closest("[data-path]")?.getAttribute("data-path") ?? null;
/** 왼쪽 패널 커서 행의 이름. 편집 중인 행은 이름 칸이 입력칸이라 글자가 아니라 경로에서 읽는다. */
const cursorName = (_pane: "left") =>
  document.querySelector('[data-pane="left"][data-path][data-cursor="true"]')?.getAttribute("data-path")?.split("/").pop() ?? "";
const selected = (el: HTMLInputElement) => el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0);

/** 커서를 `name`까지 내리고 F2로 이름 변경을 시작한다. */
async function startAt(user: Awaited<ReturnType<typeof renderApp>>["user"], name: string) {
  for (let i = 0; i < 10 && cursorName("left") !== name; i++) await user.keyboard("{ArrowDown}");
  expect(cursorName("left")).toBe(name);
  await user.keyboard("{F2}");
  return findBox();
}

describe("목록 안 이름 변경 (이슈 #65)", () => {
  it("팝업 없이 커서 행의 이름 칸이 입력칸이 되고 포커스를 받는다", async () => {
    const { user } = await renderApp(seed());
    const input = await startAt(user, "a.txt");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(editingPath()).toBe("/home/a/a.txt");
    expect(input).toHaveFocus();
    expect(input).toHaveValue("a.txt");
  });

  it("처음 선택 범위: 파일은 확장자 앞까지, 확장자가 없으면 전체, 폴더는 이름 전체", async () => {
    const { user } = await renderApp(seed());
    expect(selected(await startAt(user, "a.txt"))).toBe("a");
    await user.keyboard("{Escape}");
    expect(selected(await startAt(user, "Makefile"))).toBe("Makefile");
    await user.keyboard("{Escape}");
    await user.keyboard("{Home}");
    expect(selected(await startAt(user, "docs"))).toBe("docs");
  });

  it("폴더 이름에 점이 있어도 전체를 선택한다", async () => {
    const { user } = await renderApp(new FakeBackend().seed({ "/home/a/my.folder/x": "x", "/home/b/x.txt": "x" }));
    expect(selected(await startAt(user, "my.folder"))).toBe("my.folder");
  });

  it("Return은 저장하고 편집을 끝낸다. 커서는 새 이름에 있다", async () => {
    const { user, backend } = await renderApp(seed());
    await startAt(user, "a.txt");
    await user.keyboard("zzz{Enter}");
    await waitFor(() => expect(backend.exists("/home/a/zzz.txt")).toBe(true));
    expect(backend.exists("/home/a/a.txt")).toBe(false);
    await waitFor(() => expect(cursorName("left")).toBe("zzz.txt"));
    expect(box()).toBeNull();
  });

  it("Esc는 바꾸지 않고 끝낸다. 그 뒤 방향키는 다시 커서를 옮긴다", async () => {
    const { user, backend } = await renderApp(seed());
    await startAt(user, "a.txt");
    await user.keyboard("zzz{Escape}");
    expect(box()).toBeNull();
    expect(backend.exists("/home/a/a.txt")).toBe(true);
    expect(backend.exists("/home/a/zzz.txt")).toBe(false);
    await user.keyboard("{ArrowDown}");
    expect(cursorName("left")).toBe("b.txt");
  });

  it("↓: 저장하고 편집 전 위치의 아래 항목 편집으로 넘어간다(새 이름이 정렬로 옮겨 가도)", async () => {
    const { user, backend } = await renderApp(seed());
    await startAt(user, "a.txt");
    await user.keyboard("zzz{ArrowDown}"); // zzz.txt는 c.txt 뒤로 정렬되지만, 다음은 편집 전 아래인 b.txt
    await waitFor(() => expect(editingPath()).toBe("/home/a/b.txt"));
    expect(backend.exists("/home/a/zzz.txt")).toBe(true);
    expect(cursorName("left")).toBe("b.txt");
    const input = box()!;
    expect(input).toHaveFocus();
    expect(input).toHaveValue("b.txt");
    expect(selected(input)).toBe("b");
  });

  it("↑: 저장하고 편집 전 위치의 위 항목 편집으로 넘어간다", async () => {
    const { user, backend } = await renderApp(seed());
    await startAt(user, "c.txt");
    await user.keyboard("0{ArrowUp}"); // 0.txt는 a.txt 앞으로 정렬되지만, 다음은 편집 전 위인 b.txt
    await waitFor(() => expect(editingPath()).toBe("/home/a/b.txt"));
    expect(backend.exists("/home/a/0.txt")).toBe(true);
    expect(cursorName("left")).toBe("b.txt");
  });

  it("이름을 바꾸지 않았으면 저장 없이 옮겨 가기만 한다", async () => {
    const { user, backend } = await renderApp(seed());
    await startAt(user, "a.txt");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    await waitFor(() => expect(editingPath()).toBe("/home/a/c.txt"));
    for (const n of ["a.txt", "b.txt", "c.txt"]) expect(backend.exists(`/home/a/${n}`)).toBe(true);
    await user.keyboard("{ArrowUp}");
    await waitFor(() => expect(editingPath()).toBe("/home/a/b.txt"));
  });

  it("중복된 이름이면 이동하지 않고 편집을 이어 간다", async () => {
    const { user, backend } = await renderApp(seed());
    await startAt(user, "a.txt");
    await user.keyboard("b{ArrowDown}"); // b.txt는 이미 있다
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(editingPath()).toBe("/home/a/a.txt");
    expect(box()).toHaveValue("b.txt");
    expect(box()).toHaveFocus();
    expect(cursorName("left")).toBe("a.txt");
    expect(backend.exists("/home/a/a.txt")).toBe(true);
    // 고쳐서 다시 저장하면 넘어간다
    await user.keyboard("{Control>}a{/Control}ok.txt{ArrowDown}");
    await waitFor(() => expect(editingPath()).toBe("/home/a/b.txt"));
    expect(backend.exists("/home/a/ok.txt")).toBe(true);
  });

  it("쓸 수 없는 문자가 든 이름이면 이동하지 않고 편집을 이어 간다", async () => {
    const { user, backend } = await renderApp(seed());
    await startAt(user, "a.txt");
    await user.keyboard("{Control>}a{/Control}x/y{ArrowUp}");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(editingPath()).toBe("/home/a/a.txt");
    expect(box()).toHaveValue("x/y");
    expect(backend.exists("/home/a/a.txt")).toBe(true);
  });

  it("맨 아래에서 ↓는 저장하고 편집을 끝낸다", async () => {
    const { user, backend } = await renderApp(seed());
    await startAt(user, "Makefile");
    await user.keyboard("zz{ArrowDown}");
    await waitFor(() => expect(backend.exists("/home/a/zz")).toBe(true));
    await waitFor(() => expect(box()).toBeNull());
    expect(cursorName("left")).toBe("zz");
  });

  it("맨 위에서 ↑는 저장하고 편집을 끝낸다", async () => {
    const { user } = await renderApp(seed());
    await startAt(user, "docs");
    await user.keyboard("{ArrowUp}");
    await waitFor(() => expect(box()).toBeNull());
    expect(cursorName("left")).toBe("docs");
  });

  it("포커스를 잃으면 저장한다", async () => {
    const { user, backend } = await renderApp(seed());
    const input = await startAt(user, "a.txt");
    await user.keyboard("zzz");
    fireEvent.blur(input);
    await waitFor(() => expect(backend.exists("/home/a/zzz.txt")).toBe(true));
    await waitFor(() => expect(box()).toBeNull());
  });

  it("다른 행을 눌러 저장하면 커서는 누른 행에 남는다(이름 변경이 늦게 끝나도)", async () => {
    const backend = seed();
    // 이름 변경을 붙잡아 두고, 그동안 다른 행을 누른다
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const rename = backend.rename.bind(backend);
    backend.rename = async (path, name) => {
      await gate;
      return rename(path, name);
    };
    const { user } = await renderApp(backend);
    await startAt(user, "a.txt");
    await user.keyboard("zzz");
    await user.click(document.querySelector<HTMLElement>('[data-pane="left"][data-path="/home/a/c.txt"]')!); // 입력칸이 포커스를 잃는다
    expect(cursorName("left")).toBe("c.txt");
    release();
    await waitFor(() => expect(backend.exists("/home/a/zzz.txt")).toBe(true));
    await waitFor(() => expect(box()).toBeNull());
    expect(cursorName("left")).toBe("c.txt");
  });

  it("포커스를 잃었을 때 저장에 실패하면 알리고 편집을 끝낸다", async () => {
    const { user, backend } = await renderApp(seed());
    const input = await startAt(user, "a.txt");
    await user.keyboard("b"); // b.txt는 이미 있다
    fireEvent.blur(input);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await waitFor(() => expect(box()).toBeNull());
    expect(backend.exists("/home/a/a.txt")).toBe(true);
  });

  it("편집 중 글자는 입력칸이 받는다: 빠른 선택·큐 열기(=) 같은 단축키로 가지 않는다", async () => {
    const { user } = await renderApp(seed());
    await startAt(user, "a.txt");
    await user.keyboard("{End}=q ");
    expect(box()).toHaveValue("a.txt=q ");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(cursorName("left")).toBe("a.txt");
  });

  it("입력칸 더블클릭은 파일을 열지 않는다", async () => {
    const { user } = await renderApp(seed());
    const input = await startAt(user, "docs");
    await user.dblClick(input);
    expect(box()).not.toBeNull();
    expect(editingPath()).toBe("/home/a/docs");
    expect(document.querySelector('[data-path="/home/a/docs/readme.md"]')).toBeNull(); // docs 안으로 들어가지 않았다
  });

  it("편집 중인 항목이 밖에서 지워지면 편집을 끝낸다", async () => {
    const { user, backend } = await renderApp(seed());
    await startAt(user, "a.txt");
    await backend.trash("/home/a/a.txt");
    await waitFor(() => expect(box()).toBeNull());
    await user.keyboard("{ArrowDown}");
    expect(cursorName("left")).not.toBe("a.txt");
  });

  it("2개 이상 선택하면 지금처럼 다중 이름 바꾸기가 열린다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{Insert}{Insert}{F2}");
    expect(await screen.findByRole("dialog", { name: "다중 이름 바꾸기 도구" })).toBeTruthy();
    expect(box()).toBeNull();
  });
});
