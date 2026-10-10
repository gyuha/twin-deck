import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import type { OpenPathsDto } from "@twin-deck/ts-client";
import { cursorName, list, renderApp } from "./helpers";

// `td` 명령(이슈 #45)이 넘긴 경로가 왼쪽·오른쪽 패널의 새 탭으로 열린다. 왼쪽 /home/a, 오른쪽 /home/b가 시작 폴더다.
const backend = () =>
  new FakeBackend().seed({
    "/home/a/a.txt": "a",
    "/home/b/b.txt": "b",
    "/home/proj/src/main.rs": "m",
    "/home/proj/readme.md": "r",
    "/home/other/x.txt": "x",
  });
const req = (left: string | null, right: string | null = null, focus: string | null = null): OpenPathsDto => ({
  left: left ? { folder: left, focus } : null,
  right: right ? { folder: right, focus: null } : null,
  error: null,
});
const tabNames = (pane: "left" | "right") => within(screen.getAllByRole("tablist")[pane === "left" ? 0 : 1]).getAllByRole("tab").map((t) => t.textContent);
const activeTabName = (pane: "left" | "right") =>
  within(screen.getAllByRole("tablist")[pane === "left" ? 0 : 1])
    .getAllByRole("tab")
    .find((t) => t.getAttribute("aria-selected") === "true")?.textContent;
const entries = (pane: "left" | "right") => within(list(pane)).queryAllByRole("option").map((o) => o.textContent ?? "");

describe("td 명령: 넘어온 경로를 패널에 연다", () => {
  it("시작 인수의 폴더는 왼쪽 패널의 새 탭으로 열리고 저장된 탭은 남는다", async () => {
    const b = backend();
    b.launchPaths = req("/home/proj");
    await renderApp(b);
    await waitFor(() => expect(tabNames("left")).toEqual(["a", "proj"]));
    expect(activeTabName("left")).toBe("proj");
    await waitFor(() => expect(entries("left").join()).toContain("readme.md"));
    expect(tabNames("right")).toEqual(["b"]); // 오른쪽은 그대로
    expect(await b.takeLaunchPaths()).toBeNull(); // 한 번만 적용된다
  });

  it("두 경로는 왼쪽·오른쪽 패널에 각각 새 탭으로 열린다", async () => {
    const b = backend();
    b.launchPaths = req("/home/proj", "/home/other");
    await renderApp(b);
    await waitFor(() => expect(tabNames("left")).toEqual(["a", "proj"]));
    await waitFor(() => expect(tabNames("right")).toEqual(["b", "other"]));
    expect(activeTabName("right")).toBe("other");
  });

  it("실행 중 앱에 넘어온 경로도 같은 규칙으로 열린다(창을 새로 만들지 않는다)", async () => {
    const b = backend();
    await renderApp(b);
    expect(tabNames("left")).toEqual(["a"]);
    act(() => b.emitOpenPaths(req("/home/proj")));
    await waitFor(() => expect(tabNames("left")).toEqual(["a", "proj"]));
    expect(activeTabName("left")).toBe("proj");
  });

  it("그 패널에 같은 폴더의 탭이 이미 있으면 새로 만들지 않고 그 탭을 활성으로 한다", async () => {
    const b = backend();
    await renderApp(b);
    act(() => b.emitOpenPaths(req("/home/proj")));
    await waitFor(() => expect(tabNames("left")).toEqual(["a", "proj"]));
    act(() => b.emitOpenPaths(req("/home/a"))); // 첫 탭과 같은 폴더
    await waitFor(() => expect(activeTabName("left")).toBe("a"));
    expect(tabNames("left")).toEqual(["a", "proj"]); // 탭 수 불변
    act(() => b.emitOpenPaths(req("/home/proj")));
    await waitFor(() => expect(activeTabName("left")).toBe("proj"));
    expect(tabNames("left")).toEqual(["a", "proj"]);
  });

  it("파일을 넘기면 그 폴더를 열고 커서가 그 파일에 놓인다", async () => {
    const b = backend();
    await renderApp(b);
    act(() => b.emitOpenPaths(req("/home/proj", null, "readme.md")));
    await waitFor(() => expect(tabNames("left")).toEqual(["a", "proj"]));
    await waitFor(() => expect(cursorName("left")).toBe("readme.md"));
  });

  it("오류 요청은 알림을 보이고 탭을 만들지 않는다", async () => {
    const b = backend();
    await renderApp(b);
    act(() => b.emitOpenPaths({ left: null, right: null, error: "경로를 찾을 수 없습니다: nope" }));
    expect(await screen.findByText(/경로를 찾을 수 없습니다: nope/)).toBeInTheDocument();
    expect(tabNames("left")).toEqual(["a"]);
    expect(tabNames("right")).toEqual(["b"]);
  });

  it("인수가 없으면 아무것도 열지 않는다", async () => {
    const b = backend();
    await renderApp(b);
    act(() => b.emitOpenPaths({ left: null, right: null, error: null }));
    await new Promise((r) => setTimeout(r, 30));
    expect(tabNames("left")).toEqual(["a"]);
    expect(tabNames("right")).toEqual(["b"]);
  });
});
