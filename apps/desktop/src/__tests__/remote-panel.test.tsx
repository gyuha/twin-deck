import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { cursorName, entryNames, list, renderApp, seedBackend } from "./helpers";

// 오른쪽 패널을 원격 서버에 연결해 두고 복사·이동·삭제가 로컬 패널과 같은 키로 되는지 확인한다(이슈 #76).
const SFTP = { name: "회사", protocol: "sftp", host: "nas", port: 22, user: "kim", base_dir: "" };
const ROOT = "sftp://kim@nas:22";

async function connected() {
  const backend = seedBackend();
  backend.setConfig((l) => (l.config.remote = { servers: [SFTP] }));
  backend.seed({ [`${ROOT}/report.txt`]: "원격 내용", [`${ROOT}/photos/p1.jpg`]: "p1", [`${ROOT}/old.log`]: "old" });
  backend.remotePasswords.set("kim@nas:22/sftp", "pw");
  const app = await renderApp(backend);
  await app.user.click(within(screen.getByRole("toolbar", { name: "드라이브 (오른쪽 패널)" })).getByRole("button", { name: "연결" }));
  await app.user.click(within(screen.getByRole("dialog", { name: "서버에 연결" })).getByRole("option", { name: /SFTP · 회사/ }));
  await waitFor(() => expect(entryNames("right")).toEqual(["photos", "old.log", "report.txt"]));
  return app;
}

describe("원격 폴더 안에서 파일 작업 (이슈 #76)", () => {
  it("연결한 원격 폴더가 오른쪽 패널에 폴더 먼저 이름순으로 보인다", async () => {
    await connected();
    expect(entryNames("right")[0]).toBe("photos");
  });

  it("경로 막대에서 연결 이름 뒤에 /가 붙고 폴더 이름과 이어 읽힌다 (이슈 #83)", async () => {
    const { user } = await connected();
    await user.click(within(list("right")).getByRole("option", { name: /photos/ }));
    await user.keyboard("{ArrowRight}");
    const nav = screen.getAllByRole("navigation", { name: "경로" }).at(-1)!;
    await waitFor(() => expect(nav.textContent).toContain("sftp://kim@nas:22/photos"));
    expect(nav.textContent).not.toContain("22photos");
  });

  it("왼쪽(로컬) → 오른쪽(원격) F5 복사: 원격에 같은 내용으로 생긴다", async () => {
    const { user, backend } = await connected();
    await user.keyboard("{Tab}{ArrowDown}{ArrowDown}"); // 연결하면 오른쪽 패널이 활성이라 Tab으로 왼쪽으로 가서 a.txt
    expect(cursorName("left")).toBe("a.txt");
    await user.keyboard("{F5}{Enter}");
    await waitFor(() => expect(backend.exists(`${ROOT}/a.txt`)).toBe(true));
    expect(backend.read(`${ROOT}/a.txt`)).toBe("aaa");
    expect(backend.exists("/home/a/a.txt")).toBe(true);
    await waitFor(() => expect(entryNames("right")).toContain("a.txt"));
  });

  it("오른쪽(원격) → 왼쪽(로컬) F5 복사: 로컬에 같은 내용으로 생기고 원격 원본은 그대로다", async () => {
    const { user, backend } = await connected();
    await user.keyboard("{ArrowDown}{ArrowDown}"); // 활성 패널은 오른쪽: report.txt (photos, old.log, report.txt)
    expect(cursorName("right")).toBe("report.txt");
    await user.keyboard("{F5}{Enter}");
    await waitFor(() => expect(backend.exists("/home/a/report.txt")).toBe(true));
    expect(backend.read("/home/a/report.txt")).toBe("원격 내용");
    expect(backend.exists(`${ROOT}/report.txt`)).toBe(true);
  });

  it("원격 폴더를 로컬로 F6 이동하면 안의 파일까지 옮겨지고 원격에서는 사라진다", async () => {
    const { user, backend } = await connected();
        expect(cursorName("right")).toBe("photos");
    await user.keyboard("{F6}{Enter}");
    await waitFor(() => expect(backend.exists("/home/a/photos/p1.jpg")).toBe(true));
    expect(backend.exists(`${ROOT}/photos`)).toBe(false);
  });

  it("원격 폴더에서 F8은 휴지통 대신 영구 삭제로 바뀌어 설정과 무관하게 확인한다", async () => {
    const { user, backend } = await connected();
    await user.keyboard("{ArrowDown}"); // old.log
    expect(cursorName("right")).toBe("old.log");
    await user.keyboard("{F8}");
    const d = await screen.findByRole("dialog");
    expect(d).toHaveTextContent("영구 삭제");
    expect(d).toHaveTextContent("old.log");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(backend.exists(`${ROOT}/old.log`)).toBe(false));
    expect(backend.trashed).toEqual([]);
  });

  it("원격 폴더 안에서 새 폴더(F7)를 만든다", async () => {
    const { user, backend } = await connected();
    await user.keyboard("{F7}");
    await screen.findByRole("dialog");
    await user.keyboard("new/deep{Enter}");
    await waitFor(() => expect(backend.exists(`${ROOT}/new/deep`)).toBe(true));
  });

  it("원격 파일은 열거나 편집할 수 없다고 알리고 로컬 앱을 실행하지 않는다", async () => {
    const { user, backend } = await connected();
    await user.keyboard("{ArrowDown}{ArrowDown}"); // report.txt
    await user.keyboard("{Enter}");
    expect(await screen.findByText(/원격 파일은 바로 열거나 미리 볼 수 없습니다/)).toBeInTheDocument();
    expect(backend.opened).toEqual([]);
    await user.keyboard("{F4}");
    expect(backend.edited).toEqual([]);
  });

  it("원격 폴더로 들어가고 상위 폴더로 돌아올 수 있고 루트가 끝이다", async () => {
    const { user } = await connected();
    await user.keyboard("{Enter}"); // photos
    await waitFor(() => expect(entryNames("right")).toEqual(["p1.jpg"]));
    await user.keyboard("{Backspace}");
    await waitFor(() => expect(entryNames("right")).toEqual(["photos", "old.log", "report.txt"]));
    await user.keyboard("{Backspace}"); // 원격 루트의 위는 없다: 머문다
    await new Promise((r) => setTimeout(r, 30));
    expect(entryNames("right")).toEqual(["photos", "old.log", "report.txt"]);
  });
});
