import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { start } from "../bootstrap";

const entry = (name: string, kind: "file" | "dir") => ({
  name,
  path: `/home/me/${name}`,
  kind,
  size: 1,
  modifiedMs: null,
  hidden: false,
});

afterEach(() => {
  clearMocks();
  document.body.innerHTML = "";
});

function mount() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

describe("앱 부팅 (Tauri IPC 모킹)", () => {
  it("홈 폴더를 조회해 두 패널에 목록을 렌더한다", async () => {
    const calls: string[] = [];
    mockIPC(
      (cmd) => {
        calls.push(cmd);
        if (cmd === "plugin:path|resolve_directory") return "/home/me";
        if (cmd === "list_dir") return [entry("docs", "dir"), entry("a.txt", "file")];
        return null;
      },
      { shouldMockEvents: true },
    );
    await start(mount());
    for (const label of ["왼쪽 파일 목록", "오른쪽 파일 목록"]) {
      const list = await screen.findByRole("listbox", { name: label });
      await waitFor(() => expect(within(list).getAllByRole("option")).toHaveLength(2));
    }
    expect(calls).toContain("plugin:path|resolve_directory");
    expect(calls).toContain("list_dir");
    expect(calls).toContain("watch_dir");
  });

  it("IPC가 거부되면 빈 화면 대신 시작 실패 문구를 보여 준다", async () => {
    mockIPC(() => {
      throw new Error("command plugin:path|resolve_directory not allowed by ACL");
    });
    await start(mount());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("시작 실패");
    expect(alert).toHaveTextContent("not allowed by ACL");
  });
});
