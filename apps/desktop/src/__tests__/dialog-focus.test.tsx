import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import type { DialogState } from "../state/store";
import { renderApp } from "./helpers";

// 이슈 #41: 확인·선택 다이얼로그가 열리면 기본 버튼에 포커스가 가 있고, ←/→로 버튼 사이를 옮긴다. Return은 포커스된 버튼을 실행한다.
const focused = () => document.activeElement as HTMLElement;
const focusedName = () => focused().textContent;
const seed = () => new FakeBackend().seed({ "/home/a/x.txt": "x", "/home/a/y.txt": "y", "/home/b": null });
const dlg = (name: string | RegExp) => screen.findByRole("dialog", { name });

/** 다이얼로그 종류를 전부 나열한다. 종류가 늘면 여기가 컴파일 오류가 되어 이 점검을 잊지 않게 한다. */
const KINDS: Record<DialogState["kind"], "button" | "input"> = {
  name: "input",
  multirename: "input",
  confirm: "button",
  choice: "button",
  conflict: "button",
  info: "button",
  progress: "button",
};

describe("다이얼로그가 열릴 때의 포커스 (이슈 #41)", () => {
  it("종류 목록이 7가지 전부를 다룬다", () => {
    expect(Object.keys(KINDS).sort()).toEqual(["choice", "confirm", "conflict", "info", "multirename", "name", "progress"]);
  });

  it("confirm(영구 삭제 확인): 확인 버튼에 포커스", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{Shift>}{F8}{/Shift}");
    const d = await dlg(/영구 삭제/);
    await waitFor(() => expect(focused()).toBe(within(d).getByRole("button", { name: "확인" })));
  });

  it("info(파일 정보): 확인 버튼에 포커스", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{Control>}i{/Control}");
    const d = await dlg(/정보/);
    await waitFor(() => expect(focused()).toBe(within(d).getByRole("button", { name: "확인" })));
  });

  it("choice(저장하지 않은 변경): 확인 버튼에 포커스, ↑/↓는 선택", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{ArrowRight}");
    const p = within(await dlg(/미리보기: x\.txt/));
    await user.dblClick(await p.findByText("x"));
    const box = await p.findByRole("textbox", { name: "텍스트 편집" });
    await user.type(box, "y");
    fireEvent.keyDown(box, { key: "Escape" });
    const d = await dlg("저장하지 않은 변경");
    await waitFor(() => expect(focused()).toBe(within(d).getByRole("button", { name: "확인" })));
    const sel = () => within(d).getAllByRole("radio").findIndex((r) => r.getAttribute("aria-checked") === "true");
    expect(sel()).toBe(0);
    await user.keyboard("{ArrowDown}");
    expect(sel()).toBe(1);
    await user.keyboard("{ArrowUp}");
    expect(sel()).toBe(0);
    await user.keyboard("{ArrowRight}"); // ←/→는 선택이 아니라 버튼 포커스
    expect(sel()).toBe(0);
    expect(focusedName()).toBe("확인"); // 확인이 마지막 버튼이라 끝에서 멈춘다
    await user.keyboard("{ArrowLeft}");
    expect(focusedName()).toBe("취소");
  });

  it("conflict(이름 충돌): 확인 버튼에 포커스, O/S/R·↑↓ 선택은 그대로", async () => {
    const b = seed().seed({ "/home/b/x.txt": "already" });
    const { user } = await renderApp(b);
    await user.keyboard("{F5}");
    await user.keyboard("{Enter}");
    const d = await dlg(/이름이 겹칩니다/);
    await waitFor(() => expect(focused()).toBe(within(d).getByRole("button", { name: "확인" })));
    const sel = () => within(d).getAllByRole("radio").findIndex((r) => r.getAttribute("aria-checked") === "true");
    const start = sel();
    await user.keyboard("{ArrowUp}");
    expect(sel()).toBe(Math.max(0, start - 1));
    await user.keyboard("{ArrowRight}");
    expect(sel()).toBe(Math.max(0, start - 1)); // ←/→는 선택을 바꾸지 않는다
    await user.keyboard("s"); // 건너뛰기로 바로 확정
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(b.read("/home/b/x.txt")).toBe("already");
  });

  it("progress(전송 진행): 기본 버튼(백그라운드)에 포커스", async () => {
    const b = seed();
    b.queueMode = "manual";
    const { user } = await renderApp(b);
    await user.keyboard("{F5}{Enter}");
    const d = await dlg(/중/);
    await waitFor(() => expect(focused()).toBe(within(d).getByRole("button", { name: "백그라운드" })));
    expect(Array.from(d.querySelectorAll("[data-dialog-buttons] button")).map((x) => x.textContent)).toEqual(["백그라운드", "중단"]);
  });

  it("name(새 폴더)과 multirename: 입력칸이 포커스를 유지한다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{F7}");
    const d = await dlg("새 폴더");
    await waitFor(() => expect(focused()).toBe(within(d).getByRole("textbox")));
    await user.type(focused(), "새것");
    expect((focused() as HTMLInputElement).value).toContain("새것");
    await user.keyboard("{Escape}");
    await user.keyboard("{Control>}a{/Control}{Control>}{Shift>}r{/Shift}{Control>}");
    const m = await dlg(/다중 이름 바꾸기/);
    expect(m.contains(focused()) && focused().tagName === "BUTTON" && focusedName() === "이름 바꾸기").toBe(false);
  });
});

describe("←/→와 Return (영구 삭제 확인으로 확인)", () => {
  it("←로 취소에 포커스를 옮기고 Return하면 취소가 실행되어 파일이 남는다", async () => {
    const b = seed();
    const { user } = await renderApp(b);
    await user.keyboard("{Shift>}{F8}{/Shift}");
    const d = await dlg(/영구 삭제/);
    await waitFor(() => expect(focusedName()).toBe("확인"));
    await user.keyboard("{ArrowLeft}");
    expect(focused()).toBe(within(d).getByRole("button", { name: "취소" }));
    await user.keyboard("{ArrowLeft}");
    expect(focusedName()).toBe("취소"); // 끝에서 멈춘다
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(b.exists("/home/a/x.txt")).toBe(true);
  });

  it("→로 확인에 돌아와 Return하면 확인이 실행되어 지워진다", async () => {
    const b = seed();
    const { user } = await renderApp(b);
    await user.keyboard("{Shift>}{F8}{/Shift}");
    await dlg(/영구 삭제/);
    await user.keyboard("{ArrowLeft}{ArrowRight}");
    expect(focusedName()).toBe("확인");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(b.exists("/home/a/x.txt")).toBe(false));
  });

  it("처음부터 Return만 눌러도 확인이 실행된다(기본 포커스)", async () => {
    const b = seed();
    const { user } = await renderApp(b);
    await user.keyboard("{Shift>}{F8}{/Shift}");
    await dlg(/영구 삭제/);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(b.exists("/home/a/x.txt")).toBe(false));
  });

  it("Esc는 어느 버튼에 포커스가 있어도 취소다", async () => {
    const b = seed();
    const { user } = await renderApp(b);
    await user.keyboard("{Shift>}{F8}{/Shift}");
    await dlg(/영구 삭제/);
    await user.keyboard("{ArrowLeft}{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(b.exists("/home/a/x.txt")).toBe(true);
  });
});

describe("도움말", () => {
  it("열리면 닫기 버튼에 포커스가 가고 Return으로 닫힌다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{F1}");
    const d = await dlg("도움말");
    await waitFor(() => expect(focused()).toBe(within(d).getByRole("button", { name: "닫기" })));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "도움말" })).toBeNull());
  });
});

describe("파일 찾기(입력칸 포커스·Return 시작은 그대로)", () => {
  it("열리면 입력칸에 포커스가 간다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{Control>}f{/Control}");
    const d = await dlg("파일 찾기");
    await waitFor(() => expect(d.contains(focused()) && focused().tagName === "INPUT").toBe(true));
  });
});
