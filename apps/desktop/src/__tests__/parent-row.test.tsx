import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { list, renderApp } from "./helpers";

// 왼쪽 /home/a: 폴더 sub · 파일 a.txt b.txt (이름순), 오른쪽 /home/b. `..`는 /home으로 간다.
function backend(parentRow = true) {
  const b = new FakeBackend().seed({ "/home/a/sub/c.txt": "c", "/home/a/a.txt": "aaa", "/home/a/b.txt": "bbb", "/home/b/x.txt": "x" });
  b.setConfig((l) => {
    l.config.behavior.table.show_parent_row = parentRow;
    for (const k of Object.keys(l.config.fkey_bar)) l.config.fkey_bar[k] = false;
  });
  return b;
}
const options = () => within(list("left")).getAllByRole("option");
const parentOpt = () => within(list("left")).queryByRole("option", { name: "상위 폴더" });
const pathButtons = () =>
  within(screen.getAllByRole("navigation", { name: "경로" })[0])
    .getAllByRole("button")
    .map((b) => b.textContent);

describe("상위 행", () => {
  it("옵션을 켜면 목록 맨 위에 `..` 행이 보이고 커서는 첫 실제 항목에 있다", async () => {
    await renderApp(backend());
    expect(options()[0]).toHaveTextContent("..");
    expect(options()[0]).toHaveAttribute("data-parent-row");
    expect(options()[0]).toHaveAttribute("data-cursor", "false");
    expect(options()[1]).toHaveTextContent("sub");
    expect(options()[1]).toHaveAttribute("data-cursor", "true");
  });

  it("↑로 `..`에 가서 Return을 누르면 상위 폴더로 올라간다", async () => {
    const { user } = await renderApp(backend());
    await user.keyboard("{ArrowUp}");
    expect(parentOpt()).toHaveAttribute("data-cursor", "true");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(pathButtons()).not.toContain("a"));
    expect(pathButtons()).toContain("home");
  });

  it("`..` 행을 더블클릭하면 상위 폴더로 올라간다", async () => {
    const { user } = await renderApp(backend());
    await user.dblClick(parentOpt()!);
    await waitFor(() => expect(pathButtons()).not.toContain("a"));
    expect(pathButtons()).toContain("home");
  });

  it("옵션이 꺼져 있으면(기본) `..` 행이 없다", async () => {
    await renderApp(backend(false));
    expect(parentOpt()).toBeNull();
    expect(options()).toHaveLength(3);
  });

  it("루트에서는 `..` 행이 없다", async () => {
    const b = new FakeBackend().seed({ "/top.txt": "t", "/home/b/x.txt": "x" });
    b.setConfig((l) => (l.config.behavior.table.show_parent_row = true));
    await renderApp(b, "linux", { left: "/", right: "/home/b" });
    expect(parentOpt()).toBeNull();
  });

  it("검색 결과 같은 가상 탭에는 `..` 행이 없다", async () => {
    const { user } = await renderApp(backend());
    await user.keyboard("{Control>}f{/Control}");
    const d = within(await screen.findByRole("dialog", { name: "파일 찾기" }));
    await user.type(d.getByRole("textbox", { name: "파일 마스크(F)" }), "*.txt");
    await user.click(d.getByRole("button", { name: "시작" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "파일 찾기" })).toBeNull());
    await waitFor(() => expect(options().length).toBeGreaterThan(0));
    expect(parentOpt()).toBeNull();
  });
});

describe("상위 행 예외 처리", () => {
  it("예외: 전체 선택 뒤 복사 확인 창은 `..`를 빼고 센다", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await user.keyboard("{Control>}a{/Control}{F5}");
    const d = await screen.findByRole("dialog", { name: /복사/ });
    expect(d).toHaveTextContent("3개 항목"); // sub, a.txt, b.txt
    await user.keyboard("{Enter}");
    await waitFor(() => expect(b.exists("/home/b/a.txt")).toBe(true));
    expect(b.exists("/home/b/sub")).toBe(true);
    expect(b.exists("/home/b/a")).toBe(false); // 부모(/home)나 `..`가 복사되지 않는다
    expect(b.exists("/home/b/home")).toBe(false);
  });

  it("예외: 전체 선택 뒤 이동도 `..`를 빼고 센다", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await user.keyboard("{Control>}a{/Control}{F6}");
    const d = await screen.findByRole("dialog", { name: /이동/ });
    expect(d).toHaveTextContent("3개 항목");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(b.exists("/home/b/a.txt")).toBe(true));
    expect(b.exists("/home/b/home")).toBe(false);
  });

  it("예외: 전체 선택 뒤 파일 경로 복사에 부모 경로가 없다", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await user.keyboard("{Control>}a{/Control}{Control>}{F12}{/Control}");
    await waitFor(() => expect(b.clipboard.at(-1)).toBe("/home/a/sub\n/home/a/a.txt\n/home/a/b.txt"));
  });

  it("예외: 커서가 `..`이고 선택이 없으면 복사·이동·삭제·이름 바꾸기가 아무 창도 열지 않는다", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await user.keyboard("{ArrowUp}");
    expect(parentOpt()).toHaveAttribute("data-cursor", "true");
    for (const k of ["{F5}", "{F6}", "{F8}", "{F2}", "{Control>}{F12}{/Control}"]) {
      await user.keyboard(k);
      await act(async () => {});
      expect(screen.queryByRole("dialog")).toBeNull();
    }
    expect(b.clipboard).toEqual([]);
  });

  it("예외: `..`에서 Space(선택 토글)해도 선택이 생기지 않고, 상태 표시줄 개수에 들지 않는다", async () => {
    const { user } = await renderApp(backend());
    await user.keyboard("{ArrowUp}{Insert}");
    expect(options().every((o) => o.getAttribute("aria-selected") === "false")).toBe(true);
    expect(screen.getByText(/파일: 0\/2/)).toBeInTheDocument();
    expect(screen.getByText(/폴더: 0\/1/)).toBeInTheDocument();
  });
});
