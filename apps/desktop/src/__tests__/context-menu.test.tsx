import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { cursorName, list, renderApp, selectedNames } from "./helpers";

// 이름순: docs, a.txt, b.txt
const seed = () => new FakeBackend().seed({ "/home/a/docs/in.txt": "x", "/home/a/a.txt": "a", "/home/a/b.txt": "b", "/home/b": null });
const rows = () => within(list("left")).getAllByRole("option");
const menu = () => screen.queryByRole("menu", { name: "컨텍스트 메뉴" });
const items = () => within(menu()!).getAllByRole("menuitem");
const labels = () => items().map((n) => n.firstElementChild?.textContent);
const rightClick = (i: number) => fireEvent.contextMenu(rows()[i], { clientX: 40, clientY: 40 });
const item = (name: string) => within(menu()!).getByRole("menuitem", { name: new RegExp(`^${name}`) });

describe("파일 행 컨텍스트 메뉴", () => {
  it("우클릭하면 메뉴가 열리고 항목이 순서대로 나온다", async () => {
    await renderApp(seed());
    expect(menu()).toBeNull();
    rightClick(1);
    expect(menu()).toBeTruthy();
    expect(labels()).toEqual(["열기", "다음으로 열기", "여기에 압축…", "이동", "복사", "삭제", "이름 바꾸기", "파일 속성 표시"]);
    expect(within(menu()!).getAllByRole("separator")).toHaveLength(3);
  });

  it("단축키 힌트는 키맵에서 나온다", async () => {
    await renderApp(seed());
    rightClick(1);
    expect(item("이동")).toHaveTextContent("F6");
    expect(item("복사")).toHaveTextContent("F5");
    expect(item("삭제")).toHaveTextContent("F8");
  });

  it("기본 키가 없는 액션은 힌트가 비어 있다", async () => {
    await renderApp(seed());
    rightClick(1);
    expect(item("여기에 압축…").textContent).toBe("여기에 압축…");
  });

  it("사용자가 키를 지정하면 그 키가 힌트로 나온다", async () => {
    const b = seed();
    b.setConfig((l) => l.bindings.push({ key: "F9", action: "core.compress", args: {}, scope: null }));
    await renderApp(b);
    rightClick(1);
    expect(item("여기에 압축…")).toHaveTextContent("F9");
  });

  it("선택 밖의 행을 우클릭하면 커서가 그 행으로 옮겨가고 선택이 비워진다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{Insert}"); // docs 선택
    expect(selectedNames("left")).toEqual(["docs"]);
    rightClick(2);
    expect(cursorName("left")).toBe("b.txt");
    expect(selectedNames("left")).toEqual([]);
  });

  it("선택 안의 행을 우클릭하면 선택이 유지된다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{Insert}{Insert}"); // docs, a.txt 선택
    rightClick(1);
    expect(selectedNames("left")).toEqual(["docs", "a.txt"]);
    expect(cursorName("left")).toBe("a.txt");
  });

  it("항목 클릭이 액션을 실행한다: 이동·복사는 대화상자, 삭제는 휴지통, 이름 바꾸기는 이름 대화상자", async () => {
    const backend = seed();
    const { user } = await renderApp(backend);
    rightClick(1);
    await user.click(item("이동"));
    expect(menu()).toBeNull();
    expect(await screen.findByRole("dialog")).toBeTruthy();
    await user.keyboard("{Escape}");
    rightClick(1);
    await user.click(item("복사"));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    await user.keyboard("{Escape}");
    rightClick(1);
    await user.click(item("이름 바꾸기"));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    await user.keyboard("{Escape}");
    rightClick(1);
    await user.click(item("삭제"));
    // F8과 같은 경로: 휴지통 확인 설정의 기본값이 꺼짐이라 바로 휴지통으로 간다.
    await waitFor(() => expect(backend.trashed).toEqual(["/home/a/a.txt"]));
  });

  it("열기: 파일은 실행하고 폴더는 들어간다", async () => {
    const backend = seed();
    const { user } = await renderApp(backend);
    rightClick(1);
    await user.click(item("열기"));
    await waitFor(() => expect(backend.opened).toEqual(["/home/a/a.txt"]));
    rightClick(0);
    await user.click(item("열기"));
    await waitFor(() => expect(within(list("left")).getAllByRole("option")).toHaveLength(1));
  });

  it("파일 속성 표시는 정보 창을 연다", async () => {
    const { user } = await renderApp(seed());
    rightClick(1);
    await user.click(item("파일 속성 표시"));
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("Esc·바깥 클릭·항목 실행 후 메뉴가 닫힌다", async () => {
    const { user } = await renderApp(seed());
    rightClick(1);
    await user.keyboard("{Escape}");
    expect(menu()).toBeNull();
    rightClick(1);
    fireEvent.mouseDown(menu()!.parentElement!.parentElement!);
    expect(menu()).toBeNull();
  });

  it("↑↓ Enter로 조작하고 → 로 하위 메뉴를 열고 ← 로 닫는다", async () => {
    const backend = seed();
    const { user } = await renderApp(backend);
    rightClick(1);
    const cursorLabel = () => items().find((n) => n.getAttribute("data-cursor") === "true")?.firstElementChild?.textContent;
    expect(cursorLabel()).toBe("열기");
    await user.keyboard("{ArrowDown}");
    expect(cursorLabel()).toBe("다음으로 열기");
    await user.keyboard("{ArrowRight}");
    const sub = screen.getByRole("menu", { name: "다음으로 열기" });
    expect(within(sub).getAllByRole("menuitem").map((n) => n.firstElementChild?.textContent)).toEqual([
      "편집기로 열기",
      "아카이브로 열기…",
      "파일 관리자에서 보기",
    ]);
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}"); // 파일 관리자에서 보기
    await waitFor(() => expect(backend.revealed).toEqual(["/home/a/a.txt"]));
    expect(menu()).toBeNull();
    rightClick(1);
    await user.keyboard("{ArrowDown}{ArrowRight}{ArrowLeft}");
    expect(screen.queryByRole("menu", { name: "다음으로 열기" })).toBeNull();
    expect(menu()).toBeTruthy(); // 하위 메뉴만 닫힌다
    await user.keyboard("{ArrowLeft}");
    expect(menu()).toBeNull();
  });

  it("빈 영역 우클릭은 메뉴를 열지 않는다", async () => {
    await renderApp(seed());
    fireEvent.contextMenu(list("left"), { clientX: 5, clientY: 5 });
    expect(menu()).toBeNull();
  });
});
