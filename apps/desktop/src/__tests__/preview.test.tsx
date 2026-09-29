import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { cursorName, renderApp, selectedNames } from "./helpers";

function seed() {
  return new FakeBackend().seed({
    "/home/a/docs/readme.md": "r",
    "/home/a/a.png": "PNGDATA",
    "/home/a/big.log": "x".repeat(100_000),
    "/home/a/data.bin": "a\u0000b",
    "/home/a/notes.txt": "hello preview\n둘째 줄",
    "/home/b": null,
  });
}
// 이름순: docs, a.png, big.log, data.bin, notes.txt
const dlg = (name: string | RegExp) => screen.findByRole("dialog", { name });
const gone = () => expect(screen.queryByRole("dialog", { name: /미리보기/ })).toBeNull();
const goTo = async (user: Awaited<ReturnType<typeof renderApp>>["user"], n: number) =>
  user.keyboard("{ArrowDown}".repeat(n));

describe("VIEW-01 미리보기", () => {
  it("Space로 텍스트 파일의 내용을 보여 주고 Space/Esc/Mod+Y로 닫는다", async () => {
    const { user } = await renderApp(seed());
    await goTo(user, 4); // notes.txt
    await user.keyboard(" ");
    const d = await dlg("미리보기: notes.txt");
    expect(within(d).getByLabelText("텍스트 미리보기")).toHaveTextContent("hello preview");
    expect(within(d).getByLabelText("텍스트 미리보기")).toHaveTextContent("둘째 줄");
    await user.keyboard(" ");
    gone();

    await user.keyboard("{Control>}y{/Control}");
    await dlg("미리보기: notes.txt");
    await user.keyboard("{Control>}y{/Control}");
    gone();

    await user.keyboard(" ");
    await dlg("미리보기: notes.txt");
    await user.keyboard("{Escape}");
    gone();
  });

  it("이미지는 그림으로 보여 준다", async () => {
    const { user } = await renderApp(seed());
    await goTo(user, 1);
    await user.keyboard(" ");
    const d = await dlg("미리보기: a.png");
    const img = within(d).getByRole("img", { name: "a.png" });
    expect(img.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
  });

  it("큰 텍스트는 앞부분만 보여 주고 알린다", async () => {
    const { user } = await renderApp(seed());
    await goTo(user, 2);
    await user.keyboard(" ");
    const d = await dlg("미리보기: big.log");
    expect(within(d).getByLabelText("텍스트 미리보기").textContent!.length).toBe(64 * 1024);
    expect(d).toHaveTextContent("앞부분만 표시합니다");
  });

  it("바이너리와 폴더는 미리 볼 수 없다고 알린다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard(" "); // docs
    let d = await dlg("미리보기: docs");
    expect(d).toHaveTextContent("폴더 — 미리 볼 수 없는 형식");
    await user.keyboard("{Escape}");
    await goTo(user, 3); // data.bin
    await user.keyboard(" ");
    d = await dlg("미리보기: data.bin");
    expect(d).toHaveTextContent("기타 — 미리 볼 수 없는 형식");
  });

  it("열려 있는 동안 ↑↓로 이전/다음 항목을 보여 주고 커서도 따라간다", async () => {
    const { user } = await renderApp(seed());
    await goTo(user, 3); // data.bin
    await user.keyboard(" ");
    await dlg("미리보기: data.bin");
    await user.keyboard("{ArrowDown}");
    await dlg("미리보기: notes.txt");
    await user.keyboard("{ArrowUp}{ArrowUp}");
    await dlg("미리보기: big.log");
    await user.keyboard("{Escape}");
    gone();
    expect(cursorName("left")).toBe("big.log");
  });

  it("빠르게 넘길 때 늦게 온 이전 응답이 화면을 덮지 않는다", async () => {
    const b = seed();
    const orig = b.preview.bind(b);
    b.preview = async (p) => {
      if (p.endsWith("data.bin")) await new Promise((r) => setTimeout(r, 200)); // 이전 항목만 느리다
      return orig(p);
    };
    const { user } = await renderApp(b);
    await goTo(user, 3);
    await user.keyboard(" ");
    await user.keyboard("{ArrowDown}");
    await dlg("미리보기: notes.txt");
    await new Promise((r) => setTimeout(r, 350)); // 느린 응답이 도착할 시간
    expect(screen.getByRole("dialog", { name: /미리보기/ })).toHaveAccessibleName("미리보기: notes.txt");
    expect(screen.getByLabelText("텍스트 미리보기")).toHaveTextContent("hello preview");
  });

  it("읽기에 실패하면 오류를 보여 준다", async () => {
    const b = seed();
    b.preview = async (p) => {
      throw new Error(`읽을 수 없음: ${p}`); // 목록에는 있지만 읽는 순간 실패(권한, 삭제 등)
    };
    const { user } = await renderApp(b);
    await goTo(user, 4);
    await user.keyboard(" ");
    const d = await dlg("미리보기: notes.txt");
    expect(await within(d).findByRole("alert")).toHaveTextContent("읽을 수 없음");
    await user.keyboard("{Escape}");
    gone();
  });

  it("열려 있는 동안 패널 키는 무시된다", async () => {
    const b = seed();
    const { user } = await renderApp(b);
    await goTo(user, 4);
    await user.keyboard(" ");
    await dlg("미리보기: notes.txt");
    await user.keyboard("{F8}{F7}{Insert}=");
    expect(b.trashed).toEqual([]);
    expect(screen.queryByRole("dialog", { name: "새 폴더" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "작업 큐" })).toBeNull();
    expect(selectedNames("left")).toEqual([]);
  });

  it("빈 폴더에서는 열리지 않는다 (ACT-02)", async () => {
    const { user } = await renderApp(seed(), "linux", { left: "/home/b", right: "/home/a" }, { emptyLeft: true });
    await user.keyboard(" ");
    await new Promise((r) => setTimeout(r, 30));
    gone();
  });
});

describe("Space 재배정: 선택 토글은 Insert와 Shift+Space", () => {
  it("Shift+Space도 선택을 토글하고 한 칸 내려간다. Space는 선택하지 않는다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{Shift>} {/Shift}");
    expect(selectedNames("left")).toEqual(["docs"]);
    expect(cursorName("left")).toBe("a.png");
    await user.keyboard("{Insert}");
    expect(selectedNames("left")).toEqual(["docs", "a.png"]);
    await user.keyboard(" ");
    await dlg(/미리보기/);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(selectedNames("left")).toEqual(["docs", "a.png"]));
  });
});
