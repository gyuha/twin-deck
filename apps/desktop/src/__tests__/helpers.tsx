import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { App } from "../App";

export const NFD = (s: string) => s.normalize("NFD");

export function seedBackend() {
  return new FakeBackend().seed({
    "/home/a/docs/readme.md": "r",
    "/home/a/src/main.rs": "m",
    "/home/a/a.txt": "aaa",
    "/home/a/b.txt": "bbb",
    "/home/a/.hidden": "h",
    [`/home/a/${NFD("한글.txt")}`]: "hangul",
    "/home/b/x.txt": "xxx",
  });
}

export async function renderApp(backend = seedBackend(), platform: "linux" | "mac" = "linux") {
  const user = userEvent.setup();
  render(<App backend={backend} platform={platform} leftPath="/home/a" rightPath="/home/b" />);
  await waitFor(() => expect(within(list("left")).queryAllByRole("option").length).toBeGreaterThan(0));
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
