import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FakeBackend, HostKeyError } from "@twin-deck/ts-client";
import { cursorName, entryNames, renderApp } from "./helpers";

// 터미널 탭 시험용: xterm.js는 jsdom에서 그려지지 않으므로 화면 엔진을 가짜로 바꾼다(remote-terminal-reconnect.test.tsx와 같은 방식).
vi.mock("../lib/terminalEngine", () => ({
  createTerminalEngine: async () => ({
    open: () => {},
    write: () => {},
    onData: () => {},
    onResize: () => {},
    cols: 100,
    rows: 30,
    setFontFamily: () => {},
    focus: () => {},
    dispose: () => {},
  }),
}));

// 이슈 #108: 끊긴 원격 파일 탭을 쓰려 하면 묻지 않고 한 번 다시 접속한다(`remote.auto_reconnect`, 기본 켜짐).
const SERVER = { name: "서버", protocol: "sftp", host: "h", port: 22, user: "me", base_dir: "", icon: "" };
const ID = "me@h:22";

/** 원격 서버에 연결해 둔 백엔드. `remember`면 비밀번호를 키체인 흉내에 저장한다. 연결 시도 횟수를 센다. */
async function connected(remember: boolean, autoReconnect = true) {
  const b = new FakeBackend().seed({
    "/home/b/b.txt": "b",
    [`sftp://${ID}/r.txt`]: "r",
    [`sftp://${ID}/docs/d.txt`]: "d",
  });
  await b.setRemoteServers([SERVER]);
  b.setConfig((l) => {
    l.config.remote.auto_reconnect = autoReconnect;
  });
  const root = await b.remoteConnect(0, "pw", remember);
  const original = b.remoteConnect.bind(b);
  const calls = { n: 0 };
  b.remoteConnect = (...args: Parameters<typeof original>) => {
    calls.n += 1;
    return original(...args);
  };
  return { b, root, calls, original };
}

const overlay = (side: "왼쪽" | "오른쪽" = "왼쪽") => screen.getByRole("region", { name: `${side} 패널` }).querySelector("[data-remote-disconnected]");
const passwordDialog = () => screen.queryByRole("dialog", { name: "서버 비밀번호" });

/** 끊긴 뒤 왼쪽 패널에서 docs 폴더로 들어간다. */
async function dropAndEnter(b: FakeBackend, user: Awaited<ReturnType<typeof renderApp>>["user"]) {
  b.simulateRemoteDrop(ID);
  expect(cursorName("left")).toBe("docs");
  await user.keyboard("{Enter}");
}

describe("끊긴 원격 탭의 자동 재연결 (이슈 #108)", () => {
  it("켜져 있고 비밀번호가 저장돼 있으면 창 없이 다시 붙고, 같은 연결의 다른 패널 탭도 원래 경로로 다시 읽는다", async () => {
    const { b, root, calls } = await connected(true);
    const { user } = await renderApp(b, "linux", { left: root, right: `${root.replace(/\/$/, "")}/docs` });
    await waitFor(() => expect(entryNames("right")).toEqual(["d.txt"]));
    await dropAndEnter(b, user);
    await waitFor(() => expect(entryNames("left")).toEqual(["d.txt"]));
    expect(overlay()).toBeNull();
    expect(passwordDialog()).toBeNull();
    expect(calls.n).toBe(1);
    expect(await b.remoteConnections()).toEqual([0]);
    // 오른쪽 탭은 원래 경로(docs) 그대로 다시 읽혀 끊김 표시가 없다.
    expect(overlay("오른쪽")).toBeNull();
    expect(entryNames("right")).toEqual(["d.txt"]);
  });

  it("설정이 꺼져 있으면 자동으로 다시 붙지 않고 다시 연결 버튼이 뜬다", async () => {
    const { b, root, calls } = await connected(true, false);
    const { user } = await renderApp(b, "linux", { left: root, right: "/home/b" });
    await dropAndEnter(b, user);
    await waitFor(() => expect(overlay()).not.toBeNull());
    expect(within(overlay() as HTMLElement).getByRole("button", { name: "다시 연결" })).toBeEnabled();
    expect(calls.n).toBe(0);
  });

  it("비밀번호가 저장돼 있지 않으면 비밀번호 창 없이 다시 연결 버튼이 뜬다", async () => {
    const { b, root, calls } = await connected(false);
    const { user } = await renderApp(b, "linux", { left: root, right: "/home/b" });
    await dropAndEnter(b, user);
    await waitFor(() => expect(overlay()).not.toBeNull());
    expect(calls.n).toBe(1); // 저장된 비밀번호로 한 번 시도했다
    expect(passwordDialog()).toBeNull();
    expect(await b.remoteConnections()).toEqual([]);
  });

  it("호스트 키를 확인해야 하면 확인 창 없이 다시 연결 버튼이 뜬다", async () => {
    const { b, root } = await connected(true);
    const { user } = await renderApp(b, "linux", { left: root, right: "/home/b" });
    let calls = 0;
    b.remoteConnect = async () => {
      calls += 1;
      throw new HostKeyError({ host: "h", port: 22, algorithm: "ssh-ed25519", fingerprint: "SHA256:new", publicKey: "ssh-ed25519 AAAA", previousFingerprint: null });
    };
    await dropAndEnter(b, user);
    await waitFor(() => expect(overlay()).not.toBeNull());
    expect(calls).toBe(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("터미널 탭은 자동으로 다시 붙지 않고 다시 연결 버튼만 보인다", async () => {
    const { b, root, calls } = await connected(true);
    const { user } = await renderApp(b, "linux", { left: root, right: "/home/b" });
    await user.keyboard("{Control>}{Alt>}t{/Alt}{/Control}"); // 원격 위치에서 원격 셸 터미널 탭을 연다
    await waitFor(() => expect(b.terminals.size).toBe(1));
    const [termId] = [...b.terminals.keys()];
    b.simulateRemoteDrop(ID);
    act(() => b.emitTerminalExit(termId, null)); // 종료 코드 없이 닫힘 = 연결 끊김
    const lost = await waitFor(() => {
      const el = document.querySelector("[data-terminal-disconnected]");
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(within(lost).getByRole("button", { name: "다시 연결" })).toBeEnabled();
    expect(calls.n).toBe(0);
    expect(await b.remoteConnections()).toEqual([]);
  });

  it("한 번의 끊김에 자동 시도는 한 번만 한다(실패하면 다시 시도하지 않는다)", async () => {
    const { b, root, calls } = await connected(false);
    const { user } = await renderApp(b, "linux", { left: root, right: root });
    await dropAndEnter(b, user);
    await waitFor(() => expect(overlay()).not.toBeNull());
    expect(calls.n).toBe(1);
    // 같은 끊김으로 다른 패널에서도 실패해도, 이미 실패한 자동 시도는 반복하지 않는다.
    await user.keyboard("{Tab}{Enter}");
    await waitFor(() => expect(overlay("오른쪽")).not.toBeNull());
    expect(calls.n).toBe(1);
  });

  it("수동으로 다시 연결에 성공하면 다음 끊김에는 다시 자동으로 시도한다", async () => {
    const { b, root, calls } = await connected(false);
    const { user } = await renderApp(b, "linux", { left: root, right: "/home/b" });
    await dropAndEnter(b, user);
    await waitFor(() => expect(overlay()).not.toBeNull());
    await user.click(within(overlay() as HTMLElement).getByRole("button", { name: "다시 연결" }));
    const d = await screen.findByRole("dialog", { name: "서버 비밀번호" });
    await user.click(within(d).getByRole("checkbox"));
    await user.type(within(d).getByLabelText("비밀번호"), "pw{Enter}");
    await waitFor(() => expect(entryNames("left")).toEqual(["d.txt"]));
    const before = calls.n;
    b.simulateRemoteDrop(ID);
    await user.keyboard("{Backspace}");
    await waitFor(() => expect(calls.n).toBe(before + 1));
    await waitFor(() => expect(overlay()).toBeNull());
  });
});

describe("설정: 자동 재연결 스위치", () => {
  it("SFTP·FTP 서버 탭에 켜진 스위치가 있고 끄면 설정에 저장된다", async () => {
    const { b } = await connected(true);
    const { user } = await renderApp(b, "linux", { left: "/home/b", right: "/home/b" });
    await user.keyboard("{Control>},{/Control}");
    const d = await screen.findByRole("dialog", { name: "설정" });
    await user.click(within(d).getByRole("tab", { name: "SFTP·FTP 서버" }));
    const sw = within(d).getByRole("switch", { name: "끊기면 자동으로 다시 연결" });
    expect(sw).toBeChecked();
    await user.click(sw);
    await waitFor(async () => expect((await b.getConfig()).config.remote.auto_reconnect).toBe(false));
  });
});
