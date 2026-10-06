import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import type { EntryDto } from "@twin-deck/ts-client";
import { selectionSummary } from "../lib/selectionSummary";
import { renderApp } from "./helpers";

const e = (name: string, kind: EntryDto["kind"], size: number): EntryDto =>
  ({ name, path: `/x/${name}`, kind, size, modifiedMs: null, createdMs: null, mode: null, hidden: false }) as unknown as EntryDto;

describe("선택 요약 계산", () => {
  const entries = [e("d1", "dir", 4096), e("d2", "dir", 4096), e("a", "file", 1000), e("b", "file", 2500), e("l", "symlink", 10)];

  it("선택이 없으면 선택 수와 용량은 0이고 전체만 센다(폴더 용량은 더하지 않는다)", () => {
    expect(selectionSummary(entries, new Set())).toEqual({
      bytes: { selected: 0, total: 3510 },
      files: { selected: 0, total: 3 },
      dirs: { selected: 0, total: 2 },
    });
  });

  it("선택한 파일·심볼릭 링크 용량만 더하고 폴더는 개수만 센다", () => {
    const s = selectionSummary(entries, new Set(["/x/a", "/x/l", "/x/d1"]));
    expect(s).toEqual({ bytes: { selected: 1010, total: 3510 }, files: { selected: 2, total: 3 }, dirs: { selected: 1, total: 2 } });
  });

  it("목록에 없는 경로가 선택에 남아 있어도 세지 않는다", () => {
    expect(selectionSummary(entries, new Set(["/x/gone"])).files.selected).toBe(0);
  });
});

describe("선택 요약 상태 줄", () => {
  // /home/a 이름순: docs, sub(폴더 둘), a.txt(1000 B), b.txt(2500 B). 숨김 파일 .h(700 B)는 표시를 켜기 전에는 목록에 없다.
  // 폴더 용량 계산(`display.folder_size_on_select`)은 끄고 파일 규칙만 시험한다. 켠 상태는 `folder-size-select.test.tsx`가 다룬다.
  const seed = () => {
    const b = new FakeBackend().seed({
      "/home/a/docs/in.txt": "x".repeat(50),
      "/home/a/sub/in.txt": "y",
      "/home/a/a.txt": "a".repeat(1000),
      "/home/a/b.txt": "b".repeat(2500),
      "/home/a/.h": "h".repeat(700),
      "/home/b/z.txt": "z".repeat(40),
    });
    b.setConfig((l) => (l.config.display.folder_size_on_select = false));
    return b;
  };
  const status = () => screen.getByRole("status", { name: "상태 표시줄" });

  it("선택이 없을 때는 전체 규모를 `선택: 0 / 전체` 형식으로 보여 준다", async () => {
    await renderApp(seed());
    expect(status()).toHaveTextContent("선택: 0 / 3.5 KB, 파일: 0/2, 폴더: 0/2");
  });

  it("선택하면 선택한 용량·파일·폴더 수가 올라가고 폴더 용량 계산을 끄면 폴더 용량은 더하지 않는다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{Insert}"); // docs(폴더) 선택, 커서는 sub로
    expect(status()).toHaveTextContent("선택: 0 / 3.5 KB, 파일: 0/2, 폴더: 1/2");
    await user.keyboard("{ArrowDown}{Insert}"); // a.txt 선택
    expect(status()).toHaveTextContent("선택: 1.0 KB / 3.5 KB, 파일: 1/2, 폴더: 1/2");
  });

  it("전체 선택하면 선택과 전체가 같아진다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{Control>}a{/Control}");
    expect(status()).toHaveTextContent("선택: 3.5 KB / 3.5 KB, 파일: 2/2, 폴더: 2/2");
  });

  it("숨김 파일 표시를 켜면 전체에 숨김 파일이 더해진다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{Control>}{Shift>}.{/Shift}{/Control}");
    await waitFor(() => expect(status()).toHaveTextContent("선택: 0 / 4.2 KB, 파일: 0/3, 폴더: 0/2"));
  });

  it("활성 패널을 바꾸면 그 패널의 값으로 바뀐다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{Tab}");
    expect(status()).toHaveTextContent("선택: 0 / 40 B, 파일: 0/1, 폴더: 0/0");
  });
});
