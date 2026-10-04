import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { entryNames, renderApp } from "./helpers";

// 이름순: a.txt b.txt c.md
const seed = () => new FakeBackend().seed({ "/home/a/a.txt": "a", "/home/a/b.txt": "b", "/home/a/c.md": "c", "/home/b": null });
const dlg = () => screen.findByRole("dialog", { name: "다중 이름 바꾸기 도구" });
const rows = (d: HTMLElement) => within(within(d).getByRole("table")).getAllByRole("row").slice(1);
const cells = (d: HTMLElement) => rows(d).map((r) => within(r).getAllByRole("cell").map((c) => c.firstChild?.textContent ?? ""));
const newNames = (d: HTMLElement) => cells(d).map((c) => c[1]);
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const openFor = async (b: FakeBackend, selectKeys = "{Insert}{Insert}") => {
  const r = await renderApp(b);
  await r.user.keyboard(selectKeys);
  await r.user.keyboard("{Shift>}{F6}{/Shift}");
  return { ...r, d: await dlg() };
};
const renameBtn = () => screen.getByRole("button", { name: "이름 바꾸기" });

describe("다중 이름 바꾸기 도구", () => {
  it("2개 이상 선택하고 Shift+F6을 누르면 열리고 표에 이전/새 이름과 경로가 나온다", async () => {
    const { d } = await openFor(seed());
    expect(cells(d)).toEqual([
      ["a.txt", "a.txt", "/home/a"],
      ["b.txt", "b.txt", "/home/a"],
    ]);
  });

  it("선택이 없으면 기존 단일 이름 변경 창이 열린다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{Shift>}{F6}{/Shift}");
    expect(await screen.findByRole("dialog", { name: "이름 변경" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "다중 이름 바꾸기 도구" })).toBeNull();
  });

  it("입력하면 새 이름이 실시간으로 바뀐다(확장자 마스크·카운터·찾기/바꾸기)", async () => {
    const { d } = await openFor(seed());
    type("확장자 마스크", "ts");
    expect(newNames(d)).toEqual(["a.ts", "b.ts"]);
    type("파일 이름 마스크", "file_[C]");
    type("너비", "3");
    expect(newNames(d)).toEqual(["file_001.ts", "file_002.ts"]);
    type("파일 이름 마스크", "[N]");
    type("확장자 마스크", "[E]");
    type("찾기", "b");
    type("바꾸기", "X");
    expect(newNames(d)).toEqual(["a.txt", "X.txt"]);
  });

  it("이름 바꾸기 버튼이 실제로 이름을 바꾸고 창을 닫고 목록을 갱신한다", async () => {
    const b = seed();
    const { user, d } = await openFor(b);
    type("확장자 마스크", "ts");
    await user.click(within(d).getByRole("button", { name: "이름 바꾸기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(b.exists("/home/a/a.ts")).toBe(true);
    expect(b.exists("/home/a/b.ts")).toBe(true);
    expect(b.exists("/home/a/a.txt")).toBe(false);
    expect(b.exists("/home/a/c.md")).toBe(true); // 선택하지 않은 항목은 그대로
    await waitFor(() => expect(entryNames("left")).toEqual(["a.ts", "b.ts", "c.md"]));
  });

  it("Enter도 이름 바꾸기를 실행한다", async () => {
    const b = seed();
    const { user } = await openFor(b);
    type("확장자 마스크", "ts");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(b.exists("/home/a/a.ts")).toBe(true));
  });

  it("맞바꾸기(a↔b)는 임시 이름을 거쳐 처리한다", async () => {
    const b = new FakeBackend().seed({ "/home/a/1.txt": "one", "/home/a/2.txt": "two", "/home/b": null });
    const { user, d } = await openFor(b);
    type("파일 이름 마스크", "[C]");
    type("시작 번호", "2");
    type("간격", "-1");
    expect(newNames(d)).toEqual(["2.txt", "1.txt"]);
    expect(within(d).queryAllByRole("alert")).toHaveLength(0); // 맞바꾸기는 오류가 아니다
    await user.click(within(d).getByRole("button", { name: "이름 바꾸기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(b.read("/home/a/1.txt")).toBe("two");
    expect(b.read("/home/a/2.txt")).toBe("one");
    expect(entryNames("left")).toEqual(["1.txt", "2.txt"]);
  });

  it("새 이름이 겹치면 행에 오류가 보이고 버튼이 비활성이며 실행되지 않는다", async () => {
    const b = seed();
    const { user, d } = await openFor(b);
    type("파일 이름 마스크", "same");
    type("확장자 마스크", "txt");
    expect(within(d).getAllByRole("alert").map((a) => a.textContent)).toEqual([" — 새 이름이 겹칩니다", " — 새 이름이 겹칩니다"]);
    expect(renameBtn()).toBeDisabled();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "다중 이름 바꾸기 도구" })).toBeTruthy(); // 닫히지 않는다
    expect(b.exists("/home/a/a.txt")).toBe(true);
  });

  it("폴더 안 다른 파일과 겹치면 오류다", async () => {
    const { d } = await openFor(seed());
    type("찾기", "a");
    type("바꾸기", "c");
    type("확장자 마스크", "md"); // a.txt → c.md (이미 있음)
    expect(within(d).getAllByRole("alert")[0]).toHaveTextContent("같은 이름의 파일이 이미 있습니다");
    expect(renameBtn()).toBeDisabled();
  });

  it("바뀌는 이름이 없으면 이름 바꾸기가 비활성이다", async () => {
    await openFor(seed());
    expect(renameBtn()).toBeDisabled();
  });

  it("일부 항목이 실패하면 나머지는 바꾸고 실패 항목과 이유를 알린다", async () => {
    const b = seed();
    const orig = b.rename.bind(b);
    b.rename = async (path: string, name: string) => {
      if (path.endsWith("b.txt")) throw new Error("권한 없음");
      return orig(path, name);
    };
    const { user, d } = await openFor(b);
    type("확장자 마스크", "ts");
    await user.click(within(d).getByRole("button", { name: "이름 바꾸기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("1개 변경, 1개 실패 — b.txt: 권한 없음");
    expect(b.exists("/home/a/a.ts")).toBe(true);
    expect(b.exists("/home/a/b.txt")).toBe(true);
  });

  it("모두 재설정은 입력을 기본값으로 되돌린다", async () => {
    const { user, d } = await openFor(seed());
    type("확장자 마스크", "ts");
    type("찾기", "a");
    expect(newNames(d)).not.toEqual(["a.txt", "b.txt"]);
    await user.click(screen.getByRole("button", { name: "모두 재설정" }));
    expect(newNames(d)).toEqual(["a.txt", "b.txt"]);
    expect(screen.getByLabelText("확장자 마스크")).toHaveValue("[E]");
    expect(screen.getByLabelText("찾기")).toHaveValue("");
  });

  it("닫기와 Esc는 아무것도 바꾸지 않고 닫는다", async () => {
    const b = seed();
    const { user, d } = await openFor(b);
    type("확장자 마스크", "ts");
    await user.click(within(d).getByRole("button", { name: "닫기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(b.exists("/home/a/a.txt")).toBe(true);
    await user.keyboard("{Shift>}{F6}{/Shift}");
    await dlg();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(b.exists("/home/a/a.txt")).toBe(true);
  });

  it("도움말 버튼이 토큰 도움말을 보여 주고 다시 누르면 표로 돌아간다", async () => {
    const { user, d } = await openFor(seed());
    expect(within(d).queryByRole("region", { name: "마스크 도움말" })).toBeNull();
    await user.click(within(d).getByRole("button", { name: "도움말" }));
    const help = within(d).getByRole("region", { name: "마스크 도움말" });
    for (const tok of ["[N]", "[Nx:y]", "[A]", "[P]", "[C]", "[Y]"]) expect(within(help).getByText(tok)).toBeTruthy();
    expect(help).toHaveTextContent("1부터 세고");
    expect(within(d).getByRole("button", { name: "도움말 닫기" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(d).getByRole("button", { name: "도움말 닫기" }));
    expect(within(d).queryByRole("region", { name: "마스크 도움말" })).toBeNull();
    expect(rows(d)).toHaveLength(2);
  });

  it("도움말을 열어 둔 채로도 입력하면 새 이름이 계산되고, 닫으면 반영돼 있다", async () => {
    const { user, d } = await openFor(seed());
    await user.click(within(d).getByRole("button", { name: "도움말" }));
    type("파일 이름 마스크", "[N1]_[C]");
    await user.click(within(d).getByRole("button", { name: "도움말 닫기" }));
    expect(newNames(d)).toEqual(["a_1.txt", "b_2.txt"]);
  });

  it("컨텍스트 메뉴의 이름 바꾸기도 여러 항목이면 다중 도구를 연다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{Insert}{Insert}");
    const rowsEls = screen.getAllByRole("option");
    fireEvent.contextMenu(rowsEls[0], { clientX: 5, clientY: 5 }); // 선택 안의 행 → 선택 유지
    await user.click(await screen.findByRole("menuitem", { name: /^이름 바꾸기/ }));
    expect(await dlg()).toBeTruthy();
  });
});

describe("다중 이름 바꾸기 단축키와 F2", () => {
  it("2개 이상 선택하고 Ctrl+Shift+R을 누르면 다중 이름 바꾸기 도구가 열린다", async () => {
    const r = await renderApp(seed());
    await r.user.keyboard("{Insert}{Insert}");
    await r.user.keyboard("{Control>}{Shift>}r{/Shift}{/Control}");
    expect(await dlg()).toBeTruthy();
  });

  it("macOS에서는 Cmd+Shift+R이다", async () => {
    const r = await renderApp(seed(), "mac");
    await r.user.keyboard("{Insert}{Insert}");
    await r.user.keyboard("{Meta>}{Shift>}r{/Shift}{/Meta}");
    expect(await dlg()).toBeTruthy();
  });

  it("선택이 2개 미만이면 Ctrl+Shift+R은 아무 일도 하지 않는다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{Control>}{Shift>}r{/Shift}{/Control}");
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.keyboard("{Insert}"); // 1개
    await user.keyboard("{Control>}{Shift>}r{/Shift}{/Control}");
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("F2는 이름 변경이다: 선택이 없으면 단일 이름 변경 창, 2개 이상이면 다중 이름 바꾸기", async () => {
    const one = await renderApp(seed());
    await one.user.keyboard("{F2}");
    expect(await screen.findByRole("dialog", { name: "이름 변경" })).toBeTruthy();
  });

  it("F2로 2개 이상 선택했을 때는 다중 이름 바꾸기 도구가 열린다", async () => {
    const r = await renderApp(seed());
    await r.user.keyboard("{Insert}{Insert}{F2}");
    expect(await dlg()).toBeTruthy();
  });

  it("도움말에 다중 이름 바꾸기 단축키가 보인다", async () => {
    const r = await renderApp(seed());
    await r.user.keyboard("{F1}");
    const help = await screen.findByRole("dialog", { name: "도움말" });
    const row = within(help).getByText("다중 이름 바꾸기").parentElement;
    expect(row?.textContent).toBe("Ctrl+Shift+R:다중 이름 바꾸기");
  });
});
