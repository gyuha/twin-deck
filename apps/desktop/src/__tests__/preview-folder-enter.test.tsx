import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";

const breadcrumb = (pane: "left" | "right") =>
  within(screen.getAllByRole("navigation", { name: "경로" })[pane === "left" ? 0 : 1])
    .getAllByRole("button")
    .map((b) => b.textContent);

// /home/a 이름순: docs(폴더), empty(빈 폴더), nested(하위 폴더만 있는 폴더), a.txt, b.txt
const seed = () =>
  new FakeBackend().seed({
    "/home/a/docs/readme.md": "r",
    "/home/a/docs/notes.txt": "n",
    "/home/a/empty": null,
    "/home/a/nested/inner/x.txt": "x",
    "/home/a/a.txt": "a",
    "/home/a/b.txt": "b",
    "/home/b": null,
  });
const dlg = (name: string | RegExp) => screen.findByRole("dialog", { name });
const gone = () => expect(screen.queryByRole("dialog", { name: /미리보기/ })).toBeNull();
const previewFolder = async (user: Awaited<ReturnType<typeof renderApp>>["user"], downs: number) => {
  if (downs > 0) await user.keyboard("{ArrowDown}".repeat(downs));
  await user.keyboard("{Control>}y{/Control}"); // 폴더는 오른쪽 키가 들어가므로 Mod+Y로 연다
};

describe("미리보기 폴더 진입", () => {
  it("폴더 미리보기에서 →를 누르면 폴더로 들어가 첫 항목을 미리본다(미리보기는 열린 채)", async () => {
    const { user } = await renderApp(seed());
    await previewFolder(user, 0); // docs
    await dlg("미리보기: docs");
    await user.keyboard("{ArrowRight}");
    await dlg("미리보기: notes.txt"); // docs 안의 첫 항목(이름순)
    expect(breadcrumb("left")).toEqual(["/", "home", "a", "docs"]);
  });

  it("빈 폴더로 들어가면 미리보기가 닫힌다", async () => {
    const { user } = await renderApp(seed());
    await previewFolder(user, 1); // empty
    await dlg("미리보기: empty");
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(breadcrumb("left")).toEqual(["/", "home", "a", "empty"]));
    gone();
  });

  it("하위 폴더만 있는 폴더는 첫 하위 폴더를 미리보기로 이어 간다", async () => {
    const { user } = await renderApp(seed());
    await previewFolder(user, 2); // nested
    await user.keyboard("{ArrowRight}");
    await dlg("미리보기: inner");
    expect(breadcrumb("left")).toEqual(["/", "home", "a", "nested"]);
    await user.keyboard("{ArrowRight}"); // inner도 폴더라 한 단계 더 들어간다
    await dlg("미리보기: x.txt");
    expect(breadcrumb("left")).toEqual(["/", "home", "a", "nested", "inner"]);
  });

  it("↓는 폴더 위에서도 다음 항목으로 넘어간다(폴더로 들어가지 않는다)", async () => {
    const { user } = await renderApp(seed());
    await previewFolder(user, 0); // docs
    await user.keyboard("{ArrowDown}");
    await dlg("미리보기: empty");
    expect(breadcrumb("left")).toEqual(["/", "home", "a"]);
  });

  it("파일 위의 →는 이전처럼 다음 항목이다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowRight}"); // a.txt 미리보기
    await dlg("미리보기: a.txt");
    await user.keyboard("{ArrowRight}");
    await dlg("미리보기: b.txt");
    expect(breadcrumb("left")).toEqual(["/", "home", "a"]);
  });

  it("←는 지금처럼 미리보기만 닫는다", async () => {
    const { user } = await renderApp(seed());
    await previewFolder(user, 0);
    await dlg("미리보기: docs");
    await user.keyboard("{ArrowLeft}");
    gone();
    expect(breadcrumb("left")).toEqual(["/", "home", "a"]);
  });
});
