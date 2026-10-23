import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeBackend } from "@twin-deck/ts-client";
import { renderApp, seedBackend } from "./helpers";

// 이슈 #93 후속: 서버 편집 창의 아이콘 칸을 누르면 frimousse 이모지 선택 팝업이 뜬다.
// 이모지 데이터는 앱에 포함된 파일(public/emojibase)이고, 시험은 fetch를 가짜로 바꿔 그 실제 파일만 돌려주며 요청한 주소를 모은다.
const USB = { name: "USB 공유", host: "nas.local", share: "USB", user: "", icon: "" };
const SFTP = { name: "회사", protocol: "sftp", host: "files.example.com", port: 22, user: "kim", base_dir: "", icon: "🏢" };
const PUBLIC = resolve(__dirname, "../../public");

// frimousse는 받은 이모지 데이터를 모듈 수준에서 캐시한다. 그래서 요청 기록은 시험마다 비우지 않고 파일 전체에서 모은다.
const requested: string[] = [];
const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight")!;

beforeEach(() => {
  // jsdom에는 레이아웃이 없다. frimousse의 가상 목록은 뷰포트·행·헤더 높이를 clientHeight로 처음 재는데, 공용 test-setup의 shim은
  // 모든 요소에 480을 돌려줘 행 하나가 뷰포트를 채운다. 이 파일 안에서만 뷰포트 300, 행·헤더 36으로 덮어쓴다(실제 레이아웃 검증은 아니다).
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get(this: HTMLElement) {
      if (!this.closest("[frimousse-root]")) return 480;
      return this.hasAttribute("frimousse-viewport") ? 300 : 36;
    },
  });
  // jsdom에는 ResizeObserver·canvas가 없다. 크기 변화를 알려 주지 않는 최소 shim이다.
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = String(input);
    requested.push(url);
    if (!url.startsWith("/emojibase/")) throw new Error(`외부 요청: ${url}`);
    return new Response(readFileSync(resolve(PUBLIC, url.slice(1))), { headers: { "content-type": "application/json" } });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Object.defineProperty(HTMLElement.prototype, "clientHeight", clientHeight);
});

const setup = () => {
  const b = seedBackend();
  b.setConfig((l) => {
    l.config.smb = { servers: [USB] };
    l.config.remote = { auto_reconnect: true, servers: [SFTP] };
  });
  return b;
};

type App = Awaited<ReturnType<typeof renderApp>>;

/** 설정 > SFTP·FTP 서버 탭에서 첫 항목의 편집 창을 연다. */
async function openRemoteEditor(b: FakeBackend): Promise<App> {
  const app = await renderApp(b);
  await app.user.keyboard("{Control>},{/Control}");
  await screen.findByRole("dialog", { name: "설정" });
  await app.user.click(screen.getByRole("tab", { name: "SFTP·FTP 서버" }));
  await app.user.dblClick(within(screen.getByRole("listbox", { name: "저장된 원격 서버" })).getByRole("option"));
  await screen.findByRole("dialog", { name: "SFTP·FTP 서버 편집" });
  return app;
}

const iconInput = () => screen.getByRole("textbox", { name: "아이콘" });
const popup = () => screen.queryByRole("dialog", { name: "이모지 선택" });
const editor = () => screen.queryByRole("dialog", { name: "SFTP·FTP 서버 편집" });
/** 팝업이 뜨고 이모지 데이터가 로드돼 이모지 버튼이 보일 때까지 기다린다. */
const loaded = async () => {
  const p = await screen.findByRole("dialog", { name: "이모지 선택" });
  await within(p).findByText("😀");
  return p;
};

describe("아이콘 칸의 이모지 선택 팝업 (이슈 #93)", () => {
  it("아이콘 칸을 누르면 팝업이 뜨고, 팝업은 편집 창 레이아웃 밖(body)에 fixed로 그려진다", async () => {
    const { user } = await openRemoteEditor(setup());
    expect(popup()).toBeNull();
    await user.click(iconInput());
    const p = await loaded();
    expect(p.parentElement).toBe(document.body);
    expect(editor()!.contains(p)).toBe(false);
    expect(p.style.position).toBe("fixed");
  });

  it("이모지 버튼이 보이고 인터넷 요청은 없다(앱에 포함된 /emojibase/ 파일만 읽는다)", async () => {
    const { user } = await openRemoteEditor(setup());
    await user.click(iconInput());
    const p = await loaded();
    // frimousse가 이모지 버튼에 role="gridcell"을 준다. 가상 목록이라 보이는 만큼(뷰포트 300 ÷ 행 36 × 8칸)만 그린다.
    expect(within(p).getAllByRole("gridcell").length).toBeGreaterThan(8);
    expect(requested.length).toBeGreaterThan(0);
    for (const url of requested) expect(url).toMatch(/^\/emojibase\/(ko|en)\/(data|messages)\.json$/);
    expect(requested.some((u) => u.includes("://"))).toBe(false);
  });

  it("이모지를 고르면 칸의 값이 바뀌고 저장된다", async () => {
    const b = setup();
    const { user } = await openRemoteEditor(b);
    await user.click(iconInput());
    const p = await loaded();
    await user.click(within(p).getByText("😀"));
    expect(iconInput()).toHaveValue("😀");
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(async () => expect((await b.getConfig()).config.remote.servers?.[0].icon).toBe("😀"));
  });

  it("고르면 팝업이 닫히고 포커스가 아이콘 칸으로 돌아온다", async () => {
    const { user } = await openRemoteEditor(setup());
    await user.click(iconInput());
    const p = await loaded();
    await user.click(within(p).getByText("😀"));
    expect(popup()).toBeNull();
    expect(iconInput()).toHaveFocus();
  });

  it("팝업이 열린 채 Esc를 누르면 팝업만 닫히고, 한 번 더 누르면 편집 창이 닫힌다", async () => {
    const { user } = await openRemoteEditor(setup());
    await user.click(iconInput());
    await loaded();
    await user.keyboard("{Escape}");
    expect(popup()).toBeNull();
    expect(editor()).not.toBeNull();
    await user.keyboard("{Escape}");
    expect(editor()).toBeNull();
  });

  it("팝업 밖을 누르면 닫힌다", async () => {
    const { user } = await openRemoteEditor(setup());
    await user.click(iconInput());
    await loaded();
    await user.click(within(editor()!).getByRole("textbox", { name: "표시 이름" }));
    expect(popup()).toBeNull();
    expect(editor()).not.toBeNull();
  });

  it("지우기를 누르면 칸이 비고 저장된다", async () => {
    const b = setup();
    const { user } = await openRemoteEditor(b);
    expect(iconInput()).toHaveValue("🏢");
    await user.click(iconInput());
    const p = await loaded();
    await user.click(within(p).getByRole("button", { name: "지우기" }));
    expect(iconInput()).toHaveValue("");
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(async () => expect((await b.getConfig()).config.remote.servers?.[0].icon).toBe(""));
  });

  it("SMB 서버 편집 창에서도 같은 팝업이 뜨고 고른 이모지가 저장된다", async () => {
    const b = setup();
    const { user } = await renderApp(b);
    await user.keyboard("{Control>},{/Control}");
    await screen.findByRole("dialog", { name: "설정" });
    await user.click(screen.getByRole("tab", { name: "SMB 서버" }));
    await user.dblClick(within(screen.getByRole("listbox", { name: "저장된 SMB 서버" })).getByRole("option"));
    await user.click(iconInput());
    const p = await loaded();
    await user.click(within(p).getByText("😀"));
    expect(iconInput()).toHaveValue("😀");
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(async () => expect((await b.getConfig()).config.smb.servers?.[0].icon).toBe("😀"));
  });

  it("한국어 검색어로 걸러진다(정원 → 🏡이 남고 😀는 사라진다)", async () => {
    const { user } = await openRemoteEditor(setup());
    await user.click(iconInput());
    const p = await loaded();
    await user.type(within(p).getByLabelText("이모지 검색"), "정원");
    await within(p).findByText("🏡");
    await waitFor(() => expect(within(p).queryByText("😀")).toBeNull());
  });
});
