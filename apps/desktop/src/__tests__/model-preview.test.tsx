import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";

// 이름순: dir.stl(폴더), a.txt, part.STL, x.bin
const seed = () =>
  new FakeBackend().seed({
    "/home/a/dir.stl/inner.txt": "i",
    "/home/a/a.txt": "hello preview",
    "/home/a/part.STL": "solid x\nendsolid x\n",
    "/home/a/x.bin": "bin\u0000data",
    "/home/b": null,
  });
const dlg = (name: string | RegExp) => screen.findByRole("dialog", { name });
const open = (user: Awaited<ReturnType<typeof renderApp>>["user"], n: number) => user.keyboard("{ArrowDown}".repeat(n) + "{ArrowRight}");

describe("3D 모델 미리보기 선택", () => {
  it("3D 확장자(대소문자 무시)는 3D 뷰어가 뜬다", async () => {
    const { user } = await renderApp(seed());
    await open(user, 2); // part.STL
    const d = await dlg("미리보기: part.STL");
    expect(within(d).getByLabelText("3D 모델 미리보기")).toBeInTheDocument();
    expect(within(d).queryByLabelText("텍스트 미리보기")).toBeNull();
  });

  it("일반 텍스트·기타 파일은 기존 뷰어 그대로", async () => {
    const { user } = await renderApp(seed());
    await open(user, 1); // a.txt
    let d = await dlg("미리보기: a.txt");
    expect(within(d).getByLabelText("텍스트 미리보기")).toBeInTheDocument();
    expect(within(d).queryByLabelText("3D 모델 미리보기")).toBeNull();
    await user.keyboard("{Escape}");
    await open(user, 2); // x.bin
    d = await dlg("미리보기: x.bin");
    expect(d).toHaveTextContent("미리 볼 수 없는 형식");
  });

  it("폴더 이름이 .stl이어도 3D 뷰어로 열지 않는다(폴더는 트리)", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{Control>}y{/Control}"); // 첫 항목 dir.stl 폴더
    const d = await dlg("미리보기: dir.stl");
    expect(within(d).queryByLabelText("3D 모델 미리보기")).toBeNull();
    expect(d.textContent).toContain("inner.txt");
  });

  it("WebGL을 쓸 수 없으면(jsdom) 안내 문구가 보인다", async () => {
    const { user } = await renderApp(seed());
    await open(user, 2);
    const d = await dlg("미리보기: part.STL");
    expect(await within(d).findByText(/3D 미리보기를 쓸 수 없습니다/)).toBeInTheDocument();
  });
});
