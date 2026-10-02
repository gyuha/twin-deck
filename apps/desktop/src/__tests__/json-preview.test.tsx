import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";

async function open(files: Record<string, string>, name: string) {
  const { user } = await renderApp(new FakeBackend().seed({ ...files, "/home/b": null }));
  await user.keyboard("{ArrowRight}");
  return within(await screen.findByRole("dialog", { name: `미리보기: ${name}` }));
}
const kinds = (el: HTMLElement) =>
  [...el.querySelectorAll("[data-json]")].map((n) => `${n.getAttribute("data-json")}:${n.textContent}`);

describe("JSON 미리보기", () => {
  it("키·문자열·숫자·불리언·null을 구분해 칠하고 원문 텍스트는 그대로 둔다", async () => {
    const src = '{"a": "x", "n": -1.5e3, "t": true, "z": null}';
    const dlg = await open({ "/home/a/d.json": src }, "d.json");
    const view = dlg.getByLabelText("JSON 미리보기");
    expect(view.textContent).toBe(src);
    expect(kinds(view)).toEqual([
      'key:"a"', 'string:"x"', 'key:"n"', "literal:-1.5e3", 'key:"t"', "literal:true", 'key:"z"', "literal:null",
    ]);
    const cls = (t: string) => [...view.querySelectorAll("span")].find((n) => n.textContent === t)?.className;
    expect(new Set([cls('"a"'), cls('"x"'), cls("-1.5e3"), cls("true"), cls("null")]).size).toBe(5);
  });

  it("문자열 안의 따옴표·콜론·숫자는 토큰으로 쪼개지 않는다", async () => {
    const src = '{"k": "a \\"q\\": 12 true"}';
    const view = (await open({ "/home/a/d.json": src }, "d.json")).getByLabelText("JSON 미리보기");
    expect(view.textContent).toBe(src);
    expect(kinds(view)).toEqual(['key:"k"', 'string:"a \\"q\\": 12 true"']);
  });

  it("64KB에서 잘린 JSON도 칠하고 잘림 안내를 남긴다", async () => {
    const src = `[${'{"id": 1, "ok": true},'.repeat(10_000)}`;
    const dlg = await open({ "/home/a/big.json": src }, "big.json");
    expect(kinds(dlg.getByLabelText("JSON 미리보기")).length).toBeGreaterThan(100);
    expect(dlg.getByText(/앞부분만 표시합니다/)).toBeTruthy();
  });

  it(".json이 아닌 텍스트는 기존 <pre> 그대로다", async () => {
    const dlg = await open({ "/home/a/d.txt": '{"a": 1}' }, "d.txt");
    expect(dlg.getByLabelText("텍스트 미리보기").querySelector("[data-json]")).toBeNull();
  });
});
