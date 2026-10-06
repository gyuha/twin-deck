import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { cursorName, names, renderApp, selectedNames } from "./helpers";

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
    await user.keyboard("{ArrowRight}");
    const d = await dlg("미리보기: notes.txt");
    expect(within(d).getByLabelText("텍스트 미리보기")).toHaveTextContent("hello preview");
    expect(within(d).getByLabelText("텍스트 미리보기")).toHaveTextContent("둘째 줄");
    await user.keyboard(" ");
    gone();

    await user.keyboard("{Control>}y{/Control}");
    await dlg("미리보기: notes.txt");
    await user.keyboard("{Control>}y{/Control}");
    gone();

    await user.keyboard("{ArrowRight}");
    await dlg("미리보기: notes.txt");
    await user.keyboard("{Escape}");
    gone();
  });

  it("이미지는 그림으로 보여 준다", async () => {
    const { user } = await renderApp(seed());
    await goTo(user, 1);
    await user.keyboard("{ArrowRight}");
    const d = await dlg("미리보기: a.png");
    const img = within(d).getByRole("img", { name: "a.png" });
    expect(img.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
  });

  it("큰 텍스트는 앞부분만 보여 주고 알린다", async () => {
    const { user } = await renderApp(seed());
    await goTo(user, 2);
    await user.keyboard("{ArrowRight}");
    const d = await dlg("미리보기: big.log");
    expect(within(d).getByLabelText("텍스트 미리보기").textContent!.length).toBe(64 * 1024);
    expect(d).toHaveTextContent("앞부분만 표시합니다");
  });

  it("바이너리는 미리 볼 수 없다고 알리고 폴더는 트리로 보여 준다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{Control>}y{/Control}"); // docs (폴더는 오른쪽 키가 들어가므로 Mod+Y)
    let d = await dlg("미리보기: docs");
    expect(d).not.toHaveTextContent("미리 볼 수 없는 형식"); // 폴더는 트리 텍스트(folder-preview.test)
    await user.keyboard("{Escape}");
    await goTo(user, 3); // data.bin
    await user.keyboard("{ArrowRight}");
    d = await dlg("미리보기: data.bin");
    expect(d).toHaveTextContent("기타 — 미리 볼 수 없는 형식");
  });

  it("열려 있는 동안 ↑↓로 이전/다음 항목을 보여 주고 커서도 따라간다", async () => {
    const { user } = await renderApp(seed());
    await goTo(user, 3); // data.bin
    await user.keyboard("{ArrowRight}");
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
    await user.keyboard("{ArrowRight}");
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
    await user.keyboard("{ArrowRight}");
    const d = await dlg("미리보기: notes.txt");
    expect(await within(d).findByRole("alert")).toHaveTextContent("읽을 수 없음");
    await user.keyboard("{Escape}");
    gone();
  });

  it("열려 있는 동안 패널 키는 무시된다", async () => {
    const b = seed();
    const { user } = await renderApp(b);
    await goTo(user, 4);
    await user.keyboard("{ArrowRight}");
    await dlg("미리보기: notes.txt");
    await user.keyboard("{F8}{F7}{Insert}=");
    expect(b.trashed).toEqual([]);
    expect(screen.queryByRole("dialog", { name: "새 폴더" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "작업 큐" })).toBeNull();
    expect(selectedNames("left")).toEqual([]);
  });

  it("빈 폴더에서는 열리지 않는다 (ACT-02)", async () => {
    const { user } = await renderApp(seed(), "linux", { left: "/home/b", right: "/home/a" }, { emptyLeft: true });
    await user.keyboard("{ArrowRight}");
    await new Promise((r) => setTimeout(r, 30));
    gone();
  });
});

describe("미리보기가 열린 동안 왼쪽 키", () => {
  it("왼쪽 키는 미리보기를 닫고 커서와 폴더는 그대로 둔다", async () => {
    const { user } = await renderApp(seed());
    await goTo(user, 4); // notes.txt
    await user.keyboard("{ArrowRight}");
    await dlg("미리보기: notes.txt");
    await user.keyboard("{ArrowLeft}");
    gone();
    expect(cursorName("left")).toBe("notes.txt");
    expect(names("left")).toHaveLength(5);
  });
});

describe("Space는 선택 토글, 미리보기는 오른쪽 키", () => {
  it("Space는 현재 항목을 선택하고 한 칸 내려간다. 미리보기는 열리지 않는다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard(" ");
    expect(selectedNames("left")).toEqual(["docs"]);
    expect(cursorName("left")).toBe("a.png");
    await user.keyboard("{Insert}");
    expect(selectedNames("left")).toEqual(["docs", "a.png"]);
    expect(screen.queryByRole("dialog", { name: /미리보기/ })).toBeNull();
    await user.keyboard("{ArrowRight}");
    await dlg(/미리보기/);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(selectedNames("left")).toEqual(["docs", "a.png"]));
  });
});

describe("미리보기 제목", () => {
  it("긴 파일 이름도 줄여서 자르지 않고 줄바꿈으로 전부 보여 주며, 본문이 길어도 제목 높이가 줄지 않는다", async () => {
    const long = `${"아주긴이름".repeat(15)}.txt`;
    const { user } = await renderApp(
      new FakeBackend().seed({ [`/home/a/${long}`]: "x\n".repeat(5000), "/home/b": null }),
    );
    await user.keyboard("{ArrowRight}");
    const d = await dlg(`미리보기: ${long}`);
    const h = within(d).getByRole("heading", { name: long });
    expect(h.textContent).toBe(long); // 이름이 잘리지 않고 그대로 들어 있다
    // truncate(overflow:hidden)는 flex 안에서 높이가 0까지 줄어 글자 윗부분이 잘리는 원인이었다
    expect(h.className).not.toContain("truncate");
    expect(h.className).toContain("shrink-0");
    expect(h.className).toContain("break-all");
  });
});

describe("항목을 넘길 때 깜빡임", () => {
  it("다음 항목을 읽는 동안 이전 내용을 그대로 보여 주고(빈 창·'불러오는 중' 없음), 도착하면 바뀐다", async () => {
    const b = seed();
    const orig = b.preview.bind(b);
    b.preview = async (p) => {
      if (p.endsWith("notes.txt")) await new Promise((r) => setTimeout(r, 150)); // 다음 항목이 느리다
      return orig(p);
    };
    const { user } = await renderApp(b);
    await goTo(user, 3); // data.bin
    await user.keyboard("{ArrowRight}");
    const d = await dlg("미리보기: data.bin");
    await within(d).findByText(/미리 볼 수 없는 형식/);
    await user.keyboard("{ArrowDown}"); // notes.txt (느림)
    const d2 = await dlg("미리보기: notes.txt");
    // 읽는 중에도 이전 내용이 남아 있고 로딩 문구로 비워지지 않는다
    expect(within(d2).queryByText("불러오는 중…")).toBeNull();
    expect(within(d2).getByText(/미리 볼 수 없는 형식/)).toBeTruthy();
    await waitFor(() => expect(within(d2).getByLabelText("텍스트 미리보기")).toHaveTextContent("hello preview"));
    expect(within(d2).queryByText(/미리 볼 수 없는 형식/)).toBeNull();
  });

  it("창 높이는 내용과 무관하게 고정이다(짧은 내용에서 줄었다 늘어나지 않는다)", async () => {
    const { user } = await renderApp(seed());
    await goTo(user, 4);
    await user.keyboard("{ArrowRight}");
    const d = await dlg("미리보기: notes.txt");
    expect(d.className).toContain("h-[80vh]");
    expect(d.className).not.toContain("max-h-[80vh]");
  });
});
