import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../i18n";
import { dateGroup } from "../lib/dateGroups";

// 2026-10-14 12:00 (로컬). 구간은 로컬 자정으로 가른다.
const NOW = new Date(2026, 9, 14, 12, 0, 0).getTime();
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const title = (ms: number | null) => dateGroup(ms, NOW).title;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  setLanguage("ko");
});
afterEach(() => {
  vi.useRealTimers();
  setLanguage("ko");
});

describe("날짜 구간 (이슈 #62)", () => {
  it("오늘 자정 정각은 오늘이고 1ms 전은 어제다", () => {
    expect(title(at(2026, 10, 14, 0, 0))).toBe("오늘");
    expect(title(at(2026, 10, 14, 0, 0) - 1)).toBe("어제");
  });

  it("앞날 시각은 오늘로 본다", () => {
    expect(title(at(2026, 10, 15))).toBe("오늘");
  });

  it("어제 자정부터 어제, 그 전 7일 안은 이전 7일", () => {
    expect(title(at(2026, 10, 13, 0, 0))).toBe("어제");
    expect(title(at(2026, 10, 13, 0, 0) - 1)).toBe("이전 7일");
    expect(title(at(2026, 10, 7, 0, 0))).toBe("이전 7일");
  });

  it("이전 7일 밖에서 30일 안은 이전 30일", () => {
    expect(title(at(2026, 10, 7, 0, 0) - 1)).toBe("이전 30일");
    expect(title(at(2026, 9, 14, 0, 0))).toBe("이전 30일");
  });

  it("30일 밖의 이번 해는 월별", () => {
    expect(title(at(2026, 9, 14, 0, 0) - 1)).toBe("9월");
    expect(title(at(2026, 6, 10))).toBe("6월");
    expect(title(at(2026, 1, 1, 0, 0))).toBe("1월");
  });

  it("지난 해는 연도별", () => {
    expect(title(at(2025, 12, 31))).toBe("2025");
    expect(title(at(2024, 1, 1))).toBe("2024");
  });

  it("수정일이 없으면 날짜 없음", () => {
    expect(title(null)).toBe("날짜 없음");
  });

  it("최신 구간이 위에 오도록 순위가 늘어난다", () => {
    const order = [at(2026, 10, 14, 1), at(2026, 10, 13, 1), at(2026, 10, 10), at(2026, 9, 20), at(2026, 6, 10), at(2026, 2, 1), at(2025, 12, 31), at(2024, 1, 1), null];
    const ranks = order.map((ms) => dateGroup(ms, NOW).rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(new Set(ranks).size).toBe(ranks.length);
  });

  it("같은 구간은 같은 식별자를 갖는다", () => {
    expect(dateGroup(at(2026, 6, 1), NOW).id).toBe(dateGroup(at(2026, 6, 30), NOW).id);
    expect(dateGroup(at(2026, 6, 1), NOW).id).not.toBe(dateGroup(at(2026, 5, 31), NOW).id);
  });

  it("영어에서는 월 이름과 영어 제목을 쓴다", () => {
    setLanguage("en");
    expect(title(at(2026, 10, 14, 0, 0))).toBe("Today");
    expect(title(at(2026, 10, 13, 0, 0))).toBe("Yesterday");
    expect(title(at(2026, 6, 10))).toBe("June");
    expect(title(null)).toBe("No date");
  });
});
