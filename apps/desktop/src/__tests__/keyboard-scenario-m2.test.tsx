import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { cursorName, entryNames, list, renderApp, selectedNames } from "./helpers";

/**
 * M2 성공 기준 종단 시나리오. 마우스 없이 키보드만으로:
 * 볼륨 메뉴로 이동 → Go To Path → 정렬 → 패턴으로 선택 → 큐로 복사(일시정지/재개) → Actions Panel로 복제
 * → 미리보기 → 상태 저장까지 이어간다. 이 파일에는 마우스 조작이 없어야 한다.
 */
const crumbs = () =>
  within(screen.getAllByRole("navigation", { name: "경로" })[0]).getAllByRole("button").map((b) => b.textContent);
const jobRows = () => within(screen.getByRole("listbox", { name: "작업 목록" })).getAllByRole("option");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("M2 키보드 전용 종단 시나리오", () => {
  it("볼륨 → 경로 이동 → 정렬 → 패턴 선택 → 큐 복사 → Actions Panel 복제 → 미리보기 → 상태 저장", async () => {
    const backend = new FakeBackend().seed({
      "/home/a/docs/readme.md": "r",
      "/home/a/src/main.rs": "m",
      "/home/a/a.txt": "aaa",
      "/home/a/b.md": "bbbbb",
      "/home/a/c.zip": "c",
      "/home/a/d.txt": "0123456789",
      "/Volumes/USB/backup.iso": "iso",
      "/home/b": null,
    });
    backend.queueMode = "manual";
    backend.setConfig((l) => l.bindings.push({ key: "F9", action: "core.select.group", args: {}, scope: null }));
    const { user } = await renderApp(backend, "linux", { left: "/home/a/src", right: "/home/b" });
    const advance = () => act(async () => void (await backend.advance()));

    // 1) Alt+1: 볼륨 메뉴에서 USB를 골라 들어간다
    await user.keyboard("{Alt>}1{/Alt}");
    await screen.findByRole("dialog", { name: "볼륨" });
    await user.keyboard("{ArrowDown}{Enter}");
    await waitFor(() => expect(crumbs()).toEqual(["/", "Volumes", "USB"]));
    expect(entryNames("left")).toEqual(["backup.iso"]);

    // 2) Ctrl+G: 경로를 입력해 이동한다 (열릴 때 현재 경로가 선택되어 있어 바로 덮어쓴다)
    await user.keyboard("{Control>}g{/Control}");
    await screen.findByRole("dialog", { name: "경로로 이동" });
    await user.keyboard("/home/a{Enter}");
    await waitFor(() => expect(crumbs()).toEqual(["/", "home", "a"]));

    // 3) 크기 정렬: Alt+Shift+S 두 번 → 오름차순 뒤 내림차순
    await user.keyboard("{Alt>}{Shift>}s{/Shift}{/Alt}");
    await waitFor(() => expect(entryNames("left")).toEqual(["docs", "src", "c.zip", "a.txt", "b.md", "d.txt"]));
    await user.keyboard("{Alt>}{Shift>}s{/Shift}{/Alt}");
    await waitFor(() => expect(entryNames("left")).toEqual(["docs", "src", "d.txt", "b.md", "a.txt", "c.zip"]));

    // 4) F9(Select Group): *.txt 패턴으로 a.txt, d.txt 선택
    await user.keyboard("{F9}");
    await screen.findByRole("dialog", { name: "패턴으로 선택" });
    await user.keyboard("*.txt{Enter}");
    await waitFor(() => expect(selectedNames("left")).toEqual(["d.txt", "a.txt"]));

    // 5) F5: 비활성 패널로 복사 → 큐. 일시정지 중에는 진행하지 않고 재개하면 끝난다
    await user.keyboard("{F5}");
    await waitFor(() => expect(screen.getByRole("status", { name: "작업 큐 진행" })).toHaveTextContent("0/2"));
    await user.keyboard("=");
    await screen.findByRole("dialog", { name: "작업 큐" });
    expect(jobRows()[0]).toHaveTextContent("복사 0/2");
    await advance();
    await waitFor(() => expect(jobRows()[0]).toHaveTextContent("복사 1/2"));
    expect(backend.exists("/home/b/d.txt")).toBe(true);
    expect(backend.exists("/home/b/a.txt")).toBe(false);
    await user.keyboard("p");
    await waitFor(() => expect(jobRows()[0]).toHaveTextContent("일시정지"));
    expect(await backend.advance()).toBe(false);
    expect(backend.exists("/home/b/a.txt")).toBe(false);
    await user.keyboard("p");
    await advance();
    await waitFor(() => expect(jobRows()[0]).toHaveTextContent("완료"));
    expect(backend.exists("/home/b/a.txt")).toBe(true);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "작업 큐" })).toBeNull());
    expect(selectedNames("left")).toEqual([]); // 복사를 시작하면 선택이 풀린다

    // 6) Actions Panel: 이름으로 찾아 복제 (커서 항목 docs)
    expect(cursorName("left")).toBe("docs");
    await user.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");
    await screen.findByRole("dialog", { name: "Actions Panel" });
    await user.keyboard("core.duplicate{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Actions Panel" })).toBeNull());
    await advance();
    await waitFor(() => expect(backend.exists("/home/a/docs copy/readme.md")).toBe(true));
    await waitFor(() => expect(entryNames("left")).toContain("docs copy"));

    // 7) Space: 미리보기 (d.txt의 내용), Esc로 닫는다
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(cursorName("left")).toBe("d.txt");
    await user.keyboard(" ");
    const preview = await screen.findByRole("dialog", { name: "미리보기: d.txt" });
    expect(within(preview).getByLabelText("텍스트 미리보기")).toHaveTextContent("0123456789");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: /미리보기/ })).toBeNull();

    // 8) 상태가 저장되어 있다: 위치, 정렬, 커서
    await waitFor(() => expect(backend.savedStates.at(-1)?.left.tabs[0].cursorName).toBe("d.txt"), { timeout: 3000 });
    const saved = backend.savedStates.at(-1)!;
    expect(saved.left.tabs[0]).toMatchObject({ path: "/home/a", sort: { key: "size", dir: "desc" } });
    expect(list("left").getAttribute("aria-rowcount")).toBe("7"); // 복제한 폴더까지
    await sleep(0);
  });
});
