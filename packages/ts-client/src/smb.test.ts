import { describe, expect, it } from "vitest";
import { SmbConnectError } from "./backend";
import { FakeBackend } from "./fake";

const server = (host: string, share: string, user = "") => ({ name: "", host, share, user });

async function backendWith(...servers: ReturnType<typeof server>[]) {
  const b = new FakeBackend();
  await b.setSmbServers(servers);
  return b;
}

describe("SMB 연결 계약 (FakeBackend)", () => {
  it("목록을 저장하면 설정에 반영되고 빈 name은 host/share가 된다", async () => {
    const b = new FakeBackend();
    const loaded = await b.setSmbServers([server("nas", "공유", "kim")]);
    expect(loaded.config.smb.servers).toEqual([{ name: "nas/공유", host: "nas", share: "공유", user: "kim", icon: "" }]);
    expect((await b.getConfig()).config.smb.servers).toHaveLength(1);
  });

  it("host나 share가 빈 항목이 있으면 목록을 바꾸지 않고 거부한다", async () => {
    const b = await backendWith(server("nas", "공유"));
    await expect(b.setSmbServers([server("nas", " ")])).rejects.toThrow(/host와 share/);
    expect((await b.getConfig()).config.smb.servers).toHaveLength(1);
  });

  it("연결하면 /Volumes/<share> 볼륨이 생기고, 이미 있으면 그 경로를 그대로 돌려준다", async () => {
    const b = await backendWith(server("nas", "공유"));
    expect(await b.smbConnect(0, null, false)).toBe("/Volumes/공유");
    expect(await b.smbConnect(0, null, false)).toBe("/Volumes/공유");
    expect((await b.listVolumes()).filter((v) => v.mountPoint === "/Volumes/공유")).toHaveLength(1);
  });

  it("비밀번호가 bad면 auth 오류이고 볼륨은 생기지 않는다", async () => {
    const b = await backendWith(server("nas", "공유", "kim"));
    const e = await b.smbConnect(0, "bad", true).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(SmbConnectError);
    expect((e as SmbConnectError).kind).toBe("auth");
    expect((await b.listVolumes()).some((v) => v.mountPoint === "/Volumes/공유")).toBe(false);
    expect(b.smbPasswords.size).toBe(0);
  });

  it("사용자가 있는데 비밀번호도 저장값도 없으면 auth 오류다", async () => {
    const b = await backendWith(server("nas", "공유", "kim"));
    await expect(b.smbConnect(0, null, false)).rejects.toMatchObject({ kind: "auth" });
  });

  it("host가 offline이면 unreachable 오류다", async () => {
    const b = await backendWith(server("offline", "공유"));
    await expect(b.smbConnect(0, null, false)).rejects.toMatchObject({ kind: "unreachable" });
  });

  it("remember로 저장한 비밀번호는 다음 연결에 쓰이고, 지우면 다시 묻는다", async () => {
    const b = await backendWith(server("nas", "공유", "kim"));
    await b.smbConnect(0, "pw", true);
    expect(b.smbPasswords.get("kim@nas/공유")).toBe("pw");
    await b.unmountVolume("/Volumes/공유");
    expect(await b.smbConnect(0, null, false)).toBe("/Volumes/공유");
    await b.unmountVolume("/Volumes/공유");
    await b.smbForgetPassword(0);
    await expect(b.smbConnect(0, null, false)).rejects.toMatchObject({ kind: "auth" });
  });

  it("없는 항목 번호는 SMB 오류가 아닌 일반 오류로 거부한다", async () => {
    const b = new FakeBackend();
    const e = await b.smbConnect(3, null, false).catch((x: unknown) => x);
    expect(e).not.toBeInstanceOf(SmbConnectError);
    expect(String(e)).toMatch(/항목이 없습니다/);
  });
});
