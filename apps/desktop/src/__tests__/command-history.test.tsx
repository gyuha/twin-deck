import { cleanup, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { cursorName, renderApp, seedBackend, selectedNames } from "./helpers";

describe("명령어 줄 ↑/↓ 기록", () => {
  const open = async (backend = seedBackend(), snapshot?: Parameters<typeof renderApp>[3]) => {
    const r = await renderApp(backend, undefined, undefined, snapshot);
    return { ...r, backend, input: await screen.findByRole("textbox", { name: "명령어 줄" }) };
  };
  const run = async (user: Awaited<ReturnType<typeof open>>["user"], input: HTMLElement, ...cmds: string[]) => {
    for (const c of cmds) {
      await user.type(input, `${c}{Enter}`);
      await waitFor(() => expect(input).toHaveValue(""));
    }
  };

  it("↑는 이전 명령을 불러오고 여러 번 누르면 더 오래된 명령으로 간다", async () => {
    const { user, input } = await open();
    await run(user, input, "mkdir one", "mkdir two", "mkdir three");
    await user.click(input);
    await user.keyboard("{ArrowUp}");
    expect(input).toHaveValue("mkdir three");
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(input).toHaveValue("mkdir one");
    await user.keyboard("{ArrowUp}");
    expect(input).toHaveValue("mkdir one");
  });

  it("↓로 최신을 지나면 ↑ 전에 치던 글자를 복원한다", async () => {
    const { user, input } = await open();
    await run(user, input, "mkdir one", "mkdir two");
    await user.click(input);
    await user.type(input, "mk");
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(input).toHaveValue("mkdir one");
    await user.keyboard("{ArrowDown}");
    expect(input).toHaveValue("mkdir two");
    await user.keyboard("{ArrowDown}");
    expect(input).toHaveValue("mk");
    await user.keyboard("{ArrowDown}");
    expect(input).toHaveValue("mk");
  });

  it("기록이 없으면 ↑/↓는 입력칸을 바꾸지 않는다", async () => {
    const { user, input } = await open();
    await user.click(input);
    await user.type(input, "abc");
    await user.keyboard("{ArrowUp}{ArrowDown}");
    expect(input).toHaveValue("abc");
  });

  it("글자를 고치면 탐색 위치를 처음으로 되돌린다", async () => {
    const { user, input } = await open();
    await run(user, input, "mkdir one", "mkdir two");
    await user.click(input);
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(input).toHaveValue("mkdir one");
    await user.type(input, "X");
    await user.keyboard("{ArrowUp}");
    expect(input).toHaveValue("mkdir two");
  });

  it("바로 앞과 같은 명령은 한 번만 기록한다", async () => {
    const { user, input } = await open();
    await run(user, input, "mkdir a", "mkdir a", "mkdir b", "mkdir a");
    await user.click(input);
    await user.keyboard("{ArrowUp}");
    expect(input).toHaveValue("mkdir a");
    await user.keyboard("{ArrowUp}");
    expect(input).toHaveValue("mkdir b");
    await user.keyboard("{ArrowUp}");
    expect(input).toHaveValue("mkdir a");
    await user.keyboard("{ArrowUp}");
    expect(input).toHaveValue("mkdir a");
  });

  it("실패한 명령도 기록하고 100개까지만 기억한다", async () => {
    const b = seedBackend();
    b.shellResult = { exit_code: 1, output: "", timed_out: false };
    const { user, input } = await open(b);
    for (let i = 1; i <= 101; i++) {
      await user.type(input, `c${i}{Enter}`);
      // 실패하면 결과 창이 뜨므로 닫는다.
      await user.click(await screen.findByRole("button", { name: "확인" }));
    }
    await waitFor(() => expect(b.storedState?.commandHistory).toHaveLength(100));
    expect(b.storedState?.commandHistory?.[0]).toBe("c2");
    expect(b.storedState?.commandHistory?.at(-1)).toBe("c101");
  }, 60000);

  it("저장한 기록이 다시 띄운 앱에서 ↑로 보인다", async () => {
    const b = seedBackend();
    const first = await open(b);
    await run(first.user, first.input, "mkdir one", "mkdir two");
    await waitFor(() => expect(b.storedState?.commandHistory).toEqual(["mkdir one", "mkdir two"]));
    cleanup();
    const second = await open(b, { snapshot: b.storedState });
    await second.user.click(second.input);
    await second.user.keyboard("{ArrowUp}");
    expect(second.input).toHaveValue("mkdir two");
    await second.user.keyboard("{ArrowUp}");
    expect(second.input).toHaveValue("mkdir one");
  });

  it("↑/↓는 패널 커서를 움직이지 않는다", async () => {
    const { user, input } = await open();
    await run(user, input, "mkdir one");
    const before = selectedNames("left");
    const at = cursorName("left");
    expect(at).not.toBe("");
    await user.click(input);
    await user.keyboard("{ArrowUp}{ArrowUp}{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(cursorName("left")).toBe(at);
    expect(selectedNames("left")).toEqual(before);
  });
});
