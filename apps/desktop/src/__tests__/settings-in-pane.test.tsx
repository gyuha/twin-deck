import { act, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "./helpers";

const pane = (side: "left" | "right") => screen.getByRole("region", { name: side === "left" ? "왼쪽 패널" : "오른쪽 패널" });
const open = (user: Awaited<ReturnType<typeof renderApp>>["user"]) => user.keyboard("{Control>},{/Control}");
const settings = (side: "left" | "right") => within(pane(side)).queryByRole("dialog", { name: "설정" });

// seedBackend: 왼쪽 /home/a(a.txt …), 오른쪽 /home/b(x.txt)
describe("설정은 활성 패널 자리에 뜬다", () => {
  it("왼쪽이 활성이면 왼쪽 패널 안에 뜨고 오른쪽 패널은 그대로 보인다", async () => {
    const { user } = await renderApp();
    await open(user);
    expect(await within(pane("left")).findByRole("dialog", { name: "설정" })).toBeInTheDocument();
    expect(settings("right")).toBeNull();
    expect(within(pane("right")).getByText("x.txt")).toBeInTheDocument();
  });

  it("오른쪽이 활성이면 오른쪽 패널 안에 뜨고 왼쪽 패널은 그대로 보인다", async () => {
    const { user } = await renderApp();
    await user.keyboard("{Tab}");
    await open(user);
    expect(await within(pane("right")).findByRole("dialog", { name: "설정" })).toBeInTheDocument();
    expect(settings("left")).toBeNull();
    expect(within(pane("left")).getByText("a.txt")).toBeInTheDocument();
  });

  it("설정이 열린 패널의 탭 줄과 목록은 가려지고, Esc로 닫으면 같은 탭·목록이 돌아온다", async () => {
    const { user } = await renderApp();
    expect(within(pane("left")).getAllByRole("tab")).toHaveLength(1);
    await open(user);
    await screen.findByRole("dialog", { name: "설정" });
    expect(within(pane("left")).queryByRole("tablist", { name: "탭" })).toBeNull();
    expect(within(pane("left")).queryByText("a.txt")).toBeNull();
    await user.keyboard("{Escape}");
    expect(settings("left")).toBeNull();
    expect(within(pane("left")).getByRole("tablist", { name: "탭" })).toBeInTheDocument();
    expect(within(pane("left")).getAllByRole("tab")).toHaveLength(1);
    expect(within(pane("left")).getByText("a.txt")).toBeInTheDocument();
  });

  it("설정이 열려 있는 동안 반대쪽 패널을 눌러도 설정이 유지되고 활성 패널은 바뀌지 않는다", async () => {
    const { user } = await renderApp();
    await open(user);
    await screen.findByRole("dialog", { name: "설정" });
    await user.click(within(pane("right")).getByText("x.txt"));
    expect(settings("left")).toBeInTheDocument();
    expect(pane("left")).toHaveAttribute("data-active", "true");
    expect(pane("right")).toHaveAttribute("data-active", "false");
  });

  it("설정을 바꾸면 보이는 반대쪽 패널에 바로 반영된다(탭 모양)", async () => {
    const { user, backend } = await renderApp();
    await open(user);
    await screen.findByRole("dialog", { name: "설정" });
    expect(within(pane("right")).getByRole("tab").className).not.toContain("flex-1");
    await act(async () => backend.setConfig((l) => (l.config.behavior.layout.tab_style = "segments")));
    expect(within(pane("right")).getByRole("tab").className).toContain("flex-1");
  });

  it("섹션은 위쪽 가로 탭 줄이고 눌러서 바꿀 수 있다", async () => {
    const { user } = await renderApp();
    await open(user);
    const dlg = await screen.findByRole("dialog", { name: "설정" });
    const strip = within(dlg).getByRole("tablist", { name: "설정 섹션" });
    expect(strip).toHaveAttribute("aria-orientation", "horizontal");
    await user.click(within(strip).getByRole("tab", { name: "목록과 선택" }));
    expect(within(dlg).getByRole("tabpanel", { name: "목록과 선택" })).toBeInTheDocument();
  });
});
