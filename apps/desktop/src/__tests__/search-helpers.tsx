import { act, screen, waitFor, within } from "@testing-library/react";
import { FakeBackend } from "@twin-deck/ts-client";
import { expect } from "vitest";
import type { renderApp } from "./helpers";

type User = Awaited<ReturnType<typeof renderApp>>["user"];

/**
 * 검색/분석 테스트용 트리. 홈(/home/a)은 다음과 같다:
 *   big/blob.bin(1000) big/other.bin(10)   docs/readme.md(1) docs/report-2026.md(10) docs/deep/annual-report.txt(20)
 *   src/main.rs(1)   report.txt(5)   pack.zip(아카이브, "PK")
 *     └ pack.zip!/inner/report-in-zip.txt(7)  pack.zip!/data.bin(300)
 * 왼쪽 패널은 /home/a, 오른쪽은 /home/b.
 */
export function searchBackend() {
  return new FakeBackend().seed({
    "/home/a/big/blob.bin": "x".repeat(1000),
    "/home/a/big/other.bin": "y".repeat(10),
    "/home/a/docs/readme.md": "r",
    "/home/a/docs/report-2026.md": "b".repeat(10),
    "/home/a/docs/deep/annual-report.txt": "c".repeat(20),
    "/home/a/src/main.rs": "m",
    "/home/a/report.txt": "a".repeat(5),
    "/home/a/pack.zip": "PK",
    "/home/a/pack.zip!/inner/report-in-zip.txt": "z".repeat(7),
    "/home/a/pack.zip!/data.bin": "d".repeat(300),
    "/home/b/x.txt": "xxx",
  });
}

/** Actions Panel에서 액션 ID를 쳐서 실행한다(기본 키가 없는 액션용). */
export async function runAction(user: User, id: string) {
  await user.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");
  await screen.findByRole("dialog", { name: "Actions Panel" });
  await user.keyboard(`${id}{Enter}`);
}

/** Look Up 다이얼로그에 질의를 넣고 확정한다. */
export async function submitQuery(user: User, query: string) {
  const input = await screen.findByRole("textbox", { name: "질의" });
  await user.type(input, query);
  await user.keyboard("{Enter}");
}

export const tabTitles = (pane: "left" | "right" = "left") =>
  within(screen.getAllByRole("tablist")[pane === "left" ? 0 : 1])
    .getAllByRole("tab")
    .map((t) => t.textContent);

export const activeTabTitle = (pane: "left" | "right" = "left") =>
  within(screen.getAllByRole("tablist")[pane === "left" ? 0 : 1])
    .getAllByRole("tab")
    .find((t) => t.getAttribute("aria-selected") === "true")?.textContent;

export const statusText = () => screen.getByRole("status", { name: "검색 상태" }).textContent ?? "";
export const warningTexts = () =>
  screen.queryAllByRole("listitem").filter((li) => li.closest("ul")?.getAttribute("aria-label") === "경고").map((li) => li.textContent);

export const crumbs = (pane: "left" | "right" = "left") =>
  within(screen.getAllByRole("navigation", { name: "경로" })[pane === "left" ? 0 : 1])
    .getAllByRole("button")
    .map((b) => b.textContent);

/** 수동 모드에서 검색을 한 걸음 진행한다(React 갱신을 act로 감싼다). */
export async function step(backend: FakeBackend, times = 1) {
  for (let i = 0; i < times; i++) await act(async () => void (await backend.stepSearch()));
}

export const waitDone = () => waitFor(() => expect(statusText()).toMatch(/완료|취소됨/));
