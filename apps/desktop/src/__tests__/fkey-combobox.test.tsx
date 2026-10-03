import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "./helpers";

type User = Awaited<ReturnType<typeof renderApp>>["user"];
const openRow = async (user: User, fkey: string) => {
  await user.keyboard("{Control>},{/Control}");
  await screen.findByRole("dialog", { name: "설정" });
  await user.click(screen.getByRole("tab", { name: "F키" }));
  const trigger = within(screen.getByRole("group", { name: fkey })).getByRole("combobox");
  await user.click(trigger);
  return trigger;
};
const search = (fkey: string) => screen.getByRole("searchbox", { name: `${fkey} 동작 검색` });
const list = (fkey: string) => screen.queryByRole("listbox", { name: `${fkey} 동작` });
const options = (fkey: string) => (list(fkey) ? within(list(fkey) as HTMLElement).getAllByRole("option").map((o) => o.textContent) : []);

describe("F키 동작 선택: 검색되는 콤보박스", () => {
  it("열면 검색 입력에 포커스가 있고 모든 항목이 보인다", async () => {
    const { user } = await renderApp();
    await openRow(user, "F5");
    expect(search("F5")).toHaveFocus();
    expect(options("F5").length).toBeGreaterThan(30);
    expect(options("F5")[0]).toContain("기본값 (현재: 복사)");
    // 현재 값(기본값)이 선택 표시된다
    expect(within(list("F5") as HTMLElement).getByRole("option", { name: /기본값/ })).toHaveAttribute("aria-selected", "true");
  });

  it("입력하면 이름으로 걸러지고(한글 부분 일치) 액션 ID로도 찾는다", async () => {
    const { user } = await renderApp();
    await openRow(user, "F5");
    await user.type(search("F5"), "이름");
    expect(options("F5").length).toBeGreaterThan(0);
    expect(options("F5").length).toBeLessThan(10);
    expect(options("F5").some((t) => t?.includes("이름 변경"))).toBe(true);
    expect(options("F5").some((t) => t?.includes("복사"))).toBe(false);

    await user.clear(search("F5"));
    await user.type(search("F5"), "core.trash");
    expect(options("F5")).toEqual(expect.arrayContaining([expect.stringContaining("휴지통")]));
  });

  it("↑↓로 고르고 Enter로 확정하면 저장되고 목록이 닫힌다", async () => {
    const { user, backend } = await renderApp();
    const trigger = await openRow(user, "F2");
    await user.type(search("F2"), "이름 변경");
    await user.keyboard("{Enter}");
    await waitFor(async () => expect((await backend.getConfig()).config.fkeys.F2).toBe("core.rename"));
    expect(list("F2")).toBeNull();
    expect(trigger).toHaveTextContent("이름 변경");
    expect(trigger).toHaveFocus();

    // ArrowDown으로 한 칸 내려가 고른다: 첫 항목(기본값) 다음은 "해제"
    await user.click(trigger);
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");
    await waitFor(async () => expect((await backend.getConfig()).config.fkeys.F2).toBe("none"));
  });

  it("Esc는 목록만 닫고 설정 화면은 그대로 둔다", async () => {
    const { user } = await renderApp();
    await openRow(user, "F5");
    await user.keyboard("{Escape}");
    expect(list("F5")).toBeNull();
    expect(screen.getByRole("dialog", { name: "설정" })).toBeInTheDocument();
    await user.keyboard("{Escape}"); // 이번에는 설정 화면이 닫힌다
    expect(screen.queryByRole("dialog", { name: "설정" })).toBeNull();
  });

  it("일치하는 항목이 없으면 안내하고, 바깥을 누르면 아무것도 바꾸지 않고 닫힌다", async () => {
    const { user, backend } = await renderApp();
    await openRow(user, "F5");
    await user.type(search("F5"), "zzzzqqq");
    expect(await screen.findByText("일치하는 항목이 없습니다")).toBeInTheDocument();
    await user.keyboard("{Enter}"); // 고를 항목이 없으면 아무 일도 없다
    expect(list("F5")).toBeInTheDocument();
    // jsdom은 클릭 위치를 계산하지 않아서, 화면 전체를 덮는 배경 레이어(목록의 두 단계 위)를 직접 누른다
    fireEvent.mouseDown((list("F5") as HTMLElement).parentElement?.parentElement as HTMLElement);
    expect(list("F5")).toBeNull();
    expect((await backend.getConfig()).config.fkeys.F5).toBe("");
  });
});
