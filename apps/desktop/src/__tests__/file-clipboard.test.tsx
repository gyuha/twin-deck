import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { entryNames, renderApp, seedBackend } from "./helpers";

// 왼쪽 /home/a: docs src a.txt b.txt 한글.txt / 오른쪽 /home/b: x.txt. 커서는 처음에 docs.
type User = Awaited<ReturnType<typeof renderApp>>["user"];
const CTRL = (k: string) => `{Control>}${k}{/Control}`;
const CMD = (k: string) => `{Meta>}${k}{/Meta}`;
const toA = (user: User) => user.keyboard("{ArrowDown}{ArrowDown}"); // a.txt
const status = () => screen.getByRole("status", { name: "상태 표시줄" });
const noDialog = () => expect(screen.queryByRole("dialog")).toBeNull();

describe("파일 클립보드: Mod+C/X/V", () => {
  it("Ctrl+C로 운영체제 파일 클립보드에 쓰고 반대 패널에서 Ctrl+V로 복사한다 (원본 유지)", async () => {
    const { user, backend } = await renderApp();
    await toA(user);
    await user.keyboard(CTRL("c"));
    await waitFor(() => expect(backend.fileClipboard).toEqual(["/home/a/a.txt"]));
    await user.keyboard("{Tab}" + CTRL("v"));
    await waitFor(() => expect(backend.read("/home/b/a.txt")).toBe("aaa"));
    expect(backend.exists("/home/a/a.txt")).toBe(true);
    expect(backend.fileClipboard).toEqual(["/home/a/a.txt"]); // 복사는 클립보드를 그대로 둔다(여러 번 붙여 넣을 수 있다)
  });

  it("macOS에서는 Cmd+C / Cmd+V다", async () => {
    const { user, backend } = await renderApp(seedBackend(), "mac");
    await toA(user);
    await user.keyboard(CMD("c"));
    await waitFor(() => expect(backend.fileClipboard).toEqual(["/home/a/a.txt"]));
    await user.keyboard("{Tab}" + CMD("v"));
    await waitFor(() => expect(backend.read("/home/b/a.txt")).toBe("aaa"));
    // Ctrl+C는 macOS에서 파일 클립보드가 아니다.
    backend.fileClipboard = [];
    await user.keyboard("{Tab}" + CTRL("c"));
    expect(backend.fileClipboard).toEqual([]);
  });

  it("Ctrl+X는 붙여 넣기 전에는 원본을 그대로 두고, Ctrl+V에서 이동한다", async () => {
    const { user, backend } = await renderApp();
    await toA(user);
    await user.keyboard(CTRL("x"));
    await waitFor(() => expect(backend.fileClipboard).toEqual(["/home/a/a.txt"]));
    expect(backend.exists("/home/a/a.txt")).toBe(true);
    expect(status()).toHaveTextContent("잘라냈습니다");
    await user.keyboard("{Tab}" + CTRL("v"));
    await waitFor(() => expect(backend.read("/home/b/a.txt")).toBe("aaa"));
    expect(backend.exists("/home/a/a.txt")).toBe(false);
    expect(backend.fileClipboard).toEqual([]); // 이동한 파일은 클립보드에서 지운다
  });

  it("선택한 여러 항목을 한 번에 복사한다", async () => {
    const { user, backend } = await renderApp();
    await toA(user);
    await user.keyboard("{Insert}{Insert}"); // a.txt 선택 후 b.txt로, b.txt 선택 후 한글.txt로
    await user.keyboard(CTRL("c"));
    await waitFor(() => expect(backend.fileClipboard).toEqual(["/home/a/a.txt", "/home/a/b.txt"]));
    await user.keyboard("{Tab}" + CTRL("v"));
    await waitFor(() => expect(backend.read("/home/b/b.txt")).toBe("bbb"));
    expect(backend.read("/home/b/a.txt")).toBe("aaa");
  });

  it("선택이 없으면 커서 항목(폴더도)을 복사한다", async () => {
    const { user, backend } = await renderApp(); // 커서는 docs
    await user.keyboard(CTRL("c"));
    await waitFor(() => expect(backend.fileClipboard).toEqual(["/home/a/docs"]));
    await user.keyboard("{Tab}" + CTRL("v"));
    await waitFor(() => expect(backend.exists("/home/b/docs/readme.md")).toBe(true));
  });

  it("이름이 겹치면 충돌 창이 뜨고 고른 대로 처리한다", async () => {
    const backend = seedBackend().seed({ "/home/b/a.txt": "old" });
    const { user } = await renderApp(backend);
    await toA(user);
    await user.keyboard(CTRL("c") + "{Tab}" + CTRL("v"));
    await screen.findByRole("dialog", { name: "복사: 이름이 겹칩니다" });
    await user.keyboard("s"); // 건너뜀
    await waitFor(() => noDialog());
    expect(backend.read("/home/b/a.txt")).toBe("old");

    await user.keyboard(CTRL("v"));
    await screen.findByRole("dialog", { name: "복사: 이름이 겹칩니다" });
    await user.keyboard("o"); // 덮어씀
    await waitFor(() => expect(backend.read("/home/b/a.txt")).toBe("aaa"));
  });

  it("다른 앱에서 복사한 파일(운영체제 클립보드의 목록)도 붙여 넣을 수 있다", async () => {
    const { user, backend } = await renderApp();
    backend.fileClipboard = ["/home/a/b.txt", "/home/a/src"];
    await user.keyboard("{Tab}" + CTRL("v"));
    await waitFor(() => expect(backend.read("/home/b/b.txt")).toBe("bbb"));
    expect(backend.exists("/home/b/src/main.rs")).toBe(true);
    expect(backend.exists("/home/a/b.txt")).toBe(true); // 이 앱이 잘라낸 것이 아니니 복사다
  });

  it("클립보드에 파일이 없으면 오류 없이 알림만 보여 준다", async () => {
    const { user, backend } = await renderApp();
    await user.keyboard(CTRL("v"));
    await waitFor(() => expect(status()).toHaveTextContent("붙여 넣을 파일이 없습니다"));
    noDialog();
    expect(entryNames("left")).toEqual(["docs", "src", "a.txt", "b.txt", expect.any(String)]);
    expect(backend.exists("/home/a/a (1).txt")).toBe(false);
  });

  it("같은 폴더에 붙여 넣으면 이름이 겹치므로 충돌 창이 뜨고, 이름 바꿈이 기본이다", async () => {
    const { user, backend } = await renderApp();
    await toA(user);
    await user.keyboard(CTRL("c") + CTRL("v"));
    await screen.findByRole("dialog", { name: "복사: 이름이 겹칩니다" });
    await user.keyboard("{Enter}");
    await waitFor(() => expect(backend.read("/home/a/a (1).txt")).toBe("aaa"));
  });

  it("잘라낸 파일을 같은 폴더에 붙여 넣으면 아무 일도 없다", async () => {
    const { user, backend } = await renderApp();
    await toA(user);
    await user.keyboard(CTRL("x") + CTRL("v"));
    await new Promise((r) => setTimeout(r, 50));
    noDialog();
    expect(backend.read("/home/a/a.txt")).toBe("aaa");
    expect(backend.exists("/home/a/a (1).txt")).toBe(false);
  });

  it("입력창 안의 Ctrl+C는 글자 복사일 뿐 파일 클립보드를 건드리지 않는다", async () => {
    const { user, backend } = await renderApp();
    backend.fileClipboard = ["/home/a/b.txt"];
    await toA(user);
    await user.keyboard("{Shift>}{F6}{/Shift}"); // 이름 변경 창(입력창)
    await screen.findByRole("dialog");
    await user.keyboard(CTRL("c"));
    await user.keyboard(CTRL("x"));
    expect(backend.fileClipboard).toEqual(["/home/a/b.txt"]);
    await user.keyboard("{Escape}");
  });
});
