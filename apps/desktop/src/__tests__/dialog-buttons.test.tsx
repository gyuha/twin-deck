import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";

// /home/a: a.txt b.txt / /home/b: a.txt (같은 이름)
const seed = () => new FakeBackend().seed({ "/home/a/a.txt": "a", "/home/a/b.txt": "b", "/home/b/a.txt": "other" });
const dlg = () => screen.findByRole("dialog");
const button = async (name: string) => within(await dlg()).getByRole("button", { name });
const noDialog = () => waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

describe("다이얼로그의 확인·취소 버튼", () => {
  it("이름 입력: 확인 버튼으로 이름을 바꾸고, 취소 버튼은 아무것도 바꾸지 않는다", async () => {
    const backend = seed();
    const { user } = await renderApp(backend);
    await user.keyboard("{Shift>}{F6}{/Shift}");
    await user.click(await button("취소"));
    await noDialog();
    expect(backend.exists("/home/a/a.txt")).toBe(true);

    await user.keyboard("{Shift>}{F6}{/Shift}");
    await dlg();
    await user.keyboard("{Control>}a{/Control}new.txt");
    await user.click(await button("확인"));
    await waitFor(() => expect(backend.exists("/home/a/new.txt")).toBe(true));
    expect(backend.exists("/home/a/a.txt")).toBe(false);
  });

  it("확인 창(영구 삭제): 취소는 지우지 않고 확인은 지운다", async () => {
    const backend = seed();
    const { user } = await renderApp(backend);
    await user.keyboard("{Shift>}{F8}{/Shift}");
    await user.click(await button("취소"));
    await noDialog();
    expect(backend.exists("/home/a/a.txt")).toBe(true);

    await user.keyboard("{Shift>}{F8}{/Shift}");
    await user.click(await button("확인"));
    await waitFor(() => expect(backend.exists("/home/a/a.txt")).toBe(false));
  });

  it("충돌 창: 라디오로 고른 뒤 확인 버튼으로 확정하고, 취소 버튼은 그 항목을 건너뛴다", async () => {
    const backend = seed();
    const { user } = await renderApp(backend);
    await user.keyboard("{F5}{Enter}"); // 대상 폴더 확인 → 충돌 창
    await within(await dlg()).findByRole("radiogroup", { name: "충돌 처리" });
    await user.click(within(await dlg()).getByRole("radio", { name: /건너뛰기/ }));
    await user.click(await button("확인"));
    await noDialog();
    expect(backend.read("/home/b/a.txt")).toBe("other"); // 건너뛰기라 덮어쓰지 않았다
  });

  it("정보 창: 확인 버튼으로 닫고 취소 버튼은 없다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{Control>}i{/Control}");
    const d = within(await dlg());
    expect(d.queryByRole("button", { name: "취소" })).toBeNull();
    await user.click(d.getByRole("button", { name: "확인" }));
    await noDialog();
  });
});
