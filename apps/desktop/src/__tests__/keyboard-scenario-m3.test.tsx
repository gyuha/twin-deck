import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { cursorName, entryNames, renderApp } from "./helpers";
import { crumbs, runAction, searchBackend, statusText, submitQuery, tabTitles, waitDone } from "./search-helpers";

/**
 * M3 종단 시나리오 — 키보드만 쓴다(마우스 조작 없음).
 * zip 열기 → 안의 파일을 로컬로 복사 → 로컬 파일을 zip에 추가 → Look Up으로 찾기 → 가상 탭에서 복사 →
 * Disk Usage → 압축/추출. 백엔드는 인메모리 `FakeBackend`다(실제 zip 동작은 Rust 테스트가 외부 도구로 검증한다).
 */
describe("M3 키보드 종단 시나리오", () => {
  it("아카이브 열기·복사, Look Up, 가상 탭 복사, Disk Usage, 압축/추출", async () => {
    const backend = searchBackend();
    const { user } = await renderApp(backend);
    // /home/a: big, docs, src, pack.zip, report.txt  |  /home/b: x.txt
    expect(entryNames("left")).toEqual(["big", "docs", "src", "pack.zip", "report.txt"]);

    // 1) zip을 폴더처럼 열고(Enter), 안의 폴더로 들어가 파일을 반대편 패널로 복사(F5)
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{Enter}");
    await waitFor(() => expect(crumbs()).toEqual(["/", "home", "a", "pack.zip"]));
    expect(entryNames("left")).toEqual(["inner", "data.bin"]);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(entryNames("left")).toEqual(["report-in-zip.txt"]));
    await user.keyboard("{F5}{Enter}");
    await waitFor(() => expect(backend.exists("/home/b/report-in-zip.txt")).toBe(true));
    expect(backend.read("/home/b/report-in-zip.txt")).toBe("zzzzzzz");
    expect(backend.exists("/home/a/pack.zip!/inner/report-in-zip.txt")).toBe(true); // 복사이므로 원본이 남는다

    // 2) 반대편의 로컬 파일을 zip 안으로 복사한다
    await user.keyboard("{Tab}");
    await waitFor(() => expect(entryNames("right")).toEqual(["report-in-zip.txt", "x.txt"]));
    await user.keyboard("{ArrowDown}{F5}{Enter}"); // x.txt → 왼쪽(zip 안 inner)
    await waitFor(() => expect(backend.exists("/home/a/pack.zip!/inner/x.txt")).toBe(true));
    expect(backend.read("/home/a/pack.zip!/inner/x.txt")).toBe("xxx");
    await user.keyboard("{Tab}");

    // 3) 상위로 나와 zip 밖으로: 커서는 방금 나온 아카이브에 놓인다
    await user.keyboard("{Backspace}{Backspace}");
    await waitFor(() => expect(crumbs()).toEqual(["/", "home", "a"]));
    expect(cursorName("left")).toBe("pack.zip");

    // 4) Look Up(전역): 결과는 가상 탭에 스트리밍되고, 거기서 선택한 항목을 반대편으로 복사한다
    await user.keyboard("{Control>}p{/Control}");
    await submitQuery(user, "report");
    await waitDone();
    expect(tabTitles()).toEqual(["a", "Look Up: report"]);
    expect(entryNames("left")).toEqual(["annual-report.txt", "report-2026.md", "report.txt"]);
    await user.keyboard("{F5}{Enter}"); // 커서: annual-report.txt
    await waitFor(() => expect(backend.exists("/home/b/annual-report.txt")).toBe(true));
    expect(backend.exists("/home/a/docs/deep/annual-report.txt")).toBe(true);
    await user.keyboard("{Control>}w{/Control}"); // 결과 탭을 닫으면 결과를 버린다
    await waitFor(() => expect(tabTitles()).toEqual(["a"]));

    // 5) Disk Usage: 하위 항목별 크기, 큰 순서
    await runAction(user, "core.disk_usage");
    await waitDone();
    expect(entryNames("left")).toEqual(["big", "docs", "report.txt", "pack.zip", "src"]);
    expect(statusText()).toContain("Disk Usage: a");
    await user.keyboard("{Control>}w{/Control}");
    await waitFor(() => expect(tabTitles()).toEqual(["a"]));

    // 6) 압축(docs 폴더) → 같은 폴더의 docs.zip, 다시 추출 → 옆의 새 폴더(이름이 겹쳐 번호가 붙는다)
    expect(cursorName("left")).toBe("pack.zip"); // 탭을 닫아도 원래 탭의 커서는 그대로다
    await user.keyboard("{Home}{ArrowDown}"); // docs
    expect(cursorName("left")).toBe("docs");
    await runAction(user, "core.compress");
    await waitFor(() => expect(backend.exists("/home/a/docs.zip")).toBe(true));
    await waitFor(() => expect(entryNames("left")).toContain("docs.zip"));
    expect(backend.exists("/home/a/docs/readme.md")).toBe(true); // 원본 유지
    await user.keyboard("{ArrowDown}{ArrowDown}"); // 목록: big, docs, src, docs.zip, pack.zip, report.txt → docs에서 두 칸 아래
    expect(cursorName("left")).toBe("docs.zip");
    await runAction(user, "core.extract");
    await waitFor(() => expect(backend.exists("/home/a/docs (1)/docs/readme.md")).toBe(true));
    expect(backend.exists("/home/a/docs.zip")).toBe(true); // 아카이브 유지
    expect(screen.queryByRole("alert")).toBeNull(); // 시나리오 내내 오류 없음
  });
});
