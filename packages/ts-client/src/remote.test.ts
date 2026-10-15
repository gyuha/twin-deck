import { describe, expect, it } from "vitest";
import { RemoteConnectError, baseName, isRemotePath, joinPath, parentPath, remoteUrl, splitRemote, trimTrailingSep } from "./backend";
import { FakeBackend } from "./fake";

const server = (protocol: string, host: string, user = "", port = 0, base_dir = "") => ({ name: "", protocol, host, port, user, base_dir });

async function backendWith(...servers: ReturnType<typeof server>[]) {
  const b = new FakeBackend();
  await b.setRemoteServers(servers);
  return b;
}

describe("원격 경로 표기 (ADR-0019)", () => {
  it("분해하고 다시 만든다", () => {
    expect(splitRemote("sftp://me@nas:22/home/a b.txt")).toEqual({ scheme: "sftp", id: "me@nas:22", path: "/home/a b.txt" });
    expect(splitRemote("ftp://nas:21")).toEqual({ scheme: "ftp", id: "nas:21", path: "/" });
    expect(splitRemote("/home/a")).toBeNull();
    expect(splitRemote("sftp:///x")).toBeNull();
    expect(isRemotePath("ftp://h/x")).toBe(true);
    expect(remoteUrl("sftp", "h:22", "a")).toBe("sftp://h:22/a");
  });

  it("상위 폴더는 루트가 끝이고 루트는 끝에 슬래시가 있다", () => {
    expect(parentPath("sftp://h:22/a/b")).toBe("sftp://h:22/a");
    expect(parentPath("sftp://h:22/a")).toBe("sftp://h:22/");
    expect(parentPath("sftp://h:22/")).toBeNull();
    expect(parentPath("ftp://h:21")).toBeNull();
  });

  it("잇기·이름·끝 구분자 떼기", () => {
    expect(joinPath("sftp://h:22/", "a")).toBe("sftp://h:22/a");
    expect(joinPath("sftp://h:22", "a")).toBe("sftp://h:22/a");
    expect(baseName("sftp://h:22/a/한글.txt")).toBe("한글.txt");
    expect(baseName("sftp://h:22/")).toBe("h:22");
    expect(trimTrailingSep("sftp://h:22/a/")).toBe("sftp://h:22/a");
    expect(trimTrailingSep("sftp://h:22")).toBe("sftp://h:22/");
  });

  it("로컬 경로 규칙은 그대로다", () => {
    expect(parentPath("/a/b")).toBe("/a");
    expect(parentPath("C:\\a")).toBe("C:\\");
    expect(baseName("/a/b.txt")).toBe("b.txt");
  });
});

describe("원격 연결 계약 (FakeBackend)", () => {
  it("목록을 저장하면 기본 포트와 이름이 채워진다", async () => {
    const b = new FakeBackend();
    const loaded = await b.setRemoteServers([server("sftp", "nas", "kim"), server("ftp", "ftp.x.com")]);
    expect(loaded.config.remote.servers).toEqual([
      { name: "kim@nas", protocol: "sftp", host: "nas", port: 22, user: "kim", base_dir: "" },
      { name: "ftp.x.com", protocol: "ftp", host: "ftp.x.com", port: 21, user: "", base_dir: "" },
    ]);
    expect((await b.getConfig()).config.remote.servers).toHaveLength(2);
  });

  it("protocol이 sftp·ftp가 아니거나 host가 비면 목록을 바꾸지 않고 거부한다", async () => {
    const b = await backendWith(server("sftp", "nas", "kim"));
    await expect(b.setRemoteServers([server("smb", "nas")])).rejects.toThrow(/protocol/);
    await expect(b.setRemoteServers([server("ftp", " ")])).rejects.toThrow(/host/);
    expect((await b.getConfig()).config.remote.servers).toHaveLength(1);
  });

  it("연결하면 루트 경로를 돌려주고 미리 넣은 파일이 그 아래에 보인다", async () => {
    const b = await backendWith(server("sftp", "nas", "kim"));
    b.seed({ "sftp://kim@nas:22/docs/a.txt": "hi", "sftp://kim@nas:22/b.txt": "b" });
    const root = await b.remoteConnect(0, "pw", false);
    expect(root).toBe("sftp://kim@nas:22/");
    expect((await b.listDir(root, false)).map((e) => e.name)).toEqual(["docs", "b.txt"]);
    expect((await b.listDir(joinPath(root, "docs"), false)).map((e) => e.path)).toEqual(["sftp://kim@nas:22/docs/a.txt"]);
  });

  it("시작 폴더가 있으면 그 폴더가 루트다", async () => {
    const b = await backendWith(server("ftp", "nas", "", 0, "/pub"));
    expect(await b.remoteConnect(0, null, false)).toBe("ftp://nas:21/pub");
  });

  it("이미 연결돼 있으면 다시 인증하지 않고 같은 루트다, 끊으면 목록에서 빠진다", async () => {
    const b = await backendWith(server("sftp", "nas", "kim"), server("ftp", "ftp.x.com"));
    await b.remoteConnect(0, "pw", false);
    await b.remoteConnect(1, null, false);
    expect(await b.remoteConnections()).toEqual([0, 1]);
    expect(await b.remoteConnect(0, null, false)).toBe("sftp://kim@nas:22/");
    await b.remoteDisconnect(0);
    expect(await b.remoteConnections()).toEqual([1]);
  });

  it("비밀번호가 bad면 auth 오류이고 연결되지 않으며 저장도 안 된다", async () => {
    const b = await backendWith(server("sftp", "nas", "kim"));
    const e = await b.remoteConnect(0, "bad", true).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(RemoteConnectError);
    expect((e as RemoteConnectError).kind).toBe("auth");
    expect(await b.remoteConnections()).toEqual([]);
    expect(b.remotePasswords.size).toBe(0);
  });

  it("사용자가 있는데 비밀번호도 저장값도 없으면 auth 오류다", async () => {
    const b = await backendWith(server("sftp", "nas", "kim"));
    await expect(b.remoteConnect(0, null, false)).rejects.toMatchObject({ kind: "auth" });
    await expect(b.remoteConnect(0, "", false)).rejects.toMatchObject({ kind: "auth" });
  });

  it("사용자가 없는 SFTP는 auth 오류, 사용자가 없는 FTP는 익명으로 열린다", async () => {
    const b = await backendWith(server("sftp", "nas"), server("ftp", "ftp.x.com"));
    await expect(b.remoteConnect(0, null, false)).rejects.toMatchObject({ kind: "auth" });
    expect(await b.remoteConnect(1, null, false)).toBe("ftp://ftp.x.com:21/");
  });

  it("host가 offline이면 unreachable 오류다", async () => {
    const b = await backendWith(server("ftp", "offline", "kim"));
    await expect(b.remoteConnect(0, "pw", false)).rejects.toMatchObject({ kind: "unreachable" });
  });

  it("remember로 저장한 비밀번호는 다음 연결에 쓰이고, 지우면 다시 묻는다", async () => {
    const b = await backendWith(server("sftp", "nas", "kim"));
    await b.remoteConnect(0, "pw", true);
    expect(b.remotePasswords.get("kim@nas:22/sftp")).toBe("pw");
    await b.remoteDisconnect(0);
    expect(await b.remoteConnect(0, null, false)).toBe("sftp://kim@nas:22/");
    await b.remoteDisconnect(0);
    await b.remoteForgetPassword(0);
    await expect(b.remoteConnect(0, null, false)).rejects.toMatchObject({ kind: "auth" });
  });

  it("없는 항목 번호는 원격 오류가 아닌 일반 오류로 거부한다", async () => {
    const b = new FakeBackend();
    const e = await b.remoteConnect(3, null, false).catch((x: unknown) => x);
    expect(e).not.toBeInstanceOf(RemoteConnectError);
    expect(String(e)).toMatch(/항목이 없습니다/);
  });

  it("원격 폴더 안에서 폴더·파일 만들기, 복사, 이동, 삭제가 로컬과 같게 동작한다", async () => {
    const b = await backendWith(server("sftp", "nas", "kim"));
    b.seed({ "/local/x.txt": "x", "/other": null });
    const root = await b.remoteConnect(0, "pw", false);
    await b.mkdir(joinPath(root, "dir"));
    await b.touch(joinPath(root, "dir/new.txt"));
    await b.enqueue("copy", [{ src: "/local/x.txt", destDir: joinPath(root, "dir"), policy: "skip" }]);
    expect(b.read("sftp://kim@nas:22/dir/x.txt")).toBe("x");
    await b.enqueue("move", [{ src: "sftp://kim@nas:22/dir/x.txt", destDir: "/other", policy: "skip" }]);
    expect(b.read("/other/x.txt")).toBe("x");
    expect(b.exists("sftp://kim@nas:22/dir/x.txt")).toBe(false);
    await b.enqueue("delete", [{ src: "sftp://kim@nas:22/dir", destDir: null, policy: "skip" }]);
    expect(b.exists("sftp://kim@nas:22/dir")).toBe(false);
  });
});
