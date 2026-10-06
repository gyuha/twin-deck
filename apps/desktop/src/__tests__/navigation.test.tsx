import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { activePane, cursorName, names, renderApp, selectedNames } from "./helpers";

const breadcrumb = (pane: "left" | "right") =>
  within(screen.getAllByRole("navigation", { name: "경로" })[pane === "left" ? 0 : 1])
    .getAllByRole("button")
    .map((b) => b.textContent);

describe("PANE-01 두 패널과 Tab 전환", () => {
  it("왼쪽이 처음 활성이고 Tab으로 전환된다", async () => {
    const { user } = await renderApp();
    expect(activePane()).toBe("left");
    await user.keyboard("{Tab}");
    expect(activePane()).toBe("right");
    await user.keyboard("{Tab}");
    expect(activePane()).toBe("left");
  });
});

describe("PANE-02 패널별 독립 탭 상태", () => {
  it("탭마다 위치와 커서를 따로 가진다", async () => {
    const { user } = await renderApp();
    await user.keyboard("{Control>}t{/Control}");
    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(3)); // 왼쪽 2 + 오른쪽 1
    await user.keyboard("{Enter}"); // 새 탭(둘째)에서 docs로 진입
    await waitFor(() => expect(breadcrumb("left")).toEqual(["/", "home", "a", "docs"]));
    await user.keyboard("{Control>}{PageUp}{/Control}"); // 첫째 탭으로
    await waitFor(() => expect(breadcrumb("left")).toEqual(["/", "home", "a"]));
    expect(breadcrumb("right")).toEqual(["/", "home", "b"]);
    expect(cursorName("left")).toBe("docs");
  });
});

describe("PANE-04 탭 단축키", () => {
  it("새 탭, 순환, 닫기, 마지막 탭은 닫히지 않는다", async () => {
    const { user } = await renderApp();
    const leftTabs = () => within(screen.getAllByRole("tablist")[0]).getAllByRole("tab");
    await user.keyboard("{Control>}t{/Control}");
    await waitFor(() => expect(leftTabs()).toHaveLength(2));
    expect(leftTabs()[1]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Control>}{PageDown}{/Control}"); // 둘째에서 다음 → 첫째로 순환
    expect(leftTabs()[0]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Control>}w{/Control}");
    await waitFor(() => expect(leftTabs()).toHaveLength(1));
    await user.keyboard("{Control>}w{/Control}");
    expect(leftTabs()).toHaveLength(1);
  });
});

describe("NAV-01 방향키/Home/End/Page 이동", () => {
  it("커서가 이동하고 양 끝에서 멈춘다", async () => {
    const { user } = await renderApp();
    expect(cursorName("left")).toBe("docs");
    await user.keyboard("{ArrowDown}");
    expect(cursorName("left")).toBe("src");
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(cursorName("left")).toBe("docs");
    await user.keyboard("{End}");
    expect(cursorName("left").normalize("NFC")).toBe("한글.txt");
    expect(names("left")).toHaveLength(5);
    await user.keyboard("{Home}");
    expect(cursorName("left")).toBe("docs");
    await user.keyboard("{PageDown}");
    expect(cursorName("left")).not.toBe("docs");
    await user.keyboard("{PageUp}");
    expect(cursorName("left")).toBe("docs");
  });
});

describe("NAV-03 열기와 상위 이동", () => {
  it("Enter로 폴더에 들어가고 Backspace로 나오면 커서가 원래 폴더에 있다", async () => {
    const { user } = await renderApp();
    await user.keyboard("{ArrowDown}{Enter}");
    await waitFor(() => expect(breadcrumb("left")).toEqual(["/", "home", "a", "src"]));
    expect(names("left")[0]).toContain("main.rs");
    await user.keyboard("{Backspace}");
    await waitFor(() => expect(breadcrumb("left")).toEqual(["/", "home", "a"]));
    expect(cursorName("left")).toBe("src");
  });

  it("파일에서 Enter는 아무 일도 하지 않는다", async () => {
    const { user } = await renderApp();
    await user.keyboard("{ArrowDown}{ArrowDown}"); // a.txt
    await user.keyboard("{Enter}");
    expect(breadcrumb("left")).toEqual(["/", "home", "a"]);
  });

  it("'..' 항목 더블클릭으로 상위 이동", async () => {
    const { user } = await renderApp();
    await user.dblClick(screen.getAllByRole("button", { name: "상위 폴더" })[0]);
    await waitFor(() => expect(breadcrumb("left")).toEqual(["/", "home"]));
  });
});

describe("NAV-12 브레드크럼", () => {
  it("경로 조각을 보여 주고 클릭하면 이동한다", async () => {
    const { user } = await renderApp();
    expect(breadcrumb("left")).toEqual(["/", "home", "a"]);
    await user.click(within(screen.getAllByRole("navigation", { name: "경로" })[0]).getByRole("button", { name: "home" }));
    await waitFor(() => expect(breadcrumb("left")).toEqual(["/", "home"]));
    expect(names("left").some((n) => n.includes("a"))).toBe(true);
  });
});

describe("SEL-01 전체 선택과 해제", () => {
  it("Ctrl+A로 모두 선택, Esc로 해제", async () => {
    const { user } = await renderApp();
    await user.keyboard("{Control>}a{/Control}");
    expect(selectedNames("left")).toHaveLength(5);
    expect(screen.getByRole("status", { name: "상태 표시줄" })).toHaveTextContent("파일: 3/3, 폴더: 2/2");
    await user.keyboard("{Escape}");
    expect(selectedNames("left")).toHaveLength(0);
  });
});

describe("SEL-02 Shift+이동은 지나간 범위의 선택을 반전", () => {
  it("Shift+↓ 두 번이면 처음 두 항목이 선택된다", async () => {
    const { user } = await renderApp();
    await user.keyboard("{Shift>}{ArrowDown}{ArrowDown}{/Shift}");
    expect(selectedNames("left")).toEqual(["docs", "src"]);
    expect(cursorName("left")).toBe("a.txt");
  });

  it("이미 선택된 항목을 지나가면 선택이 해제된다", async () => {
    const { user } = await renderApp();
    await user.keyboard("{Control>}a{/Control}");
    await user.keyboard("{Shift>}{ArrowDown}{/Shift}");
    expect(selectedNames("left")).not.toContain("docs");
    expect(selectedNames("left")).toHaveLength(4);
  });

  it("Insert는 커서 항목을 토글하고 한 칸 내려간다", async () => {
    const { user } = await renderApp();
    await user.keyboard("{Insert}");
    expect(selectedNames("left")).toEqual(["docs"]);
    expect(cursorName("left")).toBe("src");
  });
});

describe("SEL-05 Quick Select", () => {
  it("문자를 입력하면 부분 일치 항목으로 커서가 가고 Esc로 끝난다", async () => {
    const { user } = await renderApp();
    await user.keyboard("b");
    expect(screen.getByRole("status", { name: "빠른 선택" })).toHaveTextContent("b");
    expect(cursorName("left")).toBe("b.txt");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("status", { name: "빠른 선택" })).toBeNull();
  });

  it("Backspace는 입력을 지우고 Enter는 일치한 행을 연다", async () => {
    const { user } = await renderApp();
    await user.keyboard("sr");
    expect(cursorName("left")).toBe("src");
    await user.keyboard("{Backspace}"); // "s" → 처음 일치하는 docs
    expect(screen.getByRole("status", { name: "빠른 선택" })).toHaveTextContent("빠른 선택: s");
    expect(cursorName("left")).toBe("docs");
    expect(breadcrumb("left")).toEqual(["/", "home", "a"]); // Backspace가 상위 이동을 일으키지 않았다
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("status", { name: "빠른 선택" })).toBeNull();
    await waitFor(() => expect(breadcrumb("left")).toEqual(["/", "home", "a", "docs"])); // 이슈 #4: 일치한 행(폴더)을 연다
  });

  it("NFD로 저장된 한글 이름이 NFC 입력에 일치한다", async () => {
    const { user } = await renderApp();
    await user.keyboard("한글");
    expect(cursorName("left").normalize("NFC")).toBe("한글.txt");
  });
});

describe("OP-17 숨김 파일 표시", () => {
  it("Ctrl+H로 숨김 파일이 나타났다 사라진다", async () => {
    const { user } = await renderApp();
    expect(names("left").some((n) => n.includes(".hidden"))).toBe(false);
    await user.keyboard("{Control>}h{/Control}");
    await waitFor(() => expect(names("left").some((n) => n.includes(".hidden"))).toBe(true));
    await user.keyboard("{Control>}h{/Control}");
    await waitFor(() => expect(names("left").some((n) => n.includes(".hidden"))).toBe(false));
  });

  it("macOS 키맵은 Cmd+Shift+. 를 쓴다", async () => {
    const { user } = await renderApp(undefined, "mac");
    await user.keyboard("{Meta>}{Shift>}.{/Shift}{/Meta}");
    await waitFor(() => expect(names("left").some((n) => n.includes(".hidden"))).toBe(true));
  });
});
