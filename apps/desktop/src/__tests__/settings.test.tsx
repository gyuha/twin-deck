import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { cursorName, renderApp, seedBackend } from "./helpers";

const open = (user: Awaited<ReturnType<typeof renderApp>>["user"]) => user.keyboard("{Control>},{/Control}");
const dialog = () => screen.findByRole("dialog", { name: "설정" });
const sw = (name: string) => screen.getByRole("switch", { name });

describe("설정 화면 열기와 닫기", () => {
  it("Mod+,로 열고 Esc로 닫는다", async () => {
    const { user } = await renderApp();
    expect(screen.queryByRole("dialog", { name: "설정" })).toBeNull();
    await open(user);
    await dialog();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "설정" })).toBeNull();
  });

  it("macOS에서는 Cmd+,로 연다", async () => {
    const { user } = await renderApp(seedBackend(), "mac");
    await user.keyboard("{Meta>},{/Meta}");
    await dialog();
  });

  it("열려 있는 동안 패널 키는 무시된다", async () => {
    const { user, backend } = await renderApp();
    await open(user);
    await dialog();
    await user.keyboard("{F8}{ArrowDown}");
    expect(backend.trashed).toEqual([]);
    await user.keyboard("{Escape}");
    expect(cursorName("left")).toBe("docs");
  });

  it("섹션 8개가 왼쪽에 있고 처음에는 모양이 열린다", async () => {
    const { user } = await renderApp();
    await open(user);
    await dialog();
    const tabs = within(screen.getByRole("tablist", { name: "설정 섹션" })).getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["모양", "목록과 선택", "표시 형식", "미리보기", "확인", "폴더 단축키", "F키", "환경"]);
    expect(screen.getByRole("tab", { name: "모양" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("switch", { name: "Action Bar 표시" })).toBeInTheDocument();
  });
});

describe("설정 값 바꾸기", () => {
  it("스위치는 바꾸는 즉시 저장되고 화면에 반영된다", async () => {
    const { user, backend } = await renderApp();
    expect(screen.getByRole("toolbar", { name: "액션 바" })).toBeInTheDocument();
    await open(user);
    await dialog();
    await user.click(sw("Action Bar 표시"));
    await waitFor(() => expect((backend as unknown as { loaded: { config: { behavior: { layout: { show_action_bar: boolean } } } } }).loaded.config.behavior.layout.show_action_bar).toBe(false));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("toolbar", { name: "액션 바" })).toBeNull();
  });

  it("다른 섹션의 스위치도 바뀐다 (순환 선택)", async () => {
    const { user, backend } = await renderApp();
    await open(user);
    await dialog();
    await user.click(screen.getByRole("tab", { name: "목록과 선택" }));
    await user.click(sw("순환 선택"));
    await waitFor(async () => expect((await backend.getConfig()).config.behavior.table.circular_selection).toBe(true));
  });

  it("테마는 검색 상자에서 고르면 즉시 바뀐다", async () => {
    const { user, backend } = await renderApp();
    await open(user);
    await dialog();
    await user.click(within(screen.getByRole("group", { name: "테마" })).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: /Dracula Default/ }));
    await waitFor(async () => expect((await backend.getConfig()).config.behavior.theme).toBe("dracula-default"));
    await waitFor(() => expect(document.documentElement.dataset.colorTheme).toBe("dracula-default"));
  });

  it("테마 목록은 system·light·dark와 Warp 테마 112개(총 115개)이고 옛 이름은 없다", async () => {
    const { user } = await renderApp();
    await open(user);
    await dialog();
    await user.click(within(screen.getByRole("group", { name: "테마" })).getByRole("combobox"));
    const names = within(await screen.findByRole("listbox", { name: "테마" })).getAllByRole("option").map((o) => o.textContent ?? "");
    expect(names.length).toBe(115);
    expect(names.slice(0, 3).map((n) => n.split(" · ")[0].replace("✓", ""))).toEqual(["system", "light", "dark"]);
    expect(names.some((n) => n.startsWith("Catppuccin Mocha"))).toBe(true);
    for (const old of ["midnight", "noir", "slate", "nord", "mocha"]) expect(names.some((n) => n.startsWith(`${old} `))).toBe(false);
  });

  it("테마 검색: 보이는 이름·파일 이름·밝기로 찾고 Enter로 고른다", async () => {
    const { user, backend } = await renderApp();
    await open(user);
    await dialog();
    await user.click(within(screen.getByRole("group", { name: "테마" })).getByRole("combobox"));
    const search = await screen.findByRole("searchbox", { name: "테마 검색" });
    const shown = () => within(screen.getByRole("listbox", { name: "테마" })).queryAllByRole("option").map((o) => o.textContent ?? "");
    await user.type(search, "dracula");
    // 검색어가 그대로 들어 있는 Dracula Default·Dracula Soft가 맨 앞이고, 글자만 흩어져 맞는 항목은 뒤로 밀린다(퍼지 검색, F키 선택 상자와 같은 규칙).
    expect(shown().slice(0, 2).every((n) => n.startsWith("Dracula"))).toBe(true);
    expect(shown().length).toBeLessThan(10); // 112개가 다 나오지 않는다
    await user.clear(search);
    await user.type(search, "catppuccin-latte"); // 파일 이름으로
    expect(shown()[0]).toContain("Catppuccin Latte");
    await user.clear(search);
    await user.type(search, "밝음");
    expect(shown().length).toBe(32);
    await user.clear(search);
    await user.type(search, "solarized-light{Enter}");
    await waitFor(async () => expect((await backend.getConfig()).config.behavior.theme).toBe("solarized-light"));
  });

  it("Office 문서 미리보기 스위치: 기본은 꺼짐이고 설명에 데이터만 보는 기능이라 적혀 있으며, 켜면 저장된다", async () => {
    const { user, backend } = await renderApp();
    await open(user);
    await dialog();
    await user.click(screen.getByRole("tab", { name: "미리보기" }));
    const sw = screen.getByRole("switch", { name: "Office 문서 미리보기" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    const row = screen.getByRole("group", { name: "Office 문서 미리보기" });
    expect(row).toHaveTextContent("데이터만 보는 기능");
    await user.click(sw);
    await waitFor(async () => expect((await backend.getConfig()).config.preview.office).toBe(true));
  });

  it("숫자 입력(아이콘 크기)은 Enter로 저장된다", async () => {
    const { user, backend } = await renderApp();
    await open(user);
    await dialog();
    const input = screen.getByRole("spinbutton", { name: "아이콘 크기" });
    await user.clear(input);
    await user.type(input, "24{Enter}");
    await waitFor(async () => expect((await backend.getConfig()).config.behavior.table.icon_size).toBe(24));
  });

  it("문자 입력(날짜 형식)은 포커스를 벗어날 때 저장된다", async () => {
    const { user, backend } = await renderApp();
    await open(user);
    await dialog();
    await user.click(screen.getByRole("tab", { name: "표시 형식" }));
    const input = screen.getByRole("textbox", { name: "날짜 형식" });
    await user.clear(input);
    await user.type(input, "%Y-%m-%d");
    await user.tab();
    await waitFor(async () => expect((await backend.getConfig()).config.display.date_format).toBe("%Y-%m-%d"));
  });
});

describe("기본값으로", () => {
  it("값이 기본값과 다를 때만 보이고, 누르면 기본값으로 돌아간다", async () => {
    const backend = seedBackend();
    backend.setConfig((l) => (l.config.behavior.table.icon_size = 20));
    const { user } = await renderApp(backend);
    await open(user);
    await dialog();
    const row = screen.getByRole("group", { name: "아이콘 크기" });
    expect(within(row).getByRole("spinbutton")).toHaveValue(20);
    await user.click(within(row).getByRole("button", { name: "기본값으로" }));
    await waitFor(async () => expect((await backend.getConfig()).config.behavior.table.icon_size).toBe(16));
    await waitFor(() => expect(within(row).queryByRole("button", { name: "기본값으로" })).toBeNull());
    expect(within(row).getByRole("spinbutton")).toHaveValue(16);
  });

  it("기본값과 같으면 버튼이 없다", async () => {
    const { user } = await renderApp();
    await open(user);
    await dialog();
    expect(screen.queryAllByRole("button", { name: "기본값으로" })).toEqual([]);
  });
});

describe("설정 파일 문법 오류와 설정 폴더", () => {
  it("문법 오류가 있으면 알려 주고 컨트롤을 비활성화한다", async () => {
    const backend = seedBackend();
    backend.setConfig((l) => l.warnings.push({ file: "config.toml", message: "TOML 문법 오류: expected `=`", line: 3 }));
    const { user } = await renderApp(backend);
    await open(user);
    const d = await dialog();
    expect(within(d).getByRole("alert")).toHaveTextContent("문법 오류");
    expect(sw("Action Bar 표시")).toBeDisabled();
  });

  it("설정 폴더 열기 버튼이 폴더를 연다", async () => {
    const { user, backend } = await renderApp();
    await open(user);
    const d = await dialog();
    await user.click(within(d).getByRole("button", { name: "설정 폴더 열기" }));
    await waitFor(() => expect(backend.configDirRevealed).toBe(1));
  });

  it("쓰기에 실패하면 설정 화면 안에 오류를 보여 준다", async () => {
    const backend = seedBackend();
    backend.setConfigValue = async () => {
      throw new Error("config.toml을 쓰지 못했습니다");
    };
    const { user } = await renderApp(backend);
    await open(user);
    const d = await dialog();
    await user.click(sw("Action Bar 표시"));
    expect(await within(d).findByRole("alert")).toHaveTextContent("쓰지 못했습니다");
  });
});

describe("키 설정", () => {
  it("settings 액션이 기본 키맵에 있다", async () => {
    const { user } = await renderApp();
    await act(async () => {});
    await user.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");
    await user.keyboard("settings");
    expect(await screen.findByRole("option", { name: /설정/ })).toBeInTheDocument();
  });
});

describe("파일 목록 모양 설정 항목", () => {
  it("모양 탭에 줄무늬·표시 칸·폴더 모양·커서 행 꽉 채움이 있고 바꾸면 저장된다", async () => {
    const { user, backend } = await renderApp();
    await open(user);
    await dialog();
    expect(screen.getByRole("group", { name: "폴더 모양" })).toBeInTheDocument();
    expect(sw("줄무늬 행")).toHaveAttribute("aria-checked", "false");
    expect(sw("표시 칸")).toHaveAttribute("aria-checked", "true");
    expect(sw("커서 행 꽉 채움")).toHaveAttribute("aria-checked", "false");
    await user.click(sw("줄무늬 행"));
    await waitFor(() => expect((backend as unknown as { loaded: { config: { behavior: { table: { zebra_rows: boolean } } } } }).loaded.config.behavior.table.zebra_rows).toBe(true));
  });
});

describe("패널·탭 모양 설정 항목", () => {
  it("모양 탭에 패널 테두리 강조와 탭 모양이 있고 바꾸면 저장된다", async () => {
    const { user, backend } = await renderApp();
    await open(user);
    await dialog();
    expect(screen.getByRole("group", { name: "탭 모양" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "탭 닫기 버튼" })).toBeInTheDocument();
    expect(sw("탭 닫기 버튼")).toHaveAttribute("aria-checked", "false");
    await user.click(sw("탭 닫기 버튼"));
    await waitFor(() => expect((backend as unknown as { loaded: { config: { behavior: { layout: { tab_close_button: boolean } } } } }).loaded.config.behavior.layout.tab_close_button).toBe(true));
    expect(sw("패널 테두리 강조")).toHaveAttribute("aria-checked", "true");
    await user.click(sw("패널 테두리 강조"));
    await waitFor(() => expect((backend as unknown as { loaded: { config: { behavior: { layout: { pane_highlight: boolean } } } } }).loaded.config.behavior.layout.pane_highlight).toBe(false));
  });
});
