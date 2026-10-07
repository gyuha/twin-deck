import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { defaultBindingsFor } from "@twin-deck/actions";
import { entryNames, renderApp } from "./helpers";
import { runAction, searchBackend, tabTitles, waitDone } from "./search-helpers";

// 왼쪽 패널은 가상 탭이라 경로 표시줄이 없다(VirtualHeader). 경로 표시줄은 오른쪽 패널의 것 하나뿐이다.
const crumbs = (_pane: "right") =>
  within(screen.getAllByRole("navigation", { name: "경로" }).at(-1) as HTMLElement)
    .getAllByRole("button")
    .map((b) => b.textContent);

// 왼쪽 /home/a 스캔: big(1010) docs(31) report.txt(5) pack.zip(2) src(1) = 합계 1049.
// 0.5% 미만(≈5.2)인 report.txt·pack.zip·src는 "기타 3개"(합계 8)로 묶인다.
const map = () => screen.getByLabelText("용량 treemap");
const tiles = () => Array.from(map().querySelectorAll<HTMLElement>("[data-tile]"));
const tileTitles = () => tiles().map((t) => t.getAttribute("title") ?? "");
const tileByName = (name: string) => {
  const t = tiles().find((x) => (x.getAttribute("title") ?? "").startsWith(name));
  if (!t) throw new Error(`타일 없음: ${name} (${tileTitles().join(" | ")})`);
  return t;
};
const selected = () => tiles().filter((t) => t.getAttribute("aria-selected") === "true").map((t) => t.getAttribute("title")?.split(" · ")[0]);
const usageScans = (b: ReturnType<typeof searchBackend>) => b.searchesStarted.filter((s) => s[0] === "usage").map((s) => s[1]);

async function openTreemap() {
  const backend = searchBackend();
  backend.setConfig((l) => (l.config.display.size_format = "bytes"));
  const r = await renderApp(backend);
  await runAction(r.user, "core.disk_usage.treemap");
  await waitFor(() => expect(tiles().length).toBeGreaterThan(0));
  await waitFor(() => expect(tileTitles().some((t) => t.startsWith("big"))).toBe(true));
  return { ...r, backend };
}

describe("Disk Usage treemap", () => {
  it("core.disk_usage.treemap은 Treemap 보기로 열고, core.disk_usage는 목록으로 연다", async () => {
    const { user } = await openTreemap();
    expect(tabTitles()).toEqual(["a", "Disk Usage: a"]);
    expect(screen.queryByRole("listbox", { name: "왼쪽 파일 목록" })).toBeNull(); // 목록 대신 그림
    await user.keyboard("{Alt>}t{/Alt}"); // 목록으로 전환
    expect(screen.getByRole("listbox", { name: "왼쪽 파일 목록" })).toBeInTheDocument();
    await waitDone();
  });

  it("기본 키: Alt+T 하나뿐이다(열기·전환 겸용). core.disk_usage.treemap에는 기본 키가 없다(겹침 없음)", () => {
    for (const platform of ["mac", "linux"] as const) {
      const all = defaultBindingsFor(platform);
      const has = (action: string) => all.filter((b) => b.actionId === action).flatMap((b) => b.keys);
      expect(has("core.disk_usage.treemap")).toEqual([]); // Alt+T가 같은 일을 하므로 따로 키를 두지 않는다(Actions Panel·메뉴로는 쓸 수 있다)
      expect(all.some((b) => b.keys.includes("Mod+Alt+U"))).toBe(false);
      expect(has("core.disk_usage.toggle_view")).toEqual(["Alt+T"]);
      const keys = all.flatMap((b) => b.keys.map((k) => `${b.scope}:${k}:${JSON.stringify(b.args ?? null)}`));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("Alt+T는 일반 폴더 탭에서도 동작한다: 그 폴더를 treemap으로 연다", async () => {
    const backend = searchBackend();
    const { user } = await renderApp(backend);
    expect(tabTitles()).toEqual(["a"]);
    await user.keyboard("{Alt>}t{/Alt}");
    await waitFor(() => expect(tabTitles()).toEqual(["a", "Disk Usage: a"]));
    await waitFor(() => expect(tiles().length).toBeGreaterThan(0));
    expect(usageScans(backend)).toEqual(["/home/a"]);
    await user.keyboard("{Alt>}t{/Alt}"); // 이제 Disk Usage 탭이므로 전환(새 탭·새 스캔 없음)
    expect(tabTitles()).toEqual(["a", "Disk Usage: a"]);
    expect(usageScans(backend)).toEqual(["/home/a"]);
    expect(screen.getByRole("listbox", { name: "왼쪽 파일 목록" })).toBeInTheDocument();
  });

  it("Alt+T 전환은 탭·스캔·항목을 그대로 두고 새 스캔을 시작하지 않는다", async () => {
    const { user, backend } = await openTreemap();
    await waitDone();
    const before = backend.searchesStarted.length;
    await user.keyboard("{Alt>}t{/Alt}");
    expect(entryNames("left")).toEqual(["big", "docs", "report.txt", "pack.zip", "src"]);
    await user.keyboard("{Alt>}t{/Alt}");
    expect(tiles().length).toBeGreaterThan(0);
    expect(backend.searchesStarted.length).toBe(before);
    expect(tabTitles()).toEqual(["a", "Disk Usage: a"]);
  });

  it("타일에 이름·크기·비율이 있고, 임계 미만 항목은 '기타 N개' 하나로 묶인다", async () => {
    await openTreemap();
    await waitDone().catch(() => {});
    await waitFor(() => expect(tileTitles().some((t) => t.startsWith("기타"))).toBe(true));
    expect(tileTitles()).toEqual(["big · 1010 B · 96.3%", "docs · 31 B · 3.0%", "기타 3개 · 8 B · 0.8%"]);
  });

  it("폴더 타일을 클릭하면 반대쪽 패널이 그 폴더로 이동하고 treemap 탭은 그대로다", async () => {
    const { user } = await openTreemap();
    await user.click(tileByName("docs"));
    await waitFor(() => expect(crumbs("right")).toEqual(["/", "home", "a", "docs"]));
    expect(tabTitles()).toEqual(["a", "Disk Usage: a"]);
    expect(tiles().length).toBeGreaterThan(0);
  });

  it("Enter도 같다: ↓로 커서를 옮겨 docs에서 Enter", async () => {
    const { user } = await openTreemap();
    await waitFor(() => expect(selected()).toEqual(["big"])); // 첫 항목(가장 큼)
    await user.keyboard("{ArrowDown}");
    expect(selected()).toEqual(["docs"]);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(crumbs("right")).toEqual(["/", "home", "a", "docs"]));
  });

  it("파일 타일은 그 파일이 있는 폴더를 반대쪽 패널에 열고, '기타' 타일은 지금 보는 폴더를 연다", async () => {
    const backend = searchBackend().seed({ "/home/a/huge.bin": "h".repeat(5000) });
    backend.setConfig((l) => (l.config.display.size_format = "bytes"));
    const { user } = await renderApp(backend);
    await runAction(user, "core.disk_usage.treemap");
    await waitFor(() => expect(tileTitles().some((t) => t.startsWith("huge.bin"))).toBe(true));
    await user.click(tileByName("huge.bin"));
    await waitFor(() => expect(crumbs("right")).toEqual(["/", "home", "a"]));
    await user.click(tileByName("docs")); // 다른 곳으로 옮긴 뒤
    await waitFor(() => expect(crumbs("right")).toEqual(["/", "home", "a", "docs"]));
    await user.click(tileByName("기타"));
    await waitFor(() => expect(crumbs("right")).toEqual(["/", "home", "a"]));
  });

  it("폴더 타일 더블클릭(또는 →)은 그 폴더로 스캔을 다시 시작하고 제목이 바뀐다, 파일 타일은 아무 일도 없다", async () => {
    const { user, backend } = await openTreemap();
    await waitDone();
    fireEvent.doubleClick(tileByName("docs"));
    await waitFor(() => expect(usageScans(backend)).toEqual(["/home/a", "/home/a/docs"]));
    await waitFor(() => expect(tabTitles()).toEqual(["a", "Disk Usage: docs"]));
    await waitFor(() => expect(tileTitles().some((t) => t.startsWith("deep"))).toBe(true));
    // → 로 더 내려간다: 첫 타일(deep 폴더, 가장 큼)
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(usageScans(backend)).toEqual(["/home/a", "/home/a/docs", "/home/a/docs/deep"]));
  });

  it("파일 타일에서는 새 스캔이 없다", async () => {
    const backend = searchBackend().seed({ "/home/a/huge.bin": "h".repeat(5000) });
    const { user } = await renderApp(backend);
    await runAction(user, "core.disk_usage.treemap");
    await waitFor(() => expect(tileTitles().some((t) => t.startsWith("huge.bin"))).toBe(true));
    const before = usageScans(backend).length;
    fireEvent.doubleClick(tileByName("huge.bin"));
    await user.keyboard("{ArrowRight}"); // 첫 타일이 파일(huge.bin)이다
    expect(usageScans(backend).length).toBe(before);
  });

  it("Backspace/←는 한 단계 위 폴더로 스캔을 다시 시작하고, 루트에서는 아무 일도 없다", async () => {
    const { user, backend } = await openTreemap();
    await waitDone();
    await user.keyboard("{Backspace}");
    await waitFor(() => expect(usageScans(backend)).toEqual(["/home/a", "/home"]));
    await user.keyboard("{ArrowLeft}");
    await waitFor(() => expect(usageScans(backend)).toEqual(["/home/a", "/home", "/"]));
    await user.keyboard("{Backspace}");
    expect(usageScans(backend)).toEqual(["/home/a", "/home", "/"]);
  });

  it("↑↓로 커서가 크기 순서대로 옮겨 가고 선택 타일이 표시된다", async () => {
    const { user } = await openTreemap();
    await waitFor(() => expect(selected()).toEqual(["big"]));
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(selected()).toEqual(["기타 3개"]); // 세 번째 항목(report.txt)은 '기타' 타일 안에 있다
    await user.keyboard("{ArrowUp}");
    expect(selected()).toEqual(["docs"]);
  });

  it("Esc는 진행 중인 스캔을 취소하고 그때까지의 결과를 남긴다", async () => {
    const backend = searchBackend();
    backend.searchMode = "manual";
    const { user } = await renderApp(backend);
    await runAction(user, "core.disk_usage.treemap");
    await waitFor(() => expect(map()).toBeInTheDocument());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByRole("status", { name: "검색 상태" })).toHaveTextContent("취소됨"));
  });

  it("삭제하면 사라진 항목을 빼고 같은 기준 폴더로 용량을 새로 계산한다", async () => {
    const { user, backend } = await openTreemap();
    expect(usageScans(backend)).toEqual(["/home/a"]);
    await user.keyboard("{Shift>}{F8}{/Shift}"); // 커서는 가장 큰 big
    await screen.findByRole("dialog");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(backend.exists("/home/a/big")).toBe(false));
    await waitFor(() => expect(usageScans(backend)).toEqual(["/home/a", "/home/a"])); // 같은 폴더를 다시 스캔한다
    await waitFor(() => expect(tileTitles().some((t) => t.startsWith("big"))).toBe(false));
    await waitFor(() => expect(tileTitles().some((t) => t.startsWith("docs"))).toBe(true));
    await waitDone();
    expect(tabTitles()).toEqual(["a", "Disk Usage: a"]); // 탭과 제목은 그대로다
  });

  it("목록 보기에서도 삭제하면 용량을 새로 계산한다", async () => {
    const backend = searchBackend();
    const { user } = await renderApp(backend);
    await runAction(user, "core.disk_usage");
    await waitDone();
    expect(usageScans(backend)).toEqual(["/home/a"]);
    await user.keyboard("{Shift>}{F8}{/Shift}"); // 가장 큰 big
    await screen.findByRole("dialog");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(backend.exists("/home/a/big")).toBe(false));
    await waitFor(() => expect(usageScans(backend)).toEqual(["/home/a", "/home/a"]));
    await waitFor(() => expect(entryNames("left")).toEqual(["docs", "report.txt", "pack.zip", "src"]));
    await waitDone();
  });

  it("목록 보기의 기존 동작은 그대로다(core.disk_usage)", async () => {
    const backend = searchBackend();
    const { user } = await renderApp(backend);
    await runAction(user, "core.disk_usage");
    await waitDone();
    expect(entryNames("left")).toEqual(["big", "docs", "report.txt", "pack.zip", "src"]);
    expect(within(screen.getByRole("listbox", { name: "왼쪽 파일 목록" })).getAllByRole("option").length).toBe(5);
  });
});
