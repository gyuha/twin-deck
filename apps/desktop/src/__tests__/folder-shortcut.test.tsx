import { act, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { crumbs } from "./search-helpers";
import { renderApp } from "./helpers";

const seed = () =>
  new FakeBackend().seed({
    "/home/a/docs/d.txt": "d",
    "/home/a/a.txt": "a",
    "/home/b/b1/x.txt": "x",
  });
const here = () => crumbs().join("/");

describe("폴더 단축키 (Ctrl+0~9)", () => {
  it("지정한 폴더로 이동한다", async () => {
    const backend = seed();
    backend.setConfig((l) => {
      l.config.shortcuts["3"] = "/home/b/b1";
    });
    const { user } = await renderApp(backend);
    await user.keyboard("{Control>}3{/Control}");
    await waitFor(() => expect(here()).toContain("b1"));
  });

  it("비어 있으면 이동하지 않고 알린다", async () => {
    const { user } = await renderApp(seed());
    const start = here();
    await user.keyboard("{Control>}5{/Control}");
    expect(await screen.findByText(/Ctrl\+5에 지정된 폴더가 없습니다/)).toBeInTheDocument();
    expect(here()).toBe(start);
  });

  it("없는 폴더는 이동하지 않는다", async () => {
    const backend = seed();
    backend.setConfig((l) => {
      l.config.shortcuts["0"] = "/nope";
    });
    const { user } = await renderApp(backend);
    const start = here();
    await user.keyboard("{Control>}0{/Control}");
    await act(() => new Promise<void>((r) => setTimeout(r, 50)));
    expect(here()).toBe(start);
  });

  it("설정 화면에서 경로를 지정하면 바로 쓸 수 있다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{Control>},{/Control}");
    await user.click(await screen.findByRole("tab", { name: "폴더 단축키" }));
    const input = screen.getByRole("textbox", { name: "Ctrl+2" });
    await user.type(input, "/home/b/b1{Enter}");
    await user.keyboard("{Escape}");
    await user.keyboard("{Control>}2{/Control}");
    await waitFor(() => expect(here()).toContain("b1"));
  });
});
