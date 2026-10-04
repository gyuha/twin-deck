import { within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { list, renderApp, NFD } from "./helpers";
import { quickMatchRange } from "../lib/names";

const seed = () =>
  new FakeBackend().seed({
    "/home/a/report-final.txt": "1",
    "/home/a/final-report.md": "2",
    "/home/a/notes.txt": "3",
    [`/home/a/${NFD("한글 문서.txt")}`]: "4",
  });
const row = (name: string) => within(list("left")).getAllByRole("option").find((o) => o.textContent?.normalize("NFC").includes(name))!;
const marks = (el: Element) => [...el.querySelectorAll("[data-quick-match]")].map((m) => m.textContent);

describe("빠른 선택: 일치한 글자 강조", () => {
  it("입력한 글자와 일치한 부분을 칠하고, 일치하지 않는 행은 그대로 둔다", async () => {
    const { user } = await renderApp(seed());
    expect(marks(list("left"))).toEqual([]); // 입력 전에는 칠하지 않는다
    await user.keyboard("repo");
    expect(marks(row("report-final"))).toEqual(["repo"]);
    expect(marks(row("final-report"))).toEqual(["repo"]);
    expect(marks(row("notes"))).toEqual([]);
    expect(row("final-report").textContent).toContain("final-report.md"); // 글자는 그대로다
  });

  it("대소문자를 무시하고 원래 대소문자 그대로 칠한다", async () => {
    const b = new FakeBackend().seed({ "/home/a/README.md": "1" });
    const { user } = await renderApp(b);
    await user.keyboard("read");
    expect(marks(row("README"))).toEqual(["READ"]);
  });

  it("NFD로 저장된 한글 이름도 NFC 입력에 칠해진다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("한글");
    expect(marks(row("한글 문서"))).toEqual(["한글"]);
  });

  it("글자를 지우면 칠한 범위가 줄고 Esc로 끝나면 모두 사라진다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("repo");
    await user.keyboard("{Backspace}");
    expect(marks(row("report-final"))).toEqual(["rep"]);
    await user.keyboard("{Escape}");
    expect(marks(list("left"))).toEqual([]);
  });
});

describe("quickMatchRange", () => {
  it("부분 일치는 첫 위치를, 접두 일치는 맨 앞만 돌려준다", () => {
    expect(quickMatchRange("my-report.txt", "report")).toEqual([3, 9]);
    expect(quickMatchRange("my-report.txt", "report", true)).toBeNull();
    expect(quickMatchRange("report.txt", "REP", true)).toEqual([0, 3]);
  });

  it("빈 입력이나 일치하지 않으면 null", () => {
    expect(quickMatchRange("a.txt", "")).toBeNull();
    expect(quickMatchRange("a.txt", "zzz")).toBeNull();
  });

  it("NFD 이름은 NFC 기준 위치를 돌려준다", () => {
    expect(quickMatchRange(NFD("한글.txt"), "글")).toEqual([1, 2]);
  });
});
