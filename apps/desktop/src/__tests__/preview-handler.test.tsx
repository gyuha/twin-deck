import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackendError, FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";

// Windows는 Office 문서를 미리보기 처리기(탐색기 미리보기 창이 쓰는 것)로 앱 창 위에 겹쳐 보여 준다(ADR-0015).
// 가짜 백엔드는 호출을 기록하고, 처리기가 있다고 답할 경로를 정한다.
// 이름순: a.docx(0), b.pptx(1), c.xlsx(2), d.zip(3), e.txt(4)
const files = {
  "/home/a/a.docx": "PK\u0003\u0004\u0000",
  "/home/a/b.pptx": "PK\u0003\u0004\u0000",
  "/home/a/c.xlsx": "PK\u0003\u0004\u0000",
  "/home/a/d.zip": "PK\u0003\u0004\u0000",
  "/home/a/e.txt": "본문",
  "/home/b": null,
};
const withHandler = () => {
  const b = new FakeBackend().seed(files);
  b.previewHandlerAvailable = (p) => /\.(docx|pptx|xlsx)$/i.test(p);
  return b;
};
const calls = (b: FakeBackend, kind: string) => b.previewHandlerCalls.filter((c) => c.call === kind);
const shows = (b: FakeBackend) => calls(b, "show").map((c) => c.path);
const dlg = (name: string) => screen.findByRole("dialog", { name });
const open = (user: Awaited<ReturnType<typeof renderApp>>["user"], n: number) => user.keyboard("{ArrowDown}".repeat(n) + "{ArrowRight}");
const placeholder = (d: HTMLElement) => d.querySelector("[data-preview-handler]");

// macOS 케이스는 Quick Look 뷰를 띄우므로 jsdom에 없는 Blob URL 함수를 대신한다.
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:handler-test");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe("Windows 미리보기 처리기", () => {
  it("Office 문서는 처리기로 보여 달라고 요청하고, 데이터 미리보기·꺼짐 안내는 없다", async () => {
    const backend = withHandler();
    const { user } = await renderApp(backend, "windows");
    await open(user, 0);
    const d = await dlg("미리보기: a.docx");
    await waitFor(() => expect(shows(backend)).toEqual(["/home/a/a.docx"]));
    expect(placeholder(d)).not.toBeNull();
    expect(within(d).queryByText(/Office 문서 미리보기가 꺼져 있습니다/)).toBeNull();
    expect(within(d).queryByText(/데이터 미리보기이며/)).toBeNull();
    expect(within(d).queryByLabelText("텍스트 미리보기")).toBeNull();
    expect(within(d).queryByRole("button", { name: "텍스트 복사" })).toBeNull();
  });

  it("docx는 설정 preview.office와 관계없이 처리기를 쓴다", async () => {
    const backend = withHandler();
    backend.setConfig((l) => (l.config.preview.office = true));
    const { user } = await renderApp(backend, "windows");
    await open(user, 0);
    const d = await dlg("미리보기: a.docx");
    await waitFor(() => expect(shows(backend)).toEqual(["/home/a/a.docx"]));
    expect(placeholder(d)).not.toBeNull();
  });

  // Windows 처리기는 docx만 쓴다. 처리기가 있어도(withHandler는 pptx·xlsx도 있다고 답한다) pptx·xlsx는 부르지 않고 지금까지의 방식을 쓴다.
  it.each([
    [1, "b.pptx"],
    [2, "c.xlsx"],
  ] as const)("%s번째 %s는 처리기를 부르지 않고 지금까지의 미리보기(preview.office가 꺼져 있으면 안내)를 쓴다", async (n, name) => {
    const backend = withHandler();
    const { user } = await renderApp(backend, "windows");
    await open(user, n);
    const d = await dlg(`미리보기: ${name}`);
    expect(await within(d).findByText(/Office 문서 미리보기가 꺼져 있습니다/)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 300));
    expect(backend.previewHandlerCalls).toEqual([]);
    expect(placeholder(d)).toBeNull();
  });

  it("처리기가 없으면 지금까지의 동작으로 돌아간다(preview.office가 꺼져 있으면 안내)", async () => {
    const backend = new FakeBackend().seed(files); // 처리기는 모두 없다고 답한다
    const { user } = await renderApp(backend, "windows");
    await open(user, 0);
    const d = await dlg("미리보기: a.docx");
    await waitFor(() => expect(shows(backend)).toEqual(["/home/a/a.docx"]));
    expect(await within(d).findByText(/Office 문서 미리보기가 꺼져 있습니다/)).toBeInTheDocument();
    expect(placeholder(d)).toBeNull();
  });

  it("처리기가 오류를 내도 지금까지의 동작으로 돌아간다", async () => {
    const backend = withHandler();
    backend.previewHandlerResponder = async () => {
      throw new BackendError("미리보기 처리기를 띄우지 못했습니다");
    };
    const { user } = await renderApp(backend, "windows");
    await open(user, 0);
    const d = await dlg("미리보기: a.docx");
    expect(await within(d).findByText(/Office 문서 미리보기가 꺼져 있습니다/)).toBeInTheDocument();
    expect(placeholder(d)).toBeNull();
    // 처리기가 오류를 냈으면 이유를 보여 준다. 그냥 없는 것과 구별해, 안 보이는 까닭을 사용자가 알 수 있게 한다.
    expect(within(d).getByText(/미리보기 처리기를 쓰지 못했습니다.*미리보기 처리기를 띄우지 못했습니다/)).toBeInTheDocument();
  });

  it("처리기가 없을 뿐이면 이유 안내는 없다", async () => {
    const { user } = await renderApp(new FakeBackend().seed(files), "windows");
    await open(user, 0);
    const d = await dlg("미리보기: a.docx");
    expect(await within(d).findByText(/Office 문서 미리보기가 꺼져 있습니다/)).toBeInTheDocument();
    expect(within(d).queryByText(/미리보기 처리기를 쓰지 못했습니다/)).toBeNull();
  });

  it("인터넷에서 받은 파일이면 이유를 알려 주고, 지금까지의 미리보기로 돌아간다", async () => {
    const backend = withHandler();
    backend.previewHandlerBlocked.add("/home/a/a.docx");
    const { user } = await renderApp(backend, "windows");
    await open(user, 0);
    const d = await dlg("미리보기: a.docx");
    expect(await within(d).findByText(/인터넷에서 받은 파일이라 Office가 미리보기를 막습니다/)).toBeInTheDocument();
    expect(within(d).getByRole("button", { name: "차단 해제하고 보기" })).toBeInTheDocument();
    expect(within(d).getByText(/Office 문서 미리보기가 꺼져 있습니다/)).toBeInTheDocument(); // 폴백
    expect(placeholder(d)).toBeNull();
    expect(backend.unblocked).toEqual([]); // 사용자가 누르기 전에는 파일을 바꾸지 않는다
  });

  it("차단 해제 버튼을 누르면 그 파일의 차단 표시를 지우고 처리기로 다시 보여 준다", async () => {
    const backend = withHandler();
    backend.previewHandlerBlocked.add("/home/a/a.docx");
    const { user } = await renderApp(backend, "windows");
    await open(user, 0);
    const d = await dlg("미리보기: a.docx");
    await user.click(await within(d).findByRole("button", { name: "차단 해제하고 보기" }));
    await waitFor(() => expect(backend.unblocked).toEqual(["/home/a/a.docx"]));
    await waitFor(() => expect(shows(backend)).toEqual(["/home/a/a.docx", "/home/a/a.docx"])); // 막혀서 한 번, 풀고 나서 한 번
    await waitFor(() => expect(placeholder(d)).not.toBeNull());
    expect(within(d).queryByText(/인터넷에서 받은 파일이라/)).toBeNull();
    expect(within(d).queryByRole("button", { name: "차단 해제하고 보기" })).toBeNull();
  });

  it("차단되지 않은 파일에는 차단 안내가 없다", async () => {
    const backend = withHandler();
    const { user } = await renderApp(backend, "windows");
    await open(user, 0);
    const d = await dlg("미리보기: a.docx");
    await waitFor(() => expect(placeholder(d)).not.toBeNull());
    expect(within(d).queryByText(/인터넷에서 받은 파일이라/)).toBeNull();
  });

  it("Office가 아닌 형식과 macOS·Linux에서는 처리기를 부르지 않는다", async () => {
    const win = withHandler();
    const w = await renderApp(win, "windows");
    await w.user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowRight}"); // e.txt
    await dlg("미리보기: e.txt");
    await new Promise((r) => setTimeout(r, 300));
    expect(shows(win)).toEqual([]);
  });

  it.each(["mac", "linux"] as const)("%s에서는 처리기를 부르지 않는다", async (platform) => {
    const backend = withHandler();
    const { user } = await renderApp(backend, platform);
    await open(user, 0);
    await dlg("미리보기: a.docx");
    await new Promise((r) => setTimeout(r, 300));
    expect(backend.previewHandlerCalls).toEqual([]);
  });

  it("다른 항목으로 넘어가면 이전 처리기 창을 내리고 새 항목을 띄운다", async () => {
    // 처리기는 docx만 쓰므로 docx 두 개로 시험한다.
    const backend = new FakeBackend().seed({ "/home/a/a.docx": "PK", "/home/a/b.docx": "PK", "/home/b": null });
    backend.previewHandlerAvailable = () => true;
    const { user } = await renderApp(backend, "windows");
    await open(user, 0);
    await dlg("미리보기: a.docx");
    await waitFor(() => expect(shows(backend)).toEqual(["/home/a/a.docx"]));
    await user.keyboard("{ArrowDown}");
    await dlg("미리보기: b.docx");
    await waitFor(() => expect(shows(backend)).toEqual(["/home/a/a.docx", "/home/a/b.docx"]));
    const order = backend.previewHandlerCalls.filter((c) => c.call === "show" || c.call === "close").map((c) => c.call);
    expect(order.slice(0, 3)).toEqual(["show", "close", "show"]); // 넘기기 전에 이전 창이 먼저 내려간다
  });

  it("미리보기를 닫으면 처리기 창을 내린다", async () => {
    const backend = withHandler();
    const { user } = await renderApp(backend, "windows");
    await open(user, 0);
    await dlg("미리보기: a.docx");
    await waitFor(() => expect(shows(backend).length).toBe(1));
    const before = calls(backend, "close").length;
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "미리보기: a.docx" })).toBeNull());
    expect(calls(backend, "close").length).toBeGreaterThan(before);
  });

  it("삭제 확인 같은 대화상자가 위에 뜨면 처리기 창을 숨기고, 닫으면 다시 보인다", async () => {
    const backend = withHandler();
    const { user } = await renderApp(backend, "windows");
    await open(user, 0);
    await dlg("미리보기: a.docx");
    await waitFor(() => expect(shows(backend).length).toBe(1));
    await waitFor(() => expect(calls(backend, "setVisible").at(-1)?.visible ?? true).toBe(true));
    await user.keyboard("{Delete}"); // 영구 삭제 확인 대화상자
    await screen.findByRole("dialog", { name: /삭제/ });
    await waitFor(() => expect(calls(backend, "setVisible").at(-1)?.visible).toBe(false));
    await user.keyboard("{Escape}"); // 취소
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /삭제/ })).toBeNull());
    await waitFor(() => expect(calls(backend, "setVisible").at(-1)?.visible).toBe(true));
  });

  it("미리보기 창을 끄는 동안에는 처리기 창을 숨기고 놓으면 다시 보인다", async () => {
    const backend = withHandler();
    const { user } = await renderApp(backend, "windows");
    await open(user, 0);
    const d = await dlg("미리보기: a.docx");
    await waitFor(() => expect(shows(backend).length).toBe(1));
    const title = d.querySelector("[data-preview-title]") as HTMLElement;
    fireEvent.mouseDown(title, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 140, clientY: 130 });
    await waitFor(() => expect(calls(backend, "setVisible").at(-1)?.visible).toBe(false));
    fireEvent.mouseUp(window);
    await waitFor(() => expect(calls(backend, "setVisible").at(-1)?.visible).toBe(true));
  });
});
