import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EntryDto } from "@twin-deck/ts-client";
import { FakeBackend } from "@twin-deck/ts-client";
import { sortEntries } from "../lib/sort";
import { list, renderApp } from "./helpers";
import { within } from "@testing-library/react";

const N = 100_000;
const BENCH = !!process.env.BENCH;
const log = (msg: string) => {
  if (BENCH) console.info(`[bench] ${msg}`);
};
const ms = (t: number) => `${(performance.now() - t).toFixed(0)}ms`;

function entries(): EntryDto[] {
  return Array.from({ length: N }, (_, i) => ({
    name: `item-${String((i * 7919) % N).padStart(6, "0")}`,
    path: `/tmp/big/item-${i}`,
    kind: i % 100 === 0 ? "dir" : "file",
    size: (i * 37) % 1_000_003,
    modifiedMs: 1_780_000_000_000 + ((i * 131) % 86_400_000),
    createdMs: 1_780_000_000_000,
    mode: 0o644,
    hidden: false,
  }));
}

/**
 * 10만 항목 측정. `BENCH=1 bun run test bench`로 값을 볼 수 있다. 시간 임계값은 검사하지 않고(측정과 판정은
 * docs/m2-benchmark.md) 결과가 올바른지만 확인한다. Node/jsdom 값이라 실제 웹뷰의 렌더/스크롤 시간은 아니다.
 */
describe("10만 항목 측정 (Node/jsdom)", () => {
  it("IPC 페이로드 역직렬화와 정렬", () => {
    const list = entries();
    let t = performance.now();
    const json = JSON.stringify(list);
    log(`JSON.stringify ${ms(t)} bytes=${json.length}`);
    t = performance.now();
    const parsed = JSON.parse(json) as EntryDto[];
    log(`JSON.parse ${ms(t)}`);
    expect(parsed).toHaveLength(N);

    for (const sort of [
      { key: "name", dir: "asc" },
      { key: "size", dir: "desc" },
      { key: "modified", dir: "asc" },
      { key: "extension", dir: "asc" },
    ] as const) {
      t = performance.now();
      const sorted = sortEntries(parsed, sort);
      log(`sortEntries ${sort.key}/${sort.dir} ${ms(t)}`);
      expect(sorted).toHaveLength(N);
      const firstFile = sorted.findIndex((e) => e.kind !== "dir");
      expect(firstFile).toBe(N / 100); // 폴더가 먼저
    }
  });

  it("앱이 10만 항목을 열어 그릴 때 DOM 행 수와 시간", async () => {
    const b = new FakeBackend();
    b.seed({ "/big": null, "/other": null });
    for (let i = 0; i < N; i++) b.seed({ [`/big/f${String(i).padStart(6, "0")}`]: "" });
    const t = performance.now();
    const { user } = await renderApp(b, "linux", { left: "/big", right: "/other" });
    await waitFor(() => expect(list("left").getAttribute("aria-rowcount")).toBe(String(N)), { timeout: 30_000 });
    const rows = within(list("left")).getAllByRole("option").length;
    log(`open+render ${ms(t)} domRows=${rows} rowcount=${list("left").getAttribute("aria-rowcount")}`);
    expect(rows).toBeLessThanOrEqual(200);

    const t2 = performance.now();
    await user.keyboard("{End}");
    await waitFor(() => expect(within(list("left")).getAllByRole("option").some((o) => o.getAttribute("data-cursor") === "true")).toBe(true));
    log(`End(맨 끝으로) ${ms(t2)} domRows=${within(list("left")).getAllByRole("option").length}`);

    const t3 = performance.now();
    await user.keyboard("{Alt>}{Shift>}s{/Shift}{/Alt}");
    await waitFor(() => expect(list("left").getAttribute("aria-rowcount")).toBe(String(N)));
    log(`정렬 액션(크기) 반영 ${ms(t3)}`);
  }, 60_000);
});
