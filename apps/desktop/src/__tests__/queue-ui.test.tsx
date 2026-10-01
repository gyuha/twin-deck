import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { cursorName, renderApp, seedBackend } from "./helpers";

const indicator = () => screen.queryByRole("status", { name: "작업 큐 진행" });
const popup = () => screen.queryByRole("dialog", { name: "작업 큐" });
const jobRows = () => within(screen.getByRole("listbox", { name: "작업 목록" })).getAllByRole("option");

async function manualCopyAll() {
  const backend = seedBackend();
  backend.queueMode = "manual";
  const r = await renderApp(backend);
  await r.user.keyboard("{Control>}a{/Control}{F5}{Enter}"); // 5개 항목을 큐에
  await waitFor(() => expect(indicator()).toBeInTheDocument());
  return { ...r, backend };
}

const advance = (b: { advance(): Promise<boolean> }) => act(async () => void (await b.advance()));

describe("Q-02 진행 표시", () => {
  it("실행할 작업이 있는 동안만 나타나고 끝나면 사라진다", async () => {
    const { backend } = await manualCopyAll();
    expect(indicator()).toHaveTextContent("작업 1개 · 0/5");
    await advance(backend);
    await waitFor(() => expect(indicator()).toHaveTextContent("1/5"));
    for (let i = 0; i < 4; i++) await advance(backend);
    await waitFor(() => expect(indicator()).toBeNull());
    expect(backend.exists("/home/b/docs/readme.md")).toBe(true);
  });

  it("즉시 실행 모드에서는 남지 않는다", async () => {
    const { user, backend } = await renderApp();
    await user.keyboard("{ArrowDown}{ArrowDown}{F5}{Enter}");
    await waitFor(() => expect(backend.exists("/home/b/a.txt")).toBe(true));
    expect(indicator()).toBeNull();
  });
});

describe("Q-03 큐 팝업과 키보드 조작", () => {
  it("=로 열고 작업 상태를 보여 주며 P로 일시정지/재개한다", async () => {
    const { user, backend } = await manualCopyAll();
    await user.keyboard("=");
    expect(await screen.findByRole("dialog", { name: "작업 큐" })).toBeInTheDocument();
    expect(jobRows()[0]).toHaveTextContent("복사 0/5 — 대기");

    await advance(backend);
    await waitFor(() => expect(jobRows()[0]).toHaveTextContent("복사 1/5 — 진행 중"));

    await user.keyboard("p");
    await waitFor(() => expect(jobRows()[0]).toHaveTextContent("일시정지"));
    expect(await backend.advance()).toBe(false); // 일시정지 중에는 진행하지 않는다
    expect(jobRows()[0]).toHaveTextContent("1/5");

    await user.keyboard("p");
    await waitFor(() => expect(jobRows()[0]).toHaveTextContent("진행 중"));
    await advance(backend);
    await waitFor(() => expect(jobRows()[0]).toHaveTextContent("2/5"));
  });

  it("A 또는 D로 중단하면 남은 항목은 실행되지 않고 Esc로 닫으면 지워진다", async () => {
    const { user, backend } = await manualCopyAll();
    await user.keyboard("=");
    await screen.findByRole("dialog", { name: "작업 큐" });
    await advance(backend);
    await user.keyboard("a");
    await waitFor(() => expect(jobRows()[0]).toHaveTextContent("중단됨"));
    expect(await backend.advance()).toBe(false);
    expect(backend.exists("/home/b/docs")).toBe(true); // 이미 끝난 항목은 유지
    expect(backend.exists("/home/b/a.txt")).toBe(false);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(popup()).toBeNull());
    expect(await backend.queueJobs()).toEqual([]); // 끝난 작업이 정리됨

    await user.keyboard("=");
    await screen.findByRole("dialog", { name: "작업 큐" });
    expect(screen.getByText("작업 없음")).toBeInTheDocument();
    await user.keyboard("=");
    await waitFor(() => expect(popup()).toBeNull());
  });

  it("방향키/Space로 작업을 고르고 선택한 작업에만 P/D가 적용된다", async () => {
    const { user, backend } = await manualCopyAll();
    await user.keyboard("{Escape}"); // 선택 해제 후 두 번째 작업
    await user.keyboard("{F5}{Enter}"); // 커서 항목 하나를 또 큐에
    await waitFor(() => expect(backend.queueJobs().then((j) => j.length)).resolves.toBe(2));
    await user.keyboard("=");
    await screen.findByRole("dialog", { name: "작업 큐" });
    expect(jobRows()[0]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}");
    expect(jobRows()[1]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("d");
    await waitFor(() => expect(jobRows()[1]).toHaveTextContent("중단됨"));
    expect(jobRows()[0]).not.toHaveTextContent("중단됨");
    await user.keyboard("{ArrowUp}");
    await user.keyboard(" "); // Space는 아래로
    expect(jobRows()[1]).toHaveAttribute("aria-selected", "true");
  });

  it("팝업이 열려 있으면 패널 키가 무시된다", async () => {
    const { user, backend } = await manualCopyAll();
    await user.keyboard("=");
    await screen.findByRole("dialog", { name: "작업 큐" });
    const before = cursorName("left");
    await user.keyboard("{ArrowDown}{F8}{F7}");
    expect(cursorName("left")).toBe(before);
    expect(screen.queryByRole("dialog", { name: "새 폴더" })).toBeNull();
    expect((await backend.queueJobs()).length).toBe(1);
  });
});

describe("실패 요약", () => {
  it("실패한 항목의 경로와 오류를 팝업에서 보여 준다", async () => {
    const backend = seedBackend();
    backend.queueMode = "manual";
    const { user } = await renderApp(backend);
    await user.keyboard("{ArrowDown}{ArrowDown}{F5}{Enter}"); // a.txt
    await waitFor(() => expect(indicator()).toBeInTheDocument());
    await backend.deletePermanent("/home/a/a.txt"); // 실행 전에 원본이 사라짐
    await advance(backend);
    await waitFor(() => expect(indicator()).toBeNull());
    await user.keyboard("=");
    const row = (await screen.findAllByRole("option", { name: /복사 1\/1/ }))[0];
    expect(row).toHaveTextContent("실패 있음");
    expect(within(row).getByRole("alert")).toHaveTextContent("/home/a/a.txt");
    expect(within(row).getByRole("alert")).toHaveTextContent("찾을 수 없음");
  });
});
