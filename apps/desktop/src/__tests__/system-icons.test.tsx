import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { iconKey, iconPixels } from "../lib/systemIcons";
import { list, renderApp } from "./helpers";

// 설정 behavior.table.system_icons(기본 꺼짐): 켜면 목록 행의 아이콘이 운영체제의 파일 아이콘(백엔드의 data:image/png)이 된다. 얻지 못하면 머티리얼 아이콘이 그대로다.
const seed = (on: boolean) => {
  const b = new FakeBackend().seed({
    "/home/a/a.txt": "",
    "/home/a/b.txt": "",
    "/home/a/c.png": "",
    "/home/a/dir": null,
    "/home/a/x.zip": "",
    "/home/a/x.zip!/in.txt": "",
    "/home/a/x.zip!/in.md": "",
    "/home/b/y.txt": "",
    "/real/target.rs": "",
  });
  b.setConfig((l) => (l.config.behavior.table.system_icons = on));
  return b;
};
const rowOf = (name: string) => {
  const row = within(list("left"))
    .getAllByRole("option")
    .find((o) => o.querySelectorAll("span")[1]?.textContent === name);
  if (!row) throw new Error(`행을 찾을 수 없음: ${name}`);
  return row;
};
const srcOf = (name: string) => rowOf(name).querySelector("img")!.getAttribute("src")!;
const isMaterial = (src: string) => !src.startsWith("data:") && /\.svg$/.test(src);
const dataUrl = (ext: string, size: number) => `data:image/png;base64,${btoa(`icon:${ext}:${size}`)}`;
const dpr = (v: number) => Object.defineProperty(window, "devicePixelRatio", { value: v, configurable: true });
afterEach(() => dpr(1));

describe("시스템 아이콘 옵션", () => {
  it("꺼짐(기본)이면 머티리얼 아이콘이고 백엔드에 아이콘을 묻지 않는다", async () => {
    const b = seed(false);
    await renderApp(b);
    expect(isMaterial(srcOf("a.txt"))).toBe(true);
    expect(isMaterial(srcOf("dir"))).toBe(true);
    await new Promise((r) => setTimeout(r, 30));
    expect(b.systemIconCalls).toEqual([]);
  });

  it("켜면 파일·폴더 행이 백엔드의 PNG 아이콘이고 확장자별로 다르다", async () => {
    await renderApp(seed(true));
    await waitFor(() => expect(srcOf("a.txt")).toBe(dataUrl("txt", 16)));
    expect(srcOf("c.png")).toBe(dataUrl("png", 16));
    expect(srcOf("dir")).toBe(dataUrl("dir", 16));
    expect(srcOf("b.txt")).toBe(srcOf("a.txt"));
  });

  it("같은 확장자는 백엔드를 한 번만 부른다(캐시)", async () => {
    const b = seed(true);
    await renderApp(b);
    await waitFor(() => expect(srcOf("c.png")).toMatch(/^data:/));
    const txt = b.systemIconCalls.filter((c) => c.path.endsWith(".txt"));
    expect(txt).toHaveLength(1);
    expect(new Set(b.systemIconCalls.map((c) => `${c.isDir}:${c.size}`))).toEqual(new Set(["false:16", "true:16"]));
  });

  it("응답이 null이면 머티리얼 아이콘이 그대로 남는다", async () => {
    const b = seed(true);
    b.systemIconResponder = async () => null;
    await renderApp(b);
    await waitFor(() => expect(b.systemIconCalls.length).toBeGreaterThan(0));
    await act(async () => void (await new Promise((r) => setTimeout(r, 30))));
    expect(isMaterial(srcOf("a.txt"))).toBe(true);
  });

  it("거부돼도 머티리얼 아이콘이 남고 화면은 계속 동작한다", async () => {
    const b = seed(true);
    b.systemIconResponder = async () => {
      throw new Error("실패");
    };
    await renderApp(b);
    await waitFor(() => expect(b.systemIconCalls.length).toBeGreaterThan(0));
    await act(async () => void (await new Promise((r) => setTimeout(r, 30))));
    expect(isMaterial(srcOf("c.png"))).toBe(true);
  });

  it("응답이 오기 전에는 머티리얼 아이콘이고 오면 바뀐다", async () => {
    const b = seed(true);
    const pending = new Map<string, (u: string) => void>();
    b.systemIconResponder = (path) => new Promise<string>((r) => pending.set(path, r));
    await renderApp(b);
    await waitFor(() => expect(pending.has("/home/a/c.png")).toBe(true));
    expect(isMaterial(srcOf("c.png"))).toBe(true);
    await act(async () => pending.get("/home/a/c.png")!("data:image/png;base64,QQ=="));
    await waitFor(() => expect(srcOf("c.png")).toBe("data:image/png;base64,QQ=="));
  });

  it("켰다 끄면 머티리얼 아이콘으로 돌아온다", async () => {
    const b = seed(true);
    await renderApp(b);
    await waitFor(() => expect(srcOf("a.txt")).toMatch(/^data:/));
    await act(async () => void (await b.setConfigValue("behavior.table.system_icons", { kind: "bool", value: false })));
    await waitFor(() => expect(isMaterial(srcOf("a.txt"))).toBe(true));
    await act(async () => void (await b.setConfigValue("behavior.table.system_icons", { kind: "bool", value: true })));
    await waitFor(() => expect(srcOf("a.txt")).toMatch(/^data:/));
  });

  it("압축 안 항목도 확장자 아이콘을 쓴다", async () => {
    const b = seed(true);
    const { user } = await renderApp(b);
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{Enter}"); // dir, a.txt, b.txt, c.png, x.zip → x.zip 안으로
    await waitFor(() => expect(within(list("left")).getAllByRole("option").some((o) => o.textContent?.includes("in.txt"))).toBe(true));
    await waitFor(() => expect(srcOf("in.txt")).toBe(dataUrl("txt", 16))); // 이미 얻은 확장자는 다시 묻지 않는다
    await waitFor(() => expect(srcOf("in.md")).toBe(dataUrl("md", 16)));
    expect(b.systemIconCalls.filter((c) => c.path.includes("!/")).map((c) => c.path)).toEqual(["/home/a/x.zip!/in.md"]);
  });

  it("심볼릭 링크 표식은 시스템 아이콘 위에도 유지된다", async () => {
    const b = seed(true);
    await b.createSymlink("/real/target.rs", "/home/a", "rename");
    await renderApp(b);
    await waitFor(() => expect(srcOf("target.rs")).toBe(dataUrl("rs", 16)));
    expect(rowOf("target.rs").querySelector("[data-link='true']")).not.toBeNull();
  });

  it("요청 크기는 icon_size × 화면 배율을 16·32·64·128 중 올림한 값이다", async () => {
    dpr(2);
    const b = seed(true);
    await renderApp(b);
    await waitFor(() => expect(b.systemIconCalls.length).toBeGreaterThan(0));
    expect(new Set(b.systemIconCalls.map((c) => c.size))).toEqual(new Set([32]));
    expect(iconPixels(16, 1)).toBe(16);
    expect(iconPixels(24, 2)).toBe(64);
    expect(iconPixels(17, 1)).toBe(32);
    expect(iconPixels(100, 2)).toBe(128);
    expect(iconPixels(16, 0)).toBe(16);
  });

  it("아이콘 키: 폴더는 dir(.app은 경로), 파일은 소문자 확장자(exe는 경로), 압축 안은 늘 종류별", () => {
    const k = (path: string, name: string, isDir: boolean) => iconKey({ path, name, isDir });
    expect(k("/a/d", "d", true)).toBe("dir");
    expect(k("/Applications/X.app", "X.app", true)).toBe("path:/Applications/X.app");
    expect(k("/a/x.zip!/X.app", "X.app", true)).toBe("dir");
    expect(k("/a/B.TXT", "B.TXT", false)).toBe("ext:txt");
    expect(k("/a/.bashrc", ".bashrc", false)).toBe("ext:");
    expect(k("/a/tool.exe", "tool.exe", false)).toBe("path:/a/tool.exe");
    expect(k("/a/x.zip!/tool.exe", "tool.exe", false)).toBe("ext:exe");
  });

  it("설정 화면에 스위치가 있고 한국어·영어로 나온다", async () => {
    const { user, backend } = await renderApp(seed(false));
    await user.keyboard("{Control>},{/Control}");
    let dialog = await screen.findByRole("dialog", { name: "설정" });
    await user.click(within(dialog).getByRole("tab", { name: "목록과 선택" }));
    expect(within(dialog).getByRole("group", { name: "시스템 아이콘 사용" })).toBeTruthy();
    await user.keyboard("{Escape}");
    await backend.setConfigValue("behavior.language", { kind: "str", value: "en" });
    await user.keyboard("{Control>},{/Control}");
    dialog = await screen.findByRole("dialog", { name: "Settings" });
    await user.click(within(dialog).getByRole("tab", { name: "List and selection" }));
    const row = within(dialog).getByRole("group", { name: "Use system icons" });
    expect(row.textContent).not.toMatch(/[가-힣]/);
    await user.click(within(row).getByRole("switch"));
    await waitFor(async () => expect((await backend.getConfig()).config.behavior.table.system_icons).toBe(true));
  });
});

