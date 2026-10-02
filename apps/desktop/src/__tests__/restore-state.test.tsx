import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Snapshot, TabSnap } from "@twin-deck/ts-client";
import { FakeBackend } from "@twin-deck/ts-client";
import { cursorName, entryNames, list, renderApp, selectedNames } from "./helpers";

const SAVE_WAIT = { timeout: 3000 };
const tab = (path: string, over: Partial<TabSnap> = {}): TabSnap => ({
  path,
  cursorName: null,
  selection: [],
  sort: null,
  view: { mode: "table", count: 1 },
  ...over,
});
const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  version: 1,
  activePane: "left",
  showHidden: false,
  paletteQuery: "",
  split: 500,
  left: { tabs: [tab("/home/a")], active: 0 },
  right: { tabs: [tab("/home/b")], active: 0 },
  ...over,
});
const seed = () =>
  new FakeBackend().seed({
    "/home/a/docs/readme.md": "r",
    "/home/a/a.txt": "aaa",
    "/home/a/b.md": "bbbbb",
    "/home/a/c.zip": "c",
    "/home/a/.hidden": "h",
    "/home/b/x.txt": "x",
  });
const crumbs = (pane: 0 | 1 = 0) =>
  within(screen.getAllByRole("navigation", { name: "경로" })[pane]).getAllByRole("button").map((b) => b.textContent);
const tabs = (pane: 0 | 1 = 0) => within(screen.getAllByRole("tablist")[pane]).getAllByRole("tab");
const bind = (key: string, action: string) => ({ key, action, args: {}, scope: null });
/** 다중 컬럼에서는 DOM 순서가 행 우선이라, aria-rowindex(=목록 순서)로 정렬해서 이름을 얻는다. */
const namesInOrder = (pane: "left" | "right") =>
  within(list(pane))
    .getAllByRole("option")
    .sort((a, b) => Number(a.getAttribute("aria-rowindex")) - Number(b.getAttribute("aria-rowindex")))
    .map((o) => o.querySelectorAll("span")[1]?.textContent ?? "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("PANE-05 상태 복원", () => {
  it("탭, 위치, 커서, 선택, 정렬, 표시 모드, 숨김 표시, 활성 패널, 검색어를 되살린다", async () => {
    const b = seed();
    const s = snap({
      activePane: "right",
      showHidden: true,
      paletteQuery: "dupl",
      split: 500,
      left: {
        active: 1,
        tabs: [
          tab("/home/a/docs"),
          tab("/home/a", {
            cursorName: "b.md",
            selection: ["/home/a/a.txt", "/home/a/gone.txt"], // 사라진 선택은 버려진다
            sort: { key: "size", dir: "desc" },
            view: { mode: "columns", count: 2 },
          }),
        ],
      },
    });
    const { user } = await renderApp(b, "linux", undefined, { snapshot: s });
    await waitFor(() => expect(tabs()).toHaveLength(2));
    expect(tabs()[1]).toHaveAttribute("aria-selected", "true");
    expect(crumbs()).toEqual(["/", "home", "a"]); // 활성 탭(둘째)의 위치
    expect(cursorName("left")).toBe("b.md");
    expect(selectedNames("left")).toEqual(["a.txt"]);
    expect(list("left").getAttribute("data-view")).toBe("columns-2");
    expect(entryNames("left")).toContain(".hidden"); // 숨김 파일 표시
    // 크기 내림차순: 폴더 먼저, b.md(5) > a.txt(3), 같은 크기(1)는 이름순(.hidden, c.zip)
    expect(namesInOrder("left")).toEqual(["docs", "b.md", "a.txt", ".hidden", "c.zip"]);
    expect(screen.getByRole("region", { name: "오른쪽 패널" })).toHaveAttribute("data-active", "true");

    // Actions Panel 검색어
    await user.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");
    expect(await screen.findByRole("textbox", { name: "액션 검색" })).toHaveValue("dupl");
  });

  it("복원 직후에는 아무것도 다시 저장하지 않는다", async () => {
    const b = seed();
    await renderApp(b, "linux", undefined, { snapshot: snap({ left: { tabs: [tab("/home/a", { cursorName: "b.md" })], active: 0 } }) });
    await waitFor(() => expect(cursorName("left")).toBe("b.md"));
    await sleep(900);
    expect(b.savedStates).toHaveLength(0);
  });

  it("사라진 폴더는 가장 가까운 존재하는 상위 폴더로 옮기고 알린다", async () => {
    const b = seed();
    const s = snap({ left: { tabs: [tab("/home/a/gone/deeper", { cursorName: "x", selection: ["/home/a/gone/deeper/x"] })], active: 0 } });
    await renderApp(b, "linux", undefined, { snapshot: s });
    await waitFor(() => expect(crumbs()).toEqual(["/", "home", "a"]));
    expect(await screen.findByRole("alert")).toHaveTextContent("상위 폴더로 옮겼습니다");
    expect(selectedNames("left")).toEqual([]);
    expect(cursorName("left")).toBe("docs");
  });

  it("커서 항목이 사라졌으면 처음 항목에 둔다", async () => {
    const b = seed();
    await renderApp(b, "linux", undefined, { snapshot: snap({ left: { tabs: [tab("/home/a", { cursorName: "사라진.txt" })], active: 0 } }) });
    await waitFor(() => expect(entryNames("left").length).toBeGreaterThan(0));
    expect(cursorName("left")).toBe("docs");
  });

  it("저장된 상태를 읽지 못했으면 기본 상태로 시작하고 안내한다", async () => {
    const b = seed();
    await renderApp(b, "linux", undefined, { snapshot: null, stateWarning: "state.json을 무시합니다: 저장 형식 버전이 다릅니다" });
    expect(await screen.findByRole("alert")).toHaveTextContent("저장 형식 버전이 다릅니다");
    expect(crumbs()).toEqual(["/", "home", "a"]);
    expect(tabs()).toHaveLength(1);
  });
});

describe("PANE-05 저장", () => {
  it("상태가 바뀌면 잠시 뒤 한 번 저장한다 (디바운스)", async () => {
    const b = seed();
    const { user } = await renderApp(b);
    await sleep(600);
    expect(b.savedStates).toHaveLength(0); // 아무것도 안 바꿨으면 저장하지 않는다
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{Insert}{Control>}t{/Control}");
    await waitFor(() => expect(b.savedStates.length).toBeGreaterThan(0), SAVE_WAIT);
    await sleep(900);
    expect(b.savedStates).toHaveLength(1); // 여러 변경이 한 번에 저장됨
    const saved = b.savedStates[0];
    expect(saved.left.tabs).toHaveLength(2);
    expect(saved.left.active).toBe(1);
    expect(saved.left.tabs[1]).toMatchObject({ path: "/home/a" });
  });

  it("커서, 선택, 정렬, 표시 모드, 숨김, 패널을 저장하고 그대로 되살아난다 (왕복)", async () => {
    const b = seed();
    b.setConfig((l) => l.bindings.push(bind("F9", "core.view.order")));
    const { user } = await renderApp(b);
    await user.keyboard("{ArrowDown}{ArrowDown}{Insert}"); // b.md 선택, 커서는 c.zip
    await user.keyboard("{Alt>}{Shift>}s{/Shift}{/Alt}"); // 크기 정렬
    await user.keyboard("{Control>}{Alt>}2{/Alt}{/Control}"); // 2열
    await user.keyboard("{Control>}h{/Control}"); // 숨김 표시
    await user.keyboard("{Tab}"); // 오른쪽 패널
    await waitFor(() => expect(b.savedStates.at(-1)?.activePane).toBe("right"), SAVE_WAIT);
    const saved = b.savedStates.at(-1)!;
    expect(saved).toMatchObject({ showHidden: true, activePane: "right", version: 1 });
    expect(saved.left.tabs[0]).toMatchObject({
      path: "/home/a",
      cursorName: "c.zip",
      selection: ["/home/a/b.md"],
      sort: { key: "size", dir: "asc" },
      view: { mode: "columns", count: 2 },
    });

    // 다음 실행: 저장된 상태로 시작하면 같은 화면이고, 다시 저장할 것이 없다
    const before = entryNames("left");
    const count = b.savedStates.length;
    cleanup();
    await renderApp(b, "linux", undefined, { snapshot: (await b.loadState()).snapshot });
    await waitFor(() => expect(selectedNames("left")).toEqual(["b.md"]));
    expect(cursorName("left")).toBe("c.zip");
    expect(entryNames("left")).toEqual(before);
    expect(list("left").getAttribute("data-view")).toBe("columns-2");
    expect(screen.getByRole("region", { name: "오른쪽 패널" })).toHaveAttribute("data-active", "true");
    await sleep(900);
    expect(b.savedStates).toHaveLength(count);
  });

  it("Actions Panel 검색어도 저장된다", async () => {
    const b = seed();
    const { user } = await renderApp(b);
    await user.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");
    await screen.findByRole("textbox", { name: "액션 검색" });
    await user.keyboard("복제{Escape}");
    await waitFor(() => expect(b.savedStates.at(-1)?.paletteQuery).toBe("복제"), SAVE_WAIT);
  });

  it("저장에 실패하면 알리고 다음 변경 때 다시 시도한다", async () => {
    const b = seed();
    let fail = true;
    const orig = b.saveState.bind(b);
    b.saveState = async (s) => {
      if (fail) throw new Error("디스크가 가득 참");
      return orig(s);
    };
    const { user } = await renderApp(b);
    await user.keyboard("{ArrowDown}");
    expect(await screen.findByText(/상태를 저장하지 못했습니다: 디스크가 가득 참/, undefined, SAVE_WAIT)).toBeInTheDocument();
    fail = false;
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(b.savedStates.length).toBe(1), SAVE_WAIT);
  });
});

describe("core.state.reset 상태 초기화", () => {
  const withReset = () => {
    const b = seed();
    b.setConfig((l) => l.bindings.push(bind("F9", "core.state.reset")));
    return b;
  };

  it("확인하면 저장된 상태를 지우고 종료하며 그 뒤로는 저장하지 않는다", async () => {
    const b = withReset();
    b.storedState = snap();
    const { user } = await renderApp(b);
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(b.savedStates.length).toBe(1), SAVE_WAIT);
    await user.keyboard("{F9}");
    const d = await screen.findByRole("dialog", { name: /저장된 상태를 모두 지우고/ });
    expect(d).toHaveTextContent("설정 파일은 그대로");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(b.stateReset).toBe(true));
    expect(b.storedState).toBeNull();
    const count = b.savedStates.length;
    await user.keyboard("{ArrowDown}{ArrowDown}");
    await sleep(900);
    expect(b.savedStates).toHaveLength(count); // 종료 직전에 지운 상태가 되살아나지 않는다
  });

  it("Esc로 취소하면 아무것도 지우지 않는다", async () => {
    const b = withReset();
    b.storedState = snap();
    const { user } = await renderApp(b);
    await user.keyboard("{F9}");
    await screen.findByRole("dialog", { name: /저장된 상태를 모두 지우고/ });
    await user.keyboard("{Escape}");
    expect(b.stateReset).toBe(false);
    expect(b.storedState).not.toBeNull();
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(b.savedStates.length).toBe(1), SAVE_WAIT); // 저장은 계속된다
  });

  it("초기화가 실패하면 알리고 저장을 다시 켠다", async () => {
    const b = withReset();
    b.resetState = async () => {
      throw new Error("권한 없음");
    };
    const { user } = await renderApp(b);
    await user.keyboard("{F9}");
    await screen.findByRole("dialog");
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("권한 없음");
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(b.savedStates.length).toBe(1), SAVE_WAIT);
  });
});

describe("PANE-03 다중 창 (창 생성은 fake만 검증)", () => {
  it("Mod+N이 새 창을 열고 레이블이 겹치지 않는다", async () => {
    const b = seed();
    const { user } = await renderApp(b);
    await user.keyboard("{Control>}n{/Control}");
    await waitFor(() => expect(b.windowsOpened).toEqual(["win-2"]));
    expect(await screen.findByText(/새 창을 열었습니다 \(win-2\)/)).toBeInTheDocument();
    await user.keyboard("{Control>}n{/Control}");
    await waitFor(() => expect(b.windowsOpened).toEqual(["win-2", "win-3"]));
  });

  it("새 창을 열지 못하면 오류를 알린다", async () => {
    const b = seed();
    b.newWindowError = "창을 만들 수 없음";
    const { user } = await renderApp(b);
    await user.keyboard("{Control>}n{/Control}");
    expect(await screen.findByRole("alert")).toHaveTextContent("창을 만들 수 없음");
    expect(b.windowsOpened).toEqual([]);
  });
});
