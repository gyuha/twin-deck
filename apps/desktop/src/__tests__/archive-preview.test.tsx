import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";

// 실제 백엔드는 압축 파일의 미리보기로 안의 항목을 폴더 미리보기와 같은 가지(├── └── │) 트리 텍스트로 돌려준다(`text` 종류). 가짜 백엔드는 파일 내용을 그대로 돌려주므로 그 트리를 내용으로 둔다.
const TREE = "├── docs/\n│   └── readme.md\n├── src/\n│   ├── lib/\n│   │   └── mod.rs\n│   └── main.rs\n└── a.txt\n";

describe("압축 파일 미리보기", () => {
  it("→로 열면 안의 항목이 가지가 살아 있는 텍스트 트리로 보인다", async () => {
    const b = new FakeBackend().seed({ "/home/a/pack.zip": TREE, "/home/b": null });
    const { user } = await renderApp(b);
    await user.keyboard("{ArrowRight}");
    const d = await screen.findByRole("dialog", { name: "미리보기: pack.zip" });
    const text = within(d).getByLabelText("텍스트 미리보기");
    expect(text.textContent).toContain("├── docs/\n│   └── readme.md\n├── src/\n│   ├── lib/\n│   │   └── mod.rs\n│   └── main.rs\n└── a.txt");
  });

  it("목록이 잘렸으면 앞부분만 보인다는 안내를 보여 준다", async () => {
    const b = new FakeBackend().seed({ "/home/a/many.zip": "f0001.txt\n".repeat(30_000), "/home/b": null });
    const { user } = await renderApp(b);
    await user.keyboard("{ArrowRight}");
    const d = await screen.findByRole("dialog", { name: "미리보기: many.zip" });
    expect(d).toHaveTextContent("앞부분만 표시합니다");
  });
});

describe("압축 파일 미리보기 Enter", () => {
  const seed = () =>
    new FakeBackend().seed({
      "/home/a/notes.txt": "hello",
      "/home/a/pack.zip": TREE,
      "/home/a/pack.zip!/docs/readme.md": "r",
      "/home/a/pack.zip!/a.txt": "a",
      "/home/b": null,
    });
  // 이름순: notes.txt, pack.zip

  it("압축 파일 미리보기에서 Enter를 누르면 미리보기를 닫고 압축을 푼다", async () => {
    const b = seed();
    const { user } = await renderApp(b);
    await user.keyboard("{ArrowDown}{ArrowRight}"); // pack.zip 미리보기
    const d = await screen.findByRole("dialog", { name: "미리보기: pack.zip" });
    expect(d).toHaveTextContent("Enter 압축 풀기");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /미리보기/ })).toBeNull());
    await waitFor(() => expect(b.exists("/home/a/pack/a.txt")).toBe(true));
    expect((await b.queueJobs())[0]).toMatchObject({ kind: "extract" });
    expect(b.opened).toEqual([]); // 열지 않는다
  });

  it("일반 파일 미리보기의 Enter는 이전처럼 파일을 연다", async () => {
    const b = seed();
    const { user } = await renderApp(b);
    await user.keyboard("{ArrowRight}"); // notes.txt 미리보기
    const d = await screen.findByRole("dialog", { name: "미리보기: notes.txt" });
    expect(d).toHaveTextContent("Enter 열기");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(b.opened).toEqual(["/home/a/notes.txt"]));
    expect(await b.queueJobs()).toEqual([]);
  });
});
