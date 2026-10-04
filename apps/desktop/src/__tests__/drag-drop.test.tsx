import { act, createEvent, fireEvent, screen, waitFor, within } from "@testing-library/react";
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

type Pane = "left" | "right";
const rowByText = (pane: Pane, name: string) => within(list(pane)).getAllByRole("option").find((o) => o.textContent?.includes(name))!;
const section = (pane: Pane) => screen.getByRole("region", { name: pane === "left" ? "왼쪽 패널" : "오른쪽 패널" });
const status = () => screen.getByRole("status", { name: "상태 표시줄" });
const badge = () => document.querySelector("[data-drag-badge]");
const ghost = () => document.querySelector("[data-drag-ghost]");

/** 행에서 누르고(좌표 지정) 움직이는 동작. 실제 브라우저처럼 마우스 이벤트는 커서 아래 요소로 간다. */
const down = (el: Element, x = 10, y = 10) => fireEvent.mouseDown(el, { button: 0, clientX: x, clientY: y });
const moveTo = (el: Element, x: number, y: number, ctrl = false) => fireEvent.mouseMove(el, { clientX: x, clientY: y, ctrlKey: ctrl });
const up = (el: Element, ctrl = false) => fireEvent.mouseUp(el, { button: 0, ctrlKey: ctrl });
/** 행을 끌어 대상 위까지 움직인다(아직 놓지 않는다). */
const dragOver = (src: Element, target: Element, ctrl = false) => {
  down(src);
  moveTo(src, 40, 40, ctrl); // 5px 넘게 움직여 드래그 시작
  moveTo(target, 300, 300, ctrl);
};
const dragDrop = (src: Element, target: Element, ctrl = false) => {
  dragOver(src, target, ctrl);
  up(target, ctrl);
};

describe("드래그 & 드롭으로 복사·이동", () => {
  it("반대 패널에 놓으면 그 패널의 현재 폴더로 복사한다 (원본 유지)", async () => {
    const { backend } = await renderApp(seed());
    dragDrop(rowByText("left", "a.txt"), section("right"));
    await waitFor(() => expect(backend.read("/home/b/a.txt")).toBe("aaa"));
    expect(backend.exists("/home/a/a.txt")).toBe(true);
  });

  it("놓을 때 Ctrl이 눌려 있으면 이동한다 (원본이 사라진다)", async () => {
    const { backend } = await renderApp(seed());
    dragDrop(rowByText("left", "a.txt"), section("right"), true);
    await waitFor(() => expect(backend.read("/home/b/a.txt")).toBe("aaa"));
    expect(backend.exists("/home/a/a.txt")).toBe(false);
  });

  it("끄는 동안 커서 옆 표시는 Ctrl이 없으면 +, 있으면 −이고 마우스 이동과 Control 키로 바뀐다", async () => {
    await renderApp(seed());
    const src = rowByText("left", "a.txt");
    expect(badge()).toBeNull(); // 끌기 전에는 없다
    dragOver(src, section("right"), false);
    expect(badge()).toHaveTextContent("+");
    moveTo(section("right"), 310, 310, true); // 마우스가 움직이며 Ctrl
    expect(badge()).toHaveTextContent("−");
    moveTo(section("right"), 320, 320, false);
    expect(badge()).toHaveTextContent("+");
    fireEvent.keyDown(window, { key: "Control", ctrlKey: true }); // 마우스가 멈춘 채 Ctrl을 눌러도 바뀐다
    expect(badge()).toHaveTextContent("−");
    fireEvent.keyUp(window, { key: "Control" });
    expect(badge()).toHaveTextContent("+");
    expect(ghost()).toHaveTextContent("a.txt");
    up(section("right"));
  });

  it("표시는 끝나면(놓기·Esc) 사라진다", async () => {
    await renderApp(seed());
    dragDrop(rowByText("left", "a.txt"), section("right"));
    expect(badge()).toBeNull();
    dragOver(rowByText("left", "b.txt"), section("right"));
    expect(badge()).not.toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(badge()).toBeNull();
  });

  it("선택된 행을 끌면 선택 전체가, 선택에 없는 행을 끌면 그 행만 간다", async () => {
    const { user, backend } = await renderApp(seed());
    await user.keyboard("{ArrowDown}{ArrowDown}{Insert}{Insert}"); // a.txt, b.txt 선택
    dragOver(rowByText("left", "b.txt"), section("right"));
    expect(ghost()).toHaveTextContent("2개 항목");
    up(section("right"));
    await waitFor(() => expect(backend.exists("/home/b/b.txt")).toBe(true));
    expect(backend.exists("/home/b/a.txt")).toBe(true);

    dragDrop(rowByText("left", "docs"), section("right")); // 선택에 없는 행
    await waitFor(() => expect(backend.exists("/home/b/docs/readme.md")).toBe(true));
    expect(backend.exists("/home/b/other")).toBe(false);
  });

  it("반대 패널의 폴더 행에 놓으면 그 폴더 안으로 들어간다", async () => {
    const { backend } = await renderApp(seed());
    dragDrop(rowByText("left", "a.txt"), rowByText("right", "dest"));
    await waitFor(() => expect(backend.read("/home/b/dest/a.txt")).toBe("aaa"));
    expect(backend.exists("/home/b/a.txt")).toBe(false);
  });

  it("같은 패널 안의 폴더 행에 놓아도 그 폴더 안으로 들어간다 (Ctrl이면 이동)", async () => {
    const { backend } = await renderApp(seed());
    dragDrop(rowByText("left", "a.txt"), rowByText("left", "other"), true);
    await waitFor(() => expect(backend.read("/home/a/other/a.txt")).toBe("aaa"));
    expect(backend.exists("/home/a/a.txt")).toBe(false);
  });

  it("같은 패널의 빈 곳에 놓거나 자기 자신·자기 하위 폴더에 놓으면 아무 일도 없다", async () => {
    const { backend } = await renderApp(seed());
    dragDrop(rowByText("left", "a.txt"), section("left")); // 제자리
    await new Promise((r) => setTimeout(r, 50));
    expect(backend.exists("/home/a/a (1).txt")).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();

    dragDrop(rowByText("left", "docs"), rowByText("left", "docs")); // 자기 자신 안으로: 대상이 되지 않는다
    await new Promise((r) => setTimeout(r, 50));
    expect(backend.exists("/home/a/docs/docs")).toBe(false);
  });

  it("이름이 겹치면 충돌 창이 뜨고 고른 대로 처리한다", async () => {
    const backend = seed().seed({ "/home/b/a.txt": "old" });
    await renderApp(backend);
    dragDrop(rowByText("left", "a.txt"), section("right"));
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
    dragOver(rowByText("right", "x.txt"), section("left"));
    expect(ghost()).toHaveAttribute("data-valid", "false"); // 받지 않는다
    up(section("left"));
    await new Promise((r) => setTimeout(r, 50));
    expect(backend.exists("/home/a/x.txt")).toBe(false);
  });

  it("폴더 행 위에서는 강조 표시(data-drop-target)가 켜지고 떠나면 꺼진다", async () => {
    await renderApp(seed());
    const folder = rowByText("right", "dest");
    expect(folder).not.toHaveAttribute("data-drop-target");
    dragOver(rowByText("left", "a.txt"), folder);
    expect(folder).toHaveAttribute("data-drop-target", "true");
    moveTo(section("right"), 400, 400); // 폴더 행을 벗어난다
    expect(folder).not.toHaveAttribute("data-drop-target");
    moveTo(rowByText("right", "x.txt"), 410, 410); // 파일 행은 대상이 아니다(패널이 대상)
    expect(rowByText("right", "x.txt")).not.toHaveAttribute("data-drop-target");
    up(section("right"));
  });

  it("5px보다 적게 움직이면 드래그가 아니라 클릭이다 (커서 이동은 그대로)", async () => {
    const { user } = await renderApp(seed());
    const row = rowByText("left", "b.txt");
    down(row, 10, 10);
    moveTo(row, 12, 12);
    expect(ghost()).toBeNull();
    up(row);
    await user.click(row);
    expect(row).toHaveAttribute("data-cursor", "true");
  });

  it("Ctrl+클릭과 Shift+클릭 선택은 드래그를 시작하지 않는다", async () => {
    await renderApp(seed());
    const row = rowByText("left", "b.txt");
    fireEvent.mouseDown(row, { button: 0, ctrlKey: true, clientX: 10, clientY: 10 });
    moveTo(row, 80, 80);
    expect(ghost()).toBeNull();
    fireEvent.mouseUp(row, { button: 0, ctrlKey: true });
    fireEvent.mouseDown(row, { button: 0, shiftKey: true, clientX: 10, clientY: 10 });
    moveTo(row, 80, 80);
    expect(ghost()).toBeNull();
  });

  it("드래그를 끝낸 직후의 click은 커서 이동·선택을 일으키지 않는다", async () => {
    await renderApp(seed());
    const src = rowByText("left", "b.txt");
    dragOver(src, src); // 같은 행 위에서 끝낸다(대상은 없다)
    up(src);
    // 브라우저가 놓은 직후에 보내는 click
    const ev = createEvent.click(src);
    act(() => void src.dispatchEvent(ev));
    expect(ev.defaultPrevented).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    const later = createEvent.click(src); // 시간이 지난 뒤의 click은 정상이다
    act(() => void src.dispatchEvent(later));
    expect(later.defaultPrevented).toBe(false);
  });
});
