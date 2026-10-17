import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { RUST_MESSAGES, RUST_REMOTE_DISCONNECTED } from "../i18n";
import { isRemoteDisconnected } from "../lib/remoteErrors";
import { cursorName, entryNames, renderApp } from "./helpers";
import { runAction } from "./search-helpers";

// 이슈 #98: 끊긴 원격 탭을 다시 연결한다(패널을 흐리게 하고 상태 메시지와 다시 연결 버튼을 보인다).
const SERVER = { name: "서버", protocol: "sftp", host: "h", port: 22, user: "me", base_dir: "", icon: "" };
const ID = "me@h:22";

/** 원격 서버에 연결해 둔 백엔드. `remember`면 비밀번호를 키체인 흉내에 저장한다. */
async function connected(remember: boolean) {
  const b = new FakeBackend().seed({
    "/home/b/b.txt": "b",
    [`sftp://${ID}/r.txt`]: "r",
    [`sftp://${ID}/docs/d.txt`]: "d",
  });
  await b.setRemoteServers([SERVER]);
  const root = await b.remoteConnect(0, "pw", remember);
  return { b, root };
}

type App = Awaited<ReturnType<typeof renderApp>>;
const overlay = () => document.querySelector("[data-remote-disconnected]");
const reconnectButton = () => within(overlay() as HTMLElement).getByRole("button");
const region = (side: "왼쪽" | "오른쪽") => screen.getByRole("region", { name: `${side} 패널` });

/** 끊긴 뒤 왼쪽(활성) 패널에서 docs 폴더로 들어가 보면 읽기가 실패하고 오버레이가 뜬다. */
async function dropAndBrowse(b: FakeBackend, user: App["user"]) {
  b.simulateRemoteDrop(ID);
  expect(cursorName("left")).toBe("docs");
  await user.keyboard("{Enter}");
  await waitFor(() => expect(overlay()).not.toBeNull());
}

describe("끊긴 원격 탭의 다시 연결 (이슈 #98)", () => {
  it("끊긴 원격 탭에는 상태 메시지와 다시 연결 버튼이 뜨고 목록이 흐려진다", async () => {
    const { b, root } = await connected(true);
    const { user } = await renderApp(b, "linux", { left: root, right: "/home/b" });
    expect(overlay()).toBeNull();
    await dropAndBrowse(b, user);
    const o = overlay() as HTMLElement;
    expect(o).toHaveTextContent("원격 연결이 끊어졌습니다");
    expect(o).toHaveTextContent(ID);
    expect(within(o).getByRole("button", { name: "다시 연결" })).toBeEnabled();
    expect(within(region("왼쪽")).getByRole("listbox", { hidden: true })).toHaveAttribute("data-dimmed", "true");
    expect(overlay()?.closest("section")).toBe(region("왼쪽")); // 끊긴 패널에만 뜬다
  });

  it("다시 연결을 누르면 저장된 비밀번호로 접속하고 목록이 복구된다", async () => {
    const { b, root } = await connected(true);
    const { user } = await renderApp(b, "linux", { left: root, right: "/home/b" });
    await dropAndBrowse(b, user);
    await user.click(reconnectButton());
    await waitFor(() => expect(overlay()).toBeNull());
    expect(screen.queryByRole("dialog", { name: "서버 비밀번호" })).toBeNull(); // 저장된 비밀번호를 썼다
    await waitFor(() => expect(entryNames("left")).toEqual(["d.txt"]));
    expect(await b.remoteConnections()).toEqual([0]);
  });

  it("저장된 비밀번호가 없으면 비밀번호를 묻고, 맞게 입력하면 복구된다", async () => {
    const { b, root } = await connected(false);
    const { user } = await renderApp(b, "linux", { left: root, right: "/home/b" });
    await dropAndBrowse(b, user);
    await user.click(reconnectButton());
    const d = await screen.findByRole("dialog", { name: "서버 비밀번호" });
    await user.type(within(d).getByLabelText("비밀번호"), "pw{Enter}");
    await waitFor(() => expect(overlay()).toBeNull());
    await waitFor(() => expect(entryNames("left")).toEqual(["d.txt"]));
  });

  it("연결하는 동안 버튼이 꺼지고 '연결하는 중…'이 보인다", async () => {
    const { b, root } = await connected(true);
    const { user } = await renderApp(b, "linux", { left: root, right: "/home/b" });
    await dropAndBrowse(b, user);
    const original = b.remoteConnect.bind(b);
    let release: () => void = () => {};
    b.remoteConnect = (...args: Parameters<typeof original>) => new Promise((resolve) => (release = () => resolve(original(...args))));
    await user.click(reconnectButton());
    await waitFor(() => expect(within(overlay() as HTMLElement).getByRole("button", { name: "연결하는 중…" })).toBeDisabled());
    release();
    await waitFor(() => expect(overlay()).toBeNull());
  });

  it("비밀번호 창을 취소하면 오버레이가 남는다", async () => {
    const { b, root } = await connected(false);
    const { user } = await renderApp(b, "linux", { left: root, right: "/home/b" });
    await dropAndBrowse(b, user);
    await user.click(reconnectButton());
    await screen.findByRole("dialog", { name: "서버 비밀번호" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "서버 비밀번호" })).toBeNull());
    expect(overlay()).not.toBeNull();
    expect(await b.remoteConnections()).toEqual([]);
  });

  it("같은 연결을 보는 다른 패널의 탭도 함께 복구된다", async () => {
    const { b, root } = await connected(true);
    const { user } = await renderApp(b, "linux", { left: root, right: root });
    await dropAndBrowse(b, user); // 왼쪽 패널이 docs로 들어가려다 실패
    await user.keyboard("{Tab}");
    expect(cursorName("right")).toBe("docs");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(region("오른쪽").querySelector("[data-remote-disconnected]")).not.toBeNull());
    await user.click(within(region("왼쪽")).getByRole("button", { name: "다시 연결" }));
    await waitFor(() => expect(overlay()).toBeNull());
    await waitFor(() => expect(entryNames("left")).toEqual(["d.txt"]));
    await waitFor(() => expect(entryNames("right")).toEqual(["d.txt"]));
  });

  it("끊김이 아닌 오류(권한 없음)는 오버레이를 띄우지 않고 오류 줄만 보인다", async () => {
    const { b, root } = await connected(true);
    const { user } = await renderApp(b, "linux", { left: root, right: "/home/b" });
    const listDir = b.listDir.bind(b);
    b.listDir = async (p, hidden) => {
      if (p.endsWith("/docs")) throw new Error("권한 없음: /docs");
      return listDir(p, hidden);
    };
    await user.keyboard("{Enter}");
    expect(await within(region("왼쪽")).findByRole("alert")).toHaveTextContent("권한 없음");
    expect(overlay()).toBeNull();
  });

  it("액션 '원격 다시 연결'은 끊긴 탭에서만 실행되고 다시 연결한다", async () => {
    const { b, root } = await connected(true);
    const { user } = await renderApp(b, "linux", { left: root, right: "/home/b" });
    const original = b.remoteConnect.bind(b);
    let calls = 0;
    b.remoteConnect = (...args: Parameters<typeof original>) => {
      calls += 1;
      return original(...args);
    };
    await runAction(user, "core.remote.reconnect"); // 끊기지 않았으니 실행되지 않는다(패널은 열린 채 남는다)
    await user.keyboard("{Escape}");
    expect(calls).toBe(0);
    await dropAndBrowse(b, user);
    await runAction(user, "core.remote.reconnect");
    await waitFor(() => expect(overlay()).toBeNull());
    expect(calls).toBe(1);
    await waitFor(() => expect(entryNames("left")).toEqual(["d.txt"]));
  });

  it("설정에서 지워진 서버의 탭이면 다시 연결하지 않고 알림을 보인다", async () => {
    const { b, root } = await connected(true);
    const { user } = await renderApp(b, "linux", { left: root, right: "/home/b" });
    await dropAndBrowse(b, user);
    await b.setRemoteServers([]);
    const original = b.remoteConnect.bind(b);
    let calls = 0;
    b.remoteConnect = (...args: Parameters<typeof original>) => {
      calls += 1;
      return original(...args);
    };
    await waitFor(() => expect(reconnectButton()).toBeEnabled());
    await user.click(reconnectButton());
    expect(await screen.findByText("설정에서 지워진 서버라 다시 연결할 수 없습니다")).toBeInTheDocument();
    expect(calls).toBe(0);
    expect(overlay()).not.toBeNull();
  });

  it("끊김으로 알아보는 문구는 모두 Rust 영어 대응표에 있고, 권한 없음 같은 오류는 끊김이 아니다", () => {
    for (const m of RUST_REMOTE_DISCONNECTED) {
      expect(RUST_MESSAGES.some(([ko]) => ko === m), m).toBe(true);
      expect(isRemoteDisconnected(`찾을 수 없음: ${m}`)).toBe(true);
    }
    expect(isRemoteDisconnected("권한 없음: /docs")).toBe(false);
    expect(isRemoteDisconnected(null)).toBe(false);
  });
});
