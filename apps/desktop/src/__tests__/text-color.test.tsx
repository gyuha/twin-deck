import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderApp, seedBackend } from "./helpers";

const VARS = ["--color-ink", "--color-ink-dull", "--color-ink-faint"] as const;
const vars = () => VARS.map((v) => document.body.style.getPropertyValue(v));
type Colors = { theme: string; text_color: string; text_color_dark: string; text_color_light: string };
const withColors = (c: Partial<Colors>) => {
  const b = seedBackend();
  b.setConfig((l) => Object.assign(l.config.behavior, c));
  return b;
};
const behavior = async (backend: ReturnType<typeof seedBackend>) => (await backend.getConfig()).config.behavior;
const openSettings = async (user: Awaited<ReturnType<typeof renderApp>>["user"]) => {
  await user.keyboard("{Control>},{/Control}");
  await screen.findByRole("dialog", { name: "설정" });
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("글자 색 (behavior.text_color_dark / text_color_light, 이슈 #58)", () => {
  it("라이트 테마에서는 라이트용 색을 쓰고, 흐린 글자 둘은 그 색을 배경 쪽으로 섞은 값이다", async () => {
    await renderApp(withColors({ theme: "light", text_color_dark: "#eeeeee", text_color_light: "#333333" }));
    const [ink, dull, faint] = vars();
    expect(ink).toBe("#333333");
    expect(dull).toContain("#333333");
    expect(dull).toContain("var(--color-app)");
    expect(faint).toContain("#333333");
    expect(faint).not.toBe(dull); // 더 흐리게
  });

  it("다크 테마에서는 다크용 색을 쓴다", async () => {
    await renderApp(withColors({ theme: "dark", text_color_dark: "#eeeeee", text_color_light: "#333333" }));
    await waitFor(() => expect(vars()[0]).toBe("#eeeeee"));
  });

  it("테마를 바꾸면 그 테마의 색으로 바뀌고, 그 테마의 색이 비어 있으면 테마 그대로다", async () => {
    const b = withColors({ theme: "dark", text_color_dark: "#eeeeee" });
    await renderApp(b);
    await waitFor(() => expect(vars()[0]).toBe("#eeeeee"));
    await act(async () => b.setConfig((l) => (l.config.behavior.theme = "light")));
    await waitFor(() => expect(vars()).toEqual(["", "", ""]));
  });

  it("system 테마는 OS 밝기가 바뀌면 그 테마의 색을 따라간다", async () => {
    let dark = true;
    const listeners = new Set<() => void>();
    vi.stubGlobal("matchMedia", (q: string) => ({
      media: q,
      get matches() {
        return dark;
      },
      addEventListener: (_: string, l: () => void) => listeners.add(l),
      removeEventListener: (_: string, l: () => void) => listeners.delete(l),
    }));
    await renderApp(withColors({ theme: "system", text_color_dark: "#eeeeee", text_color_light: "#333333" }));
    await waitFor(() => expect(vars()[0]).toBe("#eeeeee"));
    dark = false;
    await act(async () => listeners.forEach((l) => l()));
    await waitFor(() => expect(vars()[0]).toBe("#333333"));
  });

  it("비어 있으면(기본) 아무것도 덧쓰지 않는다", async () => {
    await renderApp(withColors({}));
    expect(vars()).toEqual(["", "", ""]);
  });

  it("#rgb 약식도 받는다", async () => {
    await renderApp(withColors({ text_color_light: "#abc" }));
    expect(vars()[0]).toBe("#abc");
  });

  it("색이 아닌 값은 적용하지 않는다", async () => {
    await renderApp(withColors({ text_color_light: "red; background: url(x)" }));
    expect(vars()).toEqual(["", "", ""]);
  });

  it("색을 지우면 덧쓴 변수가 사라진다", async () => {
    const backend = withColors({ text_color_light: "#cccccc" });
    await renderApp(backend);
    expect(vars()[0]).toBe("#cccccc");
    backend.setConfig((l) => (l.config.behavior.text_color_light = ""));
    await waitFor(() => expect(vars()).toEqual(["", "", ""]));
  });

  it("설정 화면의 테마별 '글자 색' 입력칸에 hex를 쓰면 그 키에 저장되고 바로 반영된다", async () => {
    const { user, backend } = await renderApp(seedBackend());
    await openSettings(user);
    await user.type(screen.getByRole("textbox", { name: "글자 색 (다크 테마)" }), "#eeeeee");
    await user.tab();
    await waitFor(async () => expect((await behavior(backend)).text_color_dark).toBe("#eeeeee"));
    expect(vars()[0]).toBe(""); // 지금은 라이트 테마라 다크용 색은 쓰지 않는다
    await user.type(screen.getByRole("textbox", { name: "글자 색 (라이트 테마)" }), "#99aabb");
    await user.tab();
    await waitFor(async () => expect((await behavior(backend)).text_color_light).toBe("#99aabb"));
    await waitFor(() => expect(vars()[0]).toBe("#99aabb"));
  });

  it("색 선택 버튼을 누르면 색상환(color picker)이 열리고, 지우기 버튼으로 기본 색으로 돌아간다", async () => {
    const { user, backend } = await renderApp(withColors({ text_color_light: "#cccccc" }));
    await openSettings(user);
    expect(screen.queryByTestId("color-picker")).toBeNull();
    await user.click(screen.getByRole("button", { name: "글자 색 (라이트 테마) 선택" }));
    expect(await screen.findByTestId("color-picker")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "글자 색 (라이트 테마) 지우기" }));
    await waitFor(async () => expect((await behavior(backend)).text_color_light).toBe(""));
    await waitFor(() => expect(vars()).toEqual(["", "", ""]));
    fireEvent.keyDown(document.body, { key: "Escape" });
  });
});

describe("이전 버전의 글자 색 (behavior.text_color)", () => {
  it("테마별 색이 비어 있는 쪽에는 이전 공통 색을 쓴다(업데이트해도 화면이 그대로다)", async () => {
    await renderApp(withColors({ text_color: "#cccccc" }));
    expect(vars()[0]).toBe("#cccccc");
  });

  it("테마별 색을 정하면 그 테마에서는 이전 공통 색보다 앞선다", async () => {
    const b = withColors({ theme: "dark", text_color: "#cccccc", text_color_light: "#333333" });
    await renderApp(b);
    await waitFor(() => expect(vars()[0]).toBe("#cccccc")); // 다크용이 비어 있어 이전 색
    await act(async () => b.setConfig((l) => (l.config.behavior.theme = "light")));
    await waitFor(() => expect(vars()[0]).toBe("#333333"));
  });

  it("설정 화면에는 값이 있을 때만 '이전 글자 색' 줄이 보이고, 지우면 사라진다", async () => {
    const { user, backend } = await renderApp(withColors({ text_color: "#cccccc" }));
    await openSettings(user);
    expect(screen.getByRole("textbox", { name: "이전 글자 색 (모든 테마 공통)" })).toHaveValue("#cccccc");
    await user.click(screen.getByRole("button", { name: "이전 글자 색 (모든 테마 공통) 지우기" }));
    await waitFor(async () => expect((await behavior(backend)).text_color).toBe(""));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "이전 글자 색 (모든 테마 공통)" })).toBeNull());
    expect(vars()).toEqual(["", "", ""]);
  });

  it("값이 비어 있으면 '이전 글자 색' 줄은 없다", async () => {
    const { user } = await renderApp(seedBackend());
    await openSettings(user);
    expect(screen.queryByRole("textbox", { name: "이전 글자 색 (모든 테마 공통)" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "글자 색 (다크 테마)" })).toBeInTheDocument();
  });
});
