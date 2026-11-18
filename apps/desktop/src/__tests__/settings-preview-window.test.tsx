import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp, seedBackend } from "./helpers";

const openPreviewTab = async (separate: boolean) => {
  const r = await renderApp(seedBackend(), undefined, undefined, { separatePreview: separate });
  await r.user.keyboard("{Control>},{/Control}");
  await screen.findByRole("dialog", { name: "설정" });
  await r.user.click(screen.getByRole("tab", { name: "미리보기" }));
  return r;
};
const outside = () => screen.getByRole("switch", { name: "바깥 클릭으로 닫기" });
const separate = () => screen.getByRole("switch", { name: "별도 창에 보기" });

describe("설정: 별도 창에 보기와 바깥 클릭으로 닫기 (이슈 #160)", () => {
  it("별도 창에 보기가 켜져 있으면 바깥 클릭으로 닫기는 비활성이고 이유가 보인다", async () => {
    await openPreviewTab(true);
    expect(outside()).toBeDisabled();
    expect(screen.getByText("별도 창에 보기를 켜면 쓰지 않습니다")).toBeInTheDocument();
  });

  it("별도 창에 보기가 꺼져 있으면 바깥 클릭으로 닫기를 쓸 수 있다", async () => {
    await openPreviewTab(false);
    expect(outside()).toBeEnabled();
    expect(screen.queryByText("별도 창에 보기를 켜면 쓰지 않습니다")).not.toBeInTheDocument();
  });

  it("별도 창에 보기를 토글하면 바로 반영되고 저장된 값은 건드리지 않는다", async () => {
    const { user, backend } = await openPreviewTab(false);
    await user.click(outside()); // 켬
    await waitFor(async () => expect((await backend.getConfig()).config.preview.close_on_outside_click).toBe(true));
    await user.click(separate());
    await waitFor(() => expect(outside()).toBeDisabled());
    expect(outside()).toBeChecked(); // 값은 그대로
    await user.click(separate());
    await waitFor(() => expect(outside()).toBeEnabled());
    expect((await backend.getConfig()).config.preview.close_on_outside_click).toBe(true);
  });
});
