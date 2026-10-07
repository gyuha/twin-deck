import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";

const dispose = vi.fn();
// jsdom에는 WebGL이 없어 렌더러만 가짜로 바꾼다(로더·장면은 진짜 three).
vi.mock("three", async (orig) => {
  const real = await orig<typeof import("three")>();
  class FakeRenderer {
    domElement = document.createElement("canvas");
    setPixelRatio() {}
    setSize() {}
    render() {}
    dispose = dispose;
  }
  return { ...real, WebGLRenderer: FakeRenderer };
});

describe("3D 뷰어 정리", () => {
  it("모델을 그리고, 미리보기를 닫으면 렌더러를 해제한다", async () => {
    const stl = readFileSync(resolve(__dirname, "fixtures/models/tetra.stl"));
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
    vi.stubGlobal("fetch", async () => ({ ok: true, status: 200, arrayBuffer: async () => Uint8Array.from(stl).buffer }));
    const backend = new FakeBackend().seed({ "/home/a/tetra.stl": "solid", "/home/b": null });
    const { user } = await renderApp(backend);
    await user.keyboard("{ArrowRight}");
    const d = await screen.findByRole("dialog", { name: "미리보기: tetra.stl" });
    await waitFor(() => expect(d.querySelector("canvas")).not.toBeNull()); // 모델을 읽어 장면에 올렸다
    expect(dispose).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(dispose).toHaveBeenCalled());
    vi.unstubAllGlobals();
  });
});
