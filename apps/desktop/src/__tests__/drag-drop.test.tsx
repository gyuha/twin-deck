import { createEvent, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { list, renderApp } from "./helpers";
import { searchBackend, submitQuery, waitDone } from "./search-helpers";

// 왼쪽 /home/a: docs(readme.md) other(o.txt) a.txt b.txt / 오른쪽 /home/b: dest(d.txt) x.txt
const seed = () =>
  new FakeBackend().seed({
    "/home/a/docs/readme.md": "r",
    "/home/a/other/o.txt": "o",
    "/home/a/a.txt": "aaa",
    "/home/a/b.txt": "bbb",
    "/home/b/dest/d.txt": "d",
    "/home/b/x.txt": "xxx",
  });

const row = (pane: "left" | "right", name: string) => within(list(pane)).getByRole("option", { name: new RegExp(`^.?${name}`) });
const rowByText = (pane: "left" | "right", name: string) =>
  within(list(pane)).getAllByRole("option").find((o) => o.textContent?.includes(name))!;
const section = (pane: "left" | "right") => screen.getByRole("region", { name: pane === "left" ? "왼쪽 패널" : "오른쪽 패널" });

/** dataTransfer를 흉내 낸다(jsdom에는 없다). dropEffect를 읽어 볼 수 있다. */
function dt() {
  const data: Record<string, string> = {};
  return { data, dropEffect: "none", effectAllowed: "uninitialized", setData: (k: string, v: string) => (data[k] = v), getData: (k: string) => data[k] ?? "" };
}
const start = (el: Element, t = dt()) => {
  fireEvent.dragStart(el, { dataTransfer: t });
  return t;
};
/** jsdom에는 DragEvent가 없어 ctrlKey 초기값이 버려지므로 이벤트를 만든 뒤 직접 건다. */
const withCtrl = <E extends Event>(ev: E, ctrl: boolean): E => {
  Object.defineProperty(ev, "ctrlKey", { value: ctrl });
  return ev;
};
const over = (el: Element, t: ReturnType<typeof dt>, ctrl = false) => fireEvent(el, withCtrl(createEvent.dragOver(el, { dataTransfer: t }), ctrl));
const drop = (el: Element, t: ReturnType<typeof dt>, ctrl = false) => fireEvent(el, withCtrl(createEvent.drop(el, { dataTransfer: t }), ctrl));
const status = () => screen.getByRole("status", { name: "상태 표시줄" });

describe("드래그 & 드롭으로 복사·이동", () => {
  it("행은 끌 수 있다", async () => {
    await renderApp(seed());
    expect(rowByText("left", "a.txt")).toHaveAttribute("draggable", "true");
  });

  it("반대 패널에 놓으면 그 패널의 현재 폴더로 복사한다 (원본 유지)", async () => {
    const { backend } = await renderApp(seed());
    const t = start(rowByText("left", "a.txt"));
    over(section("right"), t);
    drop(section("right"), t);
    await waitFor(() => expect(backend.read("/home/b/a.txt")).toBe("aaa"));
    expect(backend.exists("/home/a/a.txt")).toBe(true);
  });

  it("드롭 때 Ctrl이 눌려 있으면 이동한다 (원본이 사라진다)", async () => {
    const { backend } = await renderApp(seed());
    const t = start(rowByText("left", "a.txt"));
    over(section("right"), t, true);
    drop(section("right"), t, true);
    await waitFor(() => expect(backend.read("/home/b/a.txt")).toBe("aaa"));
    expect(backend.exists("/home/a/a.txt")).toBe(false);
  });

  it("끄는 동안 커서 표시(dropEffect)는 Ctrl이 없으면 copy, 있으면 move다", async () => {
    await renderApp(seed());
    const t = start(rowByText("left", "a.txt"));
    over(section("right"), t, false);
    expect(t.dropEffect).toBe("copy");
    over(section("right"), t, true);
    expect(t.dropEffect).toBe("move");
    const folder = rowByText("right", "dest");
    over(folder, t, false);
    expect(t.dropEffect).toBe("copy");
    over(folder, t, true);
    expect(t.dropEffect).toBe("move");
  });

  it("선택된 행을 끌면 선택 전체가, 선택에 없는 행을 끌면 그 행만 간다", async () => {
    const { user, backend } = await renderApp(seed());
    await user.keyboard("{ArrowDown}{ArrowDown}{Insert}{Insert}"); // a.txt, b.txt 선택
    const t = start(rowByText("left", "b.txt"));
    drop(section("right"), t);
    await waitFor(() => expect(backend.exists("/home/b/b.txt")).toBe(true));
    expect(backend.exists("/home/b/a.txt")).toBe(true);

    const t2 = start(rowByText("left", "docs")); // 선택에 없는 행
    drop(section("right"), t2);
    await waitFor(() => expect(backend.exists("/home/b/docs/readme.md")).toBe(true));
    expect(backend.exists("/home/b/other")).toBe(false);
  });

  it("반대 패널의 폴더 행에 놓으면 그 폴더 안으로 들어간다", async () => {
    const { backend } = await renderApp(seed());
    const t = start(rowByText("left", "a.txt"));
    drop(rowByText("right", "dest"), t);
    await waitFor(() => expect(backend.read("/home/b/dest/a.txt")).toBe("aaa"));
    expect(backend.exists("/home/b/a.txt")).toBe(false);
  });

  it("같은 패널 안의 폴더 행에 놓아도 그 폴더 안으로 들어간다 (Ctrl이면 이동)", async () => {
    const { backend } = await renderApp(seed());
    const t = start(rowByText("left", "a.txt"));
    drop(rowByText("left", "other"), t, true);
    await waitFor(() => expect(backend.read("/home/a/other/a.txt")).toBe("aaa"));
    expect(backend.exists("/home/a/a.txt")).toBe(false);
  });

  it("같은 패널의 빈 곳에 놓거나 자기 자신·자기 하위 폴더에 놓으면 아무 일도 없다", async () => {
    const { backend } = await renderApp(seed());
    const t = start(rowByText("left", "a.txt"));
    drop(section("left"), t); // 제자리
    await new Promise((r) => setTimeout(r, 50));
    expect(backend.exists("/home/a/a (1).txt")).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();

    const t2 = start(rowByText("left", "docs"));
    drop(rowByText("left", "docs"), t2); // 자기 자신 안으로
    await waitFor(() => expect(status()).toHaveTextContent("원본 폴더 안으로는 보낼 수 없습니다"));
    expect(backend.exists("/home/a/docs/docs")).toBe(false);
  });

  it("이름이 겹치면 충돌 창이 뜨고 고른 대로 처리한다", async () => {
    const backend = seed().seed({ "/home/b/a.txt": "old" });
    await renderApp(backend);
    const t = start(rowByText("left", "a.txt"));
    drop(section("right"), t);
    await screen.findByRole("dialog", { name: "복사: 이름이 겹칩니다" });
    fireEvent.keyDown(document.body, { key: "o" });
    await waitFor(() => expect(backend.read("/home/b/a.txt")).toBe("aaa"));
  });

  it("가상 탭(검색 결과 등)에는 놓을 수 없다", async () => {
    const backend = searchBackend();
    const { user } = await renderApp(backend);
    await user.keyboard("{Control>}p{/Control}"); // 왼쪽 패널에 Look Up 결과(가상 탭)
    await submitQuery(user, "report");
    await waitDone();
    const t = start(rowByText("right", "x.txt")); // 오른쪽 패널의 파일을 왼쪽 가상 탭에 놓는다
    over(section("left"), t);
    expect(t.dropEffect).toBe("none"); // 받지 않는다
    drop(section("left"), t);
    await new Promise((r) => setTimeout(r, 50));
    expect(backend.exists("/home/a/x.txt")).toBe(false);
    // 같은 끌기를 일반 폴더에는 놓을 수 있다(대조): 오른쪽 패널의 다른 폴더가 없으니 상위 패널 규칙만 확인한다.
    const t2 = start(rowByText("right", "x.txt"));
    over(section("right"), t2);
    expect(t2.dropEffect).toBe("copy");
  });

  it("웹뷰가 Ctrl을 주지 않아도(운영체제 기준 Ctrl이 눌려 있으면) 이동한다", async () => {
    const { backend } = await renderApp(seed());
    const t = start(rowByText("left", "a.txt"));
    backend.ctrlDown = true; // 이벤트의 ctrlKey는 false지만 운영체제는 Ctrl이 눌려 있다고 답한다
    await new Promise((r) => setTimeout(r, 120)); // 드래그 중 운영체제 상태를 읽어 두는 주기
    over(section("right"), t, false);
    expect(t.dropEffect).toBe("move");
    drop(section("right"), t, false);
    await waitFor(() => expect(backend.read("/home/b/a.txt")).toBe("aaa"));
    expect(backend.exists("/home/a/a.txt")).toBe(false);
  });

  it("운영체제 기준으로도 Ctrl이 아니면 복사다", async () => {
    const { backend } = await renderApp(seed());
    const t = start(rowByText("left", "a.txt"));
    await new Promise((r) => setTimeout(r, 120));
    over(section("right"), t, false);
    expect(t.dropEffect).toBe("copy");
    drop(section("right"), t, false);
    await waitFor(() => expect(backend.read("/home/b/a.txt")).toBe("aaa"));
    expect(backend.exists("/home/a/a.txt")).toBe(true);
  });

  it("폴더 행 위에서는 강조 표시(data-drop-target)가 켜지고 떠나면 꺼진다", async () => {
    await renderApp(seed());
    const t = start(rowByText("left", "a.txt"));
    const folder = rowByText("right", "dest");
    expect(folder).not.toHaveAttribute("data-drop-target");
    over(folder, t);
    expect(folder).toHaveAttribute("data-drop-target", "true");
    fireEvent.dragLeave(folder);
    expect(folder).not.toHaveAttribute("data-drop-target");
    // 파일 행은 드롭 대상이 아니라 강조되지 않는다
    over(rowByText("right", "x.txt"), t);
    expect(rowByText("right", "x.txt")).not.toHaveAttribute("data-drop-target");
  });

  it("앱 밖에서 시작한 드래그(끌고 있는 항목이 없음)는 받지 않는다", async () => {
    const { backend } = await renderApp(seed());
    const t = dt();
    drop(section("right"), t);
    await new Promise((r) => setTimeout(r, 50));
    expect(backend.exists("/home/b/a.txt")).toBe(false);
    void row;
  });
});
