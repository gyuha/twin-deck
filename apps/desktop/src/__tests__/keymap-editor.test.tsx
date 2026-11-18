import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FakeBackend } from "@twin-deck/ts-client";
import { renderApp, seedBackend } from "./helpers";

type User = Awaited<ReturnType<typeof renderApp>>["user"];

const openShortcuts = async (user: User) => {
  await user.keyboard("{Control>},{/Control}");
  await user.click(await screen.findByRole("tab", { name: "단축키" }));
};
const editor = () => within(screen.getByRole("group", { name: "모든 단축키" }));
const row = (name: string) => editor().getByRole("group", { name });
const userBindings = async (b: FakeBackend) => (await b.getConfig()).bindings;
const record = async (user: User, name: string, keys: string) => {
  await user.click(within(row(name)).getByRole("button", { name: `${name}에 키 추가` }));
  await user.keyboard(keys);
};

describe("단축키 설정: 모든 단축키 편집기", () => {
  it("검색으로 줄을 찾고 [+]로 녹화한 키를 저장하면 바로 그 키로 실행된다", async () => {
    const backend = seedBackend();
    const { user } = await renderApp(backend);
    await openShortcuts(user);
    await user.type(screen.getByRole("textbox", { name: "단축키 검색" }), "이름 변경");
    await record(user, "이름 변경", "{Control>}j{/Control}");
    await waitFor(async () => expect(await userBindings(backend)).toContainEqual({ key: "Mod+J", action: "core.rename", args: {}, scope: null }));
    expect(within(row("이름 변경")).getByText("Ctrl+J")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.keyboard("{ArrowDown}{ArrowDown}{Control>}j{/Control}");
    expect(await screen.findByRole("textbox", { name: "새 이름" })).toHaveValue("a.txt");
  });

  it("탭 맨 위 검색창이 전역 단축키·F키 줄·모든 단축키를 함께 거른다", async () => {
    const { user } = await renderApp(seedBackend());
    await openShortcuts(user);
    const search = screen.getByRole("textbox", { name: "단축키 검색" });
    await user.type(search, "복사");
    // F5 줄은 내장 동작 이름(복사)으로 남고, 다른 F키·전역 단축키 줄은 사라진다
    expect(screen.getByRole("group", { name: "F5" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "F7" })).toBeNull();
    expect(screen.queryByRole("group", { name: "전역 화면 열기 단축키" })).toBeNull();
    expect(row("복사")).toBeInTheDocument();
    expect(editor().queryByRole("group", { name: "이동" })).toBeNull();
    await user.clear(search);
    await user.type(search, "F7");
    expect(screen.getByRole("group", { name: "F7" })).toBeInTheDocument();
    expect(row("새 폴더")).toBeInTheDocument();
  });

  it("같은 스코프에서 쓰는 키면 옮길지 묻고, 옮기면 원래 동작에서 빠진다", async () => {
    const backend = seedBackend();
    const { user } = await renderApp(backend);
    await openShortcuts(user);
    await record(user, "이름 변경", "{F5}");
    expect(within(row("이름 변경")).getByText(/F5는 '복사'에서 쓰는 키입니다/)).toBeInTheDocument();
    expect(await userBindings(backend)).toEqual([]); // 묻는 동안은 쓰지 않는다
    await user.click(within(row("이름 변경")).getByRole("button", { name: "옮기기" }));
    await waitFor(async () => expect(await userBindings(backend)).toContainEqual({ key: "F5", action: "core.rename", args: {}, scope: null }));
    await waitFor(() => expect(within(row("복사")).queryByText("F5")).toBeNull());
    expect(within(row("이름 변경")).getByText("F5")).toBeInTheDocument();
  });

  it("Esc는 녹화를 취소하고, 수식키 없는 글자 키는 받지 않는다", async () => {
    const backend = seedBackend();
    const { user } = await renderApp(backend);
    await openShortcuts(user);
    await record(user, "이름 변경", "{Escape}");
    expect(screen.getByRole("dialog", { name: "설정" })).toBeInTheDocument(); // 설정은 닫히지 않는다
    expect(within(row("이름 변경")).getByRole("button", { name: "이름 변경에 키 추가" })).toBeInTheDocument();
    await record(user, "이름 변경", "q");
    expect(within(row("이름 변경")).getByText(/글자 키는 단축키로 쓸 수 없습니다/)).toBeInTheDocument();
    expect(await userBindings(backend)).toEqual([]);
  });

  it("기본 키를 ×로 빼면 해제로 저장되고, 기본값으로 누르면 되돌아온다", async () => {
    const backend = seedBackend();
    const { user } = await renderApp(backend);
    await openShortcuts(user);
    await user.click(within(row("복사")).getByRole("button", { name: "복사에서 F5 빼기" }));
    await waitFor(async () => expect(await userBindings(backend)).toEqual([{ key: "F5", action: null, args: {}, scope: null }]));
    await waitFor(() => expect(within(row("복사")).queryByText("F5")).toBeNull());
    await user.click(within(row("복사")).getByRole("button", { name: "기본값으로" }));
    await waitFor(async () => expect(await userBindings(backend)).toEqual([]));
    expect(within(row("복사")).getByText("F5")).toBeInTheDocument();
  });

  it("폴더 단축키 줄의 키를 바꾸고 경로를 적으면 새 키로 그 폴더에 간다", async () => {
    const backend = seedBackend();
    const { user } = await renderApp(backend);
    await openShortcuts(user);
    await user.type(editor().getByRole("textbox", { name: "폴더 단축키 2 경로" }), "/home/b/docs{Enter}");
    await waitFor(async () => expect((await backend.getConfig()).config.shortcuts["2"]).toBe("/home/b/docs"));
    await record(user, "폴더 단축키 2", "{Alt>}{Shift>}2{/Shift}{/Alt}");
    await waitFor(async () => expect(await userBindings(backend)).toContainEqual({ key: "Alt+Shift+2", action: "core.go.shortcut", args: { n: "2" }, scope: null }));
    await user.keyboard("{Escape}{Alt>}{Shift>}2{/Shift}{/Alt}");
    await waitFor(() => expect(screen.getAllByText(/\/home\/b\/docs/).length).toBeGreaterThan(0));
  });
});
