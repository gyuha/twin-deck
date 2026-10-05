import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { cursorName, names, renderApp } from "./helpers";

const quickBar = () => screen.queryByRole("status", { name: "빠른 선택" });

describe("빠른 선택 이동", () => {
  const seed = () =>
    new FakeBackend().seed({
      "/home/a/1-zip.txt": "1",
      "/home/a/2-other.txt": "2",
      "/home/a/3-zip.txt": "3",
      "/home/a/4-last.txt": "4",
    });

  it("↑↓는 일치한 행 사이만 오가고(일치하지 않는 행은 건너뜀) 끝에서 멈춘다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("zip");
    expect(cursorName("left")).toBe("1-zip.txt");
    await user.keyboard("{ArrowDown}");
    expect(cursorName("left")).toBe("3-zip.txt"); // 2-other.txt를 건너뛴다
    await user.keyboard("{ArrowDown}");
    expect(cursorName("left")).toBe("3-zip.txt"); // 마지막 일치 행에서 멈춘다(4-last.txt로 가지 않는다)
    await user.keyboard("{ArrowUp}");
    expect(cursorName("left")).toBe("1-zip.txt");
    await user.keyboard("{ArrowUp}");
    expect(cursorName("left")).toBe("1-zip.txt"); // 첫 일치 행에서 멈춘다
    expect(quickBar()).not.toBeNull(); // 이동해도 빠른 선택은 계속된다
  });
});

describe("빠른 선택 실행", () => {
  it("Return은 빠른 선택을 끝내고 일치한 폴더로 들어간다", async () => {
    const b = new FakeBackend().seed({ "/home/a/zdir/inner.txt": "i", "/home/a/other.txt": "o" });
    const { user } = await renderApp(b);
    await user.keyboard("zd");
    expect(cursorName("left")).toBe("zdir");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(names("left").some((n) => n.includes("inner.txt"))).toBe(true));
    expect(quickBar()).toBeNull();
  });

  it("Return은 일치한 파일을 연다", async () => {
    const b = new FakeBackend().seed({ "/home/a/readme.md": "r", "/home/a/other.txt": "o" });
    const { user } = await renderApp(b);
    await user.keyboard("read");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(b.opened).toEqual(["/home/a/readme.md"]));
    expect(quickBar()).toBeNull();
  });

  it("Esc는 지금처럼 빠른 선택만 취소하고 아무것도 열지 않는다", async () => {
    const b = new FakeBackend().seed({ "/home/a/readme.md": "r" });
    const { user } = await renderApp(b);
    await user.keyboard("read{Escape}");
    expect(quickBar()).toBeNull();
    expect(b.opened).toEqual([]);
  });
});
