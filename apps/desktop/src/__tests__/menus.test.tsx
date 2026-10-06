import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Loaded } from "@twin-deck/ts-client";
import { cursorName, entryNames, renderApp, seedBackend } from "./helpers";

const menu = (name: string) => screen.findByRole("dialog", { name });
const options = (d: HTMLElement) => within(d).queryAllByRole("option").map((o) => o.textContent?.replace(/^\d?/, "").trim());
const crumbs = () =>
  within(screen.getAllByRole("navigation", { name: "경로" })[0])
    .getAllByRole("button")
    .map((b) => b.textContent);
const withFavs = (change: (l: Loaded) => void) => {
  const b = seedBackend().seed({ "/Volumes/USB/file.iso": "iso", "/home/a/src/lib/x.rs": "x" });
  b.setConfig(change);
  return b;
};
const bind = (key: string, action: string) => ({ key, action, args: {}, scope: null });

describe("NAV-07 Volumes 메뉴", () => {
  it("Alt+1로 열고 방향키+Return으로 볼륨에 들어간다", async () => {
    const { user } = await renderApp(withFavs(() => {}));
    await user.keyboard("{Alt>}1{/Alt}");
    const d = await menu("볼륨");
    expect(options(d)).toEqual(["/", "USB — /Volumes/USB"]);
    expect(within(d).getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}");
    expect(within(d).getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(crumbs()).toEqual(["/", "Volumes", "USB"]));
    expect(entryNames("left")).toEqual(["file.iso"]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("숫자키로 바로 고르고 Esc는 이동 없이 닫는다", async () => {
    const { user } = await renderApp(withFavs(() => {}));
    await user.keyboard("{Alt>}1{/Alt}");
    await menu("볼륨");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(crumbs()).toEqual(["/", "home", "a"]);
    await user.keyboard("{Alt>}1{/Alt}");
    await menu("볼륨");
    await user.keyboard("1");
    await waitFor(() => expect(crumbs()).toEqual(["/"]));
    expect(entryNames("left")).toContain("home");
  });

  it("U로 언마운트하고 목록이 갱신된다. 루트는 거부된다", async () => {
    const b = withFavs(() => {});
    const { user } = await renderApp(b);
    await user.keyboard("{Alt>}1{/Alt}");
    await menu("볼륨");
    await user.keyboard("u"); // 루트
    expect(await screen.findByRole("alert")).toHaveTextContent("루트");
    expect(b.unmounted).toEqual([]);
    await user.keyboard("{ArrowDown}u");
    await waitFor(() => expect(b.unmounted).toEqual(["/Volumes/USB"]));
    const d = await menu("볼륨");
    await waitFor(() => expect(options(d)).toEqual(["/"]));
  });

  it("E로 추출한다", async () => {
    const b = withFavs(() => {});
    const { user } = await renderApp(b);
    await user.keyboard("{Alt>}1{/Alt}");
    await menu("볼륨");
    await user.keyboard("{ArrowDown}e");
    await waitFor(() => expect(b.ejected).toEqual(["/Volumes/USB"]));
  });

  it("메뉴가 열려 있으면 패널 키가 무시된다", async () => {
    const b = withFavs(() => {});
    const { user } = await renderApp(b);
    await user.keyboard("{Alt>}1{/Alt}");
    await menu("볼륨");
    await user.keyboard("{F7}{ArrowDown}{Tab}");
    expect(screen.queryByRole("dialog", { name: "새 폴더" })).toBeNull();
    expect(cursorName("left")).toBe("docs");
  });
});

describe("NAV-08 Favorites", () => {
  const favs = (l: Loaded) => {
    l.config.favorites = [
      { kind: "item", name: "Downloads", path: "${user.downloads}", items: [] },
      { kind: "separator", name: null, path: null, items: [] },
      { kind: "group", name: "Work", path: null, items: [{ name: "Src", path: "~/src" }] },
      { kind: "item", name: "Docs", path: "${user.documents}", items: [] }, // 알 수 없는 폴더 → 빠짐
    ];
  };

  it("변수를 확장하고 구분선/그룹을 보여 주며 숫자키로 이동한다", async () => {
    const { user } = await renderApp(withFavs(favs));
    await user.keyboard("{Alt>}2{/Alt}");
    const d = await menu("즐겨찾기");
    expect(options(d)).toEqual(["Downloads", "Src"]);
    expect(within(d).getByRole("separator")).toBeInTheDocument();
    expect(within(d).getByText("Work")).toBeInTheDocument();
    await user.keyboard("2");
    await waitFor(() => expect(crumbs()).toEqual(["/", "home", "a", "src"]));
  });

  it("Return으로 커서 항목(Downloads → ${user.downloads})으로 이동한다", async () => {
    const { user } = await renderApp(withFavs(favs));
    await user.keyboard("{Alt>}2{/Alt}");
    await menu("즐겨찾기");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(crumbs()).toEqual(["/", "home", "a", "docs"]));
  });

  it("추가 액션이 현재 폴더를 즐겨찾기에 넣는다", async () => {
    const b = withFavs((l) => l.bindings.push(bind("F9", "core.favorites.add")));
    const { user } = await renderApp(b);
    await user.keyboard("{Enter}"); // docs 폴더로
    await waitFor(() => expect(crumbs()).toEqual(["/", "home", "a", "docs"]));
    await user.keyboard("{F9}{Alt>}2{/Alt}");
    const d = await menu("즐겨찾기");
    await waitFor(() => expect(options(d)).toContain("docs"));
  });

  it("즐겨찾기가 없으면 빈 메뉴", async () => {
    const { user } = await renderApp(withFavs(() => {}));
    await user.keyboard("{Alt>}2{/Alt}");
    const d = await menu("즐겨찾기");
    expect(within(d).getByText("항목 없음")).toBeInTheDocument();
  });
});

describe("NAV-09 Recent Locations", () => {
  async function visit(user: Awaited<ReturnType<typeof renderApp>>["user"]) {
    await user.keyboard("{Enter}"); // docs
    await waitFor(() => expect(crumbs()).toEqual(["/", "home", "a", "docs"]));
    await user.keyboard("{Backspace}");
    await waitFor(() => expect(crumbs()).toEqual(["/", "home", "a"]));
    await user.keyboard("{ArrowDown}{Enter}"); // src
    await waitFor(() => expect(crumbs()).toEqual(["/", "home", "a", "src"]));
  }

  it("이 탭에서 방문한 위치를 최근순으로 보여 준다", async () => {
    const { user } = await renderApp(withFavs(() => {}));
    await visit(user);
    await user.keyboard("{Alt>}3{/Alt}");
    const d = await menu("최근 위치");
    expect(options(d)).toEqual(["/home/a", "/home/a/docs"]);
    await user.keyboard("{Alt>}2{/Alt}");
    await waitFor(() => expect(crumbs()).toEqual(["/", "home", "a", "docs"]));
  });

  it("탭을 바꾸거나 닫아도 유지되고 Ctrl+Backspace로 비운다", async () => {
    const { user } = await renderApp(withFavs(() => {}));
    await visit(user);
    await user.keyboard("{Control>}t{/Control}"); // 새 탭: 최근 위치는 공용이라 그대로 보인다
    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(3));
    await user.keyboard("{Alt>}3{/Alt}");
    let d = await menu("최근 위치");
    expect(options(d)).toEqual(["/home/a", "/home/a/docs"]); // 새 탭의 현재 폴더(src)는 빠진다
    await user.keyboard("{Escape}{Control>}w{/Control}");
    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(2));
    await user.keyboard("{Alt>}3{/Alt}");
    d = await menu("최근 위치");
    expect(options(d)).toEqual(["/home/a", "/home/a/docs"]);
    await user.keyboard("{Control>}{Backspace}{/Control}");
    expect(within(d).getByText("항목 없음")).toBeInTheDocument();
    await user.keyboard("{Escape}{Alt>}3{/Alt}");
    d = await menu("최근 위치");
    expect(within(d).getByText("항목 없음")).toBeInTheDocument();
  });
});

describe("NAV-10 Hierarchy", () => {
  it("루트까지의 상위 폴더 목록을 보여 주고 선택하면 이동한다", async () => {
    const { user } = await renderApp(withFavs(() => {}));
    await user.keyboard("{Alt>}0{/Alt}");
    const d = await menu("상위 폴더");
    expect(options(d)).toEqual(["/home/a", "/home", "/"]);
    await user.keyboard("{ArrowDown}{Enter}");
    await waitFor(() => expect(crumbs()).toEqual(["/", "home"]));
  });
});

describe("NAV-11 Go To Path", () => {
  const open = async () => {
    const r = await renderApp(withFavs(() => {}));
    await r.user.keyboard("{Control>}g{/Control}");
    await screen.findByRole("dialog", { name: "경로로 이동" });
    return r;
  };

  it("현재 경로로 채워져 열리고 입력한 경로로 이동한다", async () => {
    const { user } = await open();
    expect(screen.getByRole("textbox", { name: "이름" })).toHaveValue("/home/a/");
    await user.keyboard("/home/a/src{Enter}");
    await waitFor(() => expect(crumbs()).toEqual(["/", "home", "a", "src"]));
  });

  it("Tab으로 폴더 이름을 완성한다", async () => {
    const { user } = await open();
    await user.keyboard("/home/a/do{Tab}");
    expect(screen.getByRole("textbox", { name: "이름" })).toHaveValue("/home/a/docs/");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(crumbs()).toEqual(["/", "home", "a", "docs"]));
  });

  it("여러 후보는 공통 접두어까지만 완성하고, ~ 를 확장한다", async () => {
    const b = withFavs(() => {}).seed({ "/home/a/docs2/x": "x", "/home/a/docs3/x": "x" });
    const { user } = await renderApp(b);
    await user.keyboard("{Control>}g{/Control}");
    await screen.findByRole("dialog", { name: "경로로 이동" });
    await user.keyboard("~/d{Tab}");
    expect(screen.getByRole("textbox", { name: "이름" })).toHaveValue("/home/a/docs");
    await user.keyboard("{Backspace}{Backspace}{Backspace}{Backspace}s{Tab}"); // ".../s" → src/
    expect(screen.getByRole("textbox", { name: "이름" })).toHaveValue("/home/a/src/");
  });

  it("없는 경로는 오류를 알리고 이동하지 않는다. Esc로 닫는다", async () => {
    const { user } = await open();
    await user.keyboard("/nope/here{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("찾을 수 없음");
    expect(crumbs()).toEqual(["/", "home", "a"]);
    await user.keyboard("{Control>}g{/Control}");
    await screen.findByRole("dialog", { name: "경로로 이동" });
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
