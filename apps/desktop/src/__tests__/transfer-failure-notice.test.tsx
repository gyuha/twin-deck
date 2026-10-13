import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { names, renderApp, seedBackend } from "./helpers";

// 상태 표시줄 알림만 센다(진행 창 안의 오류 목록도 role="alert"라서 제외한다).
const alertText = () =>
  screen
    .queryAllByRole("alert")
    .filter((e) => !e.closest('[role="dialog"]'))
    .map((e) => e.textContent ?? "");

describe("진행 창이 뜨기 전에 끝난 작업의 실패 알림", () => {
  it("F8 휴지통 이동이 곧바로 실패하면 사유를 알린다", async () => {
    const backend = seedBackend();
    backend.nextJobError = "권한이 없습니다";
    const { user } = await renderApp(backend);
    await user.keyboard("{ArrowDown}{ArrowDown}{F8}"); // a.txt
    await waitFor(() => expect(alertText().join(" ")).toContain("권한이 없습니다"));
    expect(alertText().join(" ")).toContain("휴지통으로 이동");
    expect(backend.trashed).toEqual([]);
    expect(names("left").some((n) => n.includes("a.txt"))).toBe(true);
  });

  it("F5 복사가 곧바로 실패하면 사유를 알린다", async () => {
    const backend = seedBackend();
    backend.nextJobError = "대상에 쓸 수 없습니다";
    const { user } = await renderApp(backend);
    await user.keyboard("{ArrowDown}{ArrowDown}{F5}{Enter}"); // a.txt를 오른쪽 폴더로
    await waitFor(() => expect(alertText().join(" ")).toContain("대상에 쓸 수 없습니다"));
    expect(backend.exists("/home/b/a.txt")).toBe(false);
  });

  it("성공한 작업은 알림을 띄우지 않는다", async () => {
    const { user, backend } = await renderApp();
    await user.keyboard("{ArrowDown}{ArrowDown}{F8}");
    await waitFor(() => expect(backend.trashed).toEqual(["/home/a/a.txt"]));
    await waitFor(() => expect(names("left").some((n) => n.includes("a.txt"))).toBe(false));
    expect(alertText()).toEqual([]);
  });

  it("실패 알림은 한 번만 뜬다", async () => {
    const backend = seedBackend();
    backend.nextJobError = "권한이 없습니다";
    const { user } = await renderApp(backend);
    await user.keyboard("{ArrowDown}{ArrowDown}{F8}");
    await waitFor(() => expect(alertText().length).toBe(1));
    await new Promise((r) => setTimeout(r, 400)); // 폴링이 몇 번 더 돌아도 늘지 않는다
    expect(alertText().length).toBe(1);
  });

  it("진행 창이 떠 있는 동안 실패하면 창에서 오류를 보이고 알림은 따로 띄우지 않는다", async () => {
    const backend = seedBackend();
    backend.queueMode = "manual"; // 휴지통은 300ms 뒤에 진행 창이 뜬다
    const { user } = await renderApp(backend);
    await user.keyboard("{ArrowDown}{ArrowDown}{F8}");
    await screen.findByRole("dialog", {}, { timeout: 2000 });
    await backend.deletePermanent("/home/a/a.txt"); // 휴지통으로 보낼 파일이 이미 없어 항목이 실패한다
    await backend.advance();
    await waitFor(() => expect(screen.getByRole("dialog").textContent).toContain("a.txt"));
    await new Promise((r) => setTimeout(r, 400)); // 폴링이 돌아도 창이 남고 알림은 늘지 않는다
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(alertText()).toEqual([]);
  });
});
