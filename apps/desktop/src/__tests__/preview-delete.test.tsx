import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { cursorName, renderApp } from "./helpers";

// 왼쪽 /home/a(이름순): a.txt b.txt c.txt
const seed = (confirm = true) => {
  const b = new FakeBackend().seed({ "/home/a/a.txt": "a", "/home/a/b.txt": "b", "/home/a/c.txt": "c", "/home/b": null });
  b.setConfig((l) => (l.config.core.confirm.delete = confirm));
  return b;
};
type User = Awaited<ReturnType<typeof renderApp>>["user"];
const open = (user: User, downs: number) => user.keyboard("{ArrowDown}".repeat(downs) + "{ArrowRight}");
const dlg = (name: string) => screen.findByRole("dialog", { name });
const noPreview = () => expect(screen.queryByRole("dialog", { name: /^미리보기/ })).toBeNull();

describe("미리보기에서 파일 삭제", () => {
  it("Delete → 확인 → 파일이 지워지고 다음 파일의 미리보기로 넘어간다", async () => {
    const { user, backend } = await renderApp(seed());
    await open(user, 1); // b.txt
    await dlg("미리보기: b.txt");
    await user.keyboard("{Delete}");
    await screen.findByText(/영구 삭제할까요/);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(backend.exists("/home/a/b.txt")).toBe(false));
    const d = within(await dlg("미리보기: c.txt")); // 다음 파일
    expect(d.getByLabelText("텍스트 미리보기")).toHaveTextContent("c");
    expect(backend.exists("/home/a/a.txt") && backend.exists("/home/a/c.txt")).toBe(true);
    await waitFor(() => expect(cursorName("left")).toBe("c.txt")); // 포커스도 다음 파일로
  });

  it("확인을 취소하면 아무것도 지우지 않고 미리보기가 그대로다", async () => {
    const { user, backend } = await renderApp(seed());
    await open(user, 1);
    await dlg("미리보기: b.txt");
    await user.keyboard("{Delete}");
    await screen.findByText(/영구 삭제할까요/);
    await user.keyboard("{Escape}");
    await new Promise((r) => setTimeout(r, 50));
    expect(backend.exists("/home/a/b.txt")).toBe(true);
    await dlg("미리보기: b.txt");
  });

  it("맨 끝 파일을 지우면 이전 파일로 넘어간다", async () => {
    const { user, backend } = await renderApp(seed(false)); // 확인 없이 바로
    await open(user, 2); // c.txt
    await dlg("미리보기: c.txt");
    await user.keyboard("{Delete}");
    await waitFor(() => expect(backend.exists("/home/a/c.txt")).toBe(false));
    await dlg("미리보기: b.txt");
    await waitFor(() => expect(cursorName("left")).toBe("b.txt"));
  });

  it("Shift+F8(삭제 명령)도 같다", async () => {
    const { user, backend } = await renderApp(seed(false));
    await open(user, 0); // a.txt
    await dlg("미리보기: a.txt");
    await user.keyboard("{Shift>}{F8}{/Shift}");
    await waitFor(() => expect(backend.exists("/home/a/a.txt")).toBe(false));
    await dlg("미리보기: b.txt");
  });

  it("마지막 남은 파일까지 지우면 미리보기가 닫힌다", async () => {
    const { user, backend } = await renderApp(seed(false));
    await open(user, 0);
    await dlg("미리보기: a.txt");
    await user.keyboard("{Delete}"); // a 삭제 → b
    await dlg("미리보기: b.txt");
    await user.keyboard("{Delete}"); // b 삭제 → c
    await dlg("미리보기: c.txt");
    await user.keyboard("{Delete}"); // c 삭제 → 남은 파일 없음
    await waitFor(() => expect(backend.exists("/home/a/c.txt")).toBe(false));
    await waitFor(() => noPreview());
    expect(backend.exists("/home/a/a.txt") || backend.exists("/home/a/b.txt")).toBe(false);
  });

  it("미리보기 도움말에 삭제 키가 보인다", async () => {
    const { user } = await renderApp(seed());
    await open(user, 0);
    expect(await dlg("미리보기: a.txt")).toHaveTextContent("Delete 삭제");
  });
});
