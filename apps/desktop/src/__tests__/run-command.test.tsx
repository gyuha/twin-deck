import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp, seedBackend } from "./helpers";

describe("명령 실행 (core.run_command, 이슈 #110)", () => {
  const open = async (backend = seedBackend()) => {
    const r = await renderApp(backend);
    await r.user.keyboard("{Control>}{Alt>}x{/Alt}{/Control}");
    return { ...r, backend, input: await screen.findByRole("textbox", { name: "명령" }) };
  };

  it("Ctrl+Alt+X로 명령 입력 창이 열리고, 입력한 한 줄을 활성 탭의 폴더에서 실행한다", async () => {
    const { user, backend, input } = await open();
    expect(screen.getByRole("dialog", { name: "명령 실행" })).toBeInTheDocument();
    await user.type(input, "mkdir out{Enter}");
    await waitFor(() => expect(backend.shellRuns).toEqual([{ cwd: "/home/a", command: "mkdir out" }]));
    expect(screen.queryByRole("dialog", { name: "명령 실행" })).not.toBeInTheDocument();
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

  it("빈 입력이나 취소는 아무것도 실행하지 않는다", async () => {
    const { user, backend, input } = await open();
    await user.type(input, "   {Enter}");
    await user.keyboard("{Control>}{Alt>}x{/Alt}{/Control}");
    await screen.findByRole("textbox", { name: "명령" });
    await user.keyboard("{Escape}");
    expect(backend.shellRuns).toEqual([]);
  });
});
