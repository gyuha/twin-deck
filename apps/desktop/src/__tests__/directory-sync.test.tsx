import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import type { SyncComparisonDto } from "@twin-deck/ts-client";
import { list, renderApp } from "./helpers";
import { runAction } from "./search-helpers";

const dialog = () => screen.getByRole("dialog", { name: "디렉터리 동기화" });
const control = () => within(dialog());
const seed = () => new FakeBackend().seed({
  "/home/a/left.txt": "왼쪽", "/home/a/common.txt": "같음",
  "/home/b/right.txt": "오른쪽", "/home/b/common.txt": "같음",
});
async function open(backend = seed()) {
  const app = await renderApp(backend);
  await runAction(app.user, "core.directory_sync");
  await screen.findByRole("dialog", { name: "디렉터리 동기화" });
  return app;
}
async function compare(user: Awaited<ReturnType<typeof open>>["user"]) {
  await user.click(control().getByRole("button", { name: "비교" }));
  await control().findByRole("combobox", { name: "left.txt 복사 방향" });
}
async function report(backend: FakeBackend): Promise<SyncComparisonDto> {
  const left = await backend.listDir("/home/a", true);
  const right = await backend.listDir("/home/b", true);
  return { id: 123, rows: [
    { relativePath: "left.txt", left: left.find((e) => e.name === "left.txt")!, right: null, status: "leftOnly", direction: "leftToRight", reason: null },
    { relativePath: "right.txt", left: null, right: right.find((e) => e.name === "right.txt")!, status: "rightOnly", direction: "rightToLeft", reason: null },
    { relativePath: "common.txt", left: left.find((e) => e.name === "common.txt")!, right: right.find((e) => e.name === "common.txt")!, status: "different", direction: "skip", reason: null },
  ] };
}

describe("디렉터리 동기화", () => {
  it("양쪽 현재 경로로 열고 비교 전에는 실행할 수 없다", async () => {
    await open();
    expect(control().getByRole("textbox", { name: "왼쪽 디렉터리" })).toHaveValue("/home/a");
    expect(control().getByRole("textbox", { name: "오른쪽 디렉터리" })).toHaveValue("/home/b");
    expect(control().getByRole("button", { name: "동기화…" })).toBeDisabled();
    expect(control().getByRole("button", { name: "비교" })).toHaveFocus();
  });

  it("양쪽 고유 파일을 반대편에 복사하고 동일 파일은 제외한다", async () => {
    const { user } = await open();
    await compare(user);
    expect(control().getByRole("combobox", { name: "left.txt 복사 방향" })).toHaveValue("leftToRight");
    expect(control().getByRole("combobox", { name: "right.txt 복사 방향" })).toHaveValue("rightToLeft");
    expect(control().getByRole("combobox", { name: "common.txt 복사 방향" })).toHaveValue("skip");
  });

  it("방향을 바꾸고 제외한 계획을 확인하되 취소하면 복사하지 않는다", async () => {
    const backend = seed();
    vi.spyOn(backend, "compareDirectories").mockResolvedValue(await report(backend));
    const sync = vi.spyOn(backend, "syncDirectories");
    const { user } = await open(backend);
    await compare(user);
    await user.selectOptions(control().getByRole("combobox", { name: "common.txt 복사 방향" }), "rightToLeft");
    await user.selectOptions(control().getByRole("combobox", { name: "left.txt 복사 방향" }), "skip");
    await user.click(control().getByRole("button", { name: "동기화…" }));
    const confirm = within(screen.getByRole("alertdialog"));
    expect(confirm.getByText(/파일을 삭제하지 않습니다/)).toBeVisible();
    expect(confirm.getByRole("button", { name: "취소" })).toHaveFocus();
    await user.click(confirm.getByRole("button", { name: "취소" }));
    expect(sync).not.toHaveBeenCalled();
    expect((await backend.listDir("/home/b", true)).some((e) => e.name === "left.txt")).toBe(false);
    expect(control().getByRole("combobox", { name: "common.txt 복사 방향" })).toHaveValue("rightToLeft");
  });

  it("표시 필터로 숨겨도 실행 계획을 유지한다", async () => {
    const backend = seed();
    const sync = vi.spyOn(backend, "syncDirectories");
    const { user } = await open(backend);
    await compare(user);
    await user.click(control().getByRole("button", { name: "왼쪽에만 있음" }));
    expect(control().queryByRole("combobox", { name: "left.txt 복사 방향" })).toBeNull();
    await user.click(control().getByRole("button", { name: "동기화…" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "확인하고 복사" }));
    await waitFor(() => expect(sync).toHaveBeenCalledWith(expect.any(Number), expect.arrayContaining([
      { relativePath: "left.txt", direction: "leftToRight" }, { relativePath: "right.txt", direction: "rightToLeft" },
    ])));
    await waitFor(async () => {
      expect((await backend.listDir("/home/a", true)).map((e) => e.name)).toContain("right.txt");
      expect((await backend.listDir("/home/b", true)).map((e) => e.name)).toContain("left.txt");
      expect(await backend.queueJobs()).toEqual([expect.objectContaining({ kind: "copy", status: "done", errors: [] })]);
    });
    expect(screen.queryByRole("dialog", { name: "디렉터리 동기화" })).toBeNull();
  });

  it("모두 제외 후 기본 방향을 복원하고 충돌 항목은 고를 수 없다", async () => {
    const backend = seed();
    const result = await report(backend);
    result.rows.push({ ...result.rows[2], relativePath: "collision", status: "conflict", reason: "종류 충돌" });
    vi.spyOn(backend, "compareDirectories").mockResolvedValue(result);
    const { user } = await open(backend);
    await compare(user);
    expect(control().getByRole("combobox", { name: "collision 복사 방향" })).toBeDisabled();
    await user.click(control().getByRole("button", { name: "모두 제외" }));
    expect(control().getByRole("button", { name: "동기화…" })).toBeDisabled();
    await user.click(control().getByRole("button", { name: "기본 방향으로" }));
    expect(control().getByRole("combobox", { name: "left.txt 복사 방향" })).toHaveValue("leftToRight");
    await user.click(control().getByRole("button", { name: "동기화…" }));
    const confirm = within(screen.getByRole("alertdialog"));
    await user.tab({ shift: true });
    expect(confirm.getByRole("button", { name: "확인하고 복사" })).toHaveFocus();
    await user.tab();
    expect(confirm.getByRole("button", { name: "취소" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(dialog()).toBeVisible();
  });

  it("비교 조건과 선택 이름을 백엔드에 전달한다", async () => {
    const backend = seed();
    const spy = vi.spyOn(backend, "compareDirectories");
    const { user } = await renderApp(backend);
    await user.click(within(list("left")).getByText("left.txt"));
    await user.keyboard(" ");
    await runAction(user, "core.directory_sync");
    await screen.findByRole("dialog", { name: "디렉터리 동기화" });
    for (const name of ["하위 디렉터리", "내용별 비교", "날짜 무시", "비대칭 (왼쪽 → 오른쪽만)", "기본 창에서 선택한 것만"]) {
      await user.click(control().getByRole("checkbox", { name }));
    }
    const mask = control().getByRole("textbox", { name: "파일 마스크" });
    await user.clear(mask);
    await user.type(mask, "*.txt");
    await user.click(control().getByRole("button", { name: "비교" }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(expect.any(String), "/home/a", "/home/b", {
      recursive: false, byContent: true, ignoreDate: true, asymmetric: true, pattern: "*.txt", selectedNames: ["left.txt"],
    }));
  });

  it("경로를 바꾸면 기존 패널의 선택 조건을 해제한다", async () => {
    const backend = seed();
    const spy = vi.spyOn(backend, "compareDirectories");
    const { user } = await renderApp(backend);
    await user.click(within(list("left")).getByText("left.txt"));
    await user.keyboard(" ");
    await runAction(user, "core.directory_sync");
    await user.click(control().getByRole("checkbox", { name: "기본 창에서 선택한 것만" }));
    const path = control().getByRole("textbox", { name: "왼쪽 디렉터리" });
    await user.clear(path);
    await user.type(path, "/home/b");
    expect(control().getByRole("checkbox", { name: "기본 창에서 선택한 것만" })).not.toBeChecked();
    await user.click(control().getByRole("button", { name: "비교" }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(expect.any(String), "/home/b", "/home/b", expect.objectContaining({ selectedNames: null })));
  });

  it.each(["하위 디렉터리", "내용별 비교", "날짜 무시", "비대칭 (왼쪽 → 오른쪽만)"])("%s 변경은 이전 보고서를 무효화한다", async (name) => {
    const { user } = await open();
    await compare(user);
    await user.click(control().getByRole("checkbox", { name }));
    expect(control().queryByRole("combobox", { name: "left.txt 복사 방향" })).toBeNull();
    expect(control().getByRole("button", { name: "동기화…" })).toBeDisabled();
    expect(control().getByText("경로 또는 옵션이 바뀌었습니다. 다시 비교하세요.")).toBeVisible();
  });

  it("중단 뒤 도착한 비교 응답은 버리고 새 비교는 받을 수 있다", async () => {
    const backend = seed();
    const result = await report(backend);
    let resolve!: (value: SyncComparisonDto) => void;
    const spy = vi.spyOn(backend, "compareDirectories").mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    const cancel = vi.spyOn(backend, "cancelDirectoryComparison");
    const { user } = await open(backend);
    await user.click(control().getByRole("button", { name: "비교" }));
    await user.keyboard("{Escape}");
    expect(cancel).toHaveBeenCalledWith(spy.mock.calls[0][0]);
    await act(async () => resolve(result));
    expect(control().queryByRole("combobox", { name: "left.txt 복사 방향" })).toBeNull();
    await compare(user);
  });

  it("비교 실패를 알리고 다시 비교할 수 있다", async () => {
    const backend = seed();
    vi.spyOn(backend, "compareDirectories").mockRejectedValueOnce(new Error("폴더를 읽을 수 없습니다"));
    const { user } = await open(backend);
    await user.click(control().getByRole("button", { name: "비교" }));
    expect(await control().findByRole("alert")).toHaveTextContent("폴더를 읽을 수 없습니다");
    await compare(user);
    expect(control().queryByRole("alert")).toBeNull();
  });

  it("복사 시작 실패는 확인창을 닫고 재비교를 요구한다", async () => {
    const backend = seed();
    vi.spyOn(backend, "syncDirectories").mockRejectedValue(new Error("비교 이후 파일이 변경되었습니다"));
    const { user } = await open(backend);
    await compare(user);
    await user.click(control().getByRole("button", { name: "동기화…" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "확인하고 복사" }));
    expect(await control().findByRole("alert")).toHaveTextContent("비교 이후 파일이 변경되었습니다");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(control().getByRole("button", { name: "동기화…" })).toBeDisabled();
  });

  it("창 안에서는 패널 단축키를 막고 Tab을 순환하며 Esc로 닫는다", async () => {
    const backend = seed();
    const enqueue = vi.spyOn(backend, "enqueue");
    const { user } = await open(backend);
    await user.keyboard("{F5}{Delete}{Control>}t{/Control}");
    expect(enqueue).not.toHaveBeenCalled();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    const close = control().getByRole("button", { name: "닫기" });
    close.focus();
    await user.tab({ shift: true });
    expect(control().getByRole("checkbox", { name: "한쪽에만 있음" })).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    expect(dialog().contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "디렉터리 동기화" })).toBeNull();
  });
});
