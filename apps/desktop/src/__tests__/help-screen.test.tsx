import { fireEvent, screen, within } from "@testing-library/react";
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
    expect(row(file, "이름 변경")).toBe("Shift+F6:이름 변경");
    expect(row(file, "복사")).toBe("F5:복사");
    // 키 하나하나가 칩(kbd)이다
    expect([...(within(file).getByText("이름 변경").parentElement?.querySelectorAll("kbd") ?? [])].map((k) => k.textContent)).toEqual(["Shift", "F6"]);
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
