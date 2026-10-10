import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";
import { runAction } from "./search-helpers";

// "명령줄 도구 설치/제거"(이슈 #45)는 기본 키가 없는 액션이라 Actions Panel에서 ID로 실행한다.
const backend = (state: "absent" | "installed" | "foreign" = "absent") => {
  const b = new FakeBackend().seed({ "/home/a/a.txt": "a", "/home/b/b.txt": "b" });
  b.cli = { state, link: "/usr/local/bin/td" };
  return b;
};

describe("명령줄 도구 설치/제거 액션", () => {
  it("설치 액션은 확인 창을 거쳐 설치하고 결과를 알린다", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await runAction(user, "core.cli.install");
    const d = await screen.findByRole("dialog", { name: /명령줄 도구 설치/ });
    expect(d).toHaveTextContent("/usr/local/bin/td"); // 어디에 무엇을 만드는지 보여 준다
    expect(b.cliCalls.install).toBe(0); // 확인 전에는 설치하지 않는다
    await user.keyboard("{Enter}");
    await waitFor(() => expect(b.cliCalls.install).toBe(1));
    expect(await screen.findByText(/명령줄 도구를 설치했습니다/)).toBeInTheDocument();
    expect(b.cli.state).toBe("installed");
  });

  it("확인 창에서 취소하면 설치하지 않는다", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await runAction(user, "core.cli.install");
    await screen.findByRole("dialog", { name: /명령줄 도구 설치/ });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /명령줄 도구 설치/ })).toBeNull());
    expect(b.cliCalls.install).toBe(0);
    expect(b.cli.state).toBe("absent");
  });

  it("이미 설치돼 있으면 확인 창 없이 알리기만 한다", async () => {
    const b = backend("installed");
    const { user } = await renderApp(b);
    await runAction(user, "core.cli.install");
    expect(await screen.findByText(/이미 설치되어 있습니다/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /명령줄 도구/ })).toBeNull();
    expect(b.cliCalls.install).toBe(0);
  });

  it("제거 액션은 설치된 상태에서 확인 창을 거쳐 제거한다", async () => {
    const b = backend("installed");
    const { user } = await renderApp(b);
    await runAction(user, "core.cli.uninstall");
    await screen.findByRole("dialog", { name: /명령줄 도구 제거/ });
    await user.keyboard("{Enter}");
    await waitFor(() => expect(b.cliCalls.uninstall).toBe(1));
    expect(await screen.findByText(/명령줄 도구를 제거했습니다/)).toBeInTheDocument();
    expect(b.cli.state).toBe("absent");
  });

  it("설치돼 있지 않으면 제거 액션은 알리기만 한다", async () => {
    const b = backend("absent");
    const { user } = await renderApp(b);
    await runAction(user, "core.cli.uninstall");
    expect(await screen.findByText(/설치되어 있지 않습니다/)).toBeInTheDocument();
    expect(b.cliCalls.uninstall).toBe(0);
  });

  it("다른 td가 있으면 설치·제거 모두 알리기만 하고 건드리지 않는다", async () => {
    const b = backend("foreign");
    const { user } = await renderApp(b);
    await runAction(user, "core.cli.install");
    expect(await screen.findByText(/다른 td가 이미 있어/)).toBeInTheDocument();
    expect(b.cliCalls.install).toBe(0);
    await runAction(user, "core.cli.uninstall");
    await waitFor(() => expect(screen.getAllByText(/다른 td가 이미 있어/).length).toBeGreaterThan(0));
    expect(b.cliCalls.uninstall).toBe(0);
    expect(screen.queryByRole("dialog", { name: /명령줄 도구/ })).toBeNull();
  });

  it("설치가 실패하면 오류를 알림으로 보인다", async () => {
    const b = backend();
    b.cliError = "관리자 암호 입력을 취소했습니다";
    const { user } = await renderApp(b);
    await runAction(user, "core.cli.install");
    await screen.findByRole("dialog", { name: /명령줄 도구 설치/ });
    await user.keyboard("{Enter}");
    expect(await screen.findByText(/관리자 암호 입력을 취소했습니다/)).toBeInTheDocument();
    expect(b.cli.state).toBe("absent");
  });
});
