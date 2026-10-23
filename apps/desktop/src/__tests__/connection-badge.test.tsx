import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";

// 이슈 #95: 연결 메뉴에서 SMB·SFTP·FTP(·Twin Deck)를 이름 앞 배지로 구분한다.
const NAS = { name: "NAS", host: "nas.local", share: "media", user: "kim", icon: "🗄️" };
const SFTP = { name: "회사", protocol: "sftp", host: "nas", port: 22, user: "kim", base_dir: "", icon: "🏢" };
const FTP = { name: "백업", protocol: "ftp", host: "backup", port: 21, user: "", base_dir: "", icon: "" };
const TD = { name: "집", protocol: "twindeck", host: "home.local", port: 2222, user: "me", base_dir: "", icon: "" };

const setup = () => {
  const b = new FakeBackend().seed({ "/home/a/a.txt": "a", "/home/b/b.txt": "b" });
  b.setConfig((l) => {
    l.config.smb = { servers: [NAS] };
    l.config.remote = { auto_reconnect: true, servers: [SFTP, FTP, TD] };
  });
  return b;
};
const openMenu = async (user: Awaited<ReturnType<typeof renderApp>>["user"]) => {
  await user.click(screen.getAllByRole("button", { name: "연결" })[0]);
  return screen.findByRole("dialog", { name: "서버에 연결" });
};
const rowOf = (menu: HTMLElement, name: RegExp) => within(menu).getByRole("option", { name });
const badgeOf = (row: HTMLElement) => row.querySelector<HTMLElement>("[data-protocol-badge]");

describe("연결 메뉴의 종류 배지 (이슈 #95)", () => {
  it("SMB·SFTP·FTP·Twin Deck 항목마다 종류 배지가 이름 앞에 보인다", async () => {
    const { user } = await renderApp(setup());
    const menu = await openMenu(user);
    const expected: [RegExp, string, string][] = [
      [/NAS/, "smb", "SMB"],
      [/회사/, "sftp", "SFTP"],
      [/백업/, "ftp", "FTP"],
      [/집/, "twindeck", "Twin Deck"],
    ];
    for (const [name, protocol, text] of expected) {
      const badge = badgeOf(rowOf(menu, name));
      expect(badge, text).not.toBeNull();
      expect(badge).toHaveAttribute("data-protocol-badge", protocol);
      expect(badge).toHaveTextContent(text);
    }
  });

  it("배지는 이름(아이콘 포함) 앞에 있고, 이름에는 더 이상 'SFTP · ' 같은 글자 접두사가 붙지 않는다", async () => {
    const { user } = await renderApp(setup());
    const row = rowOf(await openMenu(user), /회사/);
    const text = row.textContent ?? "";
    expect(text).toContain("SFTP 🏢 회사"); // [배지] [아이콘] 이름
    expect(text).not.toContain("SFTP · ");
    expect(text.indexOf("SFTP")).toBeLessThan(text.indexOf("회사"));
    expect(row.querySelector("[data-protocol-badge]")?.nextSibling?.textContent).toBe(" ");
  });

  it("종류마다 배지 색이 다르다(FTP는 암호화되지 않아 경고색)", async () => {
    const { user } = await renderApp(setup());
    const menu = await openMenu(user);
    const colors = ["NAS", "회사", "백업", "집"].map((n) => badgeOf(rowOf(menu, new RegExp(n)))!.className.match(/text-(?:status-\w+|accent)/)?.[0]);
    expect(new Set(colors).size).toBe(4);
    expect(colors[2]).toBe("text-status-warning");
  });

  it("서버 관리 항목(…관리)에는 배지가 없다", async () => {
    const { user } = await renderApp(setup());
    const menu = await openMenu(user);
    expect(badgeOf(rowOf(menu, /SMB 서버 관리/))).toBeNull();
    expect(badgeOf(rowOf(menu, /SFTP·FTP 관리/))).toBeNull();
  });

  it("연결 중이라 비활성인 항목에도 배지가 보인다", async () => {
    const b = setup();
    b.remotePasswords.set("kim@nas:22/sftp", "pw");
    b.remoteConnect = () => new Promise(() => {}); // 끝나지 않는 연결
    const { user } = await renderApp(b);
    await user.click(rowOf(await openMenu(user), /회사/));
    const menu = await openMenu(user);
    const busy = await waitFor(() => rowOf(menu, /연결 중/));
    expect(busy).toHaveAttribute("aria-disabled", "true");
    expect(badgeOf(busy)).toHaveAttribute("data-protocol-badge", "sftp");
  });
});
