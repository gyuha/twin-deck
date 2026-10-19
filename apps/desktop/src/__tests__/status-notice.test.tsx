import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { seedBackend, renderApp } from "./helpers";

// 없는 폴더로 가는 키를 만들어 긴 오류 메시지를 상태 표시줄에 띄운다.
const LONG = "/nope-" + "x".repeat(300);
async function withLongNotice() {
  const b = seedBackend();
  b.setConfig((l) => l.bindings.push({ key: "Alt+H", action: "core.open.directory", args: { src: LONG }, scope: null }));
  const r = await renderApp(b);
  await r.user.keyboard("{Alt>}h{/Alt}");
  const notice = await screen.findByRole("alert");
  return { ...r, notice };
}

describe("상태 표시줄 오류 메시지 (이슈 #101)", () => {
  it("긴 메시지는 한 줄로 잘리고 오른쪽 버튼 묶음은 줄어들지 않는다", async () => {
    const { notice } = await withLongNotice();
    expect(notice.className).toMatch(/\btruncate\b/);
    expect(notice.className).toMatch(/\bmin-w-0\b/);
    const footer = screen.getByRole("status", { name: "상태 표시줄" });
    const buttons = within(footer).getByRole("button", { name: "단축키 목록" }).parentElement!;
    expect(buttons.className).toMatch(/\bshrink-0\b/);
  });

  it("메시지를 누르면 전체 문구가 보이는 팝업이 열린다", async () => {
    const { user, notice } = await withLongNotice();
    const full = notice.textContent!;
    expect(full).toContain("x".repeat(300));
    await user.click(notice);
    const dlg = await screen.findByRole("dialog", { name: "오류 메시지" });
    expect(dlg).toHaveTextContent(full);
  });

  it("팝업의 복사 버튼은 전체 문구를 클립보드로 보낸다", async () => {
    const { user, backend, notice } = await withLongNotice();
    const full = notice.textContent!;
    await user.click(notice);
    const dlg = within(await screen.findByRole("dialog", { name: "오류 메시지" }));
    await user.click(dlg.getByRole("button", { name: "메시지 복사" }));
    await waitFor(() => expect(backend.clipboard).toEqual([full]));
    expect(dlg.getByRole("button", { name: "메시지 복사" })).toHaveAttribute("data-copied", "true");
  });
});
