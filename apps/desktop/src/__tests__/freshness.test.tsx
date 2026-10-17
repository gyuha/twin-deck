import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Loaded } from "@twin-deck/ts-client";
import { FakeBackend } from "@twin-deck/ts-client";
import { freshnessLevel } from "../lib/dateGroups";
import { THEMES } from "../lib/themes.generated";
import { FRESHNESS_LEVELS, FRESHNESS_MIN_STEP, contrast, deltaE, freshnessShades } from "../lib/themeColors";
import { list, renderApp } from "./helpers";

const DAY = 24 * 60 * 60 * 1000;

/** 로컬 시간 `daysAgo`일 전 자정. */
const midnight = (now: number, daysAgo: number) => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.getTime();
};

describe("파일 신선도 단계 (이슈 #91)", () => {
  const now = new Date(2026, 9, 17, 15, 30).getTime();

  it("7일·30일·365일 전 자정이 경계이고 앞날·날짜 없음도 단계가 있다", () => {
    expect(freshnessLevel(now, now)).toBe(3);
    expect(freshnessLevel(now + DAY, now)).toBe(3); // 앞날 시각은 가장 신선하다
    expect(freshnessLevel(midnight(now, 7), now)).toBe(3);
    expect(freshnessLevel(midnight(now, 7) - 1, now)).toBe(2);
    expect(freshnessLevel(midnight(now, 30), now)).toBe(2);
    expect(freshnessLevel(midnight(now, 30) - 1, now)).toBe(1);
    expect(freshnessLevel(midnight(now, 365), now)).toBe(1);
    expect(freshnessLevel(midnight(now, 365) - 1, now)).toBe(0);
    expect(freshnessLevel(null, now)).toBe(0);
  });

  it("모든 내장 테마에서 단계 색은 배경과 대비 4.5 이상이고, 나눌 수 있으면 이웃 단계가 구분된다", () => {
    const bad: string[] = [];
    let unavailable = 0;
    for (const t of THEMES) {
      for (const text of ["", t.dark ? "#e0e0e0" : "#202020"]) {
        const shades = freshnessShades(t, text);
        if (!shades) {
          if (!text) unavailable++;
          continue;
        }
        expect(shades).toHaveLength(FRESHNESS_LEVELS);
        expect(shades[FRESHNESS_LEVELS - 1]).toBe(text || t.foreground);
        shades.forEach((c, i) => {
          if (contrast(c, t.background) < 4.5) bad.push(`${t.id}${text}/${i}: 대비 ${contrast(c, t.background).toFixed(2)}`);
          if (i > 0 && deltaE(c, shades[i - 1]) < FRESHNESS_MIN_STEP * 0.9) bad.push(`${t.id}${text}/${i}: 이웃 ΔE ${deltaE(c, shades[i - 1]).toFixed(3)}`);
        });
      }
    }
    expect(bad).toEqual([]);
    // 글자색이 이미 배경과 대비가 낮은 몇 개 테마(Solarized 등)만 단계를 나눌 수 없다.
    expect(unavailable).toBeGreaterThan(0);
    expect(unavailable).toBeLessThanOrEqual(5);
  });

  it("글자색이 배경과 대비가 낮은 테마는 나눌 수 없고, 대비가 큰 글자색을 지정하면 나눌 수 있다", () => {
    const solarized = THEMES.find((t) => t.id === "solarized-light")!;
    expect(freshnessShades(solarized, "")).toBeNull();
    expect(freshnessShades(solarized, "#000000")).not.toBeNull();
  });
});

/** 오늘·15일 전·100일 전·2년 전에 고친 파일과 날짜 없는 파일. */
function seed(on: boolean, change: (l: Loaded) => void = () => {}) {
  const b = new FakeBackend().seed({
    "/home/a/fresh.txt": "f",
    "/home/a/month.txt": "m",
    "/home/a/year.txt": "y",
    "/home/a/old.txt": "o",
    "/home/b": null,
  });
  const now = Date.now();
  b.setTimes("/home/a/fresh.txt", { modifiedMs: now });
  b.setTimes("/home/a/month.txt", { modifiedMs: now - 15 * DAY });
  b.setTimes("/home/a/year.txt", { modifiedMs: now - 100 * DAY });
  b.setTimes("/home/a/old.txt", { modifiedMs: now - 2 * 365 * DAY });
  b.setConfig((l) => {
    l.config.behavior.table.freshness = on;
    change(l);
  });
  return b;
}

const nameCell = (name: string) => within(list("left")).getByText(name).closest("[data-fresh]");

describe("파일 신선도 화면 (이슈 #91)", () => {
  it("켜면 이름 칸이 수정일 단계의 색 변수를 쓰고 <html>에 단계 색이 걸린다", async () => {
    await renderApp(seed(true));
    expect(nameCell("fresh.txt")).toHaveAttribute("data-fresh", "3");
    expect(nameCell("month.txt")).toHaveAttribute("data-fresh", "2");
    expect(nameCell("year.txt")).toHaveAttribute("data-fresh", "1");
    expect(nameCell("old.txt")).toHaveAttribute("data-fresh", "0");
    expect((nameCell("old.txt") as HTMLElement).style.color).toBe("var(--fresh-0)");
    const root = document.documentElement.style;
    for (let i = 0; i < FRESHNESS_LEVELS; i++) expect(root.getPropertyValue(`--fresh-${i}`)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("끄면 이름 칸에 색을 두지 않고 단계 색도 걷는다", async () => {
    await renderApp(seed(false));
    expect(within(list("left")).getByText("fresh.txt").closest("[data-fresh]")).toBeNull();
    expect(document.documentElement.style.getPropertyValue("--fresh-0")).toBe("");
  });

  it("선택한 행은 강조색 글자를 그대로 둔다", async () => {
    const { user } = await renderApp(seed(true));
    await user.keyboard("{Insert}"); // 첫 행 fresh.txt 선택
    expect(within(list("left")).getByText("fresh.txt").closest("[data-fresh]")).toBeNull();
    expect(nameCell("month.txt")).toHaveAttribute("data-fresh", "2");
  });

  it("단계를 나눌 수 없는 테마에서 켜면 설정에 이유를 보이고 단계 색은 걸지 않는다", async () => {
    const { user } = await renderApp(seed(true, (l) => (l.config.behavior.theme = "solarized-light")));
    expect(document.documentElement.style.getPropertyValue("--fresh-0")).toBe("");
    await user.keyboard("{Control>},{/Control}");
    await user.click(screen.getByRole("tab", { name: "목록과 선택" }));
    const item = screen.getByRole("group", { name: "수정일로 이름 밝기 나누기" });
    expect(within(item).getByRole("alert")).toHaveTextContent("단계로 나눌 수 없어");
  });

  it("나눌 수 있는 테마에서는 설정에 경고가 없다", async () => {
    const { user } = await renderApp(seed(true));
    await user.keyboard("{Control>},{/Control}");
    await user.click(screen.getByRole("tab", { name: "목록과 선택" }));
    const item = screen.getByRole("group", { name: "수정일로 이름 밝기 나누기" });
    expect(within(item).queryByRole("alert")).toBeNull();
  });
});
