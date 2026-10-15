import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { cursorName, renderApp, seedBackend } from "./helpers";

const open = (user: Awaited<ReturnType<typeof renderApp>>["user"]) => user.keyboard("{Control>},{/Control}");
const dialog = () => screen.findByRole("dialog", { name: "설정" });
const sw = (name: string) => screen.getByRole("switch", { name });
/** 목록 모양·확장자 컬럼 같은 항목은 "목록과 선택" 탭에 있다. */
const listTab = (user: Awaited<ReturnType<typeof renderApp>>["user"]) => user.click(screen.getByRole("tab", { name: "목록과 선택" }));

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

  it("섹션 9개가 왼쪽에 있고 처음에는 모양이 열린다", async () => {
    const { user } = await renderApp();
    await open(user);
    await dialog();
    const tabs = within(screen.getByRole("tablist", { name: "설정 섹션" })).getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["모양", "목록과 선택", "표시 형식", "미리보기", "확인", "폴더 단축키", "F키", "환경", "SMB 서버"]);
    expect(screen.getByRole("tab", { name: "모양" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("switch", { name: "액션바 표시" })).toBeInTheDocument();
  });
});

describe("환경 섹션: 터미널 셸은 Windows에서만 보인다", () => {
  const openEnvironment = async (platform: "mac" | "linux" | "windows") => {
    const { user } = await renderApp(seedBackend(), platform);
    await user.keyboard(platform === "mac" ? "{Meta>},{/Meta}" : "{Control>},{/Control}");
    await dialog();
    await user.click(screen.getByRole("tab", { name: "환경" }));
  };

  it.each(["mac", "linux"] as const)("%s: 터미널 셸 항목이 없고 다른 환경 항목은 그대로 있다", async (platform) => {
    await openEnvironment(platform);
    expect(await screen.findByText("텍스트 편집기")).toBeInTheDocument();
    expect(screen.queryByText("터미널 셸")).toBeNull();
  });

  it("windows: 터미널 셸 항목이 보인다", async () => {
    await openEnvironment("windows");
    expect(await screen.findByText("텍스트 편집기")).toBeInTheDocument();
    expect(screen.getByText("터미널 셸")).toBeInTheDocument();
  });
});

describe("설정 값 바꾸기", () => {
  it("확장자 컬럼 설정은 다시 로드해도 유지되고 해제·기본값 복원은 다른 컬럼을 보존한다", async () => {
    const backend = seedBackend();
    const original = ["<name:220", "size:90", "modified:130", "permissions"];
    backend.setConfig((l) => { l.config.view.table.columns = original; });
    let app = await renderApp(backend);
    await open(app.user);
    await dialog();
    await listTab(app.user);
    expect(sw("확장자 컬럼 표시")).toHaveAttribute("aria-checked", "false");
    await app.user.click(sw("확장자 컬럼 표시"));
    await waitFor(async () => expect((await backend.getConfig()).config.view.table.columns).toEqual([original[0], "extension", ...original.slice(1)]));
    cleanup();
    app = await renderApp(backend);
    await open(app.user);
    await dialog();
    await listTab(app.user);
    expect(sw("확장자 컬럼 표시")).toHaveAttribute("aria-checked", "true");
    await app.user.click(sw("확장자 컬럼 표시"));
    await waitFor(async () => expect((await backend.getConfig()).config.view.table.columns).toEqual(original));
    await app.user.click(sw("확장자 컬럼 표시"));
    const group = screen.getByRole("group", { name: "확장자 컬럼 표시" });
    await app.user.click(await within(group).findByRole("button", { name: "기본값으로" }));
    await waitFor(async () => expect((await backend.getConfig()).config.view.table.columns).toEqual(original));
    expect(sw("확장자 컬럼 표시")).toHaveAttribute("aria-checked", "false");
  });

  it("직접 지정한 정렬·너비가 있는 확장자 컬럼도 켜진 상태로 인식하고 해제한다", async () => {
    const backend = seedBackend();
    backend.setConfig((l) => { l.config.view.table.columns = ["name:210", ">extension:65", "size:90"]; });
    const { user } = await renderApp(backend);
    await open(user);
    await dialog();
    await listTab(user);
    expect(sw("확장자 컬럼 표시")).toHaveAttribute("aria-checked", "true");
    expect((await backend.getConfig()).config.view.table.columns).toEqual(["name:210", ">extension:65", "size:90"]);
    await user.click(sw("확장자 컬럼 표시"));
    await waitFor(async () => expect((await backend.getConfig()).config.view.table.columns).toEqual(["name:210", "size:90"]));
  });

  it("스위치는 바꾸는 즉시 저장되고 화면에 반영된다", async () => {
    const { user, backend } = await renderApp();
    expect(screen.getByRole("toolbar", { name: "액션 바" })).toBeInTheDocument();
    await open(user);
    await dialog();
    await user.click(sw("액션바 표시"));
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

  it("Office 문서 미리보기 스위치: 기본은 꺼짐이고 설명에 데이터만 보는 기능이며 macOS는 Quick Look, Windows의 docx는 미리보기 처리기로 보여 준다고 적혀 있고, 켜면 저장된다", async () => {
    const { user, backend } = await renderApp();
    await open(user);
    await dialog();
    await user.click(screen.getByRole("tab", { name: "미리보기" }));
    const sw = screen.getByRole("switch", { name: "Office 문서 미리보기" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    const row = screen.getByRole("group", { name: "Office 문서 미리보기" });
    expect(row).toHaveTextContent("데이터만 보는 기능");
    expect(row).toHaveTextContent("macOS는 Quick Look, Windows의 docx는 설치된 Office의 미리보기 처리기로 이 설정과 관계없이");
    expect(row).toHaveTextContent("그 밖의 경우(Linux, Windows의 xlsx·pptx, Office가 없는 Windows)에만 쓰입니다");
    await user.click(sw);
    await waitFor(async () => expect((await backend.getConfig()).config.preview.office).toBe(true));
  });

  it("숫자 입력(아이콘 크기)은 Enter로 저장된다", async () => {
    const { user, backend } = await renderApp();
    await open(user);
    await dialog();
    await listTab(user);
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
    await listTab(user);
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
    expect(sw("액션바 표시")).toBeDisabled();
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
    await user.click(sw("액션바 표시"));
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
  it("목록과 선택 탭에 줄무늬·표시 칸·폴더 모양·커서 행 꽉 채움이 있고 바꾸면 저장된다", async () => {
    const { user, backend } = await renderApp();
    await open(user);
    await dialog();
    await listTab(user);
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

describe("탭 위치 설정 항목 (이슈 #67)", () => {
  it("모양 탭의 탭 위치는 기본 top이고 bottom으로 바꾸면 저장된다", async () => {
    const { user, backend } = await renderApp();
    await open(user);
    await dialog();
    const group = screen.getByRole("group", { name: "탭 위치" });
    expect(within(group).getByRole("combobox")).toHaveTextContent("top");
    await user.click(within(group).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "bottom" }));
    await waitFor(async () => expect((await backend.getConfig()).config.behavior.layout.tab_position).toBe("bottom"));
  });
});

describe("SMB 서버 탭 (이슈 #77)", () => {
  const NAS = { name: "NAS", host: "nas.local", share: "media", user: "kim" };
  const smbServers = async (backend: ReturnType<typeof seedBackend>) => (await backend.getConfig()).config.smb.servers;
  const openSmb = async (backend = seedBackend()) => {
    const app = await renderApp(backend);
    await open(app.user);
    await dialog();
    await app.user.click(screen.getByRole("tab", { name: "SMB 서버" }));
    return app;
  };
  const field = (name: string) => screen.getByRole("textbox", { name });
  const button = (name: string) => screen.getByRole("button", { name });

  it("추가 → 입력 → 저장하면 setSmbServers로 설정에 저장된다", async () => {
    const { user, backend } = await openSmb();
    expect(screen.getByText("저장된 서버가 없습니다. 추가를 눌러 만듭니다")).toBeInTheDocument();
    await user.click(button("추가"));
    await user.type(field("표시 이름"), "NAS");
    await user.type(field("호스트"), "nas.local");
    await user.type(field("공유"), "media");
    await user.type(field("사용자"), "kim");
    expect(await smbServers(backend)).toEqual([]);
    await user.click(button("저장"));
    await waitFor(async () => expect(await smbServers(backend)).toEqual([NAS]));
    expect(button("저장")).toBeDisabled();
  });

  it("저장된 항목을 고쳐 저장하고, 삭제 후 저장하면 목록에서 빠진다", async () => {
    const backend = seedBackend();
    backend.setConfig((l) => (l.config.smb = { servers: [NAS, { name: "백업", host: "backup", share: "data", user: "" }] }));
    const { user } = await openSmb(backend);
    const listbox = screen.getByRole("listbox", { name: "저장된 SMB 서버" });
    expect(within(listbox).getAllByRole("option").map((o) => o.textContent)).toEqual(["NASnas.local/media · kim", "백업backup/data"]);
    await user.click(within(listbox).getByRole("option", { name: /백업/ }));
    await user.clear(field("공유"));
    await user.type(field("공유"), "archive{Enter}");
    await waitFor(async () => expect((await smbServers(backend))?.[1].share).toBe("archive"));
    await user.click(within(listbox).getByRole("option", { name: /NAS/ }));
    await user.click(button("삭제"));
    await user.click(button("저장"));
    await waitFor(async () => expect(await smbServers(backend)).toEqual([{ name: "백업", host: "backup", share: "archive", user: "" }]));
  });

  it("호스트나 공유가 비면 저장하지 않고 오류를 보인다", async () => {
    const backend = seedBackend();
    const calls: unknown[] = [];
    const original = backend.setSmbServers.bind(backend);
    backend.setSmbServers = async (servers) => {
      calls.push(servers);
      return original(servers);
    };
    const { user } = await openSmb(backend);
    await user.click(button("추가"));
    await user.type(field("공유"), "media");
    await user.click(button("저장"));
    expect(await screen.findByText("1번째 항목: 호스트와 공유를 입력하세요")).toBeInTheDocument();
    expect(calls).toEqual([]);
    expect(await smbServers(backend)).toEqual([]);
  });

  it("저장된 비밀번호 지우기는 키체인에서 그 항목의 비밀번호를 지운다", async () => {
    const backend = seedBackend();
    backend.setConfig((l) => (l.config.smb = { servers: [NAS] }));
    backend.smbPasswords.set("kim@nas.local/media", "secret");
    const { user } = await openSmb(backend);
    await user.click(button("저장된 비밀번호 지우기"));
    expect(await within(screen.getByRole("group", { name: "저장된 SMB 서버" })).findByRole("status")).toHaveTextContent("저장된 비밀번호를 지웠습니다");
    expect(backend.smbPasswords.size).toBe(0);
  });

  it("폼에 입력하는 동안 패널 키가 패널로 새지 않는다", async () => {
    const { user, backend } = await openSmb();
    await user.click(button("추가"));
    await user.type(field("호스트"), "{F8}j");
    expect(backend.trashed).toEqual([]);
    expect(field("호스트")).toHaveValue("j");
  });
});
