import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { activePane, cursorName, entryNames, names, renderApp } from "./helpers";

/**
 * 성공 기준: 마우스 없이 "폴더 이동 → 파일 선택 → 비활성 패널로 복사/이동 → 이름 변경 → 삭제"를 끝낸다.
 * 이 파일에는 마우스 조작이 없어야 한다.
 */
describe("키보드 전용 종단 시나리오", () => {
  it("폴더 이동 → 선택 → 복사 → 이동(충돌) → 이름 변경 → 휴지통 → 영구 삭제", async () => {
    const backend = new FakeBackend().seed({
      "/home/a/docs/notes.md": "notes",
      "/home/a/docs/readme.md": "readme",
      "/home/b": null,
    });
    const { user } = await renderApp(backend);
    await waitFor(() => expect(names("left")).toHaveLength(1));

    // 1) 폴더 이동: docs로 들어간다
    await user.keyboard("{Enter}");
    await waitFor(() => expect(names("left").some((n) => n.includes("notes.md"))).toBe(true));

    // 2) 파일 선택: Insert로 두 파일을 고른다
    await user.keyboard("{Insert}");
    await user.keyboard("{Insert}");
    expect(screen.getByRole("status", { name: "상태 표시줄" })).toHaveTextContent("선택 2개");

    // 3) F5: 비활성 패널(/home/b)로 복사
    await user.keyboard("{F5}");
    await waitFor(() => expect(backend.exists("/home/b/readme.md")).toBe(true));
    expect(backend.exists("/home/b/notes.md")).toBe(true);
    expect(backend.exists("/home/a/docs/readme.md")).toBe(true); // 원본 유지
    expect(screen.getByRole("status", { name: "상태 표시줄" })).toHaveTextContent("선택 0개");

    // 4) F6: readme.md를 이동 → 같은 이름이 있어 충돌 다이얼로그 → R(이름 바꿈)
    expect(cursorName("left")).toBe("readme.md");
    await user.keyboard("{F6}");
    expect(await screen.findByRole("dialog")).toHaveTextContent("/home/b/readme.md");
    await user.keyboard("r");
    await waitFor(() => expect(backend.exists("/home/b/readme (1).md")).toBe(true));
    expect(backend.exists("/home/a/docs/readme.md")).toBe(false);

    // 5) Tab으로 비활성 패널로 전환, Shift+F6으로 이름 변경
    await user.keyboard("{Tab}");
    expect(activePane()).toBe("right");
    await waitFor(() => expect(names("right")).toHaveLength(3));
    await user.keyboard("{ArrowDown}"); // notes.md → readme (1).md
    expect(cursorName("right")).toBe("readme (1).md");
    await user.keyboard("{Shift>}{F6}{/Shift}");
    await screen.findByRole("dialog");
    await user.keyboard("renamed{Enter}"); // 확장자 앞부분만 선택되어 있으므로 renamed.md
    await waitFor(() => expect(backend.exists("/home/b/renamed.md")).toBe(true));
    expect(backend.exists("/home/b/readme (1).md")).toBe(false);

    // 6) F8: 휴지통으로
    expect(cursorName("right")).toBe("renamed.md");
    await user.keyboard("{F8}");
    await waitFor(() => expect(backend.trashed).toEqual(["/home/b/renamed.md"]));
    expect(backend.exists("/home/b/renamed.md")).toBe(false);

    // 7) Shift+F8: 영구 삭제(확인 후)
    await user.keyboard("{Home}");
    expect(cursorName("right")).toBe("notes.md");
    await user.keyboard("{Shift>}{F8}{/Shift}");
    await screen.findByRole("dialog");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(backend.exists("/home/b/notes.md")).toBe(false));

    // 최종 상태
    expect(entryNames("right")).toEqual(["readme.md"]);
    expect(backend.exists("/home/a/docs/notes.md")).toBe(true);
    expect(backend.exists("/home/b/readme.md")).toBe(true);
    expect(backend.trashed).toHaveLength(1);
  });
});
