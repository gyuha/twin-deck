import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Loaded } from "@twin-deck/ts-client";
import { FakeBackend } from "@twin-deck/ts-client";
import { cursorName, entryNames, renderApp, selectedNames } from "./helpers";

const bind = (key: string, action: string) => ({ key, action, args: {}, scope: null });
const T = new Date(2026, 5, 15, 12, 30, 0).getTime();

function seed(change: (l: Loaded) => void = () => {}) {
  const b = new FakeBackend().seed({
    "/home/a/docs/readme.md": "r",
    "/home/a/src/main.rs": "m",
    "/home/a/a.txt": "aaa",
    "/home/a/b.md": "bbbbb",
    "/home/a/c.TXT": "c",
    "/home/a/d.rs": "d",
    "/home/b": null,
  });
  b.setTimes("/home/a/a.txt", { modifiedMs: T, createdMs: T });
  b.setConfig((l) => {
    l.config.display.date_format = "%Y-%m-%d";
    l.config.display.time_format = "%H:%M";
    change(l);
  });
  return b;
}
const dialog = (name: string | RegExp) => screen.findByRole("dialog", { name });

describe("SEL-03 선택 반전", () => {
  it("선택 반전은 모든 항목의 선택 상태를 뒤집는다", async () => {
    const b = seed((l) => l.bindings.push(bind("F9", "core.select.invert")));
    const { user } = await renderApp(b);
    await user.keyboard("{ArrowDown}{ArrowDown}{Insert}"); // a.txt 선택
    expect(selectedNames("left")).toEqual(["a.txt"]);
    await user.keyboard("{F9}");
    expect(selectedNames("left")).toEqual(["docs", "src", "b.md", "c.TXT", "d.rs"]);
    await user.keyboard("{F9}");
    expect(selectedNames("left")).toEqual(["a.txt"]);
  });

  it("현재 항목 반전은 커서를 움직이지 않는다", async () => {
    const b = seed((l) => l.bindings.push(bind("F9", "core.select.invert_current")));
    const { user } = await renderApp(b);
    await user.keyboard("{ArrowDown}{F9}");
    expect(selectedNames("left")).toEqual(["src"]);
    expect(cursorName("left")).toBe("src");
    await user.keyboard("{F9}");
    expect(selectedNames("left")).toEqual([]);
  });
});

describe("SEL-04 Select/Deselect Group", () => {
  const groupBindings = (l: Loaded) => l.bindings.push(bind("F9", "core.select.group"), bind("F10", "core.deselect.group"));

  it("glob 패턴으로 선택하고 다른 패턴으로 선택 해제한다", async () => {
    const { user } = await renderApp(seed(groupBindings));
    await user.keyboard("{F9}");
    await dialog("패턴으로 선택");
    expect(screen.getByRole("textbox", { name: "이름" })).toHaveValue("*");
    await user.keyboard("*.txt{Enter}"); // 대소문자 무시: a.txt, c.TXT
    await waitFor(() => expect(selectedNames("left")).toEqual(["a.txt", "c.TXT"]));

    await user.keyboard("{F9}");
    await dialog("패턴으로 선택");
    await user.keyboard("[[b-d].*{Enter}"); // b.md, c.TXT, d.rs 추가
    await waitFor(() => expect(selectedNames("left")).toEqual(["a.txt", "b.md", "c.TXT", "d.rs"]));

    await user.keyboard("{F10}");
    await dialog("패턴으로 선택 해제");
    await user.keyboard("*.txt{Enter}");
    await waitFor(() => expect(selectedNames("left")).toEqual(["b.md", "d.rs"]));
  });

  it("일치하는 항목이 없으면 알리고 선택은 그대로다. Esc는 취소", async () => {
    const { user } = await renderApp(seed(groupBindings));
    await user.keyboard("{F9}");
    await dialog("패턴으로 선택");
    await user.keyboard("*.zip{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("일치하는 항목이 없습니다");
    expect(selectedNames("left")).toEqual([]);
    await user.keyboard("{F9}");
    await dialog("패턴으로 선택");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("OP-08 복제", () => {
  it("Mod+D로 같은 폴더에 접미사를 붙여 복사한다 (여러 번, 폴더 포함)", async () => {
    const b = seed();
    const { user } = await renderApp(b);
    await user.keyboard("{ArrowDown}{ArrowDown}"); // a.txt
    await user.keyboard("{Control>}d{/Control}");
    await waitFor(() => expect(b.exists("/home/a/a copy.txt")).toBe(true));
    await user.keyboard("{Control>}d{/Control}");
    await waitFor(() => expect(b.exists("/home/a/a copy 2.txt")).toBe(true));
    expect(b.read("/home/a/a copy 2.txt")).toBe("aaa");
    expect(b.exists("/home/a/a.txt")).toBe(true);

    await user.keyboard("{Home}{Control>}d{/Control}"); // docs 폴더
    await waitFor(() => expect(b.exists("/home/a/docs copy/readme.md")).toBe(true));
    await waitFor(() => expect(entryNames("left")).toContain("a copy 2.txt"));
  });
});

describe("OP-10 대화상자 없이 비활성 패널로", () => {
  it("copy.to_inactive / move.to_inactive", async () => {
    const b = seed((l) => l.bindings.push(bind("F9", "core.copy.to_inactive"), bind("F10", "core.move.to_inactive")));
    const { user } = await renderApp(b);
    await user.keyboard("{ArrowDown}{ArrowDown}{F9}");
    await waitFor(() => expect(b.exists("/home/b/a.txt")).toBe(true));
    expect(b.exists("/home/a/a.txt")).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.keyboard("{ArrowDown}{F10}"); // b.md 이동
    await waitFor(() => expect(b.exists("/home/b/b.md")).toBe(true));
    expect(b.exists("/home/a/b.md")).toBe(false);
  });
});

describe("OP-14 파일 정보", () => {
  it("Mod+I: 파일의 이름/경로/종류/크기/시각/권한을 보여 준다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{ArrowDown}{ArrowDown}{Control>}i{/Control}");
    const d = await dialog("정보: a.txt");
    for (const line of [
      "이름: a.txt",
      "경로: /home/a/a.txt",
      "종류: 파일",
      "크기: 3 B (3 B)",
      "생성: 2026-06-15 12:30",
      "수정: 2026-06-15 12:30",
      "권한: rw-r--r-- (644)",
    ]) {
      expect(d, line).toHaveTextContent(line);
    }
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("폴더는 항목 수를 보여 준다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{Control>}i{/Control}");
    const d = await dialog("정보: docs");
    expect(d).toHaveTextContent("종류: 폴더");
    expect(d).toHaveTextContent("항목 수: 1");
    expect(d).toHaveTextContent("권한: rwxr-xr-x (755)");
  });

  it("빈 폴더에서는 열리지 않는다 (ACT-02)", async () => {
    const b = seed();
    const { user } = await renderApp(b, "linux", { left: "/home/b", right: "/home/a" }, { emptyLeft: true });
    await user.keyboard("{Control>}i{/Control}");
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("OP-15 경로 복사", () => {
  it("F12는 현재 폴더 경로, Mod+F12는 대상 파일 경로들을 클립보드로", async () => {
    const b = seed();
    const { user } = await renderApp(b);
    await user.keyboard("{F12}");
    await waitFor(() => expect(b.clipboard).toEqual(["/home/a"]));
    expect(await screen.findByText(/폴더 경로를 복사했습니다/)).toBeInTheDocument();

    await user.keyboard("{ArrowDown}{ArrowDown}{Insert}{Insert}"); // a.txt, b.md 선택 (선택 토글은 선택 후 한 칸 내려간다)
    await user.keyboard("{Control>}{F12}{/Control}");
    await waitFor(() => expect(b.clipboard.at(-1)).toBe("/home/a/a.txt\n/home/a/b.md"));

    await user.keyboard("{Escape}{Control>}{F12}{/Control}"); // 선택 없음 → 커서 항목
    await waitFor(() => expect(b.clipboard.at(-1)).toBe("/home/a/c.TXT"));
  });
});

describe("OP-16 파일 관리자에서 보기", () => {
  it("커서 항목을 보여 주고, 빈 폴더면 현재 폴더를 보여 준다", async () => {
    const b = seed((l) => l.bindings.push(bind("F9", "core.reveal")));
    const { user } = await renderApp(b);
    await user.keyboard("{ArrowDown}{ArrowDown}{F9}");
    await waitFor(() => expect(b.revealed).toEqual(["/home/a/a.txt"]));
  });
  it("빈 폴더에서는 그 폴더 자체", async () => {
    const b = seed((l) => l.bindings.push(bind("F9", "core.reveal")));
    const { user } = await renderApp(b, "linux", { left: "/home/b", right: "/home/a" }, { emptyLeft: true });
    await user.keyboard("{F9}");
    await waitFor(() => expect(b.revealed).toEqual(["/home/b"]));
  });
});

describe("OP-09 편집 / 폴더 편집", () => {
  it("F4는 대상 항목을, Shift+F4는 현재 폴더를 설정한 편집기로 연다", async () => {
    const b = seed((l) => (l.config.environment.text_editor = "code"));
    const { user } = await renderApp(b);
    await user.keyboard("{ArrowDown}{ArrowDown}{Insert}{Insert}{F4}"); // a.txt, b.md 선택
    await waitFor(() => expect(b.edited).toEqual([["/home/a/a.txt", "/home/a/b.md"]]));
    await user.keyboard("{Shift>}{F4}{/Shift}");
    await waitFor(() => expect(b.edited.at(-1)).toEqual(["/home/a"]));
  });

  it("편집기가 설정되지 않았으면 안내 오류를 보여 준다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{ArrowDown}{ArrowDown}{F4}");
    expect(await screen.findByRole("alert")).toHaveTextContent("text_editor");
    const status = screen.getByRole("status", { name: "상태 표시줄" });
    expect(within(status).getByRole("alert")).toBeInTheDocument();
  });
});

describe("ACT-02: 대상이 없는 폴더", () => {
  it("빈 폴더에서는 복제/편집/경로 복사가 실행되지 않는다", async () => {
    const b = seed((l) => (l.config.environment.text_editor = "code"));
    const { user } = await renderApp(b, "linux", { left: "/home/b", right: "/home/a" }, { emptyLeft: true });
    await user.keyboard("{Control>}d{/Control}{F4}{Control>}{F12}{/Control}");
    await new Promise((r) => setTimeout(r, 30));
    expect(b.edited).toEqual([]);
    expect(b.clipboard).toEqual([]);
    expect((await b.queueJobs()).length).toBe(0);
  });
});
