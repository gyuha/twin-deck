import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Loaded } from "@twin-deck/ts-client";
import { FakeBackend } from "@twin-deck/ts-client";
import { cursorName, entryNames, renderApp, seedBackend } from "./helpers";

type Change = (l: Loaded) => void;

/** 시작 전에 설정을 바꿔 둔 백엔드. */
function withConfig(change: Change) {
  const b = seedBackend();
  b.setConfig(change);
  return b;
}
const bind = (key: string, action: string | null, args: Record<string, string> = {}, scope: string | null = null) => ({
  key,
  action,
  args,
  scope,
});
const status = () => screen.getByRole("status", { name: "상태 표시줄" });
const exists = (b: FakeBackend, p: string) => b.exists(p);

describe("설정 경고 표시", () => {
  it("경고가 있으면 상태 표시줄에 개수가 보이고 열면 목록이 나온다", async () => {
    const b = withConfig((l) => {
      l.warnings.push({ file: "config.toml", message: "알 수 없는 키를 무시합니다: mystery", line: null });
      l.warnings.push({ file: "keybindings.toml", message: "TOML 문법 오류: 잘못된 값", line: 3 });
    });
    const { user } = await renderApp(b);
    const button = await screen.findByRole("button", { name: /설정 경고 2개/ });
    await user.click(button);
    const dialog = await screen.findByRole("dialog", { name: "설정 경고 2개" });
    expect(dialog).toHaveTextContent("config.toml: 알 수 없는 키를 무시합니다: mystery");
    expect(dialog).toHaveTextContent("keybindings.toml:3: TOML 문법 오류");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("경고가 없으면 표시가 없다", async () => {
    await renderApp();
    expect(within(status()).queryByRole("button", { name: /설정 경고/ })).toBeNull();
  });

  it("존재하지 않는 액션이나 잘못된 키 바인딩은 경고로 나오고 앱은 동작한다", async () => {
    const b = withConfig((l) => {
      l.bindings.push(bind("F9", "nope.action"), bind("Hyper+X", "core.copy"));
    });
    const { user } = await renderApp(b);
    expect(await screen.findByRole("button", { name: /설정 경고 2개/ })).toBeInTheDocument();
    await user.keyboard("{ArrowDown}{ArrowDown}{F5}");
    await waitFor(() => expect(exists(b, "/home/b/a.txt")).toBe(true));
  });

  it("extend 모드는 아직 지원하지 않는다고 경고한다", async () => {
    const b = withConfig((l) => {
      l.config.behavior.selection.shift_mode = "extend";
    });
    await renderApp(b);
    expect(await screen.findByRole("button", { name: /설정 경고 1개/ })).toBeInTheDocument();
  });
});

describe("CFG-02 키바인딩 설정", () => {
  it("none으로 기본 바인딩을 해제한다", async () => {
    const b = withConfig((l) => l.bindings.push(bind("F5", null)));
    const { user } = await renderApp(b);
    await user.keyboard("{ArrowDown}{ArrowDown}{F5}");
    await new Promise((r) => setTimeout(r, 50));
    expect(exists(b, "/home/b/a.txt")).toBe(false);
    expect((await b.queueJobs()).length).toBe(0);
    await user.keyboard("{F6}"); // 다른 키는 그대로
    await waitFor(() => expect(exists(b, "/home/b/a.txt")).toBe(true));
  });

  it("다른 액션으로 다시 바인딩한다", async () => {
    const b = withConfig((l) => l.bindings.push(bind("F5", "core.move")));
    const { user } = await renderApp(b);
    await user.keyboard("{ArrowDown}{ArrowDown}{F5}");
    await waitFor(() => expect(exists(b, "/home/b/a.txt")).toBe(true));
    expect(exists(b, "/home/a/a.txt")).toBe(false); // 복사가 아니라 이동
  });

  it("설정 파일이 바뀌면 실행 중에도 새 키맵이 적용된다", async () => {
    const b = seedBackend();
    const { user } = await renderApp(b);
    await act(async () => b.setConfig((l) => l.bindings.push(bind("F5", null))));
    await user.keyboard("{ArrowDown}{ArrowDown}{F5}");
    await new Promise((r) => setTimeout(r, 50));
    expect(exists(b, "/home/b/a.txt")).toBe(false);
    await act(async () => b.setConfig((l) => (l.bindings = [])));
    await user.keyboard("{F5}");
    await waitFor(() => expect(exists(b, "/home/b/a.txt")).toBe(true));
  });
});

describe("OP-13 삭제/휴지통 확인 설정", () => {
  it("core.confirm.delete = false 이면 확인 없이 영구 삭제한다", async () => {
    const b = withConfig((l) => (l.config.core.confirm.delete = false));
    const { user } = await renderApp(b);
    await user.keyboard("{ArrowDown}{ArrowDown}{Shift>}{F8}{/Shift}");
    await waitFor(() => expect(exists(b, "/home/a/a.txt")).toBe(false));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(b.trashed).toEqual([]);
  });

  it("core.confirm.trash = true 이면 휴지통 이동 전에 확인한다", async () => {
    const b = withConfig((l) => (l.config.core.confirm.trash = true));
    const { user } = await renderApp(b);
    await user.keyboard("{ArrowDown}{ArrowDown}{F8}");
    const dialog = await screen.findByRole("dialog", { name: /휴지통/ });
    expect(dialog).toHaveTextContent("a.txt");
    await user.keyboard("{Escape}");
    expect(b.trashed).toEqual([]);
    await user.keyboard("{F8}");
    await screen.findByRole("dialog", { name: /휴지통/ });
    await user.keyboard("{Enter}");
    await waitFor(() => expect(b.trashed).toEqual(["/home/a/a.txt"]));
  });

  it("기본값: 영구 삭제만 확인한다", async () => {
    const { user, backend } = await renderApp();
    await user.keyboard("{ArrowDown}{ArrowDown}{F8}");
    await waitFor(() => expect(backend.trashed).toEqual(["/home/a/a.txt"]));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("NAV-06 표시/선택 옵션", () => {
  it("circular_selection: 끝에서 처음으로 순환한다", async () => {
    const b = withConfig((l) => (l.config.behavior.table.circular_selection = true));
    const { user } = await renderApp(b);
    await user.keyboard("{ArrowUp}");
    expect(cursorName("left").normalize("NFC")).toBe("한글.txt"); // 처음에서 위로 → 끝
    await user.keyboard("{ArrowDown}");
    expect(cursorName("left")).toBe("docs");
  });

  it("기본값: 끝에서 멈춘다", async () => {
    const { user } = await renderApp();
    await user.keyboard("{ArrowUp}");
    expect(cursorName("left")).toBe("docs");
  });

  it("quick_select.match_only_prefix: 접두 일치만 허용한다", async () => {
    const b = withConfig((l) => (l.config.behavior.quick_select.match_only_prefix = true));
    const { user } = await renderApp(b);
    await user.keyboard("txt"); // 부분 일치라면 a.txt로 가지만 접두 일치라 가지 않는다
    expect(cursorName("left")).toBe("docs");
    await user.keyboard("{Escape}b.");
    expect(cursorName("left")).toBe("b.txt");
  });

  it("activate_on_any_character = false: 문자 입력만으로는 시작하지 않고 Mod+F로 시작한다", async () => {
    const b = withConfig((l) => (l.config.behavior.quick_select.activate_on_any_character = false));
    const { user } = await renderApp(b);
    await user.keyboard("b");
    expect(screen.queryByRole("status", { name: "빠른 선택" })).toBeNull();
    expect(cursorName("left")).toBe("docs");
    await user.keyboard("{Control>}f{/Control}b");
    expect(screen.getByRole("status", { name: "빠른 선택" })).toHaveTextContent("b");
    expect(cursorName("left")).toBe("b.txt");
  });

  it("right_click_select: 오른쪽 클릭으로 선택을 토글한다", async () => {
    const b = withConfig((l) => (l.config.behavior.table.right_click_select = true));
    const { user } = await renderApp(b);
    const rows = screen.getAllByRole("option", { name: /a\.txt/ });
    await user.pointer({ keys: "[MouseRight]", target: rows[0] });
    await waitFor(() => expect(rows[0]).toHaveAttribute("aria-selected", "true"));
    await user.pointer({ keys: "[MouseRight]", target: rows[0] });
    await waitFor(() => expect(rows[0]).toHaveAttribute("aria-selected", "false"));
  });

  it("right_click_select 기본값(꺼짐)이면 오른쪽 클릭은 선택하지 않는다", async () => {
    const { user } = await renderApp();
    const row = screen.getAllByRole("option", { name: /a\.txt/ })[0];
    await user.pointer({ keys: "[MouseRight]", target: row });
    expect(row).toHaveAttribute("aria-selected", "false");
    expect(entryNames("left")).toContain("a.txt");
  });
});
