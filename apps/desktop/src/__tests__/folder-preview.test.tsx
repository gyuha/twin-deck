import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";

describe("폴더 미리보기", () => {
  it("폴더를 고르고 미리보기를 열면 하위 항목이 ASCII 트리로 보인다", async () => {
    const backend = new FakeBackend().seed({
      "/home/a/docs/adr/0001.md": "x",
      "/home/a/docs/readme.md": "r",
      "/home/a/docs/z.txt": "z",
      "/home/b/x.txt": "x",
    });
    const { user } = await renderApp(backend);
    await user.keyboard("{Control>}y{/Control}"); // 커서가 첫 항목(docs 폴더)
    const d = await screen.findByRole("dialog", { name: "미리보기: docs" });
    expect(d.textContent).toContain("├── adr/");
    expect(d.textContent).toContain("│   └── 0001.md");
    expect(d.textContent).toContain("├── readme.md");
    expect(d.textContent).toContain("└── z.txt");
    expect(d).not.toHaveTextContent("미리 볼 수 없는 형식");
  });
});
