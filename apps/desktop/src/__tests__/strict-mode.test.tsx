import { StrictMode } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { App } from "../App";
import { entryNames, list } from "./helpers";

// `bootstrap.tsx`는 앱을 <StrictMode>로 렌더한다. 개발 모드(tauri dev)에서 StrictMode는 효과를 마운트 → 정리 → 마운트로
// 두 번 실행하는데, 정리 단계의 dispose()가 이벤트 구독을 끊고 되살리지 않으면 백엔드 이벤트가 UI에 닿지 않는다.
// 다른 테스트는 StrictMode 없이 렌더해서 이 문제를 잡지 못했다.
const backend = () => {
  const b = new FakeBackend().seed({ "/home/a/a.txt": "hello", "/home/a/sub/b.txt": "hello", "/home/b/x.md": "x" });
  b.searchMode = "manual"; // 검색 결과를 시작 응답이 끝난 뒤 이벤트로 전달해 실제 런타임과 같은 순서로 만든다
  return b;
};
const mount = async (b: FakeBackend) => {
  const user = userEvent.setup();
  render(
    <StrictMode>
      <App backend={b} platform="linux" leftPath="/home/a" rightPath="/home/b" />
    </StrictMode>,
  );
  await waitFor(() => expect(within(list("left")).queryAllByRole("option").length).toBeGreaterThan(0));
  return user;
};

describe("StrictMode(개발 모드)에서도 백엔드 이벤트가 UI에 닿는다", () => {
  it("설정 변경 이벤트가 화면에 반영된다", async () => {
    const b = backend();
    await mount(b);
    expect(screen.getByRole("toolbar", { name: "액션 바" })).toBeInTheDocument();
    b.setConfig((l) => (l.config.behavior.layout.show_action_bar = false));
    await waitFor(() => expect(screen.queryByRole("toolbar", { name: "액션 바" })).toBeNull());
  });

  it("폴더가 바뀌었다는 이벤트로 목록이 갱신된다", async () => {
    const b = backend();
    await mount(b);
    expect(entryNames("left")).not.toContain("new.txt");
    await b.touch("/home/a/new.txt"); // 가짜 백엔드는 파일을 만들면서 폴더 변경 이벤트를 보낸다
    await waitFor(() => expect(entryNames("left")).toContain("new.txt"));
  });

  it("검색 결과가 이벤트로 도착해 가상 탭에 쌓인다", async () => {
    const b = backend();
    const user = await mount(b);
    await user.keyboard("{Control>}f{/Control}");
    await user.type(await screen.findByRole("textbox", { name: "파일 마스크(F)" }), "*.txt");
    await user.click(screen.getByRole("button", { name: "시작" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "파일 찾기" })).toBeNull());
    expect(screen.getByRole("status", { name: "검색 상태" })).toHaveTextContent("진행 중"); // 아직 결과가 오지 않았다
    await act(async () => {
      while (await b.stepSearch()); // 결과 이벤트가 하나씩 도착하고 마지막에 완료 이벤트가 온다
    });
    await waitFor(() => expect(entryNames("left").sort()).toEqual(["a.txt", "b.txt"]));
    expect(screen.getByRole("status", { name: "검색 상태" })).toHaveTextContent("완료");
  });

  it("오래 걸리는 복사에는 진행 창이 뜨고 끝나면 닫힌다", async () => {
    const b = backend();
    b.queueMode = "manual"; // 작업이 끝나지 않고 계속 진행 중인 상태
    const user = await mount(b);
    await user.keyboard("{Control>}a{/Control}{F5}");
    await screen.findByRole("dialog", { name: /복사/ });
    await user.keyboard("{Enter}");
    const d = await screen.findByRole("dialog", { name: "복사 중" });
    expect(within(d).getByRole("progressbar")).toBeInTheDocument();
    await act(async () => {
      for (let i = 0; i < 6; i++) await b.advance();
    });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "복사 중" })).toBeNull());
  });
});
