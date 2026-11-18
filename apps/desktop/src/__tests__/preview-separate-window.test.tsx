import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import type { PreviewKeyDto, PreviewTargetDto } from "@twin-deck/ts-client";
import userEvent from "@testing-library/user-event";
import { start } from "../bootstrap";
import { renderApp } from "./helpers";

const seed = (separate: boolean) => {
  const b = new FakeBackend().seed({ "/home/a/a.txt": "첫째 파일", "/home/a/b.txt": "둘째 파일", "/home/b": null });
  b.setConfig((l) => {
    l.config.preview.separate_window = separate;
  });
  return b;
};
const LOADING = "불러오는 중…";
const target = (name: string): PreviewTargetDto => ({ path: `/home/a/${name}`, name, is_dir: false, sheet: null });

describe("미리보기 별도 창: 메인 창 (이슈 #160)", () => {
  it("설정이 켜져 있으면 앱 안 패널 없이 창을 보이고, 항목을 넘기면 새 대상으로, 닫으면 숨긴다", async () => {
    const b = seed(true);
    const { user } = await renderApp(b, undefined, undefined, { separatePreview: true });
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(b.previewWindowCalls).toEqual([{ type: "show", target: target("a.txt") }]));
    expect(screen.queryByRole("dialog", { name: /미리보기/ })).not.toBeInTheDocument();
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(b.previewWindowCalls.at(-1)).toEqual({ type: "show", target: target("b.txt") }));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(b.previewWindowCalls.at(-1)).toEqual({ type: "hide" }));
    expect(b.previewWindowVisible).toBe(false);
  });

  it("미리보기 창이 닫혔다고 오면 메인의 미리보기 상태를 풀고 다시 숨기지 않는다", async () => {
    const b = seed(true);
    const { user } = await renderApp(b, undefined, undefined, { separatePreview: true });
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(b.previewWindowVisible).toBe(true));
    act(() => b.emitPreviewWindowClosed());
    // 풀린 뒤 다시 Space를 누르면 열린다(상태가 남아 있으면 닫힘으로 동작한다).
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(b.previewWindowCalls.filter((c) => c.type === "show")).toHaveLength(2));
    expect(b.previewWindowCalls.some((c) => c.type === "hide")).toBe(false);
  });

  it("설정이 꺼져 있으면 창 명령을 부르지 않고 앱 안 패널을 그대로 쓴다", async () => {
    const b = seed(false);
    const { user } = await renderApp(b, undefined, undefined, { separatePreview: false });
    await user.keyboard("{ArrowRight}");
    expect(await screen.findByRole("dialog", { name: /미리보기/ })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /미리보기/ })).not.toBeInTheDocument());
    expect(b.previewWindowCalls).toEqual([]);
  });
});

describe("미리보기 별도 창: 기본 설정 (이슈 #160)", () => {
  it("기본 설정 그대로 미리보기를 열면 별도 창을 보이고 앱 안 패널은 없다", async () => {
    const b = new FakeBackend().seed({ "/home/a/a.txt": "첫째 파일", "/home/b": null });
    expect((await b.getConfig()).config.preview.separate_window).toBe(true);
    const { user } = await renderApp(b, undefined, undefined, { separatePreview: null });
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(b.previewWindowCalls).toEqual([{ type: "show", target: target("a.txt") }]));
    expect(screen.queryByRole("dialog", { name: /미리보기/ })).not.toBeInTheDocument();
  });
});

describe("미리보기 별도 창: 미리보기 창 화면 (이슈 #160)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });
  const boot = async (b: FakeBackend) => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    await start(el, { backend: b, platform: "linux", getHome: async () => "/home/a" });
  };

  it("처음 대상을 그리고, 대상이 바뀌면 따라가고, Esc로 닫는다", async () => {
    const b = seed(true);
    b.previewWindowMode = true;
    b.previewWindowCurrent = target("a.txt");
    await boot(b);
    expect(await screen.findByLabelText("텍스트 미리보기")).toHaveTextContent("첫째 파일");
    act(() => b.emitPreviewWindowTarget(target("b.txt")));
    await waitFor(() => expect(screen.getByLabelText("텍스트 미리보기")).toHaveTextContent("둘째 파일"));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await waitFor(() => expect(b.previewWindowCalls).toContainEqual({ type: "close" }));
  });

  it("늦게 온 이전 대상의 결과가 새 대상을 덮어쓰지 않는다", async () => {
    const b = seed(true);
    b.previewWindowMode = true;
    b.previewWindowCurrent = target("a.txt");
    const orig = b.preview.bind(b);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    b.preview = async (p) => {
      if (p.endsWith("a.txt")) await gate;
      return orig(p);
    };
    await boot(b);
    await screen.findByText(LOADING); // 첫 대상(a.txt)이 읽는 중일 때
    act(() => b.emitPreviewWindowTarget(target("b.txt")));
    await waitFor(() => expect(screen.getByLabelText("텍스트 미리보기")).toHaveTextContent("둘째 파일"));
    await act(async () => {
      release();
      await gate;
    });
    expect(screen.getByLabelText("텍스트 미리보기")).toHaveTextContent("둘째 파일");
  });
});

const key = (k: string, extra: Partial<PreviewKeyDto> = {}): PreviewKeyDto => ({ key: k, code: k, meta: false, ctrl: false, alt: false, shift: false, ...extra });

describe("미리보기 별도 창: 보완 (이슈 #160 리뷰)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });
  const boot = async (b: FakeBackend) => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    await start(el, { backend: b, platform: "linux", getHome: async () => "/home/a" });
  };
  const windowBackend = (files: Record<string, string>, current: string) => {
    const b = new FakeBackend().seed({ ...files, "/home/a": null });
    b.previewWindowMode = true;
    b.previewWindowCurrent = target(current);
    return b;
  };

  it("별도 창의 Markdown 경로 링크는 이동하지 않는다(메인 창과 대상이 어긋나지 않게)", async () => {
    const b = windowBackend({ "/home/a/readme.md": "[둘째](b.txt)", "/home/a/b.txt": "둘째 파일" }, "readme.md");
    const info = vi.spyOn(b, "fileInfo");
    await boot(b);
    await userEvent.click(await screen.findByText("둘째"));
    await new Promise((r) => setTimeout(r, 30));
    expect(info).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: /readme\.md/ })).toBeInTheDocument();
  });

  it("미리보기 창에서 탐색 키는 메인 창으로 넘기고, 복사 키는 가로채지 않는다", async () => {
    const b = windowBackend({ "/home/a/a.txt": "첫째 파일" }, "a.txt");
    await boot(b);
    await screen.findByLabelText("텍스트 미리보기");
    const down = new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", bubbles: true, cancelable: true });
    act(() => void window.dispatchEvent(down));
    expect(down.defaultPrevented).toBe(true);
    expect(b.previewWindowCalls).toContainEqual({ type: "forwardKey", key: key("ArrowDown") });
    const copy = new KeyboardEvent("keydown", { key: "c", code: "KeyC", ctrlKey: true, bubbles: true, cancelable: true });
    act(() => void window.dispatchEvent(copy));
    expect(copy.defaultPrevented).toBe(false);
    expect(b.previewWindowCalls.filter((c) => c.type === "forwardKey")).toHaveLength(1);
  });

  it("미리보기 창 하단 안내는 이 창에서 되는 것만 말한다", async () => {
    const b = windowBackend({ "/home/a/a.txt": "첫째 파일" }, "a.txt");
    await boot(b);
    await screen.findByLabelText("텍스트 미리보기");
    expect(screen.getByText(/Esc 닫기/)).toBeInTheDocument();
    expect(screen.queryByText(/Delete 삭제|더블클릭 편집/)).not.toBeInTheDocument();
  });

  it("메인 창은 넘겨받은 Down을 기존 키 처리로 실행해 다음 항목을 보인다", async () => {
    const b = seed(true);
    const { user } = await renderApp(b, undefined, undefined, { separatePreview: true });
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(b.previewWindowVisible).toBe(true));
    act(() => b.emitPreviewWindowKey(key("ArrowDown")));
    await waitFor(() => expect(b.previewWindowCalls.at(-1)).toEqual({ type: "show", target: target("b.txt") }));
  });

  it("창 보이기가 실패하면 알리고 메인 미리보기를 닫는다", async () => {
    const b = seed(true);
    b.previewWindowShow = async () => {
      throw new Error("창 만들기 실패");
    };
    const { user } = await renderApp(b, undefined, undefined, { separatePreview: true });
    await user.keyboard("{ArrowRight}");
    expect(await screen.findByText(/창 만들기 실패/)).toBeInTheDocument();
    // 닫혔다면 다시 열 수 있다(열린 채면 같은 키가 다음 항목으로 넘어가 알림이 달라진다).
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(b.previewWindowCalls.filter((c) => c.type === "hide")).toHaveLength(0));
  });

  it("대화상자가 열려 있으면 넘어온 키는 버린다(Enter가 확인을 누르지 않는다)", async () => {
    const b = seed(true);
    const { user } = await renderApp(b, undefined, undefined, { separatePreview: true });
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(b.previewWindowVisible).toBe(true));
    act(() => b.emitPreviewWindowKey(key("Delete")));
    expect(await screen.findByRole("dialog")).toBeInTheDocument(); // 삭제 확인
    act(() => b.emitPreviewWindowKey(key("Enter")));
    act(() => b.emitPreviewWindowKey(key("Delete")));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByRole("dialog")).toBeInTheDocument(); // 확인되지 않고 그대로
    await expect(b.fileInfo("/home/a/a.txt")).resolves.toBeTruthy();
  });

  it("늦게 실패한 이전 show가 그 사이 성공한 새 대상의 미리보기를 닫지 않는다", async () => {
    const b = seed(true);
    const orig = b.previewWindowShow.bind(b);
    let fail!: () => void;
    const gate = new Promise<void>((_, rej) => (fail = () => rej(new Error("늦은 실패"))));
    const shows: string[] = [];
    b.previewWindowShow = async (t) => {
      shows.push(t.name);
      if (t.name === "a.txt") return gate;
      return orig(t);
    };
    const { user } = await renderApp(b, undefined, undefined, { separatePreview: true });
    await user.keyboard("{ArrowRight}"); // a.txt: 응답 대기
    await user.keyboard("{ArrowDown}"); // b.txt: 성공
    await waitFor(() => expect(b.previewWindowVisible).toBe(true));
    await act(async () => {
      fail();
      await gate.catch(() => {});
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(b.previewWindowVisible).toBe(true);
    expect(screen.queryByText(/늦은 실패/)).not.toBeInTheDocument();
    act(() => b.emitPreviewWindowKey(key("ArrowUp")));
    await waitFor(() => expect(shows.at(-1)).toBe("a.txt")); // 미리보기가 닫히지 않았으니 키가 먹는다
  });
});
