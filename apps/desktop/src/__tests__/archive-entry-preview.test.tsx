import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";

// 압축 패널(`pack.zip!`)을 왼쪽에 열고 첫 항목(a.txt)에서 →로 미리보기를 연다. 실제 백엔드는 압축 안 항목을 압축에서 읽어 글·이미지는 내용으로 돌려준다(가짜 백엔드의 `pack.zip!/…` 항목은 그 내용을 그대로 쓴다).
async function openEntry() {
  const backend = new FakeBackend().seed({
    "/home/a/pack.zip": "PK-pack",
    "/home/a/pack.zip!/a.txt": "압축 안 글\n둘째 줄\n",
    "/home/a/pack.zip!/b.png": "png-bytes",
    "/home/b": null,
  });
  const { user } = await renderApp(backend, "linux", { left: "/home/a/pack.zip!", right: "/home/b" });
  await user.keyboard("{ArrowRight}");
  const el = await screen.findByRole("dialog", { name: "미리보기: a.txt" });
  return { user, backend, dlg: within(el) };
}

describe("압축 안 파일 미리보기", () => {
  it("압축 안 텍스트 파일에서 →를 누르면 내용이 보인다", async () => {
    const { dlg } = await openEntry();
    expect(dlg.getByLabelText("텍스트 미리보기").textContent).toContain("압축 안 글\n둘째 줄");
  });

  it("압축 안 파일은 더블클릭해도 편집 상자가 뜨지 않고 Ctrl+S로도 쓰이지 않는다", async () => {
    const { user, backend, dlg } = await openEntry();
    await user.dblClick(dlg.getByLabelText("텍스트 미리보기"));
    expect(dlg.queryByRole("textbox", { name: "텍스트 편집" })).toBeNull();
    expect(await screen.findByText(/압축 파일 안의 파일은 편집할 수 없습니다/)).toBeInTheDocument();
    await user.keyboard("{Control>}s{/Control}");
    expect(backend.writes).toHaveLength(0);
  });
});
