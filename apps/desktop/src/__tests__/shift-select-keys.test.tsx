import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { defaultBindingsFor } from "@twin-deck/actions";
import { cursorName, entryNames, renderApp, selectedNames } from "./helpers";

/** 이슈 #51: Shift+PageUp/PageDown/Home/End 범위 선택과 macOS Cmd+↑/↓. */
const seed = () => {
  const files: Record<string, string> = {};
  for (let i = 1; i <= 25; i++) files[`/home/a/f${String(i).padStart(2, "0")}.txt`] = "x";
  files["/home/b/x.txt"] = "x";
  return new FakeBackend().seed(files);
};

/** 선택된 항목의 번호(f01.txt → 1) 목록. */
const selectedNumbers = () =>
  selectedNames("left")
    .map((n) => Number(/f(\d+)\.txt/.exec(n)?.[1]))
    .sort((a, b) => a - b);

describe("Shift+이동 키 범위 선택 (#51)", () => {
  it("Shift+PageDown은 한 페이지(10행) 아래로 가며 시작 항목부터 도착 항목까지 선택한다", async () => {
    const { user } = await renderApp(seed());
    await waitFor(() => expect(entryNames("left")).toHaveLength(25));
    await user.keyboard("{Shift>}{PageDown}{/Shift}");
    expect(cursorName("left")).toContain("f11.txt");
    expect(selectedNumbers()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("Shift+PageUp은 한 페이지 위로 가며 시작 항목부터 도착 항목까지 선택한다", async () => {
    const { user } = await renderApp(seed());
    await waitFor(() => expect(entryNames("left")).toHaveLength(25));
    await user.keyboard("{End}{Shift>}{PageUp}{/Shift}");
    expect(cursorName("left")).toContain("f15.txt");
    expect(selectedNumbers()).toEqual([15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]);
  });

  it("첫 항목에서 Shift+End는 마지막 항목까지 모두, 마지막 항목에서 Shift+Home은 첫 항목까지 모두 선택한다", async () => {
    const { user } = await renderApp(seed());
    await waitFor(() => expect(entryNames("left")).toHaveLength(25));
    await user.keyboard("{Shift>}{End}{/Shift}");
    expect(cursorName("left")).toContain("f25.txt");
    expect(selectedNumbers()).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    await user.keyboard("{Escape}{Shift>}{Home}{/Shift}");
    expect(cursorName("left")).toContain("f01.txt");
    expect(selectedNumbers()).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  });

  it("Shift+PageDown을 연속으로 눌러도 선택이 끊기지 않는다", async () => {
    const { user } = await renderApp(seed());
    await waitFor(() => expect(entryNames("left")).toHaveLength(25));
    await user.keyboard("{Shift>}{PageDown}{PageDown}{/Shift}");
    expect(cursorName("left")).toContain("f21.txt");
    expect(selectedNumbers()).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
  });

  it("macOS: Cmd+Shift+↓/↑는 Shift+End/Home처럼 도착 항목까지 선택한다", async () => {
    const { user } = await renderApp(seed(), "mac");
    await waitFor(() => expect(entryNames("left")).toHaveLength(25));
    await user.keyboard("{Meta>}{Shift>}{ArrowDown}{/Shift}{/Meta}");
    expect(cursorName("left")).toContain("f25.txt");
    expect(selectedNumbers()).toHaveLength(25);
    await user.keyboard("{Escape}{Meta>}{Shift>}{ArrowUp}{/Shift}{/Meta}");
    expect(cursorName("left")).toContain("f01.txt");
    expect(selectedNumbers()).toHaveLength(25);
  });

  it("macOS: Cmd+↓/↑는 커서를 맨 끝/맨 처음으로 옮기고 선택하지 않는다", async () => {
    const { user } = await renderApp(seed(), "mac");
    await waitFor(() => expect(entryNames("left")).toHaveLength(25));
    await user.keyboard("{Meta>}{ArrowDown}{/Meta}");
    expect(cursorName("left")).toContain("f25.txt");
    await user.keyboard("{Meta>}{ArrowUp}{/Meta}");
    expect(cursorName("left")).toContain("f01.txt");
    expect(selectedNumbers()).toEqual([]);
  });

  it("Cmd+↑/↓ 기본 키는 macOS에만 있다", () => {
    const has = (p: "mac" | "windows" | "linux", key: string, action: string) =>
      defaultBindingsFor(p).some((b) => b.actionId === action && b.keys.includes(key));
    expect(has("mac", "Mod+Up", "core.move.home")).toBe(true);
    expect(has("mac", "Mod+Down", "core.move.end")).toBe(true);
    for (const p of ["windows", "linux"] as const) {
      expect(has(p, "Mod+Up", "core.move.home")).toBe(false);
      expect(has(p, "Mod+Down", "core.move.end")).toBe(false);
    }
  });
});
