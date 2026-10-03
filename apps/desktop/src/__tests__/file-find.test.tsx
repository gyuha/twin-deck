import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { entryNames, renderApp } from "./helpers";

// 왼쪽 /home/a, 오른쪽 /home/b. 위쪽 목록 순서: node_modules, sub, a.txt, b.md, bin.dat
const seed = () =>
  new FakeBackend().seed({
    "/home/a/a.txt": "hello world",
    "/home/a/b.md": "hello",
    "/home/a/bin.dat": "hello\0binary",
    "/home/a/sub/c.txt": "goodbye",
    "/home/a/sub/x.tmp": "hello",
    "/home/a/sub/deep/d.txt": "hello deep",
    "/home/a/node_modules/e.txt": "hello",
    "/home/b/far.txt": "hello far",
  });
type User = Awaited<ReturnType<typeof renderApp>>["user"];
const dlg = () => screen.findByRole("dialog", { name: "파일 찾기" });
const openFind = async (user: User) => {
  await user.keyboard("{Control>}f{/Control}");
  return within(await dlg());
};
const mask = (d: ReturnType<typeof within>) => d.getByRole("textbox", { name: "파일 마스크(F)" });
const start = (user: User, d: ReturnType<typeof within>) => user.click(d.getByRole("button", { name: "시작" }));
/** 새 탭에 스트리밍된 결과의 이름들(정렬). */
const results = async () => {
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "파일 찾기" })).toBeNull());
  await new Promise((r) => setTimeout(r, 30));
  return entryNames("left").sort();
};
const find = async (user: User, fill: (d: ReturnType<typeof within>) => Promise<void> | void) => {
  const d = await openFind(user);
  await fill(d);
  await start(user, d);
  return results();
};

describe("파일 찾기 다이얼로그", () => {
  it("Mod+F가 파일 찾기 다이얼로그를 열고 Esc로 닫는다", async () => {
    const { user } = await renderApp(seed());
    expect(screen.queryByRole("dialog", { name: "파일 찾기" })).toBeNull();
    const d = await openFind(user);
    expect(mask(d)).toHaveFocus(); // 열자마자 마스크 입력에 커서가 있다
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "파일 찾기" })).toBeNull();
  });

  it("Quick Select는 Mod+Shift+F로 시작한다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{Control>}{Shift>}f{/Shift}{/Control}");
    expect(await screen.findByRole("status", { name: "빠른 선택" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "파일 찾기" })).toBeNull();
  });

  it("다이얼로그에 기본 탭의 디렉터리·파일·데이터 찾기 영역과 버튼이 있다", async () => {
    const { user } = await renderApp(seed());
    const d = await openFind(user);
    for (const section of ["디렉터리", "파일", "데이터 찾기"]) expect(d.getByRole("region", { name: section })).toBeInTheDocument();
    expect(d.getByRole("tab", { name: "기본" })).toHaveAttribute("aria-selected", "true");
    for (const t of ["고급", "플러그인", "불러오기/저장", "결과"]) expect(d.getByRole("tab", { name: t })).toBeDisabled();
    for (const l of ["디렉터리에서 시작(D)", "하위 디렉터리 제외(X)", "파일 마스크(F)", "파일 제외(E)", "찾을 텍스트"]) {
      expect(d.getByRole("textbox", { name: l })).toBeInTheDocument();
    }
    expect(d.getByRole("combobox", { name: "하위 디렉터리에서 검색(B)" })).toHaveValue("all");
    for (const l of ["열려있는 탭", "선택한 디렉터리 및 파일", "심볼릭 링크 따라가기", "압축파일에서 찾기", "파일 이름의 일부로 검색", "정규식", "파일에서 텍스트 찾기", "바꾸기"]) {
      expect(d.getByRole("checkbox", { name: l })).toBeInTheDocument();
    }
    expect(d.getByRole("checkbox", { name: "파일 이름의 일부로 검색" })).toBeChecked(); // 이미지의 기본값
    for (const b of ["시작", "취소", "닫기", "새 검색", "마지막 검색"]) expect(d.getByRole("button", { name: b })).toBeInTheDocument();
    expect(d.getByRole("button", { name: "마지막 검색" })).toBeDisabled(); // 아직 검색한 적이 없다
    expect(d.getByRole("button", { name: "취소" })).toBeDisabled(); // 진행 중인 검색이 없다
  });

  it("시작 디렉터리의 기본값은 현재 폴더다", async () => {
    const { user } = await renderApp(seed());
    let d = await openFind(user);
    expect(d.getByRole("textbox", { name: "디렉터리에서 시작(D)" })).toHaveValue("/home/a");
    await user.keyboard("{Escape}{ArrowDown}{Enter}"); // sub로 들어간다
    await waitFor(() => expect(entryNames("left")).toContain("deep"));
    d = await openFind(user);
    expect(d.getByRole("textbox", { name: "디렉터리에서 시작(D)" })).toHaveValue("/home/a/sub");
  });

  it("시작하면 하위 폴더까지 마스크에 맞는 파일을 새 탭에 보여 준다", async () => {
    const backend = seed();
    const { user } = await renderApp(backend);
    const names = await find(user, (d) => user.type(mask(d), "*.txt"));
    expect(names).toEqual(["a.txt", "c.txt", "d.txt", "e.txt"]);
    expect(backend.searchesStarted.at(-1)?.slice(0, 2)).toEqual(["find", "/home/a"]);
    expect(screen.getAllByRole("tab").some((t) => t.textContent?.includes("Find: *.txt"))).toBe(true);
  });

  it("하위 디렉터리에서 검색을 현재 디렉터리만으로 하면 하위 폴더는 찾지 않는다", async () => {
    const { user } = await renderApp(seed());
    const names = await find(user, async (d) => {
      await user.type(mask(d), "*.txt");
      await user.selectOptions(d.getByRole("combobox", { name: "하위 디렉터리에서 검색(B)" }), "0");
    });
    expect(names).toEqual(["a.txt"]);
  });

  it("하위 디렉터리 제외와 파일 제외 마스크가 적용된다", async () => {
    const { user } = await renderApp(seed());
    const names = await find(user, async (d) => {
      await user.type(d.getByRole("textbox", { name: "하위 디렉터리 제외(X)" }), "node_modules");
      await user.type(d.getByRole("textbox", { name: "파일 제외(E)" }), "*.tmp");
    });
    expect(names).toEqual(["a.txt", "b.md", "bin.dat", "c.txt", "d.txt", "deep", "sub"]);
  });

  it("파일 이름의 일부로 검색을 끄면 이름이 정확히 같은 파일만 찾는다", async () => {
    const { user } = await renderApp(seed());
    const part = await find(user, (d) => user.type(mask(d), "c"));
    expect(part).toEqual(["c.txt"]); // 켜져 있으면 이름에 c가 든 항목(부분 일치)
    const exact = await find(user, async (d) => {
      await user.type(mask(d), "c");
      await user.click(d.getByRole("checkbox", { name: "파일 이름의 일부로 검색" }));
    });
    expect(exact).toEqual([]);
    const full = await find(user, async (d) => {
      await user.type(mask(d), "c.txt");
      await user.click(d.getByRole("checkbox", { name: "파일 이름의 일부로 검색" }));
    });
    expect(full).toEqual(["c.txt"]);
  });

  it("정규식을 켜면 파일 마스크를 정규식으로 해석한다", async () => {
    const { user } = await renderApp(seed());
    const names = await find(user, async (d) => {
      await user.click(mask(d));
      await user.paste(String.raw`^[ab]\.(txt|md)$`); // type은 [와 {를 키 이름으로 해석한다
      await user.click(d.getByRole("checkbox", { name: "정규식" }));
    });
    expect(names).toEqual(["a.txt", "b.md"]);
  });

  it("파일에서 텍스트 찾기는 내용에 글자가 든 파일만 보여 준다", async () => {
    const { user } = await renderApp(seed());
    const names = await find(user, async (d) => {
      await user.click(d.getByRole("checkbox", { name: "파일에서 텍스트 찾기" }));
      await user.type(d.getByRole("textbox", { name: "찾을 텍스트" }), "HELLO");
    });
    expect(names).toEqual(["a.txt", "b.md", "d.txt", "e.txt", "x.tmp"]); // 바이너리(bin.dat)와 다른 내용(c.txt)은 없다
  });

  it("텍스트를 포함하지 않는 파일 찾기는 반대로 보여 준다", async () => {
    const { user } = await renderApp(seed());
    const names = await find(user, async (d) => {
      await user.click(d.getByRole("checkbox", { name: "파일에서 텍스트 찾기" }));
      await user.type(d.getByRole("textbox", { name: "찾을 텍스트" }), "hello");
      await user.click(d.getByRole("checkbox", { name: "텍스트를 포함하지 않는 파일 찾기" }));
    });
    expect(names).toEqual(["c.txt"]);
  });

  it("선택한 디렉터리 및 파일에 체크하면 선택한 항목 안에서만 찾는다", async () => {
    const { user } = await renderApp(seed());
    let d = await openFind(user);
    expect(d.getByRole("checkbox", { name: "선택한 디렉터리 및 파일" })).toBeDisabled(); // 선택이 없으면 비활성
    await user.keyboard("{Escape}{ArrowDown} "); // sub 선택(커서는 a.txt로)
    await user.keyboard(" "); // a.txt 선택
    d = await openFind(user);
    const names = await (async () => {
      await user.click(d.getByRole("checkbox", { name: "선택한 디렉터리 및 파일" }));
      await user.type(mask(d), "*.txt");
      await start(user, d);
      return results();
    })();
    expect(names).toEqual(["a.txt", "c.txt", "d.txt"]);
  });

  it("열려있는 탭에 체크하면 열려 있는 모든 탭의 폴더에서 찾는다", async () => {
    const backend = seed();
    const { user } = await renderApp(backend);
    const names = await find(user, async (d) => {
      await user.click(d.getByRole("checkbox", { name: "열려있는 탭" }));
      expect(d.getByRole("textbox", { name: "디렉터리에서 시작(D)" })).toBeDisabled();
      await user.type(mask(d), "*.txt");
    });
    expect(names).toEqual(["a.txt", "c.txt", "d.txt", "e.txt", "far.txt"]); // 왼쪽 /home/a + 오른쪽 /home/b
    expect(JSON.parse(backend.searchesStarted.at(-1)?.[2] ?? "{}").roots).toEqual(["/home/a", "/home/b"]);
  });

  it("새 검색은 입력을 비우고 마지막 검색은 직전 조건을 되살린다", async () => {
    const { user } = await renderApp(seed());
    let d = await openFind(user);
    await user.type(mask(d), "abc");
    await user.click(d.getByRole("checkbox", { name: "파일에서 텍스트 찾기" }));
    await user.click(d.getByRole("button", { name: "새 검색" }));
    expect(mask(d)).toHaveValue("");
    expect(d.getByRole("checkbox", { name: "파일에서 텍스트 찾기" })).not.toBeChecked();
    await user.type(mask(d), "*.md");
    await start(user, d);
    expect(await results()).toEqual(["b.md"]);
    d = await openFind(user);
    expect(mask(d)).toHaveValue(""); // 새로 열면 기본값
    await user.click(d.getByRole("button", { name: "마지막 검색" }));
    expect(mask(d)).toHaveValue("*.md");
  });

  it("아직 지원하지 않는 항목은 비활성이고 찾는 중에 다시 열면 취소할 수 있다", async () => {
    const backend = seed();
    backend.searchMode = "manual"; // 결과가 오지 않아 검색이 계속 진행 중이다
    const { user } = await renderApp(backend);
    let d = await openFind(user);
    for (const l of ["압축파일에서 찾기", "바꾸기", "Office XML", "16진수"]) expect(d.getByRole("checkbox", { name: l })).toBeDisabled();
    expect(d.getByRole("combobox", { name: "인코딩(G)" })).toBeDisabled();
    expect(d.getByRole("textbox", { name: "바꿀 텍스트" })).toBeDisabled();
    expect(d.getByRole("checkbox", { name: "대소문자 구분" })).toBeDisabled(); // 텍스트 찾기를 켜기 전에는 비활성
    await user.type(mask(d), "*.txt");
    await start(user, d);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "파일 찾기" })).toBeNull());
    d = await openFind(user);
    const cancel = d.getByRole("button", { name: "취소" });
    expect(cancel).toBeEnabled();
    await user.click(cancel);
    await waitFor(() => expect(cancel).toBeDisabled());
  });
});
