import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { cursorName, renderApp } from "./helpers";

// 이슈 #90: Enter는 .app 안으로 들어가고, Shift+Enter(core.open.launch)는 앱을 실행한다.
const SHIFT_ENTER = "{Shift>}{Enter}{/Shift}";
type User = Awaited<ReturnType<typeof renderApp>>["user"];

const seed = () =>
  new FakeBackend().seed({
    "/home/a/Foo.app/Contents/Info.plist": "p",
    "/home/a/Bar.APP/Contents/Info.plist": "p",
    "/home/a/plain/x.txt": "x",
    "/home/a/note.txt": "n",
    "/home/b/b.txt": "b",
  });

/** 왼쪽 패널의 현재 경로(브레드크럼 버튼 글자). */
const crumbs = () => within(screen.getAllByRole("navigation", { name: "경로" }).at(0)!).getAllByRole("button").map((b) => b.textContent);

/** 커서를 이름에 맞는 항목으로 옮긴다. */
async function moveTo(user: User, name: string) {
  for (let i = 0; i < 12 && cursorName("left") !== name; i++) await user.keyboard("{ArrowDown}");
  expect(cursorName("left")).toBe(name);
}

describe("앱 실행 액션 (이슈 #90)", () => {
  it("로컬 .app 폴더에서 Shift+Enter는 안으로 들어가지 않고 앱을 실행한다", async () => {
    const backend = seed();
    const { user } = await renderApp(backend);
    await moveTo(user, "Foo.app");
    const before = crumbs();
    await user.keyboard(SHIFT_ENTER);
    await waitFor(() => expect(backend.opened).toEqual(["/home/a/Foo.app"]));
    expect(crumbs()).toEqual(before);
    expect(cursorName("left")).toBe("Foo.app");
  });

  it("같은 .app 폴더에서 Enter만 누르면 지금처럼 안으로 들어가고 실행하지 않는다", async () => {
    const backend = seed();
    const { user } = await renderApp(backend);
    await moveTo(user, "Foo.app");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(crumbs().at(-1)).toBe("Foo.app"));
    expect(backend.opened).toEqual([]);
  });

  it("확장자 대소문자가 달라도(Bar.APP) 앱으로 실행한다", async () => {
    const backend = seed();
    const { user } = await renderApp(backend);
    await moveTo(user, "Bar.APP");
    await user.keyboard(SHIFT_ENTER);
    await waitFor(() => expect(backend.opened).toEqual(["/home/a/Bar.APP"]));
  });

  it("일반 폴더에서 Shift+Enter는 Enter처럼 안으로 들어가고 실행하지 않는다", async () => {
    const backend = seed();
    const { user } = await renderApp(backend);
    await moveTo(user, "plain");
    await user.keyboard(SHIFT_ENTER);
    await waitFor(() => expect(crumbs().at(-1)).toBe("plain"));
    expect(backend.opened).toEqual([]);
  });

  it("일반 파일에서 Shift+Enter는 Enter처럼 기본 프로그램으로 연다", async () => {
    const backend = seed();
    const { user } = await renderApp(backend);
    await moveTo(user, "note.txt");
    await user.keyboard(SHIFT_ENTER);
    await waitFor(() => expect(backend.opened).toEqual(["/home/a/note.txt"]));
  });

  it("원격(sftp://) 경로의 .app 폴더에서는 앱을 실행하지 않는다", async () => {
    const backend = new FakeBackend().seed({ "/home/b/b.txt": "b", "sftp://me@h:22/Foo.app/Contents/x": "x" });
    await backend.setRemoteServers([{ name: "서버", protocol: "sftp", host: "h", port: 22, user: "me", base_dir: "" }]);
    const root = await backend.remoteConnect(0, "pw", false);
    const { user } = await renderApp(backend, "linux", { left: root, right: "/home/b" });
    await moveTo(user, "Foo.app");
    await user.keyboard(SHIFT_ENTER);
    await waitFor(() => expect(crumbs().at(-1)).toBe("Foo.app")); // Enter와 똑같이 폴더로 들어간다
    expect(backend.opened).toEqual([]);
  });
});
