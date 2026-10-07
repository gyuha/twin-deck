import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { entryNames, renderApp } from "./helpers";
import { runAction, searchBackend, tabTitles, waitDone } from "./search-helpers";

// 왼쪽 /home/a 스캔: big(1010) docs(31) report.txt(5) pack.zip(2) src(1). 0.5% 미만은 "기타 3개"로 묶인다.
// 화면(800×480): big이 왼쪽을 거의 다 채우고, 오른쪽의 좁은 띠에 docs(위)·기타(아래)가 쌓인다.
const tiles = () => Array.from(screen.getByLabelText("용량 treemap").querySelectorAll<HTMLElement>("[data-tile]"));
const selected = () => tiles().filter((t) => t.getAttribute("aria-selected") === "true").map((t) => t.getAttribute("title")?.split(" · ")[0]);
const usageScans = (b: ReturnType<typeof searchBackend>) => b.searchesStarted.filter((s) => s[0] === "usage").map((s) => s[1]);
const rightCrumbs = () =>
  Array.from(screen.getAllByRole("navigation", { name: "경로" }).at(-1)!.querySelectorAll("button")).map((b) => b.textContent);

async function open(extra: Record<string, string> = {}) {
  const backend = searchBackend().seed(extra);
  backend.setConfig((l) => (l.config.display.size_format = "bytes"));
  const r = await renderApp(backend);
  await runAction(r.user, "core.disk_usage.treemap");
  await waitFor(() => expect(tiles().some((t) => (t.getAttribute("title") ?? "").startsWith("big"))).toBe(true));
  await waitDone();
  return { ...r, backend };
}

describe("이슈 #29: treemap 방향키는 보이는 대로 움직인다", () => {
  it("→는 오른쪽 타일로 옮기고 올라가거나 내려가지 않는다", async () => {
    const { user, backend } = await open();
    await waitFor(() => expect(selected()).toEqual(["big"]));
    await user.keyboard("{ArrowRight}");
    expect(selected()).toEqual(["docs"]);
    expect(usageScans(backend)).toEqual(["/home/a"]);
  });

  it("←는 왼쪽 타일로 옮기고 상위로 올라가지 않는다", async () => {
    const { user, backend } = await open();
    await user.keyboard("{ArrowRight}{ArrowLeft}");
    expect(selected()).toEqual(["big"]);
    expect(usageScans(backend)).toEqual(["/home/a"]);
  });

  it("↑↓는 위/아래 타일로 옮긴다", async () => {
    const { user } = await open();
    await user.keyboard("{ArrowRight}{ArrowDown}");
    expect(selected()).toEqual(["기타 3개"]);
    await user.keyboard("{ArrowUp}");
    expect(selected()).toEqual(["docs"]);
  });

  it("그 방향에 타일이 없는 가장자리에서는 커서가 그대로다", async () => {
    const { user } = await open();
    await user.keyboard("{ArrowLeft}{ArrowUp}{ArrowDown}");
    expect(selected()).toEqual(["big"]); // big은 왼쪽·위·아래가 모두 가장자리다
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowUp}");
    expect(selected()).toEqual(["docs"]); // docs는 오른쪽·위가 가장자리다
  });

  it("Enter는 반대쪽 패널에 그 폴더를 열고 기준 폴더는 그대로다", async () => {
    const { user, backend } = await open();
    await user.keyboard("{ArrowRight}{Enter}");
    await waitFor(() => expect(rightCrumbs()).toEqual(["/", "home", "a", "docs"]));
    expect(usageScans(backend)).toEqual(["/home/a"]);
  });

  it("폴더 타일에서 Shift+→는 그 폴더로 내려간다", async () => {
    const { user, backend } = await open();
    await user.keyboard("{ArrowRight}{Shift>}{ArrowRight}{/Shift}");
    await waitFor(() => expect(usageScans(backend)).toEqual(["/home/a", "/home/a/docs"]));
    await waitFor(() => expect(tabTitles()).toEqual(["a", "Disk Usage: docs"]));
  });

  it("파일 타일에서 Shift+→는 내려가지 않고 미리보기를 연다", async () => {
    const { user, backend } = await open({ "/home/a/huge.bin": "h".repeat(5000) });
    await waitFor(() => expect(selected()).toEqual(["huge.bin"])); // 가장 큰 항목이 파일이다
    await user.keyboard("{Shift>}{ArrowRight}{/Shift}");
    await waitFor(() => expect(screen.getByRole("dialog", { name: /미리보기/ })).toBeInTheDocument());
    expect(usageScans(backend)).toEqual(["/home/a"]);
  });

  it("Mod+Enter는 폴더 타일에서 내려가고 파일 타일에서는 아무 일도 없다", async () => {
    const { user, backend } = await open({ "/home/a/huge.bin": "h".repeat(5000) });
    await waitFor(() => expect(selected()).toEqual(["huge.bin"]));
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(usageScans(backend)).toEqual(["/home/a"]);
    await user.keyboard("{ArrowRight}"); // 오른쪽 이웃(폴더)
    const name = selected()[0];
    expect(name).toBeDefined();
    await user.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() => expect(usageScans(backend).length).toBe(2));
  });

  it("Backspace는 한 단계 위로 올라간다", async () => {
    const { user, backend } = await open();
    await user.keyboard("{Backspace}");
    await waitFor(() => expect(usageScans(backend)).toEqual(["/home/a", "/home"]));
  });

  it("목록 보기에서는 →가 지금처럼 동작한다(treemap 전용 변경)", async () => {
    const backend = searchBackend();
    const { user } = await renderApp(backend);
    await runAction(user, "core.disk_usage");
    await waitDone();
    await user.keyboard("{ArrowRight}"); // 목록 보기: 폴더(big)면 그 안으로 들어간다(다시 스캔하지 않는다)
    await waitFor(() => expect(entryNames("left")).toEqual(["blob.bin", "other.bin"]));
    expect(usageScans(backend)).toEqual(["/home/a"]);
  });
});
