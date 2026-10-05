import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { crumbs, runAction } from "./search-helpers";
import { cursorName, entryNames, renderApp } from "./helpers";

/**
 * /home/a 목록: docs(폴더) bundle.zip plain.txt report.txt / /home/b: x.txt
 * bundle.zip은 `PK…`로 시작하고 안쪽(`bundle.zip!`)에 content/a.txt, b.txt가 있는 아카이브다.
 */
function backend() {
  return new FakeBackend().seed({
    "/home/a/docs/readme.md": "r",
    "/home/a/docs/notes.txt": "n",
    "/home/a/bundle.zip": "PK",
    "/home/a/bundle.zip!/content/a.txt": "A",
    "/home/a/bundle.zip!/b.txt": "B",
    "/home/a/plain.txt": "plain",
    "/home/a/report.txt": "abc",
    "/home/b/x.txt": "xxx",
  });
}
const TO_BUNDLE = "{ArrowDown}"; // docs → bundle.zip
const TO_REPORT = "{ArrowDown}{ArrowDown}{ArrowDown}";

const indicator = () => screen.queryByRole("status", { name: "작업 큐 진행" });
const advance = (b: FakeBackend) => act(async () => void (await b.advance()));

describe("OP-11 압축", () => {
  it("파일 하나: 이름에서 확장자를 뺀 zip이 같은 폴더에 생기고 원본은 그대로다", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await user.keyboard(TO_REPORT);
    await runAction(user, "core.compress");
    await waitFor(() => expect(b.exists("/home/a/report.zip")).toBe(true));
    expect(b.exists("/home/a/report.txt")).toBe(true);
    expect((await b.queueJobs())[0]).toMatchObject({ kind: "compress", status: "done" });
    await waitFor(() => expect(entryNames("left")).toEqual(["docs", "bundle.zip", "plain.txt", "report.txt", "report.zip"]));
  });

  it("폴더 하나: 폴더 이름의 zip, 만든 zip은 폴더처럼 열어 볼 수 있다", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await runAction(user, "core.compress"); // 커서: docs
    await waitFor(() => expect(b.exists("/home/a/docs.zip")).toBe(true));
    expect(b.exists("/home/a/docs/readme.md")).toBe(true);
    await waitFor(() => expect(entryNames("left")).toContain("docs.zip"));
    // 새 zip을 열어 본다: docs, bundle.zip, docs.zip 순서
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    await waitFor(() => expect(crumbs().at(-1)).toBe("docs.zip"));
    expect(entryNames("left")).toEqual(["docs"]);
  });

  it("여러 항목을 선택하면 하나의 zip으로 묶이고 이름은 현재 폴더 이름이다. 겹치면 번호가 붙는다", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await user.keyboard("{Insert}"); // docs 선택 (커서는 bundle.zip으로)
    await user.keyboard("{ArrowDown}{Insert}"); // plain.txt 선택 (커서는 report.txt로)
    await runAction(user, "core.compress");
    expect(await screen.findByRole("dialog")).toHaveTextContent("압축 파일 이름"); // 여러 항목은 이름을 묻는다
    await user.keyboard("{Enter}"); // 기본 이름(현재 폴더 이름)
    await waitFor(() => expect(b.exists("/home/a/a.zip")).toBe(true));
    expect(b.exists("/home/a/a.zip!/docs/readme.md")).toBe(true);
    expect(b.exists("/home/a/a.zip!/plain.txt")).toBe(true);
    expect(b.exists("/home/a/a.zip!/report.txt")).toBe(false); // 선택하지 않은 항목은 없다
    expect(b.exists("/home/a/plain.txt")).toBe(true); // 원본은 그대로
    // 다시 여러 항목을 묶으면 같은 이름이 있으므로 번호가 붙는다
    await waitFor(() => expect(entryNames("left")).toContain("a.zip"));
    await user.keyboard("{Home}{Insert}{Insert}"); // docs, a.zip 선택
    await runAction(user, "core.compress");
    await screen.findByRole("dialog");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(b.exists("/home/a/a (1).zip")).toBe(true));
    expect(b.exists("/home/a/a.zip")).toBe(true);
  });

  it("여러 항목: 다이얼로그에서 지정한 이름으로 만든다(.zip이 없으면 붙인다)", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await user.keyboard("{Insert}{Insert}"); // docs, bundle.zip 선택
    await runAction(user, "core.compress");
    await screen.findByRole("dialog");
    await user.keyboard("{Control>}a{/Control}mine{Enter}");
    await waitFor(() => expect(b.exists("/home/a/mine.zip")).toBe(true));
    expect(b.exists("/home/a/a.zip")).toBe(false);
  });

  it("여러 항목: 이름 다이얼로그를 취소하면 압축하지 않는다", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await user.keyboard("{Insert}{Insert}");
    await runAction(user, "core.compress");
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((await b.queueJobs()).length).toBe(0);
  });

  it("체크박스를 켜면 압축 파일이 반대 패널 폴더에 만들어진다", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await user.keyboard("{Insert}{Insert}"); // docs, bundle.zip 선택
    await runAction(user, "core.compress");
    const dlg = await screen.findByRole("dialog");
    await user.click(within(dlg).getByRole("checkbox", { name: "반대 패널에 압축 파일 놓기" }));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(b.exists("/home/b/a.zip")).toBe(true));
    expect(b.exists("/home/a/a.zip")).toBe(false); // 이 폴더에는 없다
    expect(b.exists("/home/b/a.zip!/docs/readme.md")).toBe(true);
    await waitFor(() => expect(entryNames("right")).toContain("a.zip")); // 반대 패널 목록에 나타난다
  });

  it("체크박스는 기본이 꺼져 있어 이 폴더에 만든다", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await user.keyboard("{Insert}{Insert}");
    await runAction(user, "core.compress");
    const dlg = await screen.findByRole("dialog");
    expect(within(dlg).getByRole("checkbox", { name: "반대 패널에 압축 파일 놓기" })).not.toBeChecked();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(b.exists("/home/a/a.zip")).toBe(true));
    expect(b.exists("/home/b/a.zip")).toBe(false);
  });

  it("반대 패널이 아카이브 안이면 체크박스를 보이지 않는다", async () => {
    const b = backend();
    const { user } = await renderApp(b, "linux", { left: "/home/a", right: "/home/a/bundle.zip!" });
    await user.keyboard("{Insert}{Insert}");
    await runAction(user, "core.compress");
    const dlg = await screen.findByRole("dialog");
    expect(within(dlg).queryByRole("checkbox")).toBeNull();
  });

  it("한 항목은 이름을 묻지 않고 바로 압축한다", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await user.keyboard(TO_REPORT);
    await runAction(user, "core.compress");
    await waitFor(() => expect(b.exists("/home/a/report.zip")).toBe(true));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("끝나면 만들어진 압축 파일이 목록에 나타나고 커서가 그 파일에 놓인다", async () => {
    const b = backend();
    b.queueMode = "manual";
    const { user } = await renderApp(b);
    await user.keyboard(TO_REPORT);
    await runAction(user, "core.compress");
    await waitFor(() => expect(indicator()).toBeInTheDocument());
    expect(entryNames("left")).not.toContain("report.zip"); // 끝나기 전에는 없다
    await advance(b);
    await waitFor(() => expect(entryNames("left")).toContain("report.zip")); // 이벤트 없이도 끝나면 나타난다
    await waitFor(() => expect(cursorName("left")).toBe("report.zip"));
  });

  it("큐 이벤트가 웹뷰에 닿지 않아도(실제 Tauri 런타임) 끝나면 목록에 나타난다", async () => {
    const b = backend();
    b.queueMode = "manual";
    b.onQueueChanged = () => () => {}; // 이벤트를 받지 못하는 환경
    b.onDirChanged = () => () => {};
    const { user } = await renderApp(b);
    await user.keyboard(TO_REPORT);
    await runAction(user, "core.compress");
    await advance(b);
    await waitFor(() => expect(entryNames("left")).toContain("report.zip"));
  });

  it("큐 작업으로 실행된다: 진행 표시가 있고 끝나기 전에는 결과가 없다", async () => {
    const b = backend();
    b.queueMode = "manual";
    const { user } = await renderApp(b);
    await user.keyboard(TO_REPORT);
    await runAction(user, "core.compress");
    await waitFor(() => expect(indicator()).toBeInTheDocument());
    expect(b.exists("/home/a/report.zip")).toBe(false);
    await user.keyboard("=");
    const popup = await screen.findByRole("dialog", { name: "작업 큐" });
    expect(within(popup).getByRole("option")).toHaveTextContent("압축");
    await user.keyboard("{Escape}");
    await advance(b);
    await waitFor(() => expect(b.exists("/home/a/report.zip")).toBe(true));
    await waitFor(() => expect(indicator()).toBeNull());
  });

  it("아카이브 안의 항목과 검색 결과 탭에서는 안내하고 하지 않는다", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await user.keyboard(`${TO_BUNDLE}{Enter}`); // bundle.zip 안으로
    await waitFor(() => expect(crumbs().at(-1)).toBe("bundle.zip"));
    await runAction(user, "core.compress");
    expect(await screen.findByRole("alert")).toHaveTextContent("아카이브 안의 항목은 압축할 수 없습니다");
    expect((await b.queueJobs()).length).toBe(0);
  });
});

describe("OP-11 추출", () => {
  it("아카이브 옆의 새 폴더에 풀고 원본 아카이브는 그대로 둔다. 겹치면 번호가 붙는다", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await user.keyboard(TO_BUNDLE);
    await runAction(user, "core.extract");
    await waitFor(() => expect(b.exists("/home/a/bundle/content/a.txt")).toBe(true));
    expect(b.read("/home/a/bundle/b.txt")).toBe("B");
    expect(b.exists("/home/a/bundle.zip")).toBe(true);
    expect((await b.queueJobs())[0]).toMatchObject({ kind: "extract", status: "done" });
    await runAction(user, "core.extract");
    await waitFor(() => expect(b.exists("/home/a/bundle (1)/b.txt")).toBe(true));
    await waitFor(() => expect(entryNames("left")).toEqual(["bundle", "bundle (1)", "docs", "bundle.zip", "plain.txt", "report.txt"]));
  });

  it("추출 (반대편 패널로): 반대편 폴더에 풀린다", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await user.keyboard(TO_BUNDLE);
    await runAction(user, "core.extract.to_inactive");
    await waitFor(() => expect(b.exists("/home/b/bundle/content/a.txt")).toBe(true));
    expect(b.exists("/home/a/bundle")).toBe(false);
  });

  it("아카이브가 아닌 항목만 있으면 안내한다", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await user.keyboard("{ArrowDown}{ArrowDown}"); // plain.txt
    await runAction(user, "core.extract");
    expect(await screen.findByRole("alert")).toHaveTextContent("압축 파일(아카이브)을 선택하세요");
    expect((await b.queueJobs()).length).toBe(0);
  });

  it("여러 아카이브를 선택하면 아카이브마다 작업이 생긴다", async () => {
    const b = backend().seed({ "/home/a/second.zip": "PK", "/home/a/second.zip!/s.txt": "S" });
    const { user } = await renderApp(b);
    await user.keyboard("{Control>}a{/Control}"); // 전체 선택: 아카이브 아닌 것은 걸러진다
    await runAction(user, "core.extract");
    await waitFor(() => expect(b.exists("/home/a/second/s.txt")).toBe(true));
    expect(b.exists("/home/a/bundle/b.txt")).toBe(true);
    expect((await b.queueJobs()).filter((j) => j.kind === "extract")).toHaveLength(2);
  });
});

describe("OP-12 심볼릭 링크", () => {
  it("커서 항목을 반대편 패널 폴더에 링크로 만든다", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await user.keyboard(TO_REPORT);
    await runAction(user, "core.file.symlink");
    await waitFor(() => expect(b.exists("/home/b/report.txt")).toBe(true));
    expect(await screen.findByRole("status", { name: "상태 표시줄" })).toHaveTextContent("링크를 만들었습니다: /home/b/report.txt");
    expect(b.exists("/home/a/report.txt")).toBe(true); // 원본 그대로
    await user.keyboard("{Tab}");
    await waitFor(() => expect(entryNames("right")).toEqual(["report.txt", "x.txt"]));
    // 링크는 링크로 표시된다
    const row = within(screen.getByRole("listbox", { name: "오른쪽 파일 목록" })).getAllByRole("option")[0];
    expect(row).toHaveTextContent("report.txt");
  });

  it("이름이 겹치면 물어본다: 기본은 이름 바꿈, S는 건너뛰기", async () => {
    const b = backend().seed({ "/home/b/report.txt": "already" });
    const { user } = await renderApp(b);
    await user.keyboard(TO_REPORT);
    await runAction(user, "core.file.symlink");
    await screen.findByRole("dialog", { name: "링크: 이름이 겹칩니다" });
    await user.keyboard("{Enter}"); // 이름 바꿔 만들기(기본)
    await waitFor(() => expect(b.exists("/home/b/report (1).txt")).toBe(true));
    expect(b.read("/home/b/report.txt")).toBe("already");

    await runAction(user, "core.file.symlink");
    await screen.findByRole("dialog", { name: "링크: 이름이 겹칩니다" });
    await user.keyboard("s"); // 건너뛰기
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(b.exists("/home/b/report (2).txt")).toBe(false);
    // 취소
    await runAction(user, "core.file.symlink");
    await screen.findByRole("dialog", { name: "링크: 이름이 겹칩니다" });
    await user.keyboard("{Escape}");
    expect(b.exists("/home/b/report (2).txt")).toBe(false);
  });

  it("권한이 없어서 실패하면 원인과 안내가 그대로 알림으로 나온다", async () => {
    const b = backend();
    b.symlinkError = "심볼릭 링크를 만들 권한이 없습니다. Windows에서는 설정에서 개발자 모드를 켜거나 관리자 권한으로 실행해야 합니다";
    const { user } = await renderApp(b);
    await user.keyboard(TO_REPORT);
    await runAction(user, "core.file.symlink");
    expect(await screen.findByRole("alert")).toHaveTextContent("개발자 모드");
    expect(b.exists("/home/b/report.txt")).toBe(false);
  });

  it("반대편이 아카이브 안이면 만들지 않고 안내한다", async () => {
    const b = backend();
    const { user } = await renderApp(b);
    await user.keyboard("{Tab}"); // 오른쪽 패널을 bundle.zip 안으로 보낸다
    await runAction(user, "core.go.path");
    const input = await screen.findByRole("textbox", { name: "이름" });
    await user.clear(input);
    await user.type(input, "/home/a/bundle.zip!{Enter}");
    await waitFor(() => expect(crumbs("right")).toEqual(["/", "home", "a", "bundle.zip"]));
    await user.keyboard("{Tab}");
    await user.keyboard(TO_REPORT);
    await runAction(user, "core.file.symlink");
    expect(await screen.findByRole("alert")).toHaveTextContent("아카이브 안에서는 심볼릭 링크를 만들 수 없습니다");
  });
});

describe("압축 풀기 진행 창", () => {
  it("압축을 푸는 동안 진행 창이 N/M개를 보여 주고 끝나면 닫힌다", async () => {
    const b = backend();
    b.queueMode = "manual";
    const { user } = await renderApp(b);
    await user.keyboard(TO_BUNDLE);
    await runAction(user, "core.extract");
    const d = await screen.findByRole("dialog", { name: "압축 풀기 중" });
    expect(d).toHaveTextContent("0/2개"); // bundle.zip 안의 파일 2개(content/a.txt, b.txt)
    await advance(b);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(b.exists("/home/a/bundle/b.txt")).toBe(true);
  });
});
