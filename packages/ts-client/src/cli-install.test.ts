import { describe, expect, it } from "vitest";
import { FakeBackend } from "./fake";

describe("td 명령 설치 계약 (FakeBackend)", () => {
  it("설치하면 상태가 installed가 되고 다시 설치하면 alreadyInstalled다", async () => {
    const b = new FakeBackend();
    expect((await b.cliStatus()).state).toBe("absent");
    expect(await b.cliInstall()).toBe("installed");
    expect((await b.cliStatus()).state).toBe("installed");
    expect(await b.cliInstall()).toBe("alreadyInstalled");
    expect(b.cliCalls.install).toBe(2);
  });

  it("제거하면 absent가 되고, 설치돼 있지 않으면 notInstalled다", async () => {
    const b = new FakeBackend();
    expect(await b.cliUninstall()).toBe("notInstalled");
    await b.cliInstall();
    expect(await b.cliUninstall()).toBe("removed");
    expect((await b.cliStatus()).state).toBe("absent");
  });

  it("다른 td가 있으면 설치도 제거도 하지 않고 오류로 끝난다", async () => {
    const b = new FakeBackend();
    b.cli = { state: "foreign", link: "/usr/local/bin/td" };
    await expect(b.cliInstall()).rejects.toThrow(/다른 td/);
    await expect(b.cliUninstall()).rejects.toThrow(/다른 td/);
    expect((await b.cliStatus()).state).toBe("foreign");
  });

  it("설정한 오류는 한 번만 던진다", async () => {
    const b = new FakeBackend();
    b.cliError = "관리자 암호 입력을 취소했습니다";
    await expect(b.cliInstall()).rejects.toThrow(/취소/);
    expect(await b.cliInstall()).toBe("installed");
  });
});
