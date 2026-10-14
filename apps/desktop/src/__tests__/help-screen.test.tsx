import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "./helpers";

const openHelp = async () => {
  const { user } = await renderApp();
  await user.keyboard("{F1}");
  const dialog = await screen.findByRole("dialog", { name: "도움말" });
  return { user, dialog };
};
/** 분류 영역 안에서 설명이 `title`인 행의 글자(키 칩 · ":" · 설명을 이어 붙인 것). */
const row = (section: HTMLElement, title: string) =>
  within(section)
    .getByText(title)
    .parentElement?.textContent;

describe("F1 도움말 화면", () => {
  it("제목과 분류별 영역(한글 제목)이 있고 행은 `키 : 설명` 모양이다", async () => {
    const { dialog } = await openHelp();
    expect(within(dialog).getByRole("heading", { name: "키보드 단축키" })).toBeInTheDocument();
    for (const name of ["파일", "이동", "보기", "선택", "탭"]) expect(within(dialog).getByRole("region", { name })).toBeInTheDocument();
    const file = within(dialog).getByRole("region", { name: "파일" });
    expect(row(file, "이름 변경")).toBe("Shift+F6또는F2:이름 변경");
    expect(row(file, "복사")).toBe("F5:복사");
    // 키 하나하나가 칩(kbd)이다
    expect([...(within(file).getByText("이름 변경").parentElement?.querySelectorAll("kbd") ?? [])].map((k) => k.textContent)).toEqual(["Shift", "F6", "F2"]);
  });

  it("키가 여러 개인 동작은 '또는'으로 잇는다", async () => {
    const { dialog } = await openHelp();
    const file = within(dialog).getByRole("region", { name: "파일" });
    expect(row(file, "영구 삭제")).toBe("Shift+F8또는Delete:영구 삭제");
  });

  it("대화상자·메뉴·큐 안에서만 쓰는 내부 키는 보이지 않는다", async () => {
    const { dialog } = await openHelp();
    expect(within(dialog).queryByText("확인")).toBeNull();
    expect(within(dialog).queryByText("메뉴: 위로")).toBeNull();
    expect(within(dialog).queryByText("큐: 위로")).toBeNull();
    expect(within(dialog).queryByText("도움말 닫기")).toBeNull();
    expect(within(dialog).queryByText("도움말: 실행")).toBeNull();
  });

  it("닫기 버튼과 바깥(배경) 클릭으로 닫힌다", async () => {
    const { user, dialog } = await openHelp();
    await user.click(within(dialog).getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog", { name: "도움말" })).toBeNull();

    await user.keyboard("{F1}");
    const again = await screen.findByRole("dialog", { name: "도움말" });
    fireEvent.mouseDown(again); // 패널 안쪽을 눌러도 닫히지 않는다
    expect(screen.getByRole("dialog", { name: "도움말" })).toBeInTheDocument();
    fireEvent.mouseDown(again.parentElement as HTMLElement); // 배경(패널 바깥)
    expect(screen.queryByRole("dialog", { name: "도움말" })).toBeNull();
  });
});

describe("F1 도움말 검색 (이슈 #56)", () => {
  const search = () => screen.getByRole("textbox", { name: "단축키 검색" });
  const regions = (dialog: HTMLElement) => within(dialog).queryAllByRole("region").map((r) => r.getAttribute("aria-label"));
  /** 화면에 보이는 줄의 설명(마지막 칸) 목록. */
  const titles = (dialog: HTMLElement) =>
    within(dialog)
      .queryAllByRole("region")
      .flatMap((r) => [...r.querySelectorAll(":scope > div")].map((row) => row.lastElementChild?.textContent));
  const marks = (dialog: HTMLElement) => [...dialog.querySelectorAll("mark[data-help-match]")].map((m) => m.textContent);
  const cursorRow = (dialog: HTMLElement) => dialog.querySelector("[data-help-cursor]")?.lastElementChild?.textContent;

  it("열면 검색창에 포커스가 있고, 글자는 단축키가 아니라 검색창에 들어간다", async () => {
    const { user } = await openHelp();
    expect(search()).toHaveFocus();
    await user.keyboard("{F7}u3");
    expect(search()).toHaveValue("u3");
    expect(screen.queryByRole("dialog", { name: "새 폴더" })).toBeNull();
  });

  it("설명으로 거르고, 결과가 없는 분류는 숨기고, 일치한 글자를 강조한다", async () => {
    const { user, dialog } = await openHelp();
    await user.keyboard("복사");
    expect(titles(dialog).length).toBeGreaterThan(0);
    expect(titles(dialog).every((t) => t?.includes("복사"))).toBe(true);
    expect(regions(dialog)).not.toContain("탭");
    expect(marks(dialog).length).toBeGreaterThan(0);
    expect(new Set(marks(dialog))).toEqual(new Set(["복사"]));
  });

  it("키 표기로도 찾고, 키 칩 안의 일치 부분을 강조한다", async () => {
    const { user, dialog } = await openHelp();
    await user.keyboard("shift+f6");
    expect(titles(dialog)).toContain("이름 변경");
    const kbd = within(dialog).getByText("이름 변경").closest("div")!.querySelectorAll("kbd");
    // `Shift`와 `F6` 칩이 강조되고 대안 키 `F2`는 강조되지 않는다
    expect([...kbd].map((k) => k.querySelector("mark")?.textContent ?? null)).toEqual(["Shift", "F6", null]);
  });

  it("분류 이름으로 거르고 낱말은 모두 들어 있어야 한다", async () => {
    const { user, dialog } = await openHelp();
    await user.keyboard("탭");
    expect(regions(dialog)).toContain("탭");
    await user.keyboard(" 닫기");
    expect(titles(dialog).length).toBeGreaterThan(0);
    expect(titles(dialog).every((t) => t?.includes("닫기") || t?.includes("탭"))).toBe(true);
  });

  it("일치하는 단축키가 없으면 안내 문구를 보인다", async () => {
    const { user, dialog } = await openHelp();
    await user.keyboard("없는기능zz");
    expect(within(dialog).getByText("일치하는 단축키가 없습니다.")).toBeInTheDocument();
    expect(regions(dialog)).toEqual([]);
  });

  it("↑↓로 줄을 고르고 Return으로 그 동작을 실행하며 도움말은 닫힌다", async () => {
    const { user, dialog } = await openHelp();
    await user.keyboard("폴더");
    const first = cursorRow(dialog);
    await user.keyboard("{ArrowDown}");
    expect(cursorRow(dialog)).not.toBe(first);
    await user.keyboard("{ArrowUp}");
    expect(cursorRow(dialog)).toBe(first);
    await user.clear(search());
    await user.keyboard("새 폴더");
    expect(cursorRow(dialog)).toBe("새 폴더");
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("dialog", { name: "도움말" })).toBeNull();
    await waitFor(() => expect(screen.getByRole("dialog", { name: "새 폴더" })).toBeInTheDocument());
  });

  it("Esc로 닫고 다시 열면 검색어가 비어 있다", async () => {
    const { user } = await openHelp();
    await user.keyboard("복사{Escape}");
    expect(screen.queryByRole("dialog", { name: "도움말" })).toBeNull();
    await user.keyboard("{F1}");
    await screen.findByRole("dialog", { name: "도움말" });
    expect(search()).toHaveValue("");
  });
});
