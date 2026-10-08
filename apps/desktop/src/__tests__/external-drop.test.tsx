import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { list, renderApp } from "./helpers";
import { searchBackend, submitQuery, waitDone } from "./search-helpers";

// Finder 같은 다른 앱에서 끌어 온 파일(이슈 #39). 실제 OS 끌기는 만들 수 없어 FakeBackend의 emitFileDrop으로 Tauri 드롭 이벤트를 흉내 낸다.
// 왼쪽 /home/a: docs(readme.md) a.txt / 오른쪽 /home/b: dest(d.txt) x.txt / 밖(Finder): /ext/dropped.txt, /ext/a.txt
const seed = () =>
  new FakeBackend().seed({
    "/home/a/docs/readme.md": "r",
    "/home/a/a.txt": "aaa",
    "/home/b/dest/d.txt": "d",
    "/home/b/x.txt": "xxx",
    "/ext/dropped.txt": "from finder",
    "/ext/a.txt": "ext-a",
  });

type Pane = "left" | "right";
const section = (pane: Pane) => screen.getByRole("region", { name: pane === "left" ? "왼쪽 패널" : "오른쪽 패널" });
const rowByText = (pane: Pane, name: string) => within(list(pane)).getAllByRole("option").find((o) => o.textContent?.includes(name))!;

/** 좌표 아래 요소를 테스트가 정한다(jsdom에는 elementFromPoint가 없다). */
let at: Element | null = null;
Object.defineProperty(document, "elementFromPoint", { configurable: true, writable: true, value: () => at });
afterEach(() => {
  at = null;
});

const emit = (b: FakeBackend, type: "enter" | "over" | "drop" | "leave", paths: string[] = [], el: Element | null = at) => {
  at = el;
  act(() => b.emitFileDrop({ type, paths, x: 100, y: 100 }));
};

describe("Finder에서 끌어 온 파일 놓기", () => {
  it("패널에 놓으면 그 패널의 현재 폴더로 복사한다(원본은 그대로)", async () => {
    const backend = seed();
    await renderApp(backend);
    emit(backend, "drop", ["/ext/dropped.txt"], section("right"));
    await waitFor(() => expect(backend.read("/home/b/dropped.txt")).toBe("from finder"));
    expect(backend.exists("/ext/dropped.txt")).toBe(true);
    expect(backend.exists("/home/a/dropped.txt")).toBe(false);
  });

  it("폴더 행 위에 놓으면 그 폴더 안으로 복사한다", async () => {
    const backend = seed();
    await renderApp(backend);
    emit(backend, "drop", ["/ext/dropped.txt", "/ext/a.txt"], rowByText("right", "dest"));
    await waitFor(() => expect(backend.read("/home/b/dest/dropped.txt")).toBe("from finder"));
    expect(backend.read("/home/b/dest/a.txt")).toBe("ext-a");
  });

  it("패널 밖(상태 표시줄 등)에 놓으면 아무 일도 없다", async () => {
    const backend = seed();
    await renderApp(backend);
    emit(backend, "drop", ["/ext/dropped.txt"], screen.getByRole("status", { name: "상태 표시줄" }));
    await new Promise((r) => setTimeout(r, 50));
    expect(backend.exists("/home/a/dropped.txt")).toBe(false);
    expect(backend.exists("/home/b/dropped.txt")).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("가상 탭(검색 결과 등)에는 놓을 수 없고 알림을 보인다", async () => {
    const backend = searchBackend().seed({ "/ext/dropped.txt": "x" });
    const { user } = await renderApp(backend);
    await user.keyboard("{Control>}p{/Control}"); // 왼쪽 패널에 Look Up 결과(가상 탭)
    await submitQuery(user, "report");
    await waitDone();
    emit(backend, "drop", ["/ext/dropped.txt"], section("left"));
    expect(await screen.findByText(/가상 탭에는 파일을 놓을 수 없습니다/)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(backend.exists("/home/a/dropped.txt")).toBe(false);
  });

  it("끌어 온 항목이 모두 이미 그 폴더에 있으면 건너뛰고 알린다", async () => {
    const backend = seed();
    await renderApp(backend);
    emit(backend, "drop", ["/home/a/a.txt"], section("left"));
    expect(await screen.findByText("이미 이 폴더에 있는 항목입니다")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(backend.exists("/home/a/a (1).txt")).toBe(false);
  });

  it("이름이 겹치면 기존 충돌 창이 뜨고 고른 대로 처리한다", async () => {
    const backend = seed();
    await renderApp(backend);
    emit(backend, "drop", ["/ext/a.txt"], section("left")); // /home/a에 이미 a.txt가 있다
    await screen.findByRole("dialog", { name: "복사: 이름이 겹칩니다" });
    fireEvent.keyDown(document.body, { key: "o" }); // 덮어쓰기
    await waitFor(() => expect(backend.read("/home/a/a.txt")).toBe("ext-a"));
  });
});

describe("끌고 있는 동안의 강조", () => {
  it("패널 위에서는 그 패널이, 폴더 행 위에서는 그 행이 강조되고 떠나면 꺼진다. 앱의 끌기 표시(ghost)는 그리지 않는다", async () => {
    const backend = seed();
    await renderApp(backend);
    const folder = rowByText("right", "dest");
    emit(backend, "enter", ["/ext/dropped.txt"], section("right"));
    expect(section("right")).toHaveAttribute("data-drop-target", "true");
    expect(section("left")).not.toHaveAttribute("data-drop-target");
    expect(document.querySelector("[data-drag-ghost]")).toBeNull();
    emit(backend, "over", [], folder); // over에는 경로가 없어도 enter의 경로를 이어 쓴다
    expect(folder).toHaveAttribute("data-drop-target", "true");
    expect(section("right")).not.toHaveAttribute("data-drop-target");
    emit(backend, "leave", [], null);
    expect(folder).not.toHaveAttribute("data-drop-target");
    expect(section("right")).not.toHaveAttribute("data-drop-target");
  });

  it("놓으면 강조가 꺼진다", async () => {
    const backend = seed();
    await renderApp(backend);
    emit(backend, "enter", ["/ext/dropped.txt"], section("left"));
    expect(section("left")).toHaveAttribute("data-drop-target", "true");
    emit(backend, "drop", ["/ext/dropped.txt"], section("left"));
    expect(section("left")).not.toHaveAttribute("data-drop-target");
    await waitFor(() => expect(backend.read("/home/a/dropped.txt")).toBe("from finder"));
  });
});
