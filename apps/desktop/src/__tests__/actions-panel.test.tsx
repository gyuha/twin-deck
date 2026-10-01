import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Loaded } from "@twin-deck/ts-client";
import { FakeBackend } from "@twin-deck/ts-client";
import { cursorName, renderApp, seedBackend } from "./helpers";

const panel = () => screen.findByRole("dialog", { name: "Actions Panel" });
const search = () => screen.getByRole("textbox", { name: "액션 검색" });
const rows = () => within(screen.getByRole("listbox", { name: "액션 목록" })).getAllByRole("option");
const rowTexts = () => rows().map((r) => r.textContent);
const bind = (key: string, action: string, args: Record<string, string> = {}) => ({ key, action, args, scope: null });
const crumbs = () =>
  within(screen.getAllByRole("navigation", { name: "경로" })[0])
    .getAllByRole("button")
    .map((b) => b.textContent);

function seed(change: (l: Loaded) => void = () => {}) {
  const b = seedBackend();
  b.setConfig(change);
  return b;
}
const open = async (r: Awaited<ReturnType<typeof renderApp>>) => {
  await r.user.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");
  await panel();
};

describe("ACT-01 Actions Panel", () => {
  it("Mod+Shift+P로 열려 입력창에 포커스가 가고, 처음에는 모든 액션이 보인다", async () => {
    const r = await renderApp();
    await open(r);
    expect(search()).toHaveFocus();
    expect(rows().length).toBeGreaterThan(30);
    const copy = rows().find((x) => x.textContent?.startsWith("복사"));
    expect(copy).toHaveTextContent("F5"); // 현재 키
    expect(rowTexts().join("|")).not.toContain("Actions Panel: 위로"); // 패널 안에서만 쓰는 내부 액션은 숨김
  });

  it("퍼지 검색: 이름과 ID로 찾고 가장 알맞은 것이 첫 줄에 온다", async () => {
    const r = await renderApp();
    await open(r);
    await r.user.keyboard("copy");
    await waitFor(() => expect(rows()[0]).toHaveAttribute("aria-selected", "true"));
    expect(rows()[0].textContent).toMatch(/^복사/); // core.copy
    await r.user.clear(search());
    await r.user.keyboard("복사");
    expect(rows()[0].textContent).toMatch(/복사/);
    await r.user.clear(search());
    await r.user.keyboard("zzzzqq");
    expect(await screen.findByText("일치하는 액션 없음")).toBeInTheDocument();
  });

  it("방향키로 고르고 Enter로 실행하며 실행 뒤 패널이 닫힌다", async () => {
    const b = seed();
    const r = await renderApp(b);
    await r.user.keyboard("{ArrowDown}{ArrowDown}"); // a.txt
    await open(r);
    await r.user.keyboard("core.copy{Enter}");
    await screen.findByRole("dialog", { name: /복사/ }); // 전송 확인 창
    await r.user.keyboard("{Enter}");
    await waitFor(() => expect(b.exists("/home/b/a.txt")).toBe(true));
    expect(screen.queryByRole("dialog", { name: "Actions Panel" })).toBeNull();
    expect(cursorName("left")).toBe("a.txt");
  });

  it("↓로 다른 항목을 골라 실행한다", async () => {
    const r = await renderApp();
    await open(r);
    await r.user.keyboard("hidden");
    await waitFor(() => expect(rows()[0].textContent).toMatch(/숨김/));
    await r.user.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Actions Panel" })).toBeNull());
    await waitFor(() => expect(within(screen.getByRole("listbox", { name: "왼쪽 파일 목록" })).queryAllByRole("option").some((o) => o.textContent?.includes(".hidden"))).toBe(true));
  });

  it("지금 실행할 수 없는 액션은 흐리게 보이고 Enter로 실행되지 않는다 (ACT-02)", async () => {
    const b = new FakeBackend().seed({ "/home/a/a.txt": "a", "/home/b": null });
    const r = await renderApp(b, "linux", { left: "/home/b", right: "/home/a" }, { emptyLeft: true });
    await open(r);
    await r.user.keyboard("core.copy");
    const first = rows()[0];
    expect(first).toHaveAttribute("aria-disabled", "true");
    await r.user.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "Actions Panel" })).toBeInTheDocument(); // 닫히지 않는다
    expect((await b.queueJobs()).length).toBe(0);
  });

  it("Alt를 누르고 있는 동안 액션 ID를 보여 준다", async () => {
    const r = await renderApp();
    await open(r);
    await r.user.keyboard("core.copy");
    expect(rows()[0]).toHaveTextContent("F5");
    await r.user.keyboard("{Alt>}");
    await waitFor(() => expect(rows()[0]).toHaveTextContent("core.copy"));
    await r.user.keyboard("{/Alt}");
    await waitFor(() => expect(rows()[0]).toHaveTextContent("F5"));
  });

  it("Esc로 닫고, 다시 열면 마지막 검색어가 남아 있다", async () => {
    const r = await renderApp();
    await open(r);
    await r.user.keyboard("dupl{Escape}");
    expect(screen.queryByRole("dialog", { name: "Actions Panel" })).toBeNull();
    await open(r);
    expect(search()).toHaveValue("dupl");
    await r.user.keyboard("복제"); // 남은 검색어는 선택된 채 열려 바로 덮어쓸 수 있다
    expect(search()).toHaveValue("복제");
  });

  it("열려 있는 동안 패널 키는 무시되고 숫자도 입력창에 들어간다", async () => {
    const b = seed();
    const r = await renderApp(b);
    await open(r);
    await r.user.keyboard("{F8}{F7}u3");
    expect(search()).toHaveValue("u3");
    expect(b.trashed).toEqual([]);
    expect(screen.queryByRole("dialog", { name: "새 폴더" })).toBeNull();
  });

  it("사용자 키바인딩이 바뀌면 패널에 보이는 키도 바뀐다", async () => {
    const b = seed((l) => l.bindings.push(bind("F5", "core.move")));
    const r = await renderApp(b);
    await open(r);
    await r.user.keyboard("core.move");
    expect(rows()[0].textContent).toMatch(/^이동/);
    expect(rows()[0]).toHaveTextContent("F6 · F5"); // 기본 키와 사용자 키를 모두 보여 준다
  });
});

describe("ACT-03 액션 인수", () => {
  const withOpen = (src?: string) =>
    seed((l) => l.bindings.push({ key: "Alt+H", action: "core.open.directory", args: src === undefined ? {} : { src }, scope: null }));

  it("Alt+H → core.open.directory src=~/src: 인수로 폴더에 간다", async () => {
    const { user } = await renderApp(withOpen("~/src"));
    await user.keyboard("{Alt>}h{/Alt}");
    await waitFor(() => expect(crumbs()).toEqual(["/", "home", "a", "src"]));
  });

  it("src=~ 는 홈 폴더, 절대 경로도 된다", async () => {
    const { user } = await renderApp(withOpen("~"), "linux", { left: "/home/a/src", right: "/home/b" });
    await user.keyboard("{Alt>}h{/Alt}");
    await waitFor(() => expect(crumbs()).toEqual(["/", "home", "a"]));
  });

  it("src가 없거나 없는 경로면 알리고 이동하지 않는다", async () => {
    const r1 = await renderApp(withOpen());
    await r1.user.keyboard("{Alt>}h{/Alt}");
    expect(await screen.findByRole("alert")).toHaveTextContent("src");
    expect(crumbs()).toEqual(["/", "home", "a"]);
  });

  it("없는 폴더", async () => {
    const { user } = await renderApp(withOpen("/nope"));
    await user.keyboard("{Alt>}h{/Alt}");
    expect(await screen.findByRole("alert")).toHaveTextContent("찾을 수 없음");
    expect(crumbs()).toEqual(["/", "home", "a"]);
  });

  it("액션 패널을 통해 실행해도 인수 없는 호출은 같은 안내를 준다", async () => {
    const r = await renderApp(seed());
    await open(r);
    await r.user.keyboard("core.open.directory{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("src");
  });
});
