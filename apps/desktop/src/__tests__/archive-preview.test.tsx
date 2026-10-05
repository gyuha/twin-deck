import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";

// 실제 백엔드는 압축 파일의 미리보기로 안의 항목을 들여쓴 텍스트 트리를 돌려준다(`text` 종류). 가짜 백엔드는 파일 내용을 그대로 돌려주므로 그 트리를 내용으로 둔다.
const TREE = "a.txt\ndocs/\n  readme.md\nsrc/\n  lib/\n    mod.rs\n  main.rs\n";

describe("압축 파일 미리보기", () => {
  it("→로 열면 안의 항목이 들여쓰기가 살아 있는 텍스트 트리로 보인다", async () => {
    const b = new FakeBackend().seed({ "/home/a/pack.zip": TREE, "/home/b": null });
    const { user } = await renderApp(b);
    await user.keyboard("{ArrowRight}");
    const d = await screen.findByRole("dialog", { name: "미리보기: pack.zip" });
    const text = within(d).getByLabelText("텍스트 미리보기");
    expect(text.textContent).toContain("docs/\n  readme.md\nsrc/\n  lib/\n    mod.rs\n  main.rs");
  });

  it("목록이 잘렸으면 앞부분만 보인다는 안내를 보여 준다", async () => {
    const b = new FakeBackend().seed({ "/home/a/many.zip": "f0001.txt\n".repeat(30_000), "/home/b": null });
    const { user } = await renderApp(b);
    await user.keyboard("{ArrowRight}");
    const d = await screen.findByRole("dialog", { name: "미리보기: many.zip" });
    expect(d).toHaveTextContent("앞부분만 표시합니다");
  });
});
