import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { MODEL_MAX_BYTES } from "../lib/model";
import { StoreContext } from "../state/context";
import type { AppStore } from "../state/store";
import { ModelView } from "../ui/ModelView";
import { renderApp } from "./helpers";

const dispose = vi.fn();
const forceContextLoss = vi.fn();
// jsdom에는 WebGL이 없어 렌더러만 가짜로 바꾼다(로더·장면은 진짜 three).
vi.mock("three", async (orig) => {
  const real = await orig<typeof import("three")>();
  class FakeRenderer {
    domElement = document.createElement("canvas");
    setPixelRatio() {}
    setSize() {}
    render() {}
    dispose = dispose;
    forceContextLoss = forceContextLoss;
  }
  return { ...real, WebGLRenderer: FakeRenderer };
});

const fetchSpy = vi.fn();
afterEach(() => {
  vi.unstubAllGlobals();
  fetchSpy.mockReset();
  dispose.mockClear();
  forceContextLoss.mockClear();
});
const stubFetch = (ok: boolean) => {
  fetchSpy.mockImplementation(async () => ({ ok, status: ok ? 200 : 404, arrayBuffer: async () => new ArrayBuffer(8) }));
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
};
const viewer = (size: number) => {
  const store = { api: { fileUrl: (p: string) => `fake-asset://localhost${p}` } } as unknown as AppStore;
  return render(
    <StoreContext.Provider value={store}>
      <ModelView path="/home/a/part.stl" name="part.stl" size={size} />
    </StoreContext.Provider>,
  );
};

describe("3D 뷰어 한도와 정리", () => {
  it("크기 상한을 넘는 파일은 읽지 않고 안내만 보인다", async () => {
    stubFetch(true);
    viewer(MODEL_MAX_BYTES + 1);
    expect(await screen.findByRole("alert")).toHaveTextContent("너무 커");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("읽기에 실패해도 렌더러를 해제하고 컨텍스트를 놓는다", async () => {
    stubFetch(false);
    viewer(1024);
    expect(await screen.findByRole("alert")).toHaveTextContent("파일을 읽지 못했습니다");
    expect(dispose).toHaveBeenCalled();
    expect(forceContextLoss).toHaveBeenCalled();
  });

  it("텍스트 형식은 3D 로드가 실패하면 텍스트 미리보기로 돌아간다", async () => {
    stubFetch(false);
    const backend = new FakeBackend().seed({ "/home/a/part.obj": "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n", "/home/b": null });
    const { user } = await renderApp(backend);
    await user.keyboard("{ArrowRight}");
    const d = await screen.findByRole("dialog", { name: "미리보기: part.obj" });
    await waitFor(() => expect(within(d).getByLabelText("텍스트 미리보기")).toHaveTextContent("v 0 0 0"));
  });

  it("압축 파일 안의 모델은 3D 뷰어를 쓰지 않는다(asset 프로토콜로 읽을 수 없다)", async () => {
    stubFetch(true);
    const backend = new FakeBackend().seed({ "/home/a/pack.zip": "zip", "/home/a/pack.zip!/m.obj": "v 0 0 0\n", "/home/b": null });
    const { user } = await renderApp(backend);
    await user.keyboard("{Enter}"); // 압축 파일 안으로
    await waitFor(() => expect(screen.getByRole("listbox", { name: "왼쪽 파일 목록" })).toHaveTextContent("m.obj"));
    await user.keyboard("{ArrowRight}"); // m.obj 미리보기
    const d = await screen.findByRole("dialog", { name: "미리보기: m.obj" });
    expect(within(d).queryByLabelText("3D 모델 미리보기")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
