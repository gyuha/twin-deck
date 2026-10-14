import { currentLanguage, t } from "../i18n";

/** 수정일 구간(이슈 #62). `rank`가 작을수록 최신 구간이라 목록의 위쪽이다. */
export interface DateGroup {
  id: string;
  rank: number;
  title: string;
}

const NONE_RANK = Number.MAX_SAFE_INTEGER;

/** 로컬 시간 기준 그 날의 자정. `days`일 전은 달력 기준이라 서머타임이 끼어도 자정에 맞는다. */
function startOfDay(ms: number, daysAgo = 0): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.getTime();
}

function monthName(month: number): string {
  return new Intl.DateTimeFormat(currentLanguage(), { month: "long" }).format(new Date(2000, month, 1));
}

/**
 * 수정 시각을 구간으로 나눈다. 위에서 아래로: 오늘 · 어제 · 이전 7일 · 이전 30일 · 이번 해는 월별 · 지난 해는 연도별 · 날짜 없음.
 * 로컬 자정으로 가르므로 자정 정각은 그날이고 1ms 전은 전날이다. 앞날 시각은 오늘로 본다.
 */
export function dateGroup(modifiedMs: number | null, now: number): DateGroup {
  if (modifiedMs === null) return { id: "none", rank: NONE_RANK, title: t("group.none") };
  const today = startOfDay(now);
  if (modifiedMs >= today) return { id: "today", rank: 0, title: t("group.today") };
  if (modifiedMs >= startOfDay(now, 1)) return { id: "yesterday", rank: 1, title: t("group.yesterday") };
  if (modifiedMs >= startOfDay(now, 7)) return { id: "week", rank: 2, title: t("group.week") };
  if (modifiedMs >= startOfDay(now, 30)) return { id: "month", rank: 3, title: t("group.month") };
  const at = new Date(modifiedMs);
  const year = at.getFullYear();
  const nowYear = new Date(now).getFullYear();
  if (year === nowYear) {
    const month = at.getMonth();
    return { id: `m:${year}-${month + 1}`, rank: 100 + (11 - month), title: t("group.month_name", { name: monthName(month) }) };
  }
  return { id: `y:${year}`, rank: 1000 + (nowYear - year), title: String(year) };
}

