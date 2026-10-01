import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BackendError } from "@twin-deck/ts-client";
import { cursorName, entryNames, list, renderApp } from "./helpers";
import { activeTabTitle, crumbs, runAction, searchBackend, statusText, step, submitQuery, tabTitles, waitDone } from "./search-helpers";

const LOOKUP_GLOBAL = "{Control>}p{/Control}";
const rowText = (i: number) => within(list("left")).getAllByRole("option")[i].textContent ?? "";

describe("PANE-06 가상 탭", () => {
  it("결과 탭은 위치 없이 제목으로 나타나고, 닫으면 결과를 버리고 원래 탭으로 돌아온다", async () => {
    const backend = searchBackend();
    const { user } = await renderApp(backend);
    await user.keyboard(LOOKUP_GLOBAL);
    await submitQuery(user, "report");
    await waitDone();
    expect(tabTitles()).toEqual(["a", "Look Up: report"]);
    expect(activeTabTitle()).toBe("Look Up: report");
    // 위치 표시줄(브레드크럼) 대신 결과 머리글이 있고, 상위 폴더 행("..")도 없다
    expect(screen.getAllByRole("navigation", { name: "경로" })).toHaveLength(1);
    expect(within(screen.getByRole("region", { name: "왼쪽 패널" })).queryByRole("button", { name: "상위 폴더" })).toBeNull();
    await user.keyboard("{Backspace}"); // 상위 이동은 없다
    expect(activeTabTitle()).toBe("Look Up: report");

    await user.keyboard("{Control>}w{/Control}");
    await waitFor(() => expect(tabTitles()).toEqual(["a"]));
    expect(entryNames("left")).toEqual(["big", "docs", "src", "pack.zip", "report.txt"]);
    expect(screen.queryByRole("status", { name: "검색 상태" })).toBeNull();
  });

  it("진행 중인 탭을 닫으면 작업도 취소된다", async () => {
    const backend = searchBackend();
    backend.searchMode = "manual";
    const { user } = await renderApp(backend);
    await user.keyboard(LOOKUP_GLOBAL);
    await submitQuery(user, "report");
    await waitFor(() => expect(statusText()).toContain("진행 중"));
    await user.keyboard("{Control>}w{/Control}");
    await waitFor(() => expect(tabTitles()).toEqual(["a"]));
    expect(await backend.stepSearch()).toBe(false); // 취소되어 더 진행할 것이 없다
  });

  it("가상 탭은 저장되지 않는다: 저장된 상태에는 진짜 탭만 남는다", async () => {
    const backend = searchBackend();
    const { user } = await renderApp(backend);
    await user.keyboard(LOOKUP_GLOBAL);
    await submitQuery(user, "report");
    await waitDone();
    await user.keyboard("{Control>}h{/Control}"); // 저장을 일으키는 다른 변화(숨김 파일 표시)
    await waitFor(() => expect(backend.savedStates.length).toBeGreaterThan(0), { timeout: 3000 });
    const saved = backend.savedStates.at(-1)!;
    expect(saved.showHidden).toBe(true);
    expect(saved.left.tabs.map((t) => t.path)).toEqual(["/home/a"]);
    expect(saved.left.active).toBe(0);
  });
});

describe("FIND-05 Flatten", () => {
  it("현재 폴더 아래의 파일만 평면 목록으로 보여 준다(폴더 제외, 아카이브 안은 제외)", async () => {
    const backend = searchBackend();
    const { user } = await renderApp(backend);
    await runAction(user, "core.flatten");
    await waitDone();
    expect(backend.searchesStarted).toEqual([["flatten", "/home/a", ""]]);
    expect(tabTitles()).toEqual(["a", "Flatten: a"]);
    expect(entryNames("left")).toEqual([
      "annual-report.txt",
      "blob.bin",
      "main.rs",
      "other.bin",
      "pack.zip",
      "readme.md",
      "report-2026.md",
      "report.txt",
    ]);
    expect(statusText()).toContain("8개");
  });

  it("하위 폴더에서 실행하면 그 아래만", async () => {
    const backend = searchBackend();
    const { user } = await renderApp(backend);
    await user.keyboard("{ArrowDown}{Enter}"); // docs
    await waitFor(() => expect(crumbs()).toEqual(["/", "home", "a", "docs"]));
    await runAction(user, "core.flatten");
    await waitDone();
    expect(tabTitles()).toEqual(["docs", "Flatten: docs"]);
    expect(entryNames("left")).toEqual(["annual-report.txt", "readme.md", "report-2026.md"]);
  });
});

describe("FIND-06 Analyze Disk Usage", () => {
  it("하위 항목별 총 크기를 내림차순으로 보여 준다(폴더도 크기와 함께, 폴더 우선 정렬 없음)", async () => {
    const backend = searchBackend();
    backend.setConfig((l) => (l.config.display.size_format = "bytes"));
    const { user } = await renderApp(backend);
    await runAction(user, "core.disk_usage");
    await waitDone();
    expect(tabTitles()).toEqual(["a", "Disk Usage: a"]);
    expect(entryNames("left")).toEqual(["big", "docs", "report.txt", "pack.zip", "src"]);
    expect(rowText(0)).toContain("1010"); // big = 1000 + 10
    expect(rowText(1)).toContain("31"); // docs = 1 + 10 + 20
    expect(statusText()).toMatch(/총 1\d+/); // 합계 1049바이트
  });

  it("스냅샷이 계속 도착하며 순서가 갱신되고 마지막에 끝난다", async () => {
    const backend = searchBackend();
    backend.searchMode = "manual";
    const { user } = await renderApp(backend);
    await runAction(user, "core.disk_usage");
    await waitFor(() => expect(statusText()).toContain("진행 중"));
    await step(backend, 2);
    await waitFor(() => expect(entryNames("left")).toEqual(["big", "docs"])); // 부분 결과
    expect(statusText()).toContain("진행 중");
    await step(backend, 10);
    await waitDone();
    expect(entryNames("left")).toEqual(["big", "docs", "report.txt", "pack.zip", "src"]);
  });

  it("아카이브 안에서도 동작한다: 압축 해제 크기 기준", async () => {
    const backend = searchBackend();
    const { user } = await renderApp(backend);
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{Enter}"); // pack.zip
    await waitFor(() => expect(crumbs()).toEqual(["/", "home", "a", "pack.zip"]));
    await runAction(user, "core.disk_usage");
    await waitDone();
    expect(backend.searchesStarted).toEqual([["usage", "/home/a/pack.zip!", ""]]);
    expect(entryNames("left")).toEqual(["data.bin", "inner"]);
    expect(rowText(0)).toContain("300");
  });

  it("인수 src로 대상을 지정한다(사용자 바인딩): 홈 기호(~)를 확장한다", async () => {
    const backend = searchBackend();
    backend.setConfig((l) => l.bindings.push({ key: "Alt+U", action: "core.disk_usage", args: { src: "~/docs" }, scope: null }));
    const { user } = await renderApp(backend);
    await user.keyboard("{Alt>}u{/Alt}");
    await waitDone();
    expect(backend.searchesStarted).toEqual([["usage", "/home/a/docs", ""]]);
    expect(entryNames("left")).toEqual(["deep", "report-2026.md", "readme.md"]);
  });
});

describe("가상 탭의 항목도 일반 항목처럼 다룬다", () => {
  async function lookupReport(backend = searchBackend()) {
    const r = await renderApp(backend);
    await r.user.keyboard(LOOKUP_GLOBAL);
    await submitQuery(r.user, "report");
    await waitDone();
    return { ...r, backend };
  }

  it("선택해서 다른 패널로 복사하면 원래 위치의 파일이 복사되고 결과는 그대로다", async () => {
    const { user, backend } = await lookupReport();
    expect(entryNames("left")).toEqual(["annual-report.txt", "report-2026.md", "report.txt"]);
    await user.keyboard("{Insert}{Insert}{F5}{Enter}"); // annual-report.txt, report-2026.md 선택 후 복사
    await waitFor(() => expect(backend.exists("/home/b/annual-report.txt")).toBe(true));
    expect(backend.exists("/home/b/report-2026.md")).toBe(true);
    expect(backend.exists("/home/a/docs/deep/annual-report.txt")).toBe(true); // 복사이므로 원본이 남는다
    expect(entryNames("left")).toEqual(["annual-report.txt", "report-2026.md", "report.txt"]);
  });

  it("이동하면 원래 위치에서 사라지고 결과에서도 빠진다", async () => {
    const { user, backend } = await lookupReport();
    await user.keyboard("{ArrowDown}{F6}{Enter}"); // report-2026.md → 오른쪽
    await waitFor(() => expect(backend.exists("/home/b/report-2026.md")).toBe(true));
    expect(backend.exists("/home/a/docs/report-2026.md")).toBe(false);
    await waitFor(() => expect(entryNames("left")).toEqual(["annual-report.txt", "report.txt"]));
  });

  it("영구 삭제는 확인 뒤 원래 위치에서 지우고 결과에서도 빠진다", async () => {
    const { user, backend } = await lookupReport();
    await user.keyboard("{ArrowDown}{ArrowDown}{Shift>}{F8}{/Shift}"); // report.txt
    await screen.findByRole("dialog");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(backend.exists("/home/a/report.txt")).toBe(false));
    await waitFor(() => expect(entryNames("left")).toEqual(["annual-report.txt", "report-2026.md"]));
  });

  it("휴지통(F8)도 원래 위치에 적용된다", async () => {
    const { user, backend } = await lookupReport();
    await user.keyboard("{F8}"); // annual-report.txt
    await waitFor(() => expect(backend.trashed).toEqual(["/home/a/docs/deep/annual-report.txt"]));
    await waitFor(() => expect(entryNames("left")).toEqual(["report-2026.md", "report.txt"]));
  });

  it("이름 변경은 원래 파일의 이름을 바꾸고 결과 항목도 새 이름으로 바뀐다", async () => {
    const { user, backend } = await lookupReport();
    await user.keyboard("{ArrowDown}{ArrowDown}{Shift>}{F6}{/Shift}"); // report.txt
    await screen.findByRole("dialog");
    await user.keyboard("{Control>}a{/Control}final.txt{Enter}");
    await waitFor(() => expect(backend.exists("/home/a/final.txt")).toBe(true));
    expect(backend.exists("/home/a/report.txt")).toBe(false);
    await waitFor(() => expect(entryNames("left")).toContain("final.txt"));
    expect(entryNames("left")).not.toContain("report.txt");
  });

  it("파일에서 Return: 그 파일이 있는 폴더를 새 탭으로 열고 커서를 그 파일에 둔다", async () => {
    const { user } = await lookupReport();
    await user.keyboard("{ArrowDown}{Enter}"); // report-2026.md
    await waitFor(() => expect(tabTitles()).toEqual(["a", "Look Up: report", "docs"]));
    expect(crumbs()).toEqual(["/", "home", "a", "docs"]);
    expect(cursorName("left")).toBe("report-2026.md");
    // 결과 탭은 그대로 남아 있다
    await user.keyboard("{Control>}{PageUp}{/Control}");
    expect(activeTabTitle()).toBe("Look Up: report");
    expect(entryNames("left")).toHaveLength(3);
  });

  it("해당 폴더로 이동 액션(core.reveal_in_tab)도 같다", async () => {
    const { user } = await lookupReport();
    await runAction(user, "core.reveal_in_tab");
    await waitFor(() => expect(tabTitles()).toEqual(["a", "Look Up: report", "deep"]));
    expect(cursorName("left")).toBe("annual-report.txt");
  });

  it("폴더 결과에서 Return: 그 폴더로 들어가며 결과 탭은 일반 탭이 된다", async () => {
    const backend = searchBackend();
    const { user } = await renderApp(backend);
    await user.keyboard(LOOKUP_GLOBAL);
    await submitQuery(user, "deep");
    await waitDone();
    expect(entryNames("left")).toEqual(["deep"]);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(tabTitles()).toEqual(["a", "deep"]));
    expect(crumbs()).toEqual(["/", "home", "a", "docs", "deep"]);
    expect(entryNames("left")).toEqual(["annual-report.txt"]);
  });
});

describe("가상 탭에서 하지 못하는 일은 안내한다", () => {
  it("결과 탭에는 새로 만들 수 없다", async () => {
    const { user } = await renderApp(searchBackend());
    await user.keyboard(LOOKUP_GLOBAL);
    await submitQuery(user, "report");
    await waitDone();
    await user.keyboard("{F7}");
    expect(await screen.findByRole("alert")).toHaveTextContent("새로 만들 수 없습니다");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("반대편 패널이 결과 탭이면 복사·이동의 대상이 될 수 없다", async () => {
    const backend = searchBackend();
    const { user } = await renderApp(backend);
    await user.keyboard("{Tab}"); // 오른쪽 패널에서 Look Up
    await user.keyboard(LOOKUP_GLOBAL);
    await submitQuery(user, "report");
    await waitDone();
    await user.keyboard("{Tab}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{F5}"); // 왼쪽 report.txt 복사 시도
    expect(await screen.findByRole("alert")).toHaveTextContent("대상이 될 수 없습니다");
    expect(backend.exists("/home/b/report.txt")).toBe(false);
  });

  it("실행 중 오류가 나면(시작 실패) 탭을 만들지 않고 알린다", async () => {
    const backend = searchBackend();
    backend.startFlatten = async () => {
      throw new BackendError("시작할 수 없음");
    };
    const { user } = await renderApp(backend);
    await runAction(user, "core.flatten");
    expect(await screen.findByRole("alert")).toHaveTextContent("시작할 수 없음");
    expect(tabTitles()).toEqual(["a"]);
  });
});
