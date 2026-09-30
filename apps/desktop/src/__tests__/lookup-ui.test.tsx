import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BackendError } from "@twin-deck/ts-client";
import { entryNames, renderApp } from "./helpers";
import { activeTabTitle, crumbs, searchBackend, statusText, step, submitQuery, tabTitles, waitDone, warningTexts } from "./search-helpers";

const LOOKUP_GLOBAL = "{Control>}p{/Control}";
const LOOKUP_FOLDER = "{Control>}{Alt>}p{/Alt}{/Control}";

describe("FIND-01 Look Up 다이얼로그와 범위", () => {
  it("Mod+P: 전역(홈 아래) 질의를 입력하면 새 가상 탭에 결과가 나온다", async () => {
    const backend = searchBackend();
    const { user } = await renderApp(backend);
    await user.keyboard(LOOKUP_GLOBAL);
    const dialog = await screen.findByRole("dialog", { name: "Look Up (전역: 홈 아래)" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "질의" })).toHaveFocus();
    await submitQuery(user, "report");
    await waitDone();

    expect(backend.searchesStarted).toEqual([["lookup", "/home/a", "report"]]);
    expect(tabTitles()).toEqual(["a", "Look Up: report"]);
    expect(activeTabTitle()).toBe("Look Up: report");
    // 결과는 모두 도착한 뒤 이름순으로 정렬된다. 아카이브(pack.zip) 안은 전역 검색이 들어가지 않는다.
    expect(entryNames("left")).toEqual(["annual-report.txt", "report-2026.md", "report.txt"]);
    expect(statusText()).toContain("3개");
    expect(statusText()).toContain("완료");
  });

  it("Mod+Alt+P: 현재 폴더 아래로 범위를 좁힌다", async () => {
    const backend = searchBackend();
    const { user } = await renderApp(backend);
    await user.keyboard("{ArrowDown}{Enter}"); // docs
    await waitFor(() => expect(crumbs()).toEqual(["/", "home", "a", "docs"]));
    await user.keyboard(LOOKUP_FOLDER);
    await screen.findByRole("dialog", { name: "Look Up (현재 폴더 아래)" });
    await submitQuery(user, "report");
    await waitDone();
    expect(backend.searchesStarted).toEqual([["lookup", "/home/a/docs", "report"]]);
    expect(entryNames("left")).toEqual(["annual-report.txt", "report-2026.md"]);
  });

  it("아카이브 안에서의 현재 폴더 Look Up은 그 아카이브 안만 찾는다", async () => {
    const backend = searchBackend();
    const { user } = await renderApp(backend);
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{Enter}"); // big, docs, src, pack.zip → 아카이브 열기
    await waitFor(() => expect(crumbs()).toEqual(["/", "home", "a", "pack.zip"]));
    await user.keyboard(LOOKUP_FOLDER);
    await submitQuery(user, "report");
    await waitDone();
    expect(entryNames("left")).toEqual(["report-in-zip.txt"]);
    expect(backend.searchesStarted).toEqual([["lookup", "/home/a/pack.zip!", "report"]]);
  });

  it("Esc로 다이얼로그를 닫으면 검색하지 않고 탭도 만들지 않는다", async () => {
    const backend = searchBackend();
    const { user } = await renderApp(backend);
    await user.keyboard(LOOKUP_GLOBAL);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(backend.searchesStarted).toEqual([]);
    expect(tabTitles()).toEqual(["a"]);
  });

  it("빈 질의는 다이얼로그에서 막힌다", async () => {
    const { user } = await renderApp(searchBackend());
    await user.keyboard(LOOKUP_GLOBAL);
    await screen.findByRole("dialog");
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("입력하세요");
    expect(tabTitles()).toEqual(["a"]);
  });

  it("질의 오류(문법 오류)는 알림으로 보이고 탭을 만들지 않는다", async () => {
    const backend = searchBackend();
    backend.startLookup = async () => {
      throw new BackendError("`contains` 뒤에 인수가 없습니다 (위치 13)");
    };
    const { user } = await renderApp(backend);
    await user.keyboard(LOOKUP_GLOBAL);
    await submitQuery(user, "Name contains");
    expect(await screen.findByRole("alert")).toHaveTextContent("위치 13");
    expect(tabTitles()).toEqual(["a"]);
  });
});

describe("스트리밍과 취소", () => {
  it("결과가 도착하는 대로 늘어나고 진행 중에는 취소 안내가 보인다", async () => {
    const backend = searchBackend();
    backend.searchMode = "manual";
    const { user } = await renderApp(backend);
    await user.keyboard(LOOKUP_GLOBAL);
    await submitQuery(user, "report");
    await waitFor(() => expect(tabTitles()).toEqual(["a", "Look Up: report"]));
    expect(statusText()).toContain("진행 중");
    expect(statusText()).toContain("Esc로 취소");
    expect(entryNames("left")).toEqual([]);
    expect(screen.getByText("찾는 중…")).toBeInTheDocument();

    await step(backend);
    await waitFor(() => expect(entryNames("left")).toHaveLength(1));
    await step(backend);
    await waitFor(() => expect(entryNames("left")).toHaveLength(2));
    expect(statusText()).toContain("2개");
    expect(statusText()).toContain("진행 중");

    await step(backend); // 마지막 결과 + 끝
    await waitDone();
    expect(statusText()).toContain("완료");
    expect(entryNames("left")).toEqual(["annual-report.txt", "report-2026.md", "report.txt"]); // 끝나면 정렬된다
  });

  it("Esc로 취소하면 그때까지 온 결과는 남고 더는 늘지 않는다", async () => {
    const backend = searchBackend();
    backend.searchMode = "manual";
    const { user } = await renderApp(backend);
    await user.keyboard(LOOKUP_GLOBAL);
    await submitQuery(user, "report");
    await waitFor(() => expect(statusText()).toContain("진행 중"));
    await step(backend);
    await waitFor(() => expect(entryNames("left")).toHaveLength(1));

    await user.keyboard("{Escape}");
    await waitFor(() => expect(statusText()).toContain("취소됨"));
    const kept = entryNames("left");
    expect(kept).toHaveLength(1);
    await step(backend, 3); // 이미 끝난 작업은 더 진행되지 않는다
    expect(entryNames("left")).toEqual(kept);
    expect(await backend.stepSearch()).toBe(false);
    // 끝난 탭에서 Esc는 평소처럼 선택 해제
    await user.keyboard("{Insert}");
    expect(screen.queryAllByRole("option", { selected: true })).toHaveLength(1);
    await user.keyboard("{Escape}");
    expect(screen.queryAllByRole("option", { selected: true })).toHaveLength(0);
  });

  it("선택이 있는 채로 Esc는 먼저 선택을 해제하고, 한 번 더 누르면 취소한다", async () => {
    const backend = searchBackend();
    backend.searchMode = "manual";
    const { user } = await renderApp(backend);
    await user.keyboard(LOOKUP_GLOBAL);
    await submitQuery(user, "report");
    await step(backend);
    await waitFor(() => expect(entryNames("left")).toHaveLength(1));
    await user.keyboard("{Insert}");
    await user.keyboard("{Escape}");
    expect(statusText()).toContain("진행 중");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(statusText()).toContain("취소됨"));
  });

  it("검색/분석 취소 액션(core.search.cancel)으로도 취소한다", async () => {
    const backend = searchBackend();
    backend.searchMode = "manual";
    const { user } = await renderApp(backend);
    await user.keyboard(LOOKUP_GLOBAL);
    await submitQuery(user, "report");
    await waitFor(() => expect(statusText()).toContain("진행 중"));
    await user.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");
    await screen.findByRole("dialog", { name: "Actions Panel" });
    await user.keyboard("core.search.cancel{Enter}");
    await waitFor(() => expect(statusText()).toContain("취소됨"));
  });
});

describe("FIND-03 지원하지 않는 변수", () => {
  it("오류 없이 경고를 보여 주고 결과는 비어 있다", async () => {
    const { user } = await renderApp(searchBackend());
    await user.keyboard(LOOKUP_GLOBAL);
    await submitQuery(user, "UTI is public.image");
    await waitDone();
    expect(warningTexts()).toEqual(["⚠ UTI: 이 백엔드(라이브 순회)에서 지원하지 않습니다"]);
    expect(entryNames("left")).toEqual([]);
    expect(screen.queryByRole("alert")).toBeNull(); // 오류가 아니라 경고다
    expect(statusText()).toContain("0개");
  });

  it("지원하는 질의에는 경고가 없다", async () => {
    const { user } = await renderApp(searchBackend());
    await user.keyboard(LOOKUP_GLOBAL);
    await submitQuery(user, "Name contains report");
    await waitDone();
    expect(warningTexts()).toEqual([]);
    expect(entryNames("left")).toEqual(["annual-report.txt", "report-2026.md", "report.txt"]);
  });
});
