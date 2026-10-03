import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { list, renderApp, seedBackend } from "./helpers";

const confirmDialog = (name: RegExp) => screen.findByRole("dialog", { name });
const destInput = () => screen.getByRole("textbox", { name: "대상 폴더" }) as HTMLInputElement;
const advance = (b: { advance(): Promise<boolean> }) => act(async () => void (await b.advance()));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("전송 확인 창", () => {
  it("F5: 대상 폴더가 채워져 뜨고 시작하면 복사한다", async () => {
    const { user, backend } = await renderApp();
    await user.keyboard("{ArrowDown}{ArrowDown}{F5}"); // a.txt
    const d = await confirmDialog(/a\.txt.*복사/);
    expect(destInput().value).toBe("/home/b");
    expect(within(d).getByRole("button", { name: "취소" })).toBeInTheDocument();
    expect(backend.exists("/home/b/a.txt")).toBe(false); // 시작 전에는 복사되지 않는다
    await user.keyboard("{Enter}");
    await waitFor(() => expect(backend.exists("/home/b/a.txt")).toBe(true));
  });

  it("여러 항목이면 개수를 묻는다", async () => {
    const { user } = await renderApp();
    await user.keyboard("{Control>}a{/Control}{F5}");
    await confirmDialog(/선택한 5개 항목을 복사/);
  });

  it("Esc: 취소하면 아무것도 복사하지 않는다", async () => {
    const { user, backend } = await renderApp();
    await user.keyboard("{ArrowDown}{ArrowDown}{F5}");
    await confirmDialog(/복사/);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await sleep(50);
    expect(backend.exists("/home/b/a.txt")).toBe(false);
  });

  it("취소/시작 버튼을 누를 수 있다", async () => {
    const { user, backend } = await renderApp();
    await user.keyboard("{ArrowDown}{ArrowDown}{F5}");
    const d = await confirmDialog(/복사/);
    await user.click(within(d).getByRole("button", { name: "시작" }));
    await waitFor(() => expect(backend.exists("/home/b/a.txt")).toBe(true));
  });

  it("대상 폴더를 고치면 그 폴더로 복사한다", async () => {
    const { user, backend } = await renderApp();
    await user.keyboard("{ArrowDown}{ArrowDown}{F5}");
    await confirmDialog(/복사/);
    await user.clear(destInput());
    await user.type(destInput(), "/home/a/docs{Enter}");
    await waitFor(() => expect(backend.exists("/home/a/docs/a.txt")).toBe(true));
    expect(backend.exists("/home/b/a.txt")).toBe(false);
  });

  it("없는 폴더는 창을 닫지 않고 오류를 보여 준다", async () => {
    const { user, backend } = await renderApp();
    await user.keyboard("{ArrowDown}{ArrowDown}{F5}");
    await confirmDialog(/복사/);
    await user.clear(destInput());
    await user.type(destInput(), "/nope{Enter}");
    const d = await screen.findByRole("dialog");
    expect(await within(d).findByRole("alert")).toBeInTheDocument();
    expect(destInput().value).toBe("/nope");
    expect(backend.exists("/nope/a.txt")).toBe(false);
  });

  it("원본 폴더 안쪽 경로는 거부한다", async () => {
    const { user } = await renderApp();
    await user.keyboard("{F5}"); // docs 폴더
    await confirmDialog(/docs.*복사/);
    await user.clear(destInput());
    await user.type(destInput(), "/home/a/docs/sub{Enter}");
    const d = await screen.findByRole("dialog");
    expect(await within(d).findByRole("alert")).toHaveTextContent("안");
  });

  it("F6: 이동도 확인 창을 거친다", async () => {
    const { user, backend } = await renderApp();
    await user.keyboard("{ArrowDown}{ArrowDown}{F6}");
    await confirmDialog(/a\.txt.*이동/);
    expect(backend.exists("/home/a/a.txt")).toBe(true);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(backend.exists("/home/b/a.txt")).toBe(true));
    expect(backend.exists("/home/a/a.txt")).toBe(false);
  });
});

describe("전송 진행 창", () => {
  async function startManual() {
    const backend = seedBackend();
    backend.queueMode = "manual";
    const r = await renderApp(backend);
    await r.user.keyboard("{Control>}a{/Control}{F5}");
    await confirmDialog(/복사/);
    await r.user.keyboard("{Enter}");
    return { ...r, backend };
  }

  it("확인 창을 거친 복사는 300ms를 기다리지 않고 진행 창을 바로 띄운다", async () => {
    const backend = seedBackend();
    backend.queueMode = "manual";
    const { user } = await renderApp(backend);
    await user.keyboard("{Control>}a{/Control}{F5}");
    await confirmDialog(/복사/);
    const t0 = Date.now();
    await user.keyboard("{Enter}");
    const d = await screen.findByRole("dialog", { name: "복사 중" });
    expect(Date.now() - t0).toBeLessThan(250);
    expect(within(d).getByRole("button", { name: "백그라운드" })).toBeInTheDocument();
    expect(within(d).getByRole("button", { name: "중단" })).toBeInTheDocument();
    expect(d).toHaveTextContent("Return 백그라운드 · Esc 중단");
  });

  it("Enter(백그라운드)는 창만 닫고 작업은 큐에서 계속 돌며 창이 다시 뜨지 않는다", async () => {
    const backend = seedBackend();
    backend.queueMode = "manual";
    const { user } = await renderApp(backend);
    await user.keyboard("{Control>}a{/Control}{F5}");
    await confirmDialog(/복사/);
    await user.keyboard("{Enter}");
    await screen.findByRole("dialog", { name: "복사 중" });
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("status", { name: "작업 큐 진행" })).toHaveTextContent("작업 1개"); // 작업은 그대로 진행 중
    await sleep(350); // 진행 창을 다시 띄우지 않는다
    expect(screen.queryByRole("dialog")).toBeNull();
    for (let i = 0; i < 5; i++) await advance(backend);
    await waitFor(() => expect(backend.exists("/home/b/docs/readme.md")).toBe(true));
    expect(screen.queryByRole("status", { name: "작업 큐 진행" })).toBeNull();
  });

  it("백그라운드로 보낸 뒤에도 큐 팝업(=)을 열 수 있다", async () => {
    const backend = seedBackend();
    backend.queueMode = "manual";
    const { user } = await renderApp(backend);
    await user.keyboard("{Control>}a{/Control}{F5}");
    await confirmDialog(/복사/);
    await user.keyboard("{Enter}");
    await screen.findByRole("dialog", { name: "복사 중" });
    await user.keyboard("{Enter}=");
    expect(await screen.findByRole("dialog", { name: "작업 큐" })).toBeInTheDocument();
  });

  it("Esc는 진행 중인 복사를 중단한다", async () => {
    const backend = seedBackend();
    backend.queueMode = "manual";
    const { user } = await renderApp(backend);
    await user.keyboard("{Control>}a{/Control}{F5}");
    await confirmDialog(/복사/);
    await user.keyboard("{Enter}");
    await screen.findByRole("dialog", { name: "복사 중" });
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => void (await backend.advance()));
    await waitFor(() => expect(screen.queryByRole("status", { name: "작업 큐 진행" })).toBeNull());
    expect(backend.exists("/home/b/docs/readme.md")).toBe(false); // 중단되어 나머지는 복사되지 않았다
  });

  it("빨리 끝나는 작업에는 뜨지 않는다", async () => {
    const { user, backend } = await renderApp();
    await user.keyboard("{ArrowDown}{ArrowDown}{F5}");
    await confirmDialog(/복사/);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(backend.exists("/home/b/a.txt")).toBe(true));
    await sleep(450);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("오래 걸리면 N/M개와 현재 파일을 보여 주고 끝나면 닫힌다", async () => {
    const { backend } = await startManual();
    const d = await screen.findByRole("dialog", { name: "복사 중" });
    expect(within(d).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    expect(d).toHaveTextContent("0/5개");
    await advance(backend);
    await waitFor(() => expect(screen.getByRole("dialog", { name: "복사 중" })).toHaveTextContent("1/5개"));
    expect(screen.getByRole("dialog", { name: "복사 중" })).toHaveTextContent("/home/a/"); // 현재 파일 경로
    for (let i = 0; i < 4; i++) await advance(backend);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("Esc/중단 버튼: 작업을 중단하고 닫는다", async () => {
    const { user, backend } = await startManual();
    await screen.findByRole("dialog", { name: "복사 중" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((await backend.queueJobs())[0].status).toBe("aborted");
  });

  it("실패한 항목이 있으면 닫지 않고 오류를 보여 준다", async () => {
    const { user, backend } = await startManual();
    await screen.findByRole("dialog", { name: "복사 중" });
    await backend.deletePermanent("/home/a/a.txt"); // 실행 시점에 원본이 사라진다
    for (let i = 0; i < 5; i++) await advance(backend);
    const d = await screen.findByRole("dialog", { name: /복사/ });
    expect(await within(d).findByRole("alert")).toHaveTextContent("a.txt");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("전송이 끝난 뒤 목록 갱신", () => {
  it("늦게 도착한 옛 목록이 최신 목록을 덮어쓰지 않는다", async () => {
    const backend = seedBackend();
    const { user } = await renderApp(backend);
    const before = await backend.listDir("/home/b", true); // 복사 전 목록
    const orig = backend.listDir.bind(backend);
    let armed = false;
    let slowDone = false;
    let calls = 0;
    backend.listDir = async (path: string, hidden: boolean) => {
      if (armed && path === "/home/b" && ++calls === 2 && !slowDone) {
        slowDone = true; // 대상 검증 다음에 시작한 첫 목록 조회는 느리고, 복사 전 상태를 돌려준다
        await sleep(200);
        return before;
      }
      return orig(path, hidden);
    };
    await user.keyboard("{ArrowDown}{ArrowDown}{F5}");
    await confirmDialog(/복사/);
    armed = true;
    await user.keyboard("{Enter}");
    await sleep(500);
    const right = list("right");
    expect(within(right).getByText("a.txt")).toBeInTheDocument();
  });
});

describe("큐 이벤트가 오지 않아도", () => {
  it("진행 창이 뜨고, 끝나면 닫히고 대상 목록이 갱신된다", async () => {
    const backend = seedBackend();
    backend.queueMode = "manual";
    backend.queueEvents = false;
    const { user } = await renderApp(backend);
    await user.keyboard("{Control>}a{/Control}{F5}");
    await confirmDialog(/복사/);
    await user.keyboard("{Enter}");
    const d = await screen.findByRole("dialog", { name: "복사 중" });
    expect(d).toHaveTextContent("0/5개");
    for (let i = 0; i < 5; i++) await advance(backend);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(within(list("right")).getByText("a.txt")).toBeInTheDocument());
  });
});

describe("삭제 진행 창", () => {
  it("영구 삭제: 확인 뒤 진행 창이 뜨고 끝나면 닫힌다", async () => {
    const backend = seedBackend();
    backend.queueMode = "manual";
    const { user } = await renderApp(backend);
    await user.keyboard("{Control>}a{/Control}{Shift>}{F8}{/Shift}");
    await screen.findByRole("dialog", { name: /영구 삭제/ });
    await user.keyboard("{Enter}");
    const d = await screen.findByRole("dialog", { name: "삭제 중" });
    expect(d).toHaveTextContent("0/5개");
    for (let i = 0; i < 5; i++) await advance(backend);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(backend.exists("/home/a/a.txt")).toBe(false);
  });

  it("휴지통: 진행 창이 뜨고 Esc로 중단하면 닫힌다", async () => {
    const backend = seedBackend();
    backend.queueMode = "manual";
    const { user } = await renderApp(backend);
    await user.keyboard("{Control>}a{/Control}{F8}");
    await screen.findByRole("dialog", { name: "휴지통으로 이동 중" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((await backend.queueJobs())[0].status).toBe("aborted");
  });
});
