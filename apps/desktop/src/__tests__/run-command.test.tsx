import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp, seedBackend } from "./helpers";

describe("명령어 줄 (core.run_command, 이슈 #110)", () => {
  const line = () => screen.findByRole("textbox", { name: "명령어 줄" });
  const open = async (backend = seedBackend()) => {
    const r = await renderApp(backend);
    return { ...r, backend, input: await line() };
  };

  it("기본으로 보이고, 프롬프트에 활성 탭의 폴더가 나온다", async () => {
    await open();
    expect(screen.getByText("[/home/a]$")).toBeInTheDocument();
  });

  it("Mod+K는 명령어 줄 입력칸으로 포커스를 옮긴다", async () => {
    const { user, input } = await open();
    expect(input).not.toHaveFocus();
    await user.keyboard("{Control>}k{/Control}");
    await waitFor(() => expect(input).toHaveFocus());
  });

  it("입력한 한 줄을 Enter로 활성 탭의 폴더에서 실행하고 입력칸을 비운다", async () => {
    const { user, backend, input } = await open();
    await user.type(input, "mkdir out{Enter}");
    await waitFor(() => expect(backend.shellRuns).toEqual([{ cwd: "/home/a", command: "mkdir out" }]));
    expect(input).toHaveValue("");
  });

  it("입력칸에서 친 글자는 Quick Select나 단축키로 가지 않는다", async () => {
    const { user, input } = await open();
    await user.type(input, "ls -la");
    expect(input).toHaveValue("ls -la");
    expect(screen.queryByText(/빠른 선택/)).not.toBeInTheDocument();
  });

  it("출력이 없고 성공하면 결과 창 없이 알림만 보인다", async () => {
    const { user, input } = await open();
    await user.type(input, "mkdir out{Enter}");
    expect(await screen.findByText("실행 완료: mkdir out")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "실행 결과" })).not.toBeInTheDocument();
  });

  it("출력이 있으면 결과 창에 명령·종료 코드·출력을 보인다", async () => {
    const b = seedBackend();
    b.shellResult = { exit_code: 128, output: "fatal: repository not found", timed_out: false };
    const { user, input } = await open(b);
    await user.type(input, "git clone x{Enter}");
    const dlg = await screen.findByRole("dialog", { name: "실행 결과" });
    expect(dlg).toHaveTextContent("git clone x");
    expect(dlg).toHaveTextContent("종료 코드 128");
    expect(dlg).toHaveTextContent("fatal: repository not found");
  });

  it("시간 초과면 중단했다고 알린다", async () => {
    const b = seedBackend();
    b.shellResult = { exit_code: null, output: "", timed_out: true };
    const { user, input } = await open(b);
    await user.type(input, "sleep 999{Enter}");
    expect(await screen.findByText("5분이 지나 중단했습니다")).toBeInTheDocument();
  });

  it("빈 입력은 실행하지 않고 Esc는 입력칸에서 나온다", async () => {
    const { user, backend, input } = await open();
    await user.type(input, "   {Enter}");
    expect(backend.shellRuns).toEqual([]);
    await user.click(input);
    await user.keyboard("{Escape}");
    expect(input).not.toHaveFocus();
  });

  it("show_command_line을 끄면 줄이 사라지고, Ctrl+K가 다시 켜서 포커스를 준다", async () => {
    const b = seedBackend();
    b.setConfig((l) => (l.config.behavior.layout.show_command_line = false));
    const { user } = await renderApp(b);
    expect(screen.queryByRole("textbox", { name: "명령어 줄" })).not.toBeInTheDocument();
    await user.keyboard("{Control>}k{/Control}");
    const input = await line();
    await waitFor(() => expect(input).toHaveFocus());
    expect((await b.getConfig()).config.behavior.layout.show_command_line).toBe(true);
  });

  it("Ctrl+Shift+L 토글 액션이 줄을 끄고 설정에 저장한다", async () => {
    const { user, backend } = await open();
    await user.keyboard("{Control>}{Shift>}l{/Shift}{/Control}");
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "명령어 줄" })).not.toBeInTheDocument());
    expect((await backend.getConfig()).config.behavior.layout.show_command_line).toBe(false);
  });

  it("Ctrl+Shift+K도 줄을 끄고 켠다 (이슈 #119)", async () => {
    const { user, backend } = await open();
    await user.keyboard("{Control>}{Shift>}k{/Shift}{/Control}");
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "명령어 줄" })).not.toBeInTheDocument());
    expect((await backend.getConfig()).config.behavior.layout.show_command_line).toBe(false);
    await user.keyboard("{Control>}{Shift>}k{/Shift}{/Control}");
    expect(await line()).toBeInTheDocument();
    expect((await backend.getConfig()).config.behavior.layout.show_command_line).toBe(true);
  });
});
