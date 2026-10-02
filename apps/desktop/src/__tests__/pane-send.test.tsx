import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { cursorName, entryNames, renderApp } from "./helpers";

// 왼쪽 /home/a: docs(d.txt) other a.txt / 오른쪽 /home/b: b1(x.txt)
const seed = () =>
  new FakeBackend().seed({
    "/home/a/docs/d.txt": "d",
    "/home/a/other/o.txt": "o",
    "/home/a/a.txt": "a",
    "/home/b/b1/x.txt": "x",
  });

describe("Alt+방향키: 반대편 패널로 보내기", () => {
  it("커서가 폴더면 그 폴더를 반대편 패널에서 열고, 활성 패널은 그대로다", async () => {
    const { user } = await renderApp(seed());
    expect(cursorName("left")).toBe("docs");
    await user.keyboard("{Alt>}{ArrowRight}{/Alt}");
    await waitFor(() => expect(entryNames("right")).toEqual(["d.txt"]));
    expect(entryNames("left")).toEqual(["docs", "other", "a.txt"]);
    expect(cursorName("left")).toBe("docs");
  });

  it("커서가 파일이면 현재 폴더를 반대편 패널에서 연다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{ArrowDown}{ArrowDown}"); // a.txt
    await user.keyboard("{Alt>}{ArrowRight}{/Alt}");
    await waitFor(() => expect(entryNames("right")).toEqual(["docs", "other", "a.txt"]));
  });

  it("오른쪽 패널에서는 Alt+←가 왼쪽 패널로 보낸다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{Tab}"); // 오른쪽 활성, 커서 b1
    await user.keyboard("{Alt>}{ArrowLeft}{/Alt}");
    await waitFor(() => expect(entryNames("left")).toEqual(["x.txt"]));
  });

  it("보낼 반대편이 없는 방향은 이전/다음 폴더로 간다(기존 동작)", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{Enter}"); // docs로 들어감
    await waitFor(() => expect(entryNames("left")).toEqual(["d.txt"]));
    await user.keyboard("{Alt>}{ArrowLeft}{/Alt}"); // 왼쪽 패널의 Alt+← = 뒤로
    await waitFor(() => expect(entryNames("left")).toEqual(["docs", "other", "a.txt"]));
    await user.keyboard("{Alt>}{ArrowRight}{/Alt}"); // 왼쪽 패널의 Alt+→ = 반대편으로 보내기
    await waitFor(() => expect(entryNames("right")).toEqual(["d.txt"]));
  });
});
