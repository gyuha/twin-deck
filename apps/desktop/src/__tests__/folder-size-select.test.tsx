import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { list, renderApp } from "./helpers";

// /home/a 이름순: docs(폴더, 안에 500 B), sub(폴더, 안에 40 B), a.txt(1000 B), b.txt(2500 B)
const seed = () =>
  new FakeBackend().seed({
    "/home/a/docs/in.txt": "x".repeat(500),
    "/home/a/sub/in.txt": "y".repeat(40),
    "/home/a/a.txt": "a".repeat(1000),
    "/home/a/b.txt": "b".repeat(2500),
    "/home/b/z.txt": "z",
  });
const status = () => screen.getByRole("status", { name: "상태 표시줄" });
const row = (name: string) => within(list("left")).getAllByRole("option").find((o) => o.textContent?.includes(name))!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("선택 폴더 용량", () => {
  it("폴더를 선택하면 하위 용량이 크기 칸과 상태 줄(선택/전체)에 나온다", async () => {
    const b = seed();
    const { user } = await renderApp(b);
    expect(status()).toHaveTextContent("선택: 0 / 3.5 KB, 파일: 0/2, 폴더: 0/2"); // 계산 전: 전체에 폴더가 안 더해진다
    await user.keyboard("{Insert}"); // docs 선택
    await waitFor(() => expect(row("docs")).toHaveTextContent("500 B"));
    expect(status()).toHaveTextContent("선택: 500 B / 4.0 KB, 파일: 0/2, 폴더: 1/2");
    expect(b.dirSizeCalls).toEqual(["/home/a/docs"]);
  });

  it("계산하지 않은 폴더는 크기 칸이 비어 있고 커서만 올려서는 계산하지 않는다", async () => {
    const b = seed();
    const { user } = await renderApp(b);
    await user.keyboard("{ArrowDown}{ArrowUp}");
    await sleep(80);
    expect(b.dirSizeCalls).toEqual([]);
    expect(row("sub")).not.toHaveTextContent(/\d+ B/);
  });

  it("전체 선택하면 폴더를 한 번에 하나씩 순서대로 계산한다", async () => {
    const b = seed();
    b.dirSizeDelayMs = 60;
    const { user } = await renderApp(b);
    await user.keyboard("{Control>}a{/Control}");
    await waitFor(() => expect(b.dirSizeCalls).toEqual(["/home/a/docs"])); // 첫 계산이 끝나기 전에는 하나만
    await waitFor(() => expect(b.dirSizeCalls).toEqual(["/home/a/docs", "/home/a/sub"]), { timeout: 3000 });
    await waitFor(() => expect(status()).toHaveTextContent("선택: 4.0 KB / 4.0 KB"), { timeout: 3000 }); // 500 + 40 + 3500
  });

  it("선택을 풀면 진행 중·대기 중 계산을 멈추고, 끝난 크기는 선택을 풀어도 남는다", async () => {
    const b = seed();
    b.dirSizeDelayMs = 80;
    const { user } = await renderApp(b);
    await user.keyboard("{Control>}a{/Control}");
    await waitFor(() => expect(b.dirSizeCalls).toEqual(["/home/a/docs"]));
    await user.keyboard("{Escape}"); // 선택 해제 → docs 계산 취소, sub는 시작하지 않는다
    await sleep(400);
    expect(b.dirSizeCalls).toEqual(["/home/a/docs"]);
    expect(row("docs")).not.toHaveTextContent(/\d+ B/); // 취소된 폴더는 비어 있다
    b.dirSizeDelayMs = 0;
    await user.keyboard("{Insert}"); // docs를 다시 선택하면 새로 계산한다
    await waitFor(() => expect(row("docs")).toHaveTextContent("500 B"));
    await user.keyboard("{Escape}");
    expect(row("docs")).toHaveTextContent("500 B"); // 선택을 풀어도 남는다
    expect(status()).toHaveTextContent("선택: 0 / 4.0 KB, 파일: 0/2, 폴더: 0/2");
  });

  it("계산 중에 선택을 풀었다가 바로 다시 선택해도 결국 크기가 나온다", async () => {
    const b = seed();
    b.dirSizeDelayMs = 300; // 키 입력이 끝날 때까지 계산이 진행 중이도록 충분히 길게
    b.dirSizePollMs = 150; // 취소 결과가 다시 선택하는 것보다 늦게 돌아오게 한다
    const { user } = await renderApp(b);
    await user.keyboard("{Insert}"); // docs 선택 → 계산 시작
    await waitFor(() => expect(b.dirSizeCalls).toEqual(["/home/a/docs"]));
    await user.keyboard("{ArrowUp}{Insert}"); // docs 선택을 풀고(커서는 sub로 내려간다)
    await user.keyboard("{ArrowUp}{Insert}"); // 바로 다시 선택
    await waitFor(() => expect(row("docs")).toHaveTextContent("500 B"), { timeout: 3000 });
  });

  it("목록을 다시 읽으면 계산한 크기가 지워진다", async () => {
    const b = seed();
    const { user } = await renderApp(b);
    await user.keyboard("{Insert}");
    await waitFor(() => expect(row("docs")).toHaveTextContent("500 B"));
    await user.keyboard("{Escape}");
    await b.touch("/home/a/new.txt"); // 폴더 변경 이벤트 → 목록을 다시 읽는다
    await waitFor(() => expect(row("docs")).not.toHaveTextContent(/\d+ B/));
  });

  it("설정 변경 알림으로 목록이 다시 읽혀도 계산한 크기는 남고 다시 계산하지 않는다", async () => {
    // 앱은 커서·선택이 바뀔 때마다 상태 파일(state.json)을 저장하고, 설정 폴더 감시는 그것도 설정 변경으로 알린다.
    const b = seed();
    const { user } = await renderApp(b);
    await user.keyboard("{Insert}"); // docs 선택, 커서는 sub로
    await waitFor(() => expect(row("docs")).toHaveTextContent("500 B"));
    for (let i = 0; i < 3; i++) {
      await user.keyboard("{ArrowDown}{ArrowUp}"); // 커서를 옮긴다
      b.setConfig((l) => (l.config.display.relative_date = i % 2 === 0)); // 설정 변경 알림 → 목록 다시 읽기
      await sleep(60);
    }
    expect(row("docs")).toHaveTextContent("500 B");
    expect(b.dirSizeCalls).toEqual(["/home/a/docs"]); // 한 번만 계산했다
  });

  it("옵션을 끄면 폴더를 선택해도 계산하지 않는다", async () => {
    const b = seed();
    b.setConfig((l) => (l.config.display.folder_size_on_select = false));
    const { user } = await renderApp(b);
    await user.keyboard("{Insert}");
    await sleep(100);
    expect(b.dirSizeCalls).toEqual([]);
    expect(row("docs")).not.toHaveTextContent(/\d+ B/);
    expect(status()).toHaveTextContent("선택: 0 / 3.5 KB, 파일: 0/2, 폴더: 1/2");
  });

  it("압축 파일 안의 폴더는 계산하지 않는다", async () => {
    const b = seed().seed({ "/home/a/pack.zip": "PK", "/home/a/pack.zip!/inner/f.txt": "F" });
    const { user } = await renderApp(b);
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{Enter}"); // docs, sub, a.txt, b.txt 다음 pack.zip으로 가서 연다
    await waitFor(() => expect(row("inner")).toBeTruthy());
    await user.keyboard("{Insert}"); // inner 선택
    await sleep(100);
    expect(b.dirSizeCalls).toEqual([]);
  });
});

describe("폴더 용량 설정", () => {
  it("설정 화면 표시 형식 탭에 스위치가 있고 토글하면 저장된다", async () => {
    const b = seed();
    const { user } = await renderApp(b);
    await user.keyboard("{Control>},{/Control}");
    await screen.findByRole("dialog", { name: "설정" });
    await user.click(screen.getByRole("tab", { name: "표시 형식" }));
    const sw = screen.getByRole("switch", { name: "선택한 폴더 용량 계산" });
    expect(sw).toBeChecked(); // 기본 켜짐
    await user.click(sw);
    await waitFor(async () => expect((await b.getConfig()).config.display.folder_size_on_select).toBe(false));
  });
});
