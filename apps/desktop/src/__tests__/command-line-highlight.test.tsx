import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp, seedBackend } from "./helpers";

describe("명령어 줄 입력칸 구문 강조 (이슈 #157)", () => {
  const open = async (backend = seedBackend(), paths?: { left: string; right: string }) => {
    const r = await renderApp(backend, "linux", paths);
    const input = await screen.findByRole("textbox", { name: "명령어 줄" });
    return { ...r, input };
  };
  const layer = () => document.querySelector<HTMLElement>("[data-command-line-highlight]");

  it("문자열과 변수를 각각 hljs-string·hljs-variable로 칠한다", async () => {
    const { user, input } = await open();
    await user.click(input);
    await user.type(input, 'echo "hi $HOME"');
    const l = layer()!;
    expect(l).not.toBeNull();
    expect(l.textContent).toBe('echo "hi $HOME"');
    expect(l.querySelector(".hljs-string")).not.toBeNull();
    expect(l.querySelector(".hljs-variable")).not.toBeNull();
  });

  it("레이어는 보조 기술에서 숨기고 마우스를 받지 않는다", async () => {
    await open();
    expect(layer()).toHaveAttribute("aria-hidden", "true");
    expect(layer()!.className).toContain("pointer-events-none");
  });

  it("↑로 기록을 불러와도 레이어 글자가 입력 글자와 같다", async () => {
    const { user, input } = await open();
    await user.type(input, "mkdir one{Enter}");
    await user.click(input);
    await user.keyboard("{ArrowUp}");
    expect(input).toHaveValue("mkdir one");
    expect(layer()!.textContent).toBe("mkdir one");
    await user.keyboard("{ArrowDown}");
    expect(layer()!.textContent).toBe("");
  });

  it("기록을 불러온 뒤 레이어 scrollLeft가 입력칸 scrollLeft와 같다", async () => {
    const { user, input } = await open();
    await user.type(input, "mkdir one{Enter}");
    await user.click(input);
    // jsdom은 scrollLeft를 흉내 내지 않으므로, 입력칸은 고정 값을 돌려주고 레이어는 받은 값을 기억하게 한다.
    Object.defineProperty(input, "scrollLeft", { configurable: true, value: 7 });
    let applied = 0;
    Object.defineProperty(layer()!, "scrollLeft", { configurable: true, get: () => applied, set: (v: number) => { applied = v; } });
    await user.keyboard("{ArrowUp}");
    await waitFor(() => expect(applied).toBe(7));
  });

  it("IME 조합 중에도 레이어 글자가 입력 글자와 같다", async () => {
    const { input } = await open();
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "echo 한" } });
    expect(layer()!.textContent).toBe("echo 한");
    fireEvent.change(input, { target: { value: "echo 한글" } });
    fireEvent.compositionEnd(input);
    expect(layer()!.textContent).toBe("echo 한글");
  });

  it("HTML 문자가 들어 있어도 태그로 해석하지 않고 글자 그대로 둔다", async () => {
    const { user, input } = await open();
    await user.click(input);
    await user.type(input, "echo <b>x</b> & y");
    expect(layer()!.textContent).toBe("echo <b>x</b> & y");
    expect(layer()!.querySelector("b")).toBeNull();
  });

  describe("명령 자리 단어 강조", () => {
    const typed = async (text: string) => {
      cleanup();
      const { user, input } = await open();
      await user.click(input);
      await user.type(input, text);
      const l = layer()!;
      expect(l.textContent).toBe(text);
      return [...l.querySelectorAll(".hljs-built_in")].map((e) => e.textContent);
    };

    it("줄 첫 단어를 강조한다", async () => {
      expect(await typed("git status")).toEqual(["git"]);
    });

    it("|, &&, 뒤의 첫 단어를 강조한다", async () => {
      expect(await typed("ls -la | grep foo && npm i")).toEqual(["ls", "grep", "npm"]);
    });

    it("따옴표 안의 |는 명령 경계로 보지 않는다", async () => {
      expect(await typed('echo "a | b"')).toEqual(["echo"]);
    });

    it("주석 안의 단어는 강조하지 않는다", async () => {
      expect(await typed("# git")).toEqual([]);
      expect(await typed("ls # git")).toEqual(["ls"]);
    });

    it("VAR=값 대입은 건너뛰고 그다음 단어를 강조한다", async () => {
      expect(await typed("FOO=1 git push")).toEqual(["git"]);
      expect(await typed('FOO="a b" git push')).toEqual(["git"]);
    });

    it("<script> 입력을 태그로 해석하지 않는다", async () => {
      await typed("<script>");
      expect(layer()!.querySelector("script")).toBeNull();
    });
  });

  it("로컬이 아닌 탭(입력칸 비활성)에서도 깨지지 않는다", async () => {
    const backend = new FakeBackend().seed({ "/home/a/pack.zip!/a.txt": "a", "/home/b/x.txt": "x" });
    await open(backend, { left: "/home/a/pack.zip!", right: "/home/b" });
    expect(screen.getByRole("textbox", { name: "명령어 줄" })).toBeDisabled();
    expect(layer()).not.toBeNull();
    expect(layer()!.textContent).toBe("");
  });
});
