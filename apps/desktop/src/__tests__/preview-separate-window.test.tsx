import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import type { PreviewTargetDto } from "@twin-deck/ts-client";
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
    const { user } = await renderApp(b);
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
    const { user } = await renderApp(b);
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
    const { user } = await renderApp(b);
    await user.keyboard("{ArrowRight}");
    expect(await screen.findByRole("dialog", { name: /미리보기/ })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /미리보기/ })).not.toBeInTheDocument());
    expect(b.previewWindowCalls).toEqual([]);
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
