import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { defaultBindingsFor } from "@twin-deck/actions";
import { cursorName, renderApp, seedBackend } from "./helpers";

const openSettings = (user: Awaited<ReturnType<typeof renderApp>>["user"]) => user.keyboard("{Control>},{/Control}");

const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 50)));
const nameBox = () => screen.findByRole("textbox", { name: "이름" });
const setFKeys = (backend: FakeBackend, fkeys: Record<string, string>, apps: Record<string, string> = {}) =>
  backend.setConfig((l) => {
    Object.assign(l.config.fkeys, fkeys);
    Object.assign(l.config.fkey_apps, apps);
  });
// seedBackend 이름순: docs, src, a.txt, b.txt, 한글.txt (.hidden은 숨김)
const toATxt = (user: Awaited<ReturnType<typeof renderApp>>["user"]) => user.keyboard("{ArrowDown}{ArrowDown}");

describe("F키 설정이 키맵에 반영된다", () => {
  it("fkeys.F2에 core.rename을 지정하면 F2가 이름 바꾸기를 연다", async () => {
    const backend = seedBackend();
    setFKeys(backend, { F2: "core.rename" });
    const { user } = await renderApp(backend);
    await toATxt(user);
    await user.keyboard("{F2}");
    expect(await nameBox()).toHaveValue("a.txt");
  });

  it("기본 F5를 다른 액션으로 바꾸면 복사가 실행되지 않는다", async () => {
    const backend = seedBackend();
    setFKeys(backend, { F5: "core.rename" });
    const { user } = await renderApp(backend);
    await toATxt(user);
    await user.keyboard("{F5}");
    expect(await nameBox()).toHaveValue("a.txt"); // 복사 확인 창(대상 폴더 입력)이 아니라 이름 바꾸기가 열린다
    expect(screen.queryByRole("textbox", { name: "대상 폴더" })).toBeNull();
  });

  it("none으로 지정하면 기본 키가 해제된다", async () => {
    const backend = seedBackend();
    setFKeys(backend, { F5: "none" });
    const { user } = await renderApp(backend);
    await toATxt(user);
    await user.keyboard("{F5}");
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "대상 폴더" })).toBeNull();
  });

  it("keybindings.toml이 F키 설정보다 우선한다", async () => {
    const backend = seedBackend();
    setFKeys(backend, { F2: "core.rename" });
    backend.setConfig((l) => {
      l.bindings = [{ key: "F2", action: "core.file.new_folder", args: {}, scope: null }];
    });
    const { user } = await renderApp(backend);
    await toATxt(user);
    await user.keyboard("{F2}");
    // 새 폴더 입력창이 열리고(값이 비어 있다) 이름 바꾸기(a.txt)가 아니다
    expect(await nameBox()).toHaveValue("");
  });

  it("설정이 비어 있으면 기존 F키 기본 바인딩이 그대로다", () => {
    const keysOf = (platform: "linux" | "mac") =>
      defaultBindingsFor(platform)
        .flatMap((b) => b.keys.map((k) => ({ k, id: b.actionId, scope: b.scope })))
        .filter((e) => /(^|\+)F([1-9]|1[0-2])$/.test(e.k))
        .map((e) => `${e.k}=${e.id}@${e.scope}`)
        .sort();
    const expected = [
      "F1=core.help@pane",
      "F2=core.rename@pane",
      "F1=core.help.close@help",
      "F12=core.path.copy_folder@pane",
      "F4=core.edit@pane",
      "F5=core.copy@pane",
      "F6=core.move@pane",
      "F7=core.file.new_folder@pane",
      "F8=core.trash@pane",
      "Mod+F12=core.path.copy_files@pane",
      "Shift+F4=core.edit.folder@pane",
      "Shift+F6=core.rename@pane",
      "Shift+F7=core.file.new_file@pane",
      "Shift+F8=core.delete@pane",
      "Shift+F8=core.preview.delete@preview", // 미리보기 안에서는 그 파일을 지운다
    ].sort();
    expect(keysOf("linux")).toEqual(expected);
    expect(keysOf("mac")).toEqual(expected);
  });
});

describe("F1 도움말", () => {
  it("F1은 단축키 목록 화면을 열고 Esc로 닫는다", async () => {
    const { user } = await renderApp();
    await user.keyboard("{F1}");
    const d = await screen.findByRole("dialog", { name: "도움말" });
    // 키가 걸린 액션만, 키 표기와 함께 보인다
    expect(within(d).getByText("F5")).toBeInTheDocument();
    expect(within(d).getByText("이름 변경")).toBeInTheDocument();
    await user.keyboard("{F5}"); // 도움말이 열려 있는 동안 패널 키는 무시된다
    await settle();
    expect(screen.queryByRole("textbox", { name: "대상 폴더" })).toBeNull();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "도움말" })).toBeNull();
    await user.keyboard("{F1}{F1}"); // F1이 열고 F1이 닫는다
    expect(screen.queryByRole("dialog", { name: "도움말" })).toBeNull();
  });
});

describe("애플리케이션 실행 F키", () => {
  const launchSetup = (apps = { F3: "/Applications/Foo.app" }) => {
    const backend = seedBackend();
    setFKeys(backend, { F3: "core.app.launch" }, apps);
    return backend;
  };

  it("앱 실행 F키는 선택 항목을 인자로 넘긴다", async () => {
    const backend = launchSetup();
    const { user } = await renderApp(backend);
    await toATxt(user); // a.txt
    await user.keyboard(" "); // a.txt 선택(커서는 b.txt로 내려간다)
    await user.keyboard(" "); // b.txt 선택
    await user.keyboard("{F3}");
    await waitFor(() => expect(backend.launched).toHaveLength(1));
    expect(backend.launched[0].app).toBe("/Applications/Foo.app");
    expect(backend.launched[0].paths.sort()).toEqual(["/home/a/a.txt", "/home/a/b.txt"]);
  });

  it("선택이 없으면 커서 항목을 넘긴다", async () => {
    const backend = launchSetup();
    const { user } = await renderApp(backend);
    await toATxt(user);
    expect(cursorName("left")).toBe("a.txt");
    await user.keyboard("{F3}");
    await waitFor(() => expect(backend.launched).toEqual([{ app: "/Applications/Foo.app", paths: ["/home/a/a.txt"] }]));
  });

  it("빈 폴더면 현재 폴더를 넘긴다", async () => {
    const backend = new FakeBackend().seed({ "/home/a/empty": null, "/home/b/x.txt": "x" });
    setFKeys(backend, { F3: "core.app.launch" }, { F3: "Preview" });
    const { user } = await renderApp(backend, "linux", undefined, { emptyLeft: false });
    await user.keyboard("{Enter}"); // empty 폴더로 들어간다
    await waitFor(() => expect(screen.getByRole("region", { name: "왼쪽 패널" })).toHaveTextContent("empty"));
    await settle();
    await user.keyboard("{F3}");
    await waitFor(() => expect(backend.launched).toEqual([{ app: "Preview", paths: ["/home/a/empty"] }]));
  });

  it("앱이 지정되지 않은 F키는 실행하지 않고 알린다", async () => {
    const backend = launchSetup({ F3: "" });
    const { user } = await renderApp(backend);
    await toATxt(user);
    await user.keyboard("{F3}");
    expect(await screen.findByText(/F3에 지정된 애플리케이션이 없습니다/)).toBeInTheDocument();
    expect(backend.launched).toEqual([]);
  });
});

describe("설정 화면의 F키 섹션", () => {
  const openFKeys = async (user: Awaited<ReturnType<typeof renderApp>>["user"]) => {
    await openSettings(user);
    await screen.findByRole("dialog", { name: "설정" });
    await user.click(screen.getByRole("tab", { name: "F키" }));
  };

  it("설정 화면 F키 섹션에 F1~F12와 애플리케이션 실행 메뉴가 있다", async () => {
    const { user } = await renderApp();
    await openFKeys(user);
    for (let n = 1; n <= 12; n++) expect(screen.getByRole("group", { name: `F${n}` })).toBeInTheDocument();
    // 비워 둔 키가 무엇을 하는지 기본값 항목에 보인다
    expect(within(screen.getByRole("group", { name: "F5" })).getByRole("combobox")).toHaveTextContent("기본값 (현재: 복사)");
    await user.click(within(screen.getByRole("group", { name: "F3" })).getByRole("combobox"));
    expect(await screen.findByRole("option", { name: "애플리케이션 실행" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "해제" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "이름 변경" })).toBeInTheDocument();
    // 인수가 필요한 액션은 고를 수 없다
    expect(screen.queryByRole("option", { name: /인수/ })).toBeNull();
  });

  it("F키 설정을 고르면 config에 저장된다", async () => {
    const { user, backend } = await renderApp();
    await openFKeys(user);
    await user.click(within(screen.getByRole("group", { name: "F3" })).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "애플리케이션 실행" }));
    const path = await screen.findByRole("textbox", { name: "F3 애플리케이션" });
    await user.type(path, "/Applications/Foo.app{Enter}");
    await waitFor(async () => {
      const c = (await backend.getConfig()).config;
      expect(c.fkeys.F3).toBe("core.app.launch");
      expect(c.fkey_apps.F3).toBe("/Applications/Foo.app");
    });
    // 화면에서 고른 값이 실제 키 입력까지 이어진다
    await user.keyboard("{Escape}");
    await toATxt(user);
    await user.keyboard("{F3}");
    await waitFor(() => expect(backend.launched).toEqual([{ app: "/Applications/Foo.app", paths: ["/home/a/a.txt"] }]));
    // 기본값으로 되돌리면 앱 경로도 비워진다
    await openFKeys(user);
    await user.click(within(screen.getByRole("group", { name: "F3" })).getByRole("button", { name: "기본값으로" }));
    await waitFor(async () => {
      const c = (await backend.getConfig()).config;
      expect(c.fkeys.F3).toBe("");
      expect(c.fkey_apps.F3).toBe("");
    });
  });
});
