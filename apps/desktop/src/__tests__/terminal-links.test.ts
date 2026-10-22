import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTerminalEngine } from "../lib/terminalEngine";
import { findUrls } from "../lib/terminalLinks";

// 이슈 #107: 터미널에 보이는 주소를 Ctrl(Cmd)+클릭하면 연다.
type Provider = { provideLinks(y: number, cb: (links?: { text: string; range: { start: { x: number; y: number }; end: { x: number; y: number } }; activate(e: MouseEvent): void }[]) => void): void };
const mocks = vi.hoisted(() => ({ providers: [] as unknown[], lines: [] as string[] }));
vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    rows = 24;
    cols = 80;
    options = {};
    // 한 줄 = 글자마다 한 칸, 넓은 글자(한글)는 두 칸(뒤 칸은 너비 0)으로 흉내 낸다.
    buffer = {
      active: {
        getLine: (i: number) => {
          const text = mocks.lines[i];
          if (text === undefined) return undefined;
          const cells: { c: string; w: number }[] = [];
          for (const ch of text) {
            const wide = /[가-힣]/.test(ch);
            cells.push({ c: ch, w: wide ? 2 : 1 });
            if (wide) cells.push({ c: "", w: 0 });
          }
          return { length: cells.length, getCell: (x: number) => (cells[x] ? { getChars: () => cells[x].c, getWidth: () => cells[x].w } : undefined) };
        },
      },
    };
    loadAddon() {}
    attachCustomKeyEventHandler() {}
    onData() {}
    registerLinkProvider(p: unknown) {
      mocks.providers.push(p);
    }
    dispose() {}
  },
}));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class { fit() {} dispose() {} } }));

beforeEach(() => {
  mocks.providers.length = 0;
  mocks.lines.length = 0;
  Object.defineProperty(document, "fonts", { configurable: true, value: { load: vi.fn().mockResolvedValue([]) } });
});

describe("터미널 주소 찾기", () => {
  it("http·https 주소를 찾고 문장 끝 문장부호는 뺀다", () => {
    expect(findUrls("see https://example.com/a?b=1, and http://x.io.").map((l) => l.url)).toEqual(["https://example.com/a?b=1", "http://x.io"]);
    expect(findUrls("(https://example.com/x)").map((l) => l.url)).toEqual(["https://example.com/x"]);
  });
  it("짝이 있는 닫는 괄호는 주소에 남긴다", () => {
    expect(findUrls("https://en.wikipedia.org/wiki/Foo_(bar)").map((l) => l.url)).toEqual(["https://en.wikipedia.org/wiki/Foo_(bar)"]);
  });
  it("스킴만 있거나 다른 스킴은 주소가 아니다", () => {
    expect(findUrls("https:// ftp://x.com file:///etc/passwd")).toEqual([]);
  });
});

describe("터미널 엔진의 주소 링크", () => {
  async function provider(openLink: (u: string) => void) {
    await createTerminalEngine("", openLink);
    return mocks.providers[0] as Provider;
  }
  const links = (p: Provider, y: number) => new Promise<Parameters<Parameters<Provider["provideLinks"]>[1]>[0]>((r) => p.provideLinks(y, r));

  it("Ctrl+클릭하면 주소를 열고 그냥 클릭은 열지 않는다", async () => {
    const open = vi.fn();
    const p = await provider(open);
    mocks.lines[0] = "visit https://example.com/docs now";
    const l = (await links(p, 1))!;
    expect(l).toHaveLength(1);
    expect(l[0].range).toEqual({ start: { x: 7, y: 1 }, end: { x: 30, y: 1 } });
    l[0].activate({ ctrlKey: false, metaKey: false } as MouseEvent);
    expect(open).not.toHaveBeenCalled();
    l[0].activate({ ctrlKey: true, metaKey: false } as MouseEvent);
    expect(open).toHaveBeenCalledWith("https://example.com/docs");
    l[0].activate({ ctrlKey: false, metaKey: true } as MouseEvent);
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("넓은 글자(한글)가 앞에 있어도 칸 위치가 맞는다", async () => {
    const p = await provider(vi.fn());
    mocks.lines[0] = "한글 https://a.io";
    const l = (await links(p, 1))!;
    // "한글 "은 2+2+1 = 5칸 → 주소는 6칸째부터 12자(`https://a.io`)
    expect(l[0].range).toEqual({ start: { x: 6, y: 1 }, end: { x: 17, y: 1 } });
  });

  it("주소 안에 넓은 글자가 있어도 끊기지 않는다", async () => {
    const p = await provider(vi.fn());
    mocks.lines[0] = "https://a.io/한글 끝";
    const l = (await links(p, 1))!;
    expect(l.map((x) => x.text)).toEqual(["https://a.io/한글"]);
  });

  it("주소가 없는 줄이나 없는 줄은 링크가 없다", async () => {
    const p = await provider(vi.fn());
    mocks.lines[0] = "no links here";
    expect(await links(p, 1)).toBeUndefined();
    expect(await links(p, 5)).toBeUndefined();
  });
});
