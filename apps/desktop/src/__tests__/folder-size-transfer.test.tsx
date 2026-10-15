import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { list, renderApp } from "./helpers";

// /home/a 이름순: docs(폴더, 500 B), sub(폴더, 40 B), a.txt, b.txt. 오른쪽은 /home/b.
const seed = () => {
  const b = new FakeBackend().seed({
    "/home/a/docs/in.txt": "x".repeat(500),
    "/home/a/sub/in.txt": "y".repeat(40),
    "/home/a/a.txt": "a".repeat(1000),
    "/home/a/b.txt": "b".repeat(2500),
    "/home/b/z.txt": "z",
  });
  b.dirSizeDelayMs = 400; // 계산이 도는 동안 복사·이동을 시작할 틈을 준다
  b.queueMode = "manual"; // 작업이 직접 넘길 때까지 진행 중으로 남는다
  return b;
};
const row = (name: string) => within(list("left")).getAllByRole("option").find((o) => o.textContent?.includes(name))!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("복사·이동 중 선택 폴더 용량 계산 (이슈 #81)", () => {
  it("계산이 도는 중에 붙여넣기(복사)가 시작되면 진행 중 계산을 멈춘다 — 선택이 남아 있어도", async () => {
    const b = seed();
    const { user } = await renderApp(b);
    await user.keyboard("{Insert}"); // docs 선택 → 계산 시작
    await waitFor(() => expect(b.dirSizeCalls).toEqual(["/home/a/docs"]));
    await user.keyboard("{Control>}c{/Control}{Tab}{Control>}v{/Control}"); // 반대편 패널로 붙여넣기: 왼쪽 선택은 그대로다
    await waitFor(async () => expect((await b.queueJobs()).map((j) => j.kind)).toEqual(["copy"]));
    await sleep(700); // 취소되지 않았다면 이 사이에 계산이 끝나 크기가 나온다
    expect(row("docs")).not.toHaveTextContent(/\d+ B/);
  });

  it("대기 중이던 폴더의 계산은 시작하지 않는다", async () => {
    const b = seed();
    const { user } = await renderApp(b);
    await user.keyboard("{Control>}a{/Control}"); // docs 계산 중, sub는 대기
    await waitFor(() => expect(b.dirSizeCalls).toEqual(["/home/a/docs"]));
    await user.keyboard("{Control>}c{/Control}{Tab}{Control>}v{/Control}");
    await waitFor(async () => expect((await b.queueJobs()).map((j) => j.kind)).toEqual(["copy"]));
    await sleep(900);
    expect(b.dirSizeCalls).toEqual(["/home/a/docs"]);
  });

  it("복사 작업이 진행되는 동안 폴더를 새로 선택해도 계산하지 않고, 작업이 끝나면 선택이 남은 폴더를 계산한다", async () => {
    const b = seed();
    b.dirSizeDelayMs = 0;
    const { user } = await renderApp(b);
    await b.enqueue("copy", [{ src: "/home/a/a.txt", destDir: "/home/b", policy: "rename" }]); // 진행 중으로 남는 복사 작업
    await user.keyboard("{ArrowDown}{Insert}"); // sub 선택(작업은 아직 진행 중)
    expect(screen.getByRole("status", { name: "상태 표시줄" })).toHaveTextContent("폴더: 1/2");
    await sleep(150);
    expect(b.dirSizeCalls).toEqual([]);
    await act(async () => void (await b.advance())); // 작업을 끝낸다
    // 작업이 끝나 목록이 다시 읽히면 끝난 크기가 지워져 한 번 더 셀 수 있다(기존 동작). 계산 대상은 sub뿐이다.
    await waitFor(() => expect(b.dirSizeCalls.length).toBeGreaterThan(0));
    expect(new Set(b.dirSizeCalls)).toEqual(new Set(["/home/a/sub"]));
    await waitFor(() => expect(row("sub")).toHaveTextContent("40 B"));
  });

  it("이동 작업이 진행되는 동안에도 계산하지 않는다", async () => {
    const b = seed();
    b.dirSizeDelayMs = 0;
    const { user } = await renderApp(b);
    await b.enqueue("move", [{ src: "/home/a/b.txt", destDir: "/home/b", policy: "rename" }]);
    await user.keyboard("{Insert}"); // docs 선택
    await sleep(150);
    expect(b.dirSizeCalls).toEqual([]);
  });

  it("복사·이동이 아닌 작업(휴지통)이 진행 중이어도 계산을 멈추지 않는다", async () => {
    const b = seed();
    b.dirSizeDelayMs = 0;
    const { user } = await renderApp(b);
    await b.enqueue("trash", [{ src: "/home/a/a.txt", destDir: "", policy: "skip" }]);
    await user.keyboard("{Insert}"); // docs 선택
    await waitFor(() => expect(row("docs")).toHaveTextContent("500 B"));
    expect(b.dirSizeCalls).toEqual(["/home/a/docs"]);
  });
});
