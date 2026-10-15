import { within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Loaded } from "@twin-deck/ts-client";
import { FakeBackend } from "@twin-deck/ts-client";
import { groupingActive } from "../state/store";
import { cursorName, entryNames, list, renderApp } from "./helpers";
import { runAction, searchBackend, submitQuery, waitDone } from "./search-helpers";

const DAY = 24 * 60 * 60 * 1000;
const lastYear = new Date().getFullYear() - 1;

/** 오늘·3일 전·15일 전·작년 6월에 고친 파일과 오늘 고친 폴더. 어느 날 돌려도 구간이 같도록 오늘 기준 간격으로 잡는다. */
function seed(on: boolean, change: (l: Loaded) => void = () => {}) {
  const b = new FakeBackend().seed({
    "/home/a/docs/x": "x",
    "/home/a/today.txt": "t",
    "/home/a/week.txt": "w",
    "/home/a/month.txt": "m",
    "/home/a/old.txt": "o",
    "/home/b": null,
  });
  const now = Date.now();
  b.setTimes("/home/a/docs", { modifiedMs: now });
  b.setTimes("/home/a/today.txt", { modifiedMs: now });
  b.setTimes("/home/a/week.txt", { modifiedMs: now - 3 * DAY });
  b.setTimes("/home/a/month.txt", { modifiedMs: now - 15 * DAY });
  b.setTimes("/home/a/old.txt", { modifiedMs: new Date(lastYear, 5, 1, 12).getTime() });
  b.setConfig((l) => {
    l.config.behavior.table.group_by_modified = on;
    change(l);
  });
  return b;
}
const headers = () => [...list("left").querySelectorAll("[data-group-header]")].map((h) => h.textContent);

describe("날짜 구간 그룹핑 화면 (이슈 #62)", () => {
  it("켜면 구간 제목이 최신 구간부터 차례로 나오고 구간 안은 폴더가 먼저다", async () => {
    await renderApp(seed(true));
    expect(headers()).toEqual(["오늘", "이전 7일", "이전 30일", String(lastYear)]);
    expect(entryNames("left")).toEqual(["docs", "today.txt", "week.txt", "month.txt", "old.txt"]);
  });

  it("구간 제목 행은 항목(option)에 들지 않는다", async () => {
    await renderApp(seed(true));
    expect(within(list("left")).getAllByRole("option")).toHaveLength(5);
    expect(list("left").getAttribute("aria-rowcount")).toBe("5");
  });

  it("↑/↓는 구간 제목을 건너뛰어 항목에만 커서를 둔다", async () => {
    const { user } = await renderApp(seed(true));
    expect(cursorName("left")).toBe("docs");
    await user.keyboard("{ArrowDown}");
    expect(cursorName("left")).toBe("today.txt");
    await user.keyboard("{ArrowDown}"); // 오늘 → 이전 7일 사이의 제목을 건너뛴다
    expect(cursorName("left")).toBe("week.txt");
    await user.keyboard("{ArrowUp}");
    expect(cursorName("left")).toBe("today.txt");
  });

  it("끄면 제목이 없고 항목 순서는 평소 이름 정렬이다", async () => {
    await renderApp(seed(false));
    expect(headers()).toEqual([]);
    expect(entryNames("left")).toEqual(["docs", "month.txt", "old.txt", "today.txt", "week.txt"]);
  });

  it("가상 탭(검색 결과)에서는 켜져 있어도 제목이 없다", async () => {
    const backend = searchBackend();
    backend.setConfig((l) => {
      l.config.behavior.table.group_by_modified = true;
    });
    const { user } = await renderApp(backend);
    await runAction(user, "core.lookup");
    await submitQuery(user, "report");
    await waitDone();
    expect(headers()).toEqual([]);
  });

  it("groupingActive는 설정이 켜진 실제 폴더에서만 참이다", () => {
    expect(groupingActive({ virtual: undefined }, true)).toBe(true);
    expect(groupingActive({ virtual: undefined }, false)).toBe(false);
    expect(groupingActive({ virtual: { kind: "lookup" } as never }, true)).toBe(false);
  });
});
