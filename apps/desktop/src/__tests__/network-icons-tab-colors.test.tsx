import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FakeBackend } from "@twin-deck/ts-client";
import { connectionOf, tabConnection } from "../lib/connections";
import { renderApp, seedBackend } from "./helpers";

// fake 볼륨에는 "/Volumes/USB"가 있고, fake의 SMB 마운트 위치는 `/Volumes/<share>`다. 그래서 share가 USB인 항목은 마운트된 것으로 보인다.
const USB = { name: "USB 공유", host: "nas.local", share: "USB", user: "", icon: "🗄️" };
const SFTP = { name: "회사", protocol: "sftp", host: "files.example.com", port: 22, user: "kim", base_dir: "", icon: "🏢" };
const TD = { name: "집", protocol: "twindeck", host: "home.local", port: 2222, user: "me", base_dir: "", icon: "" };
const servers = { smb: { servers: [USB] }, remote: { servers: [SFTP, TD] } };

describe("연결과 탭 종류 판정 (이슈 #92·#93)", () => {
  it("원격 경로는 연결 id가 같은 서버 항목이고, twindeck 항목이면 Twin Deck Remote다", () => {
    expect(connectionOf("sftp://kim@files.example.com:22/srv/a", servers, [])).toEqual({ kind: "remote", icon: "🏢", root: "sftp://kim@files.example.com:22/" });
    expect(connectionOf("sftp://me@home.local:2222/", servers, [])).toEqual({ kind: "twindeck", icon: "", root: "sftp://me@home.local:2222/" });
    // 저장된 항목이 없는 원격 위치도 SFTP·FTP 탭이다(아이콘만 없다).
    expect(connectionOf("ftp://anon@x:21/", servers, [])?.kind).toBe("remote");
  });

  it("로컬 경로는 그 경로를 포함하는 SMB 마운트 위치의 항목이고, 마운트 밖이면 null이다", () => {
    expect(connectionOf("/Volumes/USB/docs", servers, ["/Volumes/USB"])).toEqual({ kind: "smb", icon: "🗄️", root: "/Volumes/USB" });
    expect(connectionOf("/Volumes/USB2", servers, ["/Volumes/USB"])).toBeNull();
    expect(connectionOf("/Volumes/USB", servers, [null])).toBeNull();
    expect(connectionOf("/home/a", servers, ["/Volumes/USB"])).toBeNull();
  });

  it("터미널 탭은 시작 위치의 이모지를 쓰고, 그 밖의 가상 탭은 일반 탭이다", () => {
    expect(tabConnection({ path: "virtual:terminal:1", virtual: { kind: "terminal", base: "/home/a" } }, servers, [])).toEqual({ kind: "terminal", icon: "" });
    expect(tabConnection({ path: "virtual:terminal:2", virtual: { kind: "terminal", base: "sftp://kim@files.example.com:22/srv" } }, servers, [])).toEqual({ kind: "terminal", icon: "🏢" });
    expect(tabConnection({ path: "virtual:find:3", virtual: { kind: "find", base: "/Volumes/USB" } }, servers, ["/Volumes/USB"])).toBeNull();
  });
});

const setup = (layout: Record<string, string> = {}) => {
  const b = seedBackend().seed({ "/Volumes/USB/docs/x.txt": "x" });
  b.setConfig((l) => {
    l.config.smb = { servers: [USB] };
    l.config.remote = { servers: [SFTP] };
    Object.assign(l.config.behavior.layout, layout);
  });
  return b;
};
const leftTabs = () => within(screen.getAllByRole("tablist")[0]).getAllByRole("tab");
const leftCrumbs = () =>
  within(screen.getAllByRole("navigation", { name: "경로" })[0])
    .getAllByRole("button")
    .map((b) => b.textContent);
/** 왼쪽 패널을 마운트된 SMB 공유(/Volumes/USB)로 옮긴다. */
const goUsb = async (user: Awaited<ReturnType<typeof renderApp>>["user"]) => {
  await user.click(within(screen.getByRole("toolbar", { name: "드라이브 (왼쪽 패널)" })).getByRole("button", { name: "🗄️ USB" }));
  await waitFor(() => expect(leftTabs()[0]).toHaveTextContent("USB"));
};

describe("연결 이모지 표시 (이슈 #93)", () => {
  it("연결 메뉴의 서버 이름 앞에 이모지가 붙는다", async () => {
    const { user } = await renderApp(setup());
    await user.click(within(screen.getByRole("toolbar", { name: "드라이브 (왼쪽 패널)" })).getByRole("button", { name: "연결" }));
    const menu = screen.getByRole("dialog", { name: "서버에 연결" });
    expect(within(menu).getAllByRole("option").map((o) => o.textContent?.trim())).toEqual(["1🗄️ USB 공유", "2🏢 SFTP · 회사", "3SMB 서버 관리…", "4SFTP·FTP 관리…"]);
  });

  it("마운트된 SMB 공유의 볼륨 버튼, 그 안 폴더 탭 이름, 경로 표시줄의 마운트 조각 앞에 이모지가 붙는다", async () => {
    const { user } = await renderApp(setup());
    await goUsb(user);
    expect(leftTabs()[0]).toHaveTextContent("🗄️ USB");
    expect(leftCrumbs()).toEqual(["/", "Volumes", "🗄️ USB"]);
  });

  it("이모지가 없는 항목은 아무것도 붙지 않는다", async () => {
    const b = setup();
    b.setConfig((l) => (l.config.smb = { servers: [{ ...USB, icon: "" }] }));
    const { user } = await renderApp(b);
    await user.click(within(screen.getByRole("toolbar", { name: "드라이브 (왼쪽 패널)" })).getByRole("button", { name: "USB" }));
    await waitFor(() => expect(leftTabs()[0].textContent).toBe("USB"));
  });
});

describe("특수 탭 색 (이슈 #92)", () => {
  it("칸형: SMB 탭은 그 종류의 색을 배경으로 칠하고, 활성 탭은 안쪽 선을 더한다", async () => {
    const { user } = await renderApp(setup({ tab_style: "segments" }));
    expect(leftTabs()[0]).not.toHaveAttribute("data-tab-kind");
    await goUsb(user);
    const tab = leftTabs()[0];
    expect(tab).toHaveAttribute("data-tab-kind", "smb");
    expect(tab.style.backgroundColor).toBe("var(--tab-smb-fill)");
    expect(tab.style.color).toBe("var(--tab-smb-ink)");
    expect(tab.style.boxShadow).toContain("var(--tab-smb-ink)");
    expect(tab.querySelector("[data-tab-dot]")).toBeNull();
  });

  it("밑줄형: 이름 앞에 색 점이 있고 활성 탭의 밑줄을 그 색으로 칠한다", async () => {
    const { user } = await renderApp(setup({ tab_style: "underline" }));
    await goUsb(user);
    const tab = leftTabs()[0];
    expect((tab.querySelector("[data-tab-dot]") as HTMLElement).style.backgroundColor).toBe("var(--tab-smb-mark)");
    expect(tab.style.borderColor).toBe("var(--tab-smb-mark)");
  });

  it("off면 색을 칠하지 않는다(이모지는 그대로)", async () => {
    const { user } = await renderApp(setup({ tab_style: "segments", tab_color_smb: "off" }));
    await goUsb(user);
    const tab = leftTabs()[0];
    expect(tab).not.toHaveAttribute("data-tab-kind");
    expect(tab.style.backgroundColor).toBe("");
    expect(tab).toHaveTextContent("🗄️ USB");
  });

  it("종류별 색 변수를 <html>에 걸고, off인 종류는 걸지 않으며 직접 지정한 색은 그대로 쓴다", async () => {
    await renderApp(setup({ tab_color_terminal: "off", tab_color_smb: "#123456" }));
    const style = document.documentElement.style;
    await waitFor(() => expect(style.getPropertyValue("--tab-smb-fill")).toBe("#123456"));
    expect(style.getPropertyValue("--tab-smb-mark")).toBe("#123456");
    expect(style.getPropertyValue("--tab-terminal-fill")).toBe("");
    expect(style.getPropertyValue("--tab-remote-fill")).toMatch(/^#[0-9a-f]{6}$/);
    expect(style.getPropertyValue("--tab-twindeck-mark")).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("설정 화면 (이슈 #92·#93)", () => {
  const openSettings = async (backend: FakeBackend) => {
    const app = await renderApp(backend);
    await app.user.keyboard("{Control>},{/Control}");
    await screen.findByRole("dialog", { name: "설정" });
    return app;
  };

  it("SMB 항목 편집 창에서 이모지를 넣으면 한 글자만 남고 저장된다. 목록 행에도 보인다", async () => {
    const b = setup();
    b.setConfig((l) => (l.config.smb = { servers: [{ ...USB, icon: "" }] }));
    const { user } = await openSettings(b);
    await user.click(screen.getByRole("tab", { name: "SMB 서버" }));
    await user.dblClick(within(screen.getByRole("listbox", { name: "저장된 SMB 서버" })).getByRole("option"));
    const icon = screen.getByRole("textbox", { name: "아이콘" });
    await user.type(icon, "📁");
    await user.type(icon, "💾");
    expect(icon).toHaveValue("💾");
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(async () => expect((await b.getConfig()).config.smb.servers?.[0].icon).toBe("💾"));
    expect(within(screen.getByRole("listbox", { name: "저장된 SMB 서버" })).getByRole("option")).toHaveTextContent("💾 USB 공유");
  });

  it("원격 항목 편집 창에도 아이콘 칸이 있고 저장된다", async () => {
    const b = setup();
    const { user } = await openSettings(b);
    await user.click(screen.getByRole("tab", { name: "SFTP·FTP 서버" }));
    await user.dblClick(within(screen.getByRole("listbox", { name: "저장된 원격 서버" })).getByRole("option"));
    const icon = screen.getByRole("textbox", { name: "아이콘" });
    expect(icon).toHaveValue("🏢");
    await user.clear(icon);
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(async () => expect((await b.getConfig()).config.remote.servers?.[0].icon).toBe(""));
  });

  it("모양 탭의 탭 색: 기본 자동이고, 직접 지정을 고르면 색이 저장되며 끔으로 바꿀 수 있다", async () => {
    const b = setup();
    const { user } = await openSettings(b);
    const group = screen.getByRole("group", { name: "SMB 탭 색" });
    expect(within(group).getByRole("combobox")).toHaveTextContent("자동");
    await user.click(within(group).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "직접 지정" }));
    await waitFor(async () => expect((await b.getConfig()).config.behavior.layout.tab_color_smb).toMatch(/^#[0-9a-f]{6}$/));
    expect(within(screen.getByRole("group", { name: "SMB 탭 색" })).getByRole("textbox", { name: "SMB 탭 색" })).toBeInTheDocument();
    await user.click(within(screen.getByRole("group", { name: "SMB 탭 색" })).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "끔" }));
    await waitFor(async () => expect((await b.getConfig()).config.behavior.layout.tab_color_smb).toBe("off"));
    for (const name of ["터미널 탭 색", "SFTP·FTP 탭 색", "Twin Deck Remote 탭 색"]) expect(screen.getByRole("group", { name })).toBeInTheDocument();
  });
});
