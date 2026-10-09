import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "./helpers";

// 이미지·PDF·사운드 미리보기 용량 한도 설정(이름 `*_max_mb`, 정수 MB, 0은 제한 없음).
const open = async (user: Awaited<ReturnType<typeof renderApp>>["user"], tab: string) => {
  await user.keyboard("{Control>},{/Control}");
  const dialog = await screen.findByRole("dialog", { name: /설정|Settings/ });
  await user.click(within(dialog).getByRole("tab", { name: tab }));
  return dialog;
};

describe("미리보기 용량 한도 설정", () => {
  it("미리보기 탭에 세 항목이 기본값 10·10·20으로 있고, 숫자를 바꾸면 설정에 저장된다", async () => {
    const { user, backend } = await renderApp();
    const dialog = await open(user, "미리보기");
    const value = (name: string) => (within(dialog).getByRole("spinbutton", { name }) as HTMLInputElement).value;
    expect([value("이미지 용량 한도(MB)"), value("PDF 용량 한도(MB)"), value("사운드 용량 한도(MB)")]).toEqual(["10", "10", "20"]);
    const pdf = within(dialog).getByRole("spinbutton", { name: "PDF 용량 한도(MB)" });
    await user.clear(pdf);
    await user.type(pdf, "64{Enter}");
    await waitFor(async () => expect((await backend.getConfig()).config.preview.pdf_max_mb).toBe(64));
  });

  it("0을 넣을 수 있다(제한 없음)", async () => {
    const { user, backend } = await renderApp();
    const dialog = await open(user, "미리보기");
    const img = within(dialog).getByRole("spinbutton", { name: "이미지 용량 한도(MB)" });
    await user.clear(img);
    await user.type(img, "0{Enter}");
    await waitFor(async () => expect((await backend.getConfig()).config.preview.image_max_mb).toBe(0));
  });

  it("영어에서는 항목 이름과 설명이 영어다", async () => {
    const { user, backend } = await renderApp();
    await backend.setConfigValue("behavior.language", { kind: "str", value: "en" });
    const dialog = await open(user, "Preview");
    for (const n of ["Image size limit (MB)", "PDF size limit (MB)", "Sound size limit (MB)"]) expect(within(dialog).getByRole("spinbutton", { name: n })).toBeInTheDocument();
    expect(within(dialog).getByRole("group", { name: "PDF size limit (MB)" }).textContent).not.toMatch(/[가-힣]/);
  });
});
