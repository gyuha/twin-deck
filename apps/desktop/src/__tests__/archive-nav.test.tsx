import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { cursorName, entryNames, renderApp } from "./helpers";

// 아카이브 파일의 내용은 가짜 백엔드에서 `PK…`로 시작하면 아카이브로 취급된다.
function archiveBackend() {
  return new FakeBackend().seed({
    "/home/a/pack.zip": "PK-pack",
    "/home/a/pack.zip!/docs/readme.md": "r",
    "/home/a/pack.zip!/inner.zip": "PK-inner",
    "/home/a/pack.zip!/inner.zip!/deep.txt": "deep",
    "/home/a/pack.zip!/top.txt": "top",
    "/home/a/memo.docx": "PK-memo",
    "/home/a/memo.docx!/word/a.xml": "<a/>",
    "/home/a/data.bin": "PK-bin",
    "/home/a/notes.txt": "plain",
    "/home/b/x.txt": "xxx",
  });
}
// /home/a 목록: data.bin, memo.docx, notes.txt, pack.zip
const TO_PACK = "{ArrowDown}{ArrowDown}{ArrowDown}";

const breadcrumb = (pane: "left" | "right" = "left") =>
  within(screen.getAllByRole("navigation", { name: "경로" })[pane === "left" ? 0 : 1])
    .getAllByRole("button")
    .map((b) => b.textContent);
const markers = () => screen.queryAllByRole("img", { name: "아카이브 경계" }).length;

describe("ARC-01 아카이브를 폴더처럼 열기", () => {
  it("Enter로 열고 브레드크럼에 아카이브 경계가 표시된다", async () => {
    const { user } = await renderApp(archiveBackend());
    expect(entryNames("left")).toEqual(["data.bin", "memo.docx", "notes.txt", "pack.zip"]); // `pack.zip!`는 목록에 없다
    await user.keyboard(TO_PACK);
    expect(cursorName("left")).toBe("pack.zip");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(entryNames("left")).toEqual(["docs", "inner.zip", "top.txt"]));
    expect(breadcrumb()).toEqual(["/", "home", "a", "pack.zip"]);
    expect(markers()).toBe(1);
    await user.keyboard("{Enter}"); // docs 폴더로
    await waitFor(() => expect(entryNames("left")).toEqual(["readme.md"]));
    expect(breadcrumb()).toEqual(["/", "home", "a", "pack.zip", "docs"]);
    expect(markers()).toBe(1);
  });

  it("아카이브가 아닌 파일에서 Enter는 아무 일도 하지 않는다", async () => {
    const { user } = await renderApp(archiveBackend());
    await user.keyboard("{ArrowDown}{ArrowDown}"); // notes.txt
    await user.keyboard("{Enter}");
    expect(breadcrumb()).toEqual(["/", "home", "a"]);
    expect(markers()).toBe(0);
  });

  it("중첩 아카이브도 같은 방식으로 열리고 상위 이동은 한 단계씩, 커서는 방금 나온 아카이브에 놓인다", async () => {
    const { user } = await renderApp(archiveBackend());
    await user.keyboard(`${TO_PACK}{Enter}`);
    await waitFor(() => expect(entryNames("left")).toEqual(["docs", "inner.zip", "top.txt"]));
    await user.keyboard("{ArrowDown}{Enter}"); // inner.zip
    await waitFor(() => expect(entryNames("left")).toEqual(["deep.txt"]));
    expect(breadcrumb()).toEqual(["/", "home", "a", "pack.zip", "inner.zip"]);
    expect(markers()).toBe(2);

    await user.keyboard("{Backspace}"); // 안쪽 아카이브 루트 → 바깥 아카이브 루트
    await waitFor(() => expect(entryNames("left")).toEqual(["docs", "inner.zip", "top.txt"]));
    expect(cursorName("left")).toBe("inner.zip");
    await user.keyboard("{Backspace}"); // 바깥 아카이브 루트 → 들어 있던 폴더
    await waitFor(() => expect(entryNames("left")).toEqual(["data.bin", "memo.docx", "notes.txt", "pack.zip"]));
    expect(cursorName("left")).toBe("pack.zip");
    expect(markers()).toBe(0);
  });

  it("아카이브 안 하위 폴더에서 상위 이동은 아카이브 안에 머문다", async () => {
    const { user } = await renderApp(archiveBackend());
    await user.keyboard(`${TO_PACK}{Enter}`);
    await waitFor(() => expect(entryNames("left")).toContain("docs"));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(entryNames("left")).toEqual(["readme.md"]));
    await user.keyboard("{Backspace}");
    await waitFor(() => expect(entryNames("left")).toEqual(["docs", "inner.zip", "top.txt"]));
    expect(cursorName("left")).toBe("docs");
  });

  it("브레드크럼의 아카이브 이름을 눌러 아카이브 루트로 돌아간다", async () => {
    const { user } = await renderApp(archiveBackend());
    await user.keyboard(`${TO_PACK}{Enter}`);
    await waitFor(() => expect(entryNames("left")).toContain("docs"));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(breadcrumb()).toEqual(["/", "home", "a", "pack.zip", "docs"]));
    await user.click(within(screen.getAllByRole("navigation", { name: "경로" })[0]).getByRole("button", { name: "pack.zip" }));
    await waitFor(() => expect(breadcrumb()).toEqual(["/", "home", "a", "pack.zip"]));
  });

  it("설정의 추가 확장자를 따른다(file_systems.zip.additional_extensions)", async () => {
    const backend = archiveBackend();
    const { user } = await renderApp(backend);
    await user.keyboard("{ArrowDown}"); // memo.docx
    await user.keyboard("{Enter}");
    expect(breadcrumb()).toEqual(["/", "home", "a"]); // 기본 설정에서는 그냥 파일
    backend.setConfig((l) => (l.config.file_systems.zip.additional_extensions = ["docx"]));
    await waitFor(() => expect(backend.exists("/home/a/memo.docx")).toBe(true));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(breadcrumb()).toEqual(["/", "home", "a", "memo.docx"]));
    await waitFor(() => expect(entryNames("left")).toEqual(["word"]));
  });
});

describe("ARC-04 Open As", () => {
  const runOpenAs = async (user: Awaited<ReturnType<typeof renderApp>>["user"]) => {
    await user.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");
    await screen.findByRole("dialog", { name: "Actions Panel" });
    await user.keyboard("core.open.as_archive");
    await user.keyboard("{Enter}");
  };

  it("확장자와 무관하게 파일을 아카이브로 연다", async () => {
    const backend = archiveBackend();
    backend.seed({ "/home/a/data.bin!/inside.txt": "i" });
    const { user } = await renderApp(backend);
    expect(cursorName("left")).toBe("data.bin");
    await runOpenAs(user);
    await waitFor(() => expect(entryNames("left")).toEqual(["inside.txt"]));
    expect(breadcrumb()).toEqual(["/", "home", "a", "data.bin"]);
    expect(backend.openedAsArchive).toEqual(["/home/a/data.bin"]);
  });

  it("아카이브가 아닌 파일이나 폴더는 오류를 알리고 그 자리에 머문다", async () => {
    const backend = archiveBackend();
    const { user } = await renderApp(backend);
    await user.keyboard("{ArrowDown}{ArrowDown}"); // notes.txt
    await runOpenAs(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("아카이브로 열 수 있는 형식이 아닙니다");
    expect(breadcrumb()).toEqual(["/", "home", "a"]);
  });
});

describe("아카이브 안 파일 작업", () => {
  it("휴지통은 쓸 수 없다는 안내가 나오고 아무것도 지워지지 않는다", async () => {
    const backend = archiveBackend();
    const { user } = await renderApp(backend);
    await user.keyboard(`${TO_PACK}{Enter}`);
    await waitFor(() => expect(entryNames("left")).toContain("top.txt"));
    await user.keyboard("{ArrowDown}{ArrowDown}{F8}"); // top.txt
    expect(await screen.findByRole("alert")).toHaveTextContent("아카이브 안에서는 휴지통을 쓸 수 없습니다");
    expect(backend.trashed).toEqual([]);
    expect(backend.exists("/home/a/pack.zip!/top.txt")).toBe(true);
  });

  it("영구 삭제(Shift+F8)는 확인 후 아카이브 안에서 지운다", async () => {
    const backend = archiveBackend();
    const { user } = await renderApp(backend);
    await user.keyboard(`${TO_PACK}{Enter}`);
    await waitFor(() => expect(entryNames("left")).toContain("top.txt"));
    await user.keyboard("{ArrowDown}{ArrowDown}{Shift>}{F8}{/Shift}"); // top.txt
    await screen.findByRole("dialog");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(backend.exists("/home/a/pack.zip!/top.txt")).toBe(false));
    await waitFor(() => expect(entryNames("left")).toEqual(["docs", "inner.zip"]));
  });

  it("아카이브 안 → 다른 패널 복사(F5)와 다른 패널 → 아카이브 안 복사", async () => {
    const backend = archiveBackend();
    const { user } = await renderApp(backend);
    await user.keyboard(`${TO_PACK}{Enter}`);
    await waitFor(() => expect(entryNames("left")).toContain("top.txt"));
    await user.keyboard("{ArrowDown}{ArrowDown}{F5}{Enter}"); // top.txt → 오른쪽(/home/b)
    await waitFor(() => expect(backend.exists("/home/b/top.txt")).toBe(true));
    expect(backend.exists("/home/a/pack.zip!/top.txt")).toBe(true); // 복사이므로 원본이 남는다

    await user.keyboard("{Tab}"); // 오른쪽 패널: x.txt, top.txt
    await user.keyboard("{F5}{Enter}"); // x.txt → 왼쪽(아카이브 안)
    await waitFor(() => expect(backend.exists("/home/a/pack.zip!/x.txt")).toBe(true));
  });

  it("F4는 아카이브 안 경로를 그대로 편집 요청한다(임시 추출과 되쓰기는 백엔드 몫)", async () => {
    const backend = archiveBackend();
    backend.setConfig((l) => (l.config.environment.text_editor = "code"));
    const { user } = await renderApp(backend);
    await user.keyboard(`${TO_PACK}{Enter}`);
    await waitFor(() => expect(entryNames("left")).toContain("top.txt"));
    await user.keyboard("{ArrowDown}{ArrowDown}{F4}");
    await waitFor(() => expect(backend.edited).toEqual([["/home/a/pack.zip!/top.txt"]]));
  });
});
