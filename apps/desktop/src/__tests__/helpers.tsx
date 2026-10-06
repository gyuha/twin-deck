import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import type { Snapshot } from "@twin-deck/ts-client";
import { App } from "../App";

export const NFD = (s: string) => s.normalize("NFD");

export function seedBackend() {
  const b = new FakeBackend().seed({
    "/home/a/docs/readme.md": "r",
    "/home/a/src/main.rs": "m",
    "/home/a/a.txt": "aaa",
    "/home/a/b.txt": "bbb",
    "/home/a/.hidden": "h",
    [`/home/a/${NFD("한글.txt")}`]: "hangul",
    "/home/b/x.txt": "xxx",
  });
  // 기존 테스트는 고정 구성(layout.action_bar)만 보이는 Action Bar를 전제한다(앱 기본값 검증은 fkey-action-bar.test).
  b.setConfig((l) => {
    l.config.layout.action_bar = ["core.edit", "core.copy", "core.move", "core.file.new_folder", "core.trash", "core.delete"];
    for (const k of Object.keys(l.config.fkey_bar)) l.config.fkey_bar[k] = false;
  });
  return b;
}

export async function renderApp(
  backend = seedBackend(),
  platform: "linux" | "mac" = "linux",
  paths: { left: string; right: string } = { left: "/home/a", right: "/home/b" },
  opts: { emptyLeft?: boolean; snapshot?: Snapshot | null; stateWarning?: string | null } = {},
) {
  const user = userEvent.setup();
  render(<App
      backend={backend}
      platform={platform}
      leftPath={paths.left}
      rightPath={paths.right}
      snapshot={opts.snapshot}
      stateWarning={opts.stateWarning}
    />);
  if (opts.emptyLeft) {
    // 왼쪽이 빈 폴더: 첫 목록 조회가 끝날 시간을 준다(가짜 백엔드는 곧바로 응답한다).
    await new Promise((r) => setTimeout(r, 50));
    expect(within(list("left")).queryAllByRole("option")).toHaveLength(0);
  } else {
    await waitFor(() => expect(within(list("left")).queryAllByRole("option").length).toBeGreaterThan(0));
  }
  return { user, backend };
}

export const list = (pane: "left" | "right") =>
  screen.getByRole("listbox", { name: pane === "left" ? "왼쪽 파일 목록" : "오른쪽 파일 목록" });

export const names = (pane: "left" | "right") =>
  within(list(pane))
    .queryAllByRole("option")
    .map((o) => o.textContent ?? "");

/** 이름 칸만. */
export const entryNames = (pane: "left" | "right") =>
  within(list(pane))
    .queryAllByRole("option")
    .map((o) => o.querySelectorAll("span")[1]?.textContent ?? "");

/** 커서 행의 텍스트에서 이름 칸만 뽑는다. */
export function cursorName(pane: "left" | "right"): string {
  const row = within(list(pane))
    .getAllByRole("option")
    .find((o) => o.getAttribute("data-cursor") === "true");
  return row?.querySelectorAll("span")[1]?.textContent ?? "";
}

export function selectedNames(pane: "left" | "right"): string[] {
  return within(list(pane))
    .getAllByRole("option")
    .filter((o) => o.getAttribute("aria-selected") === "true")
    .map((o) => o.querySelectorAll("span")[1]?.textContent ?? "");
}

export const activePane = () =>
  screen.getByRole("region", { name: "왼쪽 패널" }).getAttribute("data-active") === "true" ? "left" : "right";

/** 복사·이동 진행 창이 뜨면 Enter(백그라운드)로 창만 닫아 작업이 큐에서 계속 돌게 한다. */
export async function backgroundProgress(user: { keyboard(keys: string): Promise<void> }) {
  await screen.findByRole("dialog", { name: /복사 중|이동 중/ });
  await user.keyboard("{Enter}");
  await waitFor(() => expect(screen.queryByRole("dialog", { name: /복사 중|이동 중/ })).toBeNull());
}
