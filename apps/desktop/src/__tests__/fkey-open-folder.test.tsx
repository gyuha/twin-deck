import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FakeBackend } from "@twin-deck/ts-client";
import { renderApp, seedBackend } from "./helpers";

const CODE = "/opt/homebrew/bin/code";
const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 50)));
const setup = (apps: Record<string, string> = { F6: CODE }) => {
  const backend = seedBackend();
  backend.setConfig((l) => {
    l.config.fkeys.F6 = "core.app.open_folder";
    Object.assign(l.config.fkey_apps, apps);
  });
  return backend;
};
const launched = (b: FakeBackend) => b.launched;

describe("애플리케이션으로 폴더 열기 F키", () => {
  it("커서가 파일 위에 있고 선택이 있어도 현재 폴더를 앱에 넘긴다", async () => {
    const backend = setup();
    const { user } = await renderApp(backend);
    await user.keyboard("{ArrowDown}{ArrowDown}"); // docs, src, a.txt
    await user.keyboard(" "); // a.txt 선택
    await user.keyboard("{F6}");
    await waitFor(() => expect(launched(backend)).toEqual([{ app: CODE, paths: ["/home/a"] }]));
  });

  it("폴더 위에 커서가 있어도 그 폴더가 아니라 현재 폴더를 넘긴다", async () => {
    const backend = setup();
    const { user } = await renderApp(backend);
    await user.keyboard("{F6}"); // 커서는 docs 폴더
    await waitFor(() => expect(launched(backend)).toEqual([{ app: CODE, paths: ["/home/a"] }]));
  });

  it("다른 폴더로 들어가면 그 폴더를 넘긴다", async () => {
    const backend = setup();
    const { user } = await renderApp(backend);
    await user.keyboard("{Enter}"); // docs로 들어간다
    await waitFor(() => expect(screen.getByRole("region", { name: "왼쪽 패널" })).toHaveTextContent("readme.md"));
    await settle();
    await user.keyboard("{F6}");
    await waitFor(() => expect(launched(backend)).toEqual([{ app: CODE, paths: ["/home/a/docs"] }]));
  });

  it("활성 패널의 폴더를 넘긴다(오른쪽 패널이 활성이면 오른쪽 폴더)", async () => {
    const backend = setup();
    const { user } = await renderApp(backend);
    await user.keyboard("{Tab}{F6}");
    await waitFor(() => expect(launched(backend)).toEqual([{ app: CODE, paths: ["/home/b"] }]));
  });

  it("앱이 지정되지 않았으면 실행하지 않고 알린다", async () => {
    const backend = setup({ F6: "" });
    const { user } = await renderApp(backend);
    await user.keyboard("{F6}");
    expect(await screen.findByText(/F6에 지정된 애플리케이션이 없습니다/)).toBeInTheDocument();
    expect(launched(backend)).toEqual([]);
  });

  it("설정 화면에서 '애플리케이션으로 폴더 열기'를 고르고 경로를 적으면 바로 쓸 수 있다", async () => {
    const { user, backend } = await renderApp();
    await user.keyboard("{Control>},{/Control}");
    await screen.findByRole("dialog", { name: "설정" });
    await user.click(screen.getByRole("tab", { name: "F키" }));
    await user.click(within(screen.getByRole("group", { name: "F9" })).getByRole("combobox"));
    await user.type(screen.getByRole("searchbox", { name: "F9 동작 검색" }), "애플리케이션으로 폴더 열기");
    await user.keyboard("{Enter}");
    const path = await screen.findByRole("textbox", { name: "F9 애플리케이션" });
    await user.type(path, `${CODE}{Enter}`);
    await waitFor(async () => {
      const c = (await backend.getConfig()).config;
      expect(c.fkeys.F9).toBe("core.app.open_folder");
      expect(c.fkey_apps.F9).toBe(CODE);
    });
    await user.keyboard("{Escape}{F9}");
    await waitFor(() => expect(launched(backend)).toEqual([{ app: CODE, paths: ["/home/a"] }]));
  });
});
