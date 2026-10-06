import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp, seedBackend } from "./helpers";

const menu = (name: string) => screen.findByRole("dialog", { name });
const options = (d: HTMLElement) => within(d).queryAllByRole("option").map((o) => o.textContent?.replace(/^\d?/, "").trim());
const crumbs = () =>
  within(screen.getAllByRole("navigation", { name: "경로" })[0])
    .getAllByRole("button")
    .map((b) => b.textContent);
const selected = (d: HTMLElement) => within(d).getAllByRole("option").find((o) => o.getAttribute("aria-selected") === "true")?.textContent?.replace(/^\d?/, "").trim();
const filterBox = (d: HTMLElement) => within(d).getByRole("textbox", { name: "필터" });

// 이력: /home/a → docs → a → src → lib. 지금 위치는 /home/a/src/lib.
// 최근순 목록: /home/a/src, /home/a, /home/a/docs
async function openRecent() {
  const b = seedBackend().seed({ "/home/a/src/lib/x.rs": "x" });
  const { user: u } = await renderApp(b);
  await u.keyboard("{Enter}"); // docs
  await waitFor(() => expect(crumbs()).toEqual(["/", "home", "a", "docs"]));
  await u.keyboard("{Backspace}");
  await waitFor(() => expect(crumbs()).toEqual(["/", "home", "a"]));
  await u.keyboard("{ArrowDown}{Enter}"); // src
  await waitFor(() => expect(crumbs()).toEqual(["/", "home", "a", "src"]));
  await u.keyboard("{Enter}"); // lib
  await waitFor(() => expect(crumbs()).toEqual(["/", "home", "a", "src", "lib"]));
  await u.keyboard("{Alt>}3{/Alt}");
  return { user: u, d: await menu("최근 위치") };
}

describe("최근 위치 메뉴 입력 필터", () => {
  it("열면 전체가 최근순으로 보이고, 글자를 입력하면 경로에 포함된 항목만 남는다", async () => {
    const { user, d } = await openRecent();
    expect(options(d)).toEqual(["/home/a/src", "/home/a", "/home/a/docs"]);
    await user.keyboard("doc");
    expect(filterBox(d)).toHaveValue("doc");
    expect(options(d)).toEqual(["/home/a/docs"]);
  });

  it("대소문자를 가리지 않고, 입력할 때마다 목록이 다시 걸러진다", async () => {
    const { user, d } = await openRecent();
    await user.keyboard("SRC");
    expect(options(d)).toEqual(["/home/a/src"]);
    await user.keyboard("{Backspace}{Backspace}{Backspace}");
    expect(options(d)).toEqual(["/home/a/src", "/home/a", "/home/a/docs"]);
  });

  it("필터 뒤 Return은 보이는 커서 항목으로 이동한다", async () => {
    const { user, d } = await openRecent();
    await user.keyboard("doc{Enter}");
    await waitFor(() => expect(crumbs()).toEqual(["/", "home", "a", "docs"]));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("↑↓는 보이는 항목 사이를 움직인다", async () => {
    const { user, d } = await openRecent();
    await user.keyboard("/home/a");
    expect(options(d)).toEqual(["/home/a/src", "/home/a", "/home/a/docs"]);
    expect(selected(d)).toBe("/home/a/src");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(selected(d)).toBe("/home/a/docs");
    await user.keyboard("{ArrowUp}");
    expect(selected(d)).toBe("/home/a");
  });

  it("Esc는 필터가 있으면 필터부터 비우고, 없으면 메뉴를 닫는다", async () => {
    const { user, d } = await openRecent();
    await user.keyboard("doc{Escape}");
    expect(filterBox(d)).toHaveValue("");
    expect(options(d)).toEqual(["/home/a/src", "/home/a", "/home/a/docs"]);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("일치하는 항목이 없으면 안내 문구를 보인다", async () => {
    const { user, d } = await openRecent();
    await user.keyboard("zzz");
    expect(options(d)).toEqual([]);
    expect(within(d).getByText("일치하는 항목 없음")).toBeInTheDocument();
  });

  it("Alt+숫자는 보이는 항목 기준 n번째로 이동한다", async () => {
    const { user } = await openRecent();
    await user.keyboard("a/");
    // "a/" 일치: /home/a/src, /home/a/docs → 2번째는 docs
    await user.keyboard("{Alt>}2{/Alt}");
    await waitFor(() => expect(crumbs()).toEqual(["/", "home", "a", "docs"]));
  });

  it("글자 c·u·e는 필터로 들어가고 비우기나 다른 동작을 일으키지 않는다", async () => {
    const { user, d } = await openRecent();
    await user.keyboard("cue");
    expect(filterBox(d)).toHaveValue("cue");
    expect(within(d).getByText("일치하는 항목 없음")).toBeInTheDocument();
    await user.keyboard("{Backspace}{Backspace}{Backspace}");
    expect(options(d)).toEqual(["/home/a/src", "/home/a", "/home/a/docs"]); // 비워지지 않았다
  });

  it("Ctrl+Backspace는 최근 위치를 비운다", async () => {
    const { user, d } = await openRecent();
    await user.keyboard("{Control>}{Backspace}{/Control}");
    expect(within(d).getByText("항목 없음")).toBeInTheDocument();
  });

  it("안내 문구가 새 키를 알려 준다", async () => {
    const { user, d } = await openRecent();
    expect(within(d).getByText(/입력 필터/)).toHaveTextContent("Alt+숫자");
    expect(within(d).getByText(/입력 필터/)).toHaveTextContent("Ctrl+Backspace 비우기");
  });
});

describe("다른 팝업 메뉴는 필터가 없다", () => {
  it("즐겨찾기 팝업은 필터 입력창이 없고 숫자키로 바로 고른다", async () => {
    const b = seedBackend();
    b.setConfig((l) => {
      l.config.favorites = [{ kind: "item", name: "소스", path: "/home/a/src" } as never];
    });
    const { user } = await renderApp(b);
    await user.keyboard("{Alt>}2{/Alt}");
    const d = await menu("즐겨찾기");
    expect(within(d).queryByRole("textbox", { name: "필터" })).toBeNull();
    await user.keyboard("1");
    await waitFor(() => expect(crumbs()).toEqual(["/", "home", "a", "src"]));
  });
});
