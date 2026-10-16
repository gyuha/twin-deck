import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";

// 목록은 이름순이며 파일 하나뿐이라 ArrowRight가 그 파일의 미리보기를 연다(폴더 /home/b는 오른쪽 패널).
async function open(files: Record<string, string>, name: string, setup?: (b: FakeBackend) => void) {
  const backend = new FakeBackend().seed({ ...files, "/home/b": null });
  setup?.(backend);
  const { user } = await renderApp(backend);
  await user.keyboard("{ArrowRight}");
  const dlg = await screen.findByRole("dialog", { name: `미리보기: ${name}` });
  return { user, backend, dlg: within(dlg), el: dlg };
}
const imageButton = (d: ReturnType<typeof within>) => d.queryByRole("button", { name: "이미지 복사" });
const alerts = () => screen.queryAllByRole("alert").map((e) => e.textContent ?? "").join(" ");

describe("이미지 미리보기 복사", () => {
  it("이미지 미리보기에는 제목 줄(✕와 같은 줄)에 '이미지 복사' 버튼이 있고 '텍스트 복사'는 없다", async () => {
    const { dlg } = await open({ "/home/a/a.png": "PNGDATA" }, "a.png");
    const b = imageButton(dlg)!;
    expect(b).toBeInTheDocument();
    expect(dlg.getByRole("button", { name: "닫기" }).parentElement).toBe(b.parentElement);
    expect(dlg.queryByRole("button", { name: "텍스트 복사" })).toBeNull();
    expect(b.textContent).toBe(""); // 글자가 아니라 아이콘이다
    expect(b.querySelector("svg")).not.toBeNull();
  });

  it("누르면 그 이미지의 경로가 클립보드 복사로 가고 버튼에 잠깐 복사됨 표시(data-copied)가 켜진다", async () => {
    const { user, backend, dlg } = await open({ "/home/a/a.png": "PNGDATA" }, "a.png");
    await user.click(imageButton(dlg)!);
    await waitFor(() => expect(backend.copiedImages).toEqual(["/home/a/a.png"]));
    expect(dlg.getByRole("button", { name: "이미지 복사" })).toHaveAttribute("data-copied", "true");
    await waitFor(() => expect(dlg.getByRole("button", { name: "이미지 복사" })).not.toHaveAttribute("data-copied"), { timeout: 3000 });
    expect(backend.clipboard).toEqual([]); // 텍스트 복사는 일어나지 않았다
  });

  it("미리보기에서 Mod+C(이 환경에서는 Ctrl+C)를 눌러도 같다", async () => {
    const { user, backend } = await open({ "/home/a/a.png": "PNGDATA" }, "a.png");
    await user.keyboard("{Control>}c{/Control}");
    await waitFor(() => expect(backend.copiedImages).toEqual(["/home/a/a.png"]));
    expect(backend.clipboard).toEqual([]);
  });

  it("복사가 실패하면 오류 알림이 뜨고 복사됨 표시는 켜지지 않는다", async () => {
    const { user, backend, dlg } = await open({ "/home/a/a.png": "PNGDATA" }, "a.png", (b) => {
      b.copyImageError = "클립보드를 쓸 수 없습니다";
    });
    await user.click(imageButton(dlg)!);
    await waitFor(() => expect(alerts()).toContain("클립보드를 쓸 수 없습니다"));
    expect(dlg.getByRole("button", { name: "이미지 복사" })).not.toHaveAttribute("data-copied");
    expect(backend.copiedImages).toEqual([]);
  });
});

describe("이미지가 아닌 미리보기에서의 Mod+C", () => {
  const text = "그냥 텍스트\n둘째 줄";

  it("텍스트 미리보기에는 '이미지 복사' 버튼이 없고 Mod+C는 이미지 복사를 부르지 않는다", async () => {
    const { user, backend, dlg } = await open({ "/home/a/notes.txt": text }, "notes.txt");
    expect(imageButton(dlg)).toBeNull();
    expect(dlg.getByRole("button", { name: "텍스트 복사" })).toBeInTheDocument();
    await user.keyboard("{Control>}c{/Control}");
    expect(backend.copiedImages).toEqual([]);
  });

  it("텍스트 미리보기에서 글자를 선택하고 Mod+C를 누르면 선택한 글자가 복사된다(기존 동작 유지)", async () => {
    const { user, backend, dlg } = await open({ "/home/a/notes.txt": text }, "notes.txt");
    const pre = dlg.getByLabelText("텍스트 미리보기");
    const range = document.createRange();
    range.selectNodeContents(pre);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    await user.keyboard("{Control>}c{/Control}");
    await waitFor(() => expect(backend.clipboard).toEqual([text]));
    expect(backend.copiedImages).toEqual([]);
  });

  it("선택한 글자가 없으면 아무것도 복사하지 않는다", async () => {
    const { user, backend } = await open({ "/home/a/notes.txt": text }, "notes.txt");
    window.getSelection()!.removeAllRanges();
    await user.keyboard("{Control>}c{/Control}");
    expect(backend.clipboard).toEqual([]);
    expect(backend.copiedImages).toEqual([]);
  });
});
