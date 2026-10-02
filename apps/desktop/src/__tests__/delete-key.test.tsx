import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";

describe("Delete 키", () => {
  it("Delete는 Shift+F8과 같이 영구 삭제를 확인한 뒤 지운다(휴지통이 아니다)", async () => {
    const backend = new FakeBackend().seed({ "/home/a/x.txt": "x", "/home/a/y.txt": "y", "/home/b": null });
    const { user } = await renderApp(backend);
    await user.keyboard("{Delete}");
    const dlg = await screen.findByRole("dialog");
    expect(dlg).toHaveTextContent(/영구|삭제/);
    expect(backend.exists("/home/a/x.txt")).toBe(true); // 확인 전에는 지우지 않는다
    await user.keyboard("{Enter}");
    await waitFor(() => expect(backend.exists("/home/a/x.txt")).toBe(false));
    expect(backend.trashed).toEqual([]);
    expect(backend.exists("/home/a/y.txt")).toBe(true);
  });

  it("확인 창에서 Esc로 취소하면 지우지 않는다", async () => {
    const backend = new FakeBackend().seed({ "/home/a/x.txt": "x", "/home/b": null });
    const { user } = await renderApp(backend);
    await user.keyboard("{Delete}");
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(backend.exists("/home/a/x.txt")).toBe(true);
  });
});
