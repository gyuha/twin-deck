import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp, seedBackend } from "./helpers";

const VARS = ["--color-ink", "--color-ink-dull", "--color-ink-faint"] as const;
const vars = () => VARS.map((v) => document.body.style.getPropertyValue(v));
type Behavior = { text_color: string };
const withColor = (c: string) => {
  const b = seedBackend();
  b.setConfig((l) => ((l.config.behavior as unknown as Behavior).text_color = c));
  return b;
};

describe("글자 색 (behavior.text_color)", () => {
  it("색을 지정하면 기본 글자색이 그 색이고, 흐린 글자 둘은 그 색을 배경 쪽으로 섞은 값이다", async () => {
    await renderApp(withColor("#cccccc"));
    const [ink, dull, faint] = vars();
    expect(ink).toBe("#cccccc");
    expect(dull).toContain("#cccccc");
    expect(dull).toContain("var(--color-app)");
    expect(faint).toContain("#cccccc");
    expect(faint).not.toBe(dull); // 더 흐리게
  });

  it("비어 있으면(기본) 아무것도 덧쓰지 않는다", async () => {
    await renderApp(withColor(""));
    expect(vars()).toEqual(["", "", ""]);
  });

  it("#rgb 약식도 받고, 색이 아닌 값은 무시한다", async () => {
    await renderApp(withColor("#abc"));
    expect(vars()[0]).toBe("#abc");
  });

  it("색이 아닌 값은 적용하지 않는다", async () => {
    await renderApp(withColor("red; background: url(x)"));
    expect(vars()).toEqual(["", "", ""]);
  });

  it("색을 지우면 덧쓴 변수가 사라진다", async () => {
    const backend = withColor("#cccccc");
    await renderApp(backend);
    expect(vars()[0]).toBe("#cccccc");
    backend.setConfig((l) => ((l.config.behavior as unknown as Behavior).text_color = ""));
    await waitFor(() => expect(vars()).toEqual(["", "", ""]));
  });

  it("설정 화면의 '글자 색' 입력칸에 hex를 쓰면 저장되고 바로 반영된다", async () => {
    const { user, backend } = await renderApp(seedBackend());
    await user.keyboard("{Control>},{/Control}");
    await screen.findByRole("dialog", { name: "설정" });
    const input = screen.getByRole("textbox", { name: "글자 색" });
    await user.type(input, "#99aabb");
    await user.tab();
    await waitFor(async () => expect(((await backend.getConfig()).config.behavior as unknown as Behavior).text_color).toBe("#99aabb"));
    await waitFor(() => expect(vars()[0]).toBe("#99aabb"));
  });

  it("색 선택 버튼을 누르면 색상환(color picker)이 열리고, 지우기 버튼으로 기본 색으로 돌아간다", async () => {
    const { user, backend } = await renderApp(withColor("#cccccc"));
    await user.keyboard("{Control>},{/Control}");
    await screen.findByRole("dialog", { name: "설정" });
    expect(screen.queryByTestId("color-picker")).toBeNull();
    await user.click(screen.getByRole("button", { name: "글자 색 선택" }));
    expect(await screen.findByTestId("color-picker")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "글자 색 지우기" }));
    await waitFor(async () => expect(((await backend.getConfig()).config.behavior as unknown as Behavior).text_color).toBe(""));
    await waitFor(() => expect(vars()).toEqual(["", "", ""]));
    fireEvent.keyDown(document.body, { key: "Escape" });
  });
});
