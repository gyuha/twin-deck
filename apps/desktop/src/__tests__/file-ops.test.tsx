import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { missingHandlers } from "@twin-deck/actions";
import { allHandlers } from "../actions";
import { createAppStore } from "../state/store";
import { NFD, cursorName, names, renderApp, seedBackend } from "./helpers";

const dialog = () => screen.findByRole("dialog");

describe("모든 기본 액션이 연결되어 있다", () => {
  it("핸들러 누락이 없다", () => {
    const app = createAppStore(new FakeBackend(), "/", "/");
    expect(missingHandlers(allHandlers(app))).toEqual([]);
  });
});

describe("OP-01 새 폴더 / OP-02 새 파일", () => {
  it("F7: 중첩 경로를 만든다", async () => {
    const { user, backend } = await renderApp();
    await user.keyboard("{F7}");
    await dialog();
    await user.keyboard("sub/deep{Enter}");
    await waitFor(() => expect(backend.exists("/home/a/sub/deep")).toBe(true));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(names("left").some((n) => n.includes("sub"))).toBe(true));
  });

  it("Shift+F7: 0바이트 파일을 만든다", async () => {
    const { user, backend } = await renderApp();
    await user.keyboard("{Shift>}{F7}{/Shift}");
    await dialog();
    await user.keyboard("new.txt{Enter}");
    await waitFor(() => expect(backend.exists("/home/a/new.txt")).toBe(true));
    expect(backend.read("/home/a/new.txt")).toBe("");
  });

  it("빈 이름은 확인되지 않고 Esc로 닫힌다", async () => {
    const { user } = await renderApp();
    await user.keyboard("{F7}");
    await dialog();
    await user.keyboard("{Enter}");
    expect(await screen.findByText("이름을 입력하세요")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("이미 있는 이름은 오류를 상태 표시줄에 알린다", async () => {
    const { user } = await renderApp();
    await user.keyboard("{F7}");
    await dialog();
    await user.keyboard("docs{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("이미 존재함");
  });
});

describe("다이얼로그 스코프", () => {
  it("다이얼로그가 열려 있으면 패널 키가 무시된다", async () => {
    const { user, backend } = await renderApp();
    await user.keyboard("{F7}");
    await dialog();
    await user.keyboard("{F8}{F5}{Tab}");
    expect(backend.trashed).toEqual([]);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await user.keyboard("{Escape}");
    expect(cursorName("left")).toBe("docs");
  });
});

describe("OP-05 이름 변경", () => {
  it("Shift+F6: 확장자를 뺀 부분이 선택된 상태로 열리고 새 이름이 적용된다", async () => {
    const { user, backend } = await renderApp();
    await user.keyboard("{ArrowDown}{ArrowDown}"); // a.txt
    await user.keyboard("{Shift>}{F6}{/Shift}");
    const input = await screen.findByRole("textbox", { name: "이름" });
    expect(input).toHaveValue("a.txt");
    expect((input as HTMLInputElement).selectionStart).toBe(0);
    expect((input as HTMLInputElement).selectionEnd).toBe(1);
    await user.keyboard("zzz{Enter}");
    await waitFor(() => expect(backend.exists("/home/a/zzz.txt")).toBe(true));
    expect(backend.exists("/home/a/a.txt")).toBe(false);
    await waitFor(() => expect(cursorName("left")).toBe("zzz.txt"));
  });

  it("경로 구분자가 든 이름은 거부된다", async () => {
    const { user, backend } = await renderApp();
    await user.keyboard("{ArrowDown}{ArrowDown}{Shift>}{F6}{/Shift}");
    await dialog();
    await user.keyboard("{Control>}a{/Control}x/y{Enter}");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(backend.exists("/home/a/a.txt")).toBe(true);
  });
});

describe("OP-07 영구 삭제", () => {
  it("Esc로 취소하면 삭제되지 않고 Return으로 확정하면 삭제된다", async () => {
    const { user, backend } = await renderApp();
    await user.keyboard("{ArrowDown}{ArrowDown}"); // a.txt
    await user.keyboard("{Shift>}{F8}{/Shift}");
    await dialog();
    expect(screen.getByRole("dialog")).toHaveTextContent("a.txt");
    await user.keyboard("{Escape}");
    expect(backend.exists("/home/a/a.txt")).toBe(true);
    await user.keyboard("{Shift>}{F8}{/Shift}");
    await dialog();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(backend.exists("/home/a/a.txt")).toBe(false));
    expect(backend.trashed).toEqual([]);
  });
});

describe("OP-06 휴지통", () => {
  it("F8은 확인 없이 휴지통으로 보낸다", async () => {
    const { user, backend } = await renderApp();
    await user.keyboard("{ArrowDown}{ArrowDown}{F8}");
    await waitFor(() => expect(backend.trashed).toEqual(["/home/a/a.txt"]));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(names("left").some((n) => n.includes("a.txt"))).toBe(false));
  });

  it("선택 항목이 여러 개면 모두 보낸다", async () => {
    const { user, backend } = await renderApp();
    await user.keyboard("{ArrowDown}{ArrowDown}{Insert}{F8}"); // a.txt 선택 후 커서는 b.txt
    await waitFor(() => expect(backend.trashed).toEqual(["/home/a/a.txt"]));
  });
});

describe("OP-03/04 충돌 처리 (이름 겹침)", () => {
  const withConflict = () => seedBackend().seed({ "/home/b/a.txt": "old" });
  const onAtxt = async (kind: "{F5}" | "{F6}") => {
    const r = await renderApp(withConflict());
    await r.user.keyboard("{ArrowDown}{ArrowDown}");
    await r.user.keyboard(`${kind}{Enter}`); // 전송 확인 창을 시작하면 충돌 창이 뜬다
    await dialog();
    return r;
  };

  it("R: 이름을 바꿔 복사한다", async () => {
    const { user, backend } = await onAtxt("{F5}");
    expect(screen.getByRole("dialog")).toHaveTextContent("/home/b/a.txt");
    await user.keyboard("r");
    await waitFor(() => expect(backend.exists("/home/b/a (1).txt")).toBe(true));
    expect(backend.read("/home/b/a.txt")).toBe("old");
    expect(backend.exists("/home/a/a.txt")).toBe(true);
  });

  it("S: 건너뛴다", async () => {
    const { user, backend } = await onAtxt("{F5}");
    await user.keyboard("s");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(backend.read("/home/b/a.txt")).toBe("old");
    expect(backend.exists("/home/b/a (1).txt")).toBe(false);
  });

  it("O: 덮어쓴다 (이동이면 원본이 사라진다)", async () => {
    const { user, backend } = await onAtxt("{F6}");
    await user.keyboard("o");
    await waitFor(() => expect(backend.read("/home/b/a.txt")).toBe("aaa"));
    expect(backend.exists("/home/a/a.txt")).toBe(false);
  });

  it("방향키로 고르고 Return으로 확정한다 (기본은 이름 바꿈)", async () => {
    const { user, backend } = await onAtxt("{F5}");
    expect(screen.getByRole("radio", { checked: true })).toHaveTextContent("이름 바꿔 복사");
    await user.keyboard("{ArrowUp}{ArrowUp}{Enter}"); // rename → skip → overwrite
    await waitFor(() => expect(backend.read("/home/b/a.txt")).toBe("aaa"));
  });

  it("Esc는 남은 항목까지 모두 취소한다", async () => {
    const backend = seedBackend().seed({ "/home/b/a.txt": "old", "/home/b/b.txt": "oldb" });
    const { user } = await renderApp(backend);
    await user.keyboard("{ArrowDown}{ArrowDown}{Control>}a{/Control}{F5}{Enter}"); // 5개 전부 선택
    await dialog();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // 충돌 전에 처리된 항목(docs, src)은 그대로 복사되고, 충돌 항목과 그 뒤는 처리되지 않는다.
    expect(backend.exists("/home/b/docs/readme.md")).toBe(true);
    expect(backend.read("/home/b/a.txt")).toBe("old");
    expect(backend.read("/home/b/b.txt")).toBe("oldb");
    expect(backend.exists(`/home/b/${NFD("한글.txt")}`)).toBe(false);
  });

  it("선택한 여러 항목은 겹치는 것마다 묻고 나머지는 그대로 복사한다", async () => {
    const backend = seedBackend().seed({ "/home/b/a.txt": "old" });
    const { user } = await renderApp(backend);
    await user.keyboard("{Control>}a{/Control}{F5}{Enter}");
    await dialog();
    await user.keyboard("s"); // a.txt만 겹침 → 건너뜀
    await waitFor(() => expect(backend.exists("/home/b/b.txt")).toBe(true));
    expect(backend.exists("/home/b/docs/readme.md")).toBe(true);
    expect(backend.read("/home/b/a.txt")).toBe("old");
  });

  it("A로 '남은 항목에도 같은 선택 적용'을 켜면 다시 묻지 않는다", async () => {
    const backend = seedBackend().seed({ "/home/b/a.txt": "old", "/home/b/b.txt": "oldb" });
    const { user } = await renderApp(backend);
    await user.keyboard("{Control>}a{/Control}{F5}{Enter}");
    await dialog();
    expect(screen.getByRole("checkbox", { name: /남은 \d+개 항목에도 같은 선택 적용/ })).not.toBeChecked();
    await user.keyboard("as"); // 모두 건너뜀
    await waitFor(() => expect(backend.exists("/home/b/docs/readme.md")).toBe(true));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(backend.read("/home/b/a.txt")).toBe("old");
    expect(backend.read("/home/b/b.txt")).toBe("oldb");
  });

  it("체크 박스를 클릭하고 덮어쓰기를 고르면 겹치는 항목을 모두 덮어쓴다", async () => {
    const backend = seedBackend().seed({ "/home/b/a.txt": "old", "/home/b/b.txt": "oldb" });
    const { user } = await renderApp(backend);
    await user.keyboard("{Control>}a{/Control}{F5}{Enter}");
    await dialog();
    await user.click(screen.getByRole("checkbox", { name: /남은 \d+개 항목에도 같은 선택 적용/ }));
    await user.keyboard("o");
    await waitFor(() => expect(backend.read("/home/b/b.txt")).not.toBe("oldb"));
    expect(backend.read("/home/b/a.txt")).toBe("aaa");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("항목이 하나뿐이면 체크 박스가 없다", async () => {
    await onAtxt("{F5}");
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});

describe("외부 변경 감시", () => {
  it("다른 곳에서 파일이 생기면 목록이 갱신된다", async () => {
    const { backend } = await renderApp();
    await backend.touch("/home/a/external.txt");
    await waitFor(() => expect(names("left").some((n) => n.includes("external.txt"))).toBe(true));
  });
});
